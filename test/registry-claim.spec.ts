import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { latestReading } from "@/routes/registry";
import type { RegistryWeekEntry } from "@/services/registry-pulse";

const BASE = "https://scvd.store";

/**
 * ROADMAP 0.2 / LEDGER A2 — THE REGISTRY OVERSTATED WHAT WE MEASURED.
 *
 * `/registry` published: "N doors serve offers a third party can
 * cryptographically verify." The census never verified a signature.
 * It parses the JWS and stops, and the check that does it says so in
 * its own detail string:
 *
 *   "Signatures NOT verified here — that needs the issuer's key,
 *    which is a second request this probe refuses to make."
 *
 * So the instrument was honest and the statistic derived from it was
 * not. That is the more dangerous direction: the caveat lives in a
 * check nobody reads, while the confident sentence is the one that
 * gets quoted back at us.
 *
 * It also flattered our own product. This store SELLS signature
 * verification at the conformance desk. A census implying we already
 * verify signatures for free makes the paid desk look redundant while
 * claiming credit for work we did not do — wrong in both directions
 * at once.
 */
/**
 * A ROUND THAT ACTUALLY HAS OFFERS DATA.
 *
 * The first version of this guard read the rendered page and passed —
 * not because the claim was fixed, but because the offers sentence is
 * conditional on `of_ready > 0` and the live round had none. Green
 * because the code never ran, which is the same empty guard this
 * phase exists to remove. The fixture forces the branch.
 */
const WITH_OFFERS: RegistryWeekEntry = {
  week: "2026-W34",
  observed_at: "2026-08-19T00:00:00.000Z",
  published_at: "2026-08-19T00:00:00.000Z",
  probed: 60,
  ready: 40,
  rot: { dead_doors: 20, pct: 33 },
  signed_offers: { serving: 12, of_ready: 40, pct: 30 },
  rails: { of: 0, both: 0, base_only: 0, solana_only: 0, other_only: 0, testnet_flagged: 0 },
  price_usdc: null,
  hosts: 60,
  operators: 22,
  top5_share_pct: 41,
  schemes: { exact: 40 },
};

describe("the registry claims only what the census measured", () => {
  it("never says a third party can cryptographically verify what we only parsed", () => {
    const line = latestReading(WITH_OFFERS);
    expect(line).toContain("signed offers");
    expect(line).not.toContain("cryptographically verify");
  });

  it("carries its own boundary, because a percentage implies verification", () => {
    /*
     * Deleting the overclaim is not enough. A reader who sees a
     * signed-offers percentage assumes somebody checked the
     * signatures unless the sentence says otherwise, so the limit
     * travels with the number rather than living in a footnote.
     */
    const line = latestReading(WITH_OFFERS);
    expect(line).toMatch(/NOT verified/);
    expect(line).toContain("structurally valid");
    // And it points at where verification actually happens, which is
    // a product this store sells rather than something it hides.
    expect(line).toContain("conformance desk");
  });

  it("says nothing about offers when the round measured none", () => {
    const empty: RegistryWeekEntry = {
      ...WITH_OFFERS,
      signed_offers: { serving: 0, of_ready: 0, pct: 0 },
    };
    expect(latestReading(empty)).not.toContain("signed offers");
  });

  it("keeps the overclaim off the rendered page too", async () => {
    const body = await (await SELF.fetch(`${BASE}/registry`)).text();
    expect(body).not.toContain("cryptographically verify");
  });
});
