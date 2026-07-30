import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { takeCensus } from "@/lib/census";
import { recordSettlement } from "@/lib/metrics";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;

/**
 * THE DAY THE FIRST ORGANIC SETTLE LANDED, THE PAGE THAT WATCHES FOR IT
 * SAID ZERO.
 *
 * The keeper spotted it and read it generously — "probably a
 * window-boundary thing, not a data bug." It was a data bug, and the
 * reproduction took three lines:
 *
 *   one house settle with no user-agent,
 *   one organic settle with no user-agent,
 *   census reports presented: 0, outside: 0.
 *
 * ROOT CAUSE. Clients were keyed by user-agent alone, and the tally did
 * `house ||= event.house` — so ONE house-flagged event anywhere in the
 * window marked the entire bucket as house, and the bucket was then
 * skipped whole. The intent was right and the identity model was wrong:
 * a user-agent is a BUCKET, not a person, and the emptiest bucket of all
 * is "(no user-agent)", which the keeper's own scripted tests and a real
 * hand-rolled buyer both land in.
 *
 * So the keeper testing his own till made every outside client sharing
 * a user-agent string invisible — on the single number this store was
 * built to watch. Worst possible day to find it, best possible day for
 * it to be found.
 *
 * The fix keys tallies by user-agent AND house flag: a house event still
 * counts as house, exactly as before, and stops swallowing everyone
 * standing next to it.
 */
describe("a house test does not hide an outside buyer", () => {
  const OUTSIDER = "0x9999999999999999999999999999999999999999";

  it("counts an organic settle that shares a user-agent with a house test", async () => {
    // The exact reproduction, and the regression guard.
    await recordSettlement(testEnv, "/api/buy/hello", {
      houseHeader: testEnv.HOUSE_SECRET,
      paidUsdc: 0.5,
      minimumUsdc: 0.5,
    });
    await recordSettlement(testEnv, "/api/buy/hello", {
      paidUsdc: 0.5,
      minimumUsdc: 0.5,
      payer: OUTSIDER,
    });

    const census = await takeCensus(testEnv);
    expect(
      census.presented_signature.length,
      "an outside buyer sharing a user-agent with a house test is invisible",
    ).toBeGreaterThan(0);
    expect(census.clients_outside).toBeGreaterThan(0);
  });

  it("still counts the house event as house, which was the original rule", async () => {
    // The fix must not become a hole. Splitting the bucket has to keep
    // house traffic flagged, or it would trade an undercount for the
    // far worse overcount — the keeper's own tests read as customers.
    const census = await takeCensus(testEnv);
    const houseClients = [
      ...census.presented_signature,
      ...census.walkers,
    ].filter((client) => client.house);
    expect(
      houseClients.length,
      "a house client leaked into a list that excludes house",
    ).toBe(0);
    expect(census.clients_total).toBeGreaterThan(census.clients_outside);
  });

  it("keeps house and outside apart under one shared user-agent string", async () => {
    const shared = "shared-agent/1.0";
    await recordSettlement(testEnv, "/api/buy/small_blessing", {
      userAgent: shared,
      houseHeader: testEnv.HOUSE_SECRET,
      paidUsdc: 0.005,
      minimumUsdc: 0.005,
    });
    await recordSettlement(testEnv, "/api/buy/small_blessing", {
      userAgent: shared,
      paidUsdc: 0.005,
      minimumUsdc: 0.005,
      payer: OUTSIDER,
    });
    const census = await takeCensus(testEnv);
    const outside = census.presented_signature.filter(
      (client) => client.user_agent === shared,
    );
    expect(
      outside.length,
      "the outside half of a shared user-agent went missing",
    ).toBe(1);
    expect(outside[0]?.house).toBe(false);
  });
});

/**
 * The page's verdict is computed, not written — it branches on whether
 * anybody has presented a signature. So fixing the data fixes the
 * sentence, and this is the test that the sentence follows the data
 * rather than a copy edit that would go stale again.
 */
describe("the census verdict follows the books", () => {
  it("stops saying zero once somebody has presented a signature", async () => {
    await recordSettlement(testEnv, "/api/buy/hello", {
      userAgent: "verdict-spec/1.0",
      paidUsdc: 0.5,
      minimumUsdc: 0.5,
      payer: "0x8888888888888888888888888888888888888888",
    });
    const census = await takeCensus(testEnv);
    expect(census.presented_signature.length).toBeGreaterThan(0);
    // The page renders the zero copy only on an empty list; a non-empty
    // list is the branch that names the count and links the decline desk.
    const settled = census.presented_signature.filter(
      (client) => client.settles > 0,
    );
    expect(settled.length).toBeGreaterThan(0);
  });
});
