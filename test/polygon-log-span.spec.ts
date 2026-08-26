import { describe, expect, it } from "vitest";
import { BASE_EVM, EVM_CHAINS, POLYGON_EVM } from "@/lib/base-rpc";
import {
  RECONCILE_CATCHUP_PASSES,
  RECONCILE_MAX_SPAN,
} from "@/services/chain-reconciliation";

/**
 * THE BANK WALK STALLED ON POLYGON, AND THE PROVIDERS WERE RIGHT.
 *
 * 2026-08-26, [P1] worker_health: `eth_getLogs` answered HTTP 400
 * after five attempts across polygon-rpc.com, then publicnode, then
 * drpc. The cursor did not move, and would not have moved on the next
 * run either, because nothing about the request was going to change.
 *
 * A 400 is a verdict on the REQUEST. The retry loop treats every 4xx
 * as a reason to try the next endpoint — correct for a 429, where the
 * quota is per key and the next endpoint is a different key, and
 * useless for a 400, where every provider capping at the same place
 * returns the same refusal. Three independent operators agreeing is
 * not an outage; it is a malformed ask.
 *
 * The ask was a 2,000-block window, shared with Base. The comment
 * above FALLBACK_RPCS had already recorded a provider refusing
 * exactly that span with exactly that status, "permanently, by plan
 * design" — a fact the code knew, in prose, next to the constant that
 * ignored it.
 *
 * WHAT THIS FILE CANNOT DO, said plainly. The Polygon endpoints are
 * unreachable from the environment the fix was written in, so the
 * real cap was never measured — only the 400 in the page was
 * observed. Pinning a remembered provider limit would repeat the
 * original mistake in a smaller number. So the assertions below are
 * the ones that CAN be checked without the network: that the span is
 * narrower than the one that was refused, and that it is still wide
 * enough to outrun the chain.
 */

/** Polygon mints roughly one block every two seconds. */
const POLYGON_BLOCKS_PER_HOUR = 3600 / 2;

describe("the Polygon walk asks for a window its providers will answer", () => {
  it("asks for less than the span that was refused", () => {
    // 2000 is the number in the page. Anything at or above it is the
    // stall, restored.
    expect(POLYGON_EVM.logSpan).toBeLessThan(2000);
  });

  it("still outruns the chain it is walking", () => {
    /*
     * THE FAILURE THIS PREVENTS IS THE QUIET ONE. A span small enough
     * to be accepted but too small to keep up does not page anybody:
     * the walk runs, reports success, and falls a little further
     * behind every hour until it trips the skipped-blocks clamp and
     * tears a hole in the only record of incoming payments.
     */
    const readPerHour = RECONCILE_CATCHUP_PASSES * POLYGON_EVM.logSpan;
    expect(readPerHour).toBeGreaterThan(POLYGON_BLOCKS_PER_HOUR * 2);
  });

  it("can climb out of the clamp instead of living against it", () => {
    // Recovering from a maximum-lag stall has to take a sane number of
    // hourly runs, or the hole is permanent in practice.
    const runsToRecover =
      RECONCILE_MAX_SPAN / (RECONCILE_CATCHUP_PASSES * POLYGON_EVM.logSpan);
    expect(runsToRecover).toBeLessThan(24);
  });

  it("leaves the Base walk exactly as it was", () => {
    // Base's endpoints have answered this span since the walk was
    // written. Narrowing a working walk buys nothing and risks the
    // lag failure above.
    expect(BASE_EVM.logSpan).toBe(2000);
  });

  it("gives every chain a span, so a new rail cannot inherit a guess", () => {
    for (const chain of EVM_CHAINS) {
      expect(chain.logSpan).toBeGreaterThan(0);
      expect(Number.isInteger(chain.logSpan)).toBe(true);
      // Anti-vacuity: a chain list of one would pass this trivially.
      expect(EVM_CHAINS.length).toBeGreaterThanOrEqual(2);
    }
  });
});
