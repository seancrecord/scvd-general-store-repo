import { currentKvPolicy } from "@/lib/kv-retry";

/** Only a read that exhausted its transient-service budget gets grouped in email. */
export class R2ReadUnavailable extends Error {
  constructor(readonly code: number, cause: unknown) {
    super(`R2 read remained unavailable after retries (${code})`, { cause });
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
 */
export async function r2ReadText(bucket: R2Bucket, key: string): Promise<string | null> {
  const policy = currentKvPolicy();
  for (let attempt = 0; ; attempt += 1) {
    try {
      const object = await bucket.get(key);
      return object ? await object.text() : null;
    } catch (error) {
      // Cloudflare documents these as InternalError, ServiceUnavailable,
      // and TooManyRequests. Do not retry arbitrary application errors.
      const match = error instanceof Error
        ? /^(?:get|read): .*\((10001|10043|10058)\)$/.exec(error.message)
        : null;
      if (!match) throw error;
      if (attempt + 1 >= policy.retries) {
        throw new R2ReadUnavailable(Number(match[1]), error);
      }
      const delay = policy.backoff_ms[attempt] ?? policy.backoff_ms.at(-1) ?? 600;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}
