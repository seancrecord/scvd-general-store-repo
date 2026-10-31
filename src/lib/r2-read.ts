import { currentKvPolicy } from "@/lib/kv-retry";

/** Only a read that exhausted its transient-service budget gets grouped in email. */
export class R2ReadUnavailable extends Error {
  /** The R2 service code, or null when the binding's connection dropped and no code was sent. */
  constructor(readonly code: number | null, cause: unknown) {
    super(`R2 read remained unavailable after retries (${code ?? "network connection lost"})`, { cause });
    // Existing alarm identities and keeper mutes include the error name.
    // The class marks the storage failure without renaming those rows.
    this.name = cause instanceof Error ? cause.name : "Error";
  }
}

/**
 * The October 5 alarms were R2 GET failures, outside the KV retry wrapper.
 * Reuse the request/cron budgets already chosen for storage reads. Read the
 * body inside the attempt too: a failed stream needs a fresh GET, not a
 * second attempt to consume the same body. Parsing stays with the caller;
 * malformed evidence and permission failures are not transient outages.
 *
 * THE UNCODED BLIP (2026-10-31). Three worker_health alarms in 36 hours
 * read "500 on GET /corpus/host/<host>.json: Network connection lost."
 * — no R2 code, so the pattern below would let it straight through on
 * the first attempt. That sentence is the Workers runtime saying a
 * connection dropped before the other side answered: the same
 * transient class as 10001, named by a different layer. The alarm does
 * not say WHICH binding dropped. This read is the likeliest, because a
 * host page resolves every corpus pointer through it in one wave, and
 * it was the one read on that route with no retry for the class; the
 * route's only bare KV get (the population register) got the KV retry
 * in the same change. The match is the runtime's exact sentence, not
 * "any error": an application failure still throws on the first try.
 */
const CONNECTION_LOST = /^Network connection lost\.?$/;

export async function r2ReadText(bucket: R2Bucket, key: string): Promise<string | null> {
  const policy = currentKvPolicy();
  for (let attempt = 0; ; attempt += 1) {
    try {
      const object = await bucket.get(key);
      return object ? await object.text() : null;
    } catch (error) {
      // Cloudflare documents these as InternalError, ServiceUnavailable,
      // and TooManyRequests. Do not retry arbitrary application errors.
      const message = error instanceof Error ? error.message : "";
      const match = /^(?:get|read): .*\((10001|10043|10058)\)$/.exec(message);
      if (!match && !CONNECTION_LOST.test(message)) throw error;
      if (attempt + 1 >= policy.retries) {
        throw new R2ReadUnavailable(match ? Number(match[1]) : null, error);
      }
      const delay = policy.backoff_ms[attempt] ?? policy.backoff_ms.at(-1) ?? 600;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}
