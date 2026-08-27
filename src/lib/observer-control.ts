import type { Env } from "@/types";

/**
 * THE CONTROL BEACON (roadmap 3.4, ledger B6).
 *
 * When a probe cannot reach a door, two very different things may be
 * true: their door is down, or OUR vantage is. Every instrument in
 * this store used to book that moment the same way — "unreachable",
 * the subject's outage — which quietly billed our own network trouble
 * to somebody else's published uptime. An observatory that cannot
 * tell its own blindness from the world going dark is signing claims
 * it has no evidence for.
 *
 * The control is a KNOWN-GOOD off-store URL read in the same tick as
 * the failed probe. Beacon answers: our vantage works, the subject's
 * failure is theirs. Beacon fails too: the tick is OURS — degraded —
 * and it must not count against the subject or as coverage.
 *
 * The beacon cannot be this store's own hostname (a Worker cannot
 * fetch its own host), so it is provisioned by the keeper as
 * CONTROL_BEACON_URL. Unprovisioned, the answer is "unchecked" — the
 * honest third state: the failure books as the subject's, as it
 * always did, and the row says the attribution was never verified
 * rather than implying it was.
 *
 * ANY response is proof the vantage works — even a 500 from the
 * beacon is bytes that crossed the network. Only a failure to speak
 * at all marks the tick degraded.
 */
export type ObserverStatus = "ok" | "degraded" | "unchecked";

export const CONTROL_BEACON_TIMEOUT_MS = 5_000;

export async function readObserverStatus(
  env: Env,
  fetchImpl: typeof fetch = fetch,
): Promise<ObserverStatus> {
  const beacon = env.CONTROL_BEACON_URL?.trim();
  if (!beacon) return "unchecked";
  try {
    await fetchImpl(beacon, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(CONTROL_BEACON_TIMEOUT_MS),
    });
    return "ok";
  } catch {
    return "degraded";
  }
}
