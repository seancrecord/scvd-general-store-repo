import { describe, expect, it } from "vitest";
import { marketAggregates, OFFERS_READ_BASIS } from "@/services/market";
import { runChecks } from "@/services/preflight";
import { latestReading } from "@/routes/registry";
import type { WardHostResult } from "@/services/ward-round";

/**
 * "0% OF READY DOORS SERVE SIGNED OFFERS" (task #73 / CV-2, and the
 * worked example the observatory doc calls its most urgent item —
 * docs/OBSERVATORY.md §18).
 *
 * The advisory `no-signed-offers` collapsed three observations that
 * are not the same thing:
 *
 *   A) the endpoint does not support signed offers
 *   B) it supports them but exposes them somewhere we did not look
 *   C) our probe did not find them at the path we probed
 *
 * Only (A) is a fact about the endpoint. (B) and (C) are facts about
 * OUR PROBE — rule 52's exact shape. The census published all three
 * as (A), and the public sentence went further: "the rest ask to be
 * paid on their word alone."
 *
 * WHY THIS ONE MATTERS MORE THAN ITS SIZE. This store sells
 * conformance checking. A statistic saying the ecosystem is 0%
 * compliant, published by the party selling compliance, is
 * self-serving unless it is granular — and the risk was never that
 * it was wrong. It is that we would be quietly defining reality in a
 * way that makes our own product look necessary.
 *
 * So: the advisory names what was OBSERVED, the numerator and the
 * remainder are reported separately, and the readings the probe
 * cannot separate are published as limits rather than folded into
 * the endpoint's account.
 */

function host(
  name: string,
  verdict: WardHostResult["verdict"],
  extra: Partial<WardHostResult> = {},
): WardHostResult {
  return {
    host: name,
    url: `https://${name}/api/x`,
    verdict,
    failed: [],
    advisories: [],
    ...extra,
  };
}

describe("the advisory names what was observed, not what the door is", () => {
  function challenge(extensions: Record<string, unknown> = {}): Response {
    return new Response("{}", {
      status: 402,
      headers: {
        "PAYMENT-REQUIRED": btoa(
          JSON.stringify({
            x402Version: 2,
            accepts: [
              {
                scheme: "exact",
                network: "eip155:8453",
                amount: "5000",
                asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
                payTo: "0xDD350976B8cfFc65938C0464d39A2C78BE079bd0",
                maxTimeoutSeconds: 300,
              },
            ],
            extensions,
          }),
        ),
      },
    });
  }

  const advisoryFor = (response: Response) =>
    runChecks(response, false).advisories.find((a) =>
      a.name.includes("signed-offers"),
    );

  it("is named for the observation — absence from the challenge, not absence from the door", () => {
    const advisory = advisoryFor(challenge());
    expect(advisory).toBeDefined();
    expect(
      advisory!.name,
      "the name asserts a fact about the endpoint that this probe never established",
    ).toBe("signed-offers-not-in-challenge");
  });

  it("says which readings it cannot tell apart, and how to falsify it", () => {
    const detail = advisoryFor(challenge())!.detail;
    // (B) and (C): facts about our probe, labelled as such.
    expect(detail).toMatch(/somewhere this probe did not look|not look/i);
    expect(detail).toMatch(/one path|the path we probed|this path/i);
    // The falsifier — rule 55: a claim ships with a way to walk it.
    expect(detail).toMatch(/re-?run|re-?probe|serve them in the challenge/i);
  });

  it("still says nothing when the door does serve them", () => {
    const served = challenge({
      "offer-receipt": { info: { offers: [{ signature: "a.b.c" }] } },
    });
    expect(advisoryFor(served)?.name).not.toBe("signed-offers-not-in-challenge");
  });
});

const rows = [
  // Observed serving.
    host("serves.example", "ready"),
    // Observed absent from the challenge we read.
    host("absent.example", "ready", {
      advisories: ["signed-offers-not-in-challenge"],
    }),
    // A stored row from before the rename: history stands and still joins.
    host("old.example", "ready", { advisories: ["no-signed-offers"] }),
    // Present but not parseable — a different observation again.
    host("broken.example", "ready", { failed: ["signed-offers"] }),
    // Never reached: contributes to neither numerator nor remainder.
  host("dead.example", "unreachable"),
];

describe("the census reports the remainder instead of implying it", () => {
  it("breaks the ready population into what was seen, not what was assumed", () => {
    const so = marketAggregates(rows).signed_offers;
    expect(so.of_ready).toBe(4);
    expect(so.serving).toBe(1);
    // The remainder, split by what the probe actually observed.
    expect(so.not_found_in_challenge).toBe(2);
    expect(so.present_but_unparseable).toBe(1);
    // And the parts account for the whole: nothing is implied.
    expect(
      so.serving + (so.not_found_in_challenge ?? 0) + (so.present_but_unparseable ?? 0),
      "the buckets do not sum to the denominator — something is being implied rather than counted",
    ).toBe(so.of_ready);
    expect(so.basis).toBe(OFFERS_READ_BASIS);
  });

  it("publishes the readings it cannot separate, rather than folding them in", () => {
    const so = marketAggregates(rows).signed_offers;
    const limits = String(so.cannot_distinguish);
    expect(limits).toMatch(/did not look|another placement/i);
    expect(limits).toMatch(/convention|scheme/i);
  });
});

describe("the public sentence claims only what was observed", () => {
  it("no longer says the remainder asks to be paid on its word alone", () => {
    /*
     * The week is DERIVED from the same aggregate the census
     * publishes, rather than typed here: a hand-built fixture is a
     * second source of truth, and this is the one sentence in the
     * store whose whole defect was a number meaning something other
     * than the words beside it.
     */
    const market = marketAggregates(rows);
    const entry = {
      week: "2026-W35",
      observed_at: "2026-08-28T00:00:00.000Z",
      published_at: "2026-08-28T00:00:00.000Z",
      probed: rows.length,
      ready: market.signed_offers.of_ready,
      rot: market.rot,
      signed_offers: market.signed_offers,
      rails: market.rails,
    } as unknown as Parameters<typeof latestReading>[0];

    const sentence = latestReading(entry);
    expect(
      sentence,
      "the census asserted an absence it never observed, in its most quotable line",
    ).not.toContain("word alone");
    // What it says instead: the remainder counted, and the limit named.
    expect(sentence).toContain("carried no offers in the challenge we read");
    expect(sentence).toMatch(/IS NOT THEY DO NOT HAVE THEM/i);
  });
});
