import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { RIGHTS } from "@/store/rights";
import { ROOMS } from "@/store/rooms";

const BASE = "https://scvd.store";

/**
 * WHAT'S YOURS — the axis a signature is silent about.
 *
 * @miacollective's finding, and it was an axis rather than a wording
 * problem: a signed artifact can be exactly right about WHEN it was
 * signed and WHAT it says while saying nothing about WHO IT BELONGS
 * TO. made_by answers who produced it, /attestation answers what the
 * signature proves, /wind-down answers what happens at the end. The
 * middle was empty on every surface while four shelves sold custody.
 */
describe("the store says whose the thing is", () => {
  it("answers the four questions a buyer actually asks", async () => {
    const body = (await (await SELF.fetch(`${BASE}/rights`)).json()) as {
      summary: Record<string, unknown>;
    };
    // Booleans beside the prose, because "no licence required" is the
    // fact a summariser gets wrong in the CAUTIOUS direction if it has
    // to infer it — and a wrongly cautious summary of this page costs
    // a buyer something the keeper deliberately gave away.
    expect(body.summary["buyer_owns_artifact"]).toBe(true);
    expect(body.summary["transferable"]).toBe(true);
    expect(body.summary["redistribution_permitted"]).toBe(true);
    expect(body.summary["attribution_required"]).toBe(false);
    expect(body.summary["additional_licence_or_fee"]).toBeNull();
    expect(body.summary["keeper_words_included"]).toBe(true);
  });

  it("states the immutability as part of the contract, not a courtesy", async () => {
    const page = await (
      await SELF.fetch(`${BASE}/rights`, { headers: { Accept: "text/html" } })
    ).text();
    expect(page).toContain("Immutable is part of what you paid for");
  });

  it("admits that transfer works because nobody is keeping track", async () => {
    // The load-bearing honesty. "It transfers" sounds like a feature
    // and is an admission: there is no register of owners, so there is
    // nothing to update and no way for us to confirm a transfer
    // happened. Stated as what it is rather than dressed up.
    const clause = RIGHTS.find((entry) => /sell it, give it away/i.test(entry.question));
    expect(clause).toBeTruthy();
    expect(clause?.in_practice).toMatch(/no register of owners/i);
  });

  it("does not quietly reserve a licence anywhere in its own prose", async () => {
    // The failure mode for a page this generous is a hedge creeping
    // into one clause and taking the generosity back where nobody
    // reads. If a future edit wants to reserve something, it has to
    // delete this test on purpose.
    const RESERVATIONS =
      /\b(non-commercial|personal use only|may not redistribute|all rights reserved|licen[cs]e fee|royalt)/i;
    for (const clause of RIGHTS) {
      expect(
        RESERVATIONS.test(clause.in_practice) || RESERVATIONS.test(clause.answer),
        `"${clause.question}" quietly reserves something`,
      ).toBe(false);
    }
  });

  it("is a room, so it joins the nav, the sitemap and the front of the store", async () => {
    // The lesson from /attestation shipping into a sitemap and nothing
    // else: a page nothing links to is a page nobody reads, however
    // good it is.
    expect(ROOMS.map((room) => room.path)).toContain("/rights");
    const sitemap = await (await SELF.fetch(`${BASE}/sitemap.xml`)).text();
    expect(sitemap).toContain("/rights");
  });

  it("is reachable from the two pages it sits between", async () => {
    const page = await (
      await SELF.fetch(`${BASE}/rights`, { headers: { Accept: "text/html" } })
    ).text();
    expect(page).toContain('href="/attestation"');
    expect(page).toContain('href="/wind-down"');
  });
});
