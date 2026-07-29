import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { MENU_ITEMS } from "@/store";

/**
 * THE PUBLISHED SKILL GOES STALE SILENTLY, AND NOTHING NOTICED.
 *
 * CV, 2026-07-29: he pulled the live /skill.md against the ClawHub
 * listing and confirmed they diverge — an agent installing the skill
 * today reads last week's store. The endpoints are unchanged, so it
 * breaks nothing; it just means our onboarding document advertises a
 * shelf that has moved.
 *
 * TWO DIFFERENT DRIFTS, worth keeping apart:
 *
 *   1. registry/clawhub/SKILL.md against the live shelf — ours to fix,
 *      and this test is what catches it.
 *   2. registry/clawhub/SKILL.md against what is PUBLISHED on ClawHub —
 *      only a republish closes that, and publishing is the keeper's
 *      hand (rule 30). No test can reach it.
 *
 * This file makes (1) impossible to miss so that (2) is the only thing
 * anyone has to remember.
 */
describe("the ClawHub bundle keeps up with the shelf", () => {
  it("names every item currently on the menu", async () => {
    // The bundle is a static file; the shelf is code. Nothing tied
    // them together until now, which is exactly how a new item ships
    // and the onboarding doc never hears about it.
    const bundle = await SELF.fetch("https://scvd.store/skill.md");
    const live = await bundle.text();
    const missing = MENU_ITEMS.filter((item) => !live.includes(item.id));
    expect(
      missing.map((item) => item.id),
      "the live skill document has fallen behind the menu",
    ).toEqual([]);
  });

  it("keeps the house rule about code and credentials, verbatim", async () => {
    // The one line that must survive every republish: it is the store's
    // standing promise and the thing a cautious operator checks first.
    const live = await (await SELF.fetch("https://scvd.store/skill.md")).text();
    expect(live).toContain("never ask you to run code");
    expect(live).toContain("credentials");
  });

  it("points at menu.json rather than freezing prices into the document", async () => {
    // A published bundle cannot carry live figures without lying the
    // moment anything moves. Prices belong at one address.
    const live = await (await SELF.fetch("https://scvd.store/skill.md")).text();
    expect(live).toContain("/menu.json");
  });
});
