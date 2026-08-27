import type { Env } from "@/types";

/**
 * ONE RETRY POLICY FOR TRANSIENT KV FAILURES, IN ONE PLACE.
 *
 * The policy itself was written 2026-08-04, inside kv-bulk.ts, after a
 * live "KV GET_BULK failed: 500 Internal Server Error" killed a whole
 * corrections walk. It has been correct ever since — for BULK reads
 * only. Single-key `.get()` calls never got it.
 *
 * 2026-08-21T20:31:38.446Z, and this is the reason the file exists:
 * "[P1] worker_health — Chain reconciliation failed: KV GET failed:
 * 500 Internal Server Error". GET, not GET_BULK. A one-key cursor
 * read hit the same transient class the bulk path had absorbed for
 * seventeen days, threw, and took the hourly bank walk down with it.
 *
 * THE LINE THIS DOES NOT CROSS. A failure that survives the retries
 * still THROWS, exactly as the bulk path does. Silently defaulting a
 * cursor read to "missing" would restart a walk from a made-up block
 * and report the span as clean — a wrong number wearing a walk's
 * authority. Loud failure plus the cron's next pass is the honest
 * degradation. The retry absorbs the blip and nothing else.
 */

type Namespace = Env["ORDERS"];

const RETRIES = 3;
const BACKOFF_MS = [150, 600];

/** Retries a transient KV failure; rethrows the last one if it persists. */
export async function withKvRetry<T>(read: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < RETRIES; attempt += 1) {
    try {
      return await read();
    } catch (error) {
      lastError = error;
      if (attempt < RETRIES - 1) {
        await new Promise((resolve) =>
          setTimeout(resolve, BACKOFF_MS[attempt] ?? 600),
        );
      }
    }
  }
  throw lastError;
}

/**
 * A WRITE THAT SURVIVES THE SAME TRANSIENT CLASS.
 *
 * Added 2026-08-27 after "500 on GET /api/buy/recurring_patronage: KV
 * PUT failed: 429 Too Many Requests. A visitor was handed an error
 * page here." That write sits PAST settlement, so the buyer had
 * already paid when it threw — the retry policy the reads got in
 * August was never extended to the one direction where failing costs
 * a customer money.
 *
 * The rule above is unchanged and matters more here, not less: a
 * write that outlives the retries STILL THROWS. Swallowing it would
 * hand the caller a success it did not have, and downstream a 2xx
 * clears the delivery-intent row that is the only remaining evidence
 * the sale was never delivered.
 */
export function kvPut(
  kv: Namespace,
  key: string,
  value: string,
  options?: Parameters<Namespace["put"]>[2],
): Promise<void> {
  return withKvRetry(() => kv.put(key, value, options));
}

/**
 * A single-key read that survives a 500 from the KV service. The
 * optional "json" argument exists so the #17 sweep could rewrite the
 * callee of every bare `.get(key)` / `.get(key, "json")` site without
 * touching its argument list — the mechanical change a reviewer can
 * verify by prefix alone.
 */
export function kvGet(kv: Namespace, key: string): Promise<string | null>;
export function kvGet<T = unknown>(
  kv: Namespace,
  key: string,
  type: "json",
): Promise<T | null>;
export function kvGet(
  kv: Namespace,
  key: string,
  type?: "json",
): Promise<unknown> {
  return withKvRetry(() => (type ? kv.get(key, type) : kv.get(key)));
}

/**
 * The same, for the rows this store keeps as JSON. The ignored
 * trailing argument is the sweep affordance again: a bare
 * `.get<T>(key, "json")` becomes `kvGetJson<T>(env.NS, key, "json")`
 * by rewriting only the callee.
 */
export function kvGetJson<T>(
  kv: Namespace,
  key: string,
  _type?: "json",
): Promise<T | null> {
  return withKvRetry(() => kv.get<T>(key, "json"));
}

/** A list page read under the same policy — the corrections-walk
 * class (2026-08-04) has a list-shaped sibling, and a walk that dies
 * on page three restarts from nothing. */
export function kvList(
  kv: Namespace,
  options?: Parameters<Namespace["list"]>[0],
): ReturnType<Namespace["list"]> {
  return withKvRetry(() => kv.list(options)) as ReturnType<Namespace["list"]>;
}
