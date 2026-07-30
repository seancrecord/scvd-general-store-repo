import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { SETTLED, THESES, WATCHED } from "@/store/becoming";
import { MENU_ITEMS } from "@/store";
import { whatFaq } from "@/store/copy/what";

const BASE = "https://scvd.store";
const HTML = { Accept: "text/html" };

/**
 * THE QUARANTINE, HELD BY TEST.
 *
 * /what ends its inventory with "all of that is running now; none of
 * it is a roadmap." That sentence stops being true the moment a
 * forward-looking claim leaks onto it, or the moment /becoming starts
 * reading like a catalogue. An evaluator who checks a vision statement
 * and finds it unbuilt discounts the true claims alongside the false
 * ones — which is the whole reason the two pages are separate rather
 * than one page with a disclaimer.
 */
describe("nothing on the roadmap reads as available", () => {
  it("names no purchasable item", () => {
    // The hardest failure to notice: a plan drifting into the shape of
    // an offer. If a shelf id appears here, a reader could reasonably
    // try to buy something that does not exist.
    const text = [
      ...THESES.map((entry) => `${entry.claim} ${entry.falsified_by}`),
      ...SETTLED.map((entry) => `${entry.question} ${entry.answer} ${entry.because}`),
      ...WATCHED.map((entry) => `${entry.item} ${entry.trigger} ${entry.today}`),
    ].join(" ");
    for (const item of MENU_ITEMS) {
      expect(text, `/becoming names the shelf item ${item.id}`).not.toContain(
        item.id,
      );
    }
  });

  it("says out loud that nothing on it is available", async () => {
    const page = await (
      await SELF.fetch(`${BASE}/becoming`, { headers: HTML })
    ).text();
    expect(page).toContain("NOTHING ON THIS PAGE IS AVAILABLE");
    // And points at the page that IS the inventory, so a reader who
    // arrived wanting to buy is not left at a dead end.
    expect(page).toContain('href="/what"');
  });

  it("gives every unbuilt thing a trigger and an honest today", () => {
    // A trigger is a fact somebody outside can check. A date is a
    // promise about a calendar. The Solana decision was written this
    // way before this page existed; the page generalises it, and an
    // entry without one would be a wish wearing a plan's clothes.
    for (const entry of WATCHED) {
      expect(entry.trigger.length, `${entry.item} has no trigger`).toBeGreaterThan(
        30,
      );
      expect(entry.today.length, `${entry.item} does not say what exists now`).toBeGreaterThan(
        20,
      );
    }
  });

  it("gives every thesis a way to be shown false", () => {
    // A claim with no falsifier is a slogan. This store does not get to
    // publish those on a page an answer engine will quote.
    for (const entry of THESES) {
      expect(
        entry.falsified_by.length,
        `"${entry.claim}" has no falsifier`,
      ).toBeGreaterThan(40);
    }
  });
});

describe("the two pages stay on their own sides", () => {
  it("keeps /what free of roadmap language", () => {
    // The inventory page must not acquire a future tense. If it does,
    // the quarantine is decorative.
    const answers = whatFaq(BASE)
      .map((pair) => pair.answer)
      .join(" ");
    /**
     * FUTURE-TENSE CLAIMS, not the word "roadmap" — which /what uses in
     * the sentence that DENIES having one ("none of it is a roadmap").
     * Banning the noun failed on the denial, the third time today a
     * test caught prose that names a thing in order to refuse it: the
     * /pulse leak test tripped on its own no-user-agents promise, and
     * the escrow guard had to be written to require the denial rather
     * than forbid the word. A guard that cannot tell a claim from its
     * refutation will always fire on the most careful sentence on the
     * page.
     */
    expect(answers).not.toMatch(
      /\b(we will soon|coming soon|planned for|in the near future|we plan to|will be able to)\b/i,
    );
  });

  it("keeps /what's claim that nothing on it is a roadmap", () => {
    const answers = whatFaq(BASE)
      .map((pair) => pair.answer)
      .join(" ");
    expect(answers).toContain("none of it is a roadmap");
  });
});
