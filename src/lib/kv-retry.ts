import { AsyncLocalStorage } from "node:async_hooks";
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

/**
 * TWO BUDGETS, ONE POLICY FILE (the keeper's ruling, 2026-09-02:
 * "fine upping the budget there").
 *
 * The third time in a month a cron walk died to a short KV 500 —
 * 2026-08-04 on a bulk read, 2026-08-21 on a single get, 2026-09-02
 * on the reclassification walk — the budget was the same three tries
 * over three quarters of a second that a REQUEST path gets, and on a
 * request path that is right: a buyer is waiting on the 402, and a
 * store that hangs for five seconds on a dead KV is worse than one
 * that fails fast. A cron walk has nobody waiting. It can afford to
 * sit out a blip of the length these have actually been.
 *
 * So the policy is chosen by the CALLER'S CONTEXT, not by a second
 * set of helpers: the scheduled handler runs its work inside
 * `withPatientKv`, and every read or write under it — single get,
 * bulk get, list, put — takes the patient budget through the same
 * `withKvRetry` everything already goes through. Nothing on a request
 * path changes. AsyncLocalStorage carries the choice across awaits,
 * so a walk three promises deep still knows it is a walk, and a
 * request arriving in the same isolate during a cron tick keeps its
 * own budget.
 *
 * The line that does not move: a failure that survives EITHER budget
 * still throws.
 */
export interface KvRetryPolicy {
  /** Attempts in total, the first included. */
  retries: number;
  /** Waits between attempts, in ms; the last entry repeats. */
  backoff_ms: readonly number[];
}

/** A buyer is waiting: three tries, three quarters of a second. */
export const REQUEST_KV_POLICY: KvRetryPolicy = { retries: 3, backoff_ms: [150, 600] };

/** Nobody is waiting: five tries, about five seconds. */
export const PATIENT_KV_POLICY: KvRetryPolicy = {
  retries: 5,
  backoff_ms: [150, 600, 1500, 3000],
};

const policyStore = new AsyncLocalStorage<KvRetryPolicy>();

/** The policy in force for the caller: patient inside a cron tick, request otherwise. */
export function currentKvPolicy(): KvRetryPolicy {
  return policyStore.getStore() ?? REQUEST_KV_POLICY;
}

/** Run cron work under the patient budget; every KV call inside inherits it. */
export function withPatientKv<T>(work: () => Promise<T>): Promise<T> {
  return policyStore.run(PATIENT_KV_POLICY, work);
}

/** Retries a transient KV failure under the caller's policy; rethrows the last one if it persists. */
export async function withKvRetry<T>(read: () => Promise<T>): Promise<T> {
  const policy = currentKvPolicy();
  let lastError: unknown;
  for (let attempt = 0; attempt < policy.retries; attempt += 1) {
    try {
      return await read();
    } catch (error) {
      lastError = error;
      if (attempt < policy.retries - 1) {
        const wait =
          policy.backoff_ms[attempt] ?? policy.backoff_ms[policy.backoff_ms.length - 1] ?? 600;
        await new Promise((resolve) => setTimeout(resolve, wait));
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
