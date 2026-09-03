import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { DISAGREEMENTS, openDisagreements } from "@/store/disagreements";
import { ROOMS } from "@/store/rooms";

/**
 * THE DISAGREEMENT RECORD (house rule 51, 2026-09-02). What this file
 * holds:
 *
 *   - every entry is two readings with derivations and sources, a
 *     named trigger, a state from the four, and the date it went to
 *     the other side no later than the date it was published here;
 *   - a withdrawn-by-us entry names the correction that did it, and
 *     the correction exists;
 *   - "settled" is not a word the record uses for a state;
 *   - the page serves a person and a machine at one URL, points at
 *     the corrections desk and the vocabulary, and says when nothing
 *     stands open rather than serving an empty list;
 *   - the room is registered, so the guide and the atlas carry it.
 */

const BASE = "https://scvd.store";
const STATES = new Set(["open", "withdrawn_by_us", "withdrawn_by_them", "both_stand"]);

describe("every entry keeps the arrangement's terms", () => {
  it("carries both readings with derivation and source, a trigger, and a checkable state", () => {
    expect(DISAGREEMENTS.length).toBeGreaterThan(0);
    for (const entry of DISAGREEMENTS) {
      expect(entry.id).toMatch(/^\d{4}-\d{2}-\d{2}-[a-z0-9-]+$/);
      expect(entry.subject.length).toBeGreaterThan(30);
      expect(entry.trigger.length).toBeGreaterThan(30);
      for (const reading of [entry.ours, entry.theirs]) {
        expect(reading.instrument).toBeTruthy();
        expect(reading.said.length).toBeGreaterThan(20);
        expect(reading.derivation.length).toBeGreaterThan(40);
        expect(reading.url).toMatch(/^https:\/\//);
        expect(reading.read_on).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
      expect(entry.ours.instrument).toBe("scvd.store");
      expect(entry.theirs.instrument).not.toBe("scvd.store");
      expect(STATES.has(entry.state)).toBe(true);
      expect(entry.state_rests_on.length).toBeGreaterThan(40);
    }
  });

  it("went to the other side before it went here — private first, in both directions", () => {
    for (const entry of DISAGREEMENTS) {
      expect(
        entry.sent_privately_on <= entry.published_on,
        `${entry.id} was published before it was sent, which is the event the arrangement names`,
      ).toBe(true);
    }
  });

  it("a reading withdrawn by us names the correction that did it, and the correction exists", async () => {
    const corrections = (await (
      await SELF.fetch(`${BASE}/corrections`, { headers: { Accept: "application/json" } })
    ).json()) as { corrections: { date: string }[] };
    for (const entry of DISAGREEMENTS.filter((row) => row.state === "withdrawn_by_us")) {
      expect(entry.correction_date, `${entry.id} withdrawn by us without a correction`).toBeTruthy();
      expect(corrections.corrections.some((row) => row.date === entry.correction_date)).toBe(true);
    }
  });

  it("never calls a divergence settled", () => {
    for (const entry of DISAGREEMENTS) {
      expect(entry.state).not.toMatch(/settled|resolved/);
    }
  });
});

describe("the page", () => {
  it("serves a person and a machine at one URL, with the mechanism above the list", async () => {
    const html = await (await SELF.fetch(`${BASE}/disagreements`, { headers: { Accept: "text/html" } })).text();
    expect(html).toContain("Disagreements");
    expect(html.indexOf("Four states")).toBeLessThan(html.indexOf("Trigger:"));
    expect(html).toContain("cairnwake.com");
    expect(html).toContain("/corrections");
    expect(html).toContain("/defects");

    const response = await SELF.fetch(`${BASE}/disagreements`, { headers: { Accept: "application/json" } });
    expect(response.headers.get("content-type")).toContain("application/json");
    const body = (await response.json()) as Record<string, any>;
    expect(body.on_record).toBe(DISAGREEMENTS.length);
    expect(body.open).toBe(openDisagreements().length);
    expect(String(body.corrections)).toContain("/corrections");
    expect(body.disagreements[0].theirs.url).toMatch(/^https:\/\//);
    if (body.open === 0) expect(body.none_open).toContain("No divergence stands open");
  });

  it("is a registered room, so the derived rosters carry it", () => {
    expect(ROOMS.map((room) => room.path)).toContain("/disagreements");
  });

  it("is one hop from the trust panel and the vocabulary page", async () => {
    const trust = await (await SELF.fetch(`${BASE}/trust`, { headers: { Accept: "text/html" } })).text();
    expect(trust).toContain("/disagreements");
    const defects = await (await SELF.fetch(`${BASE}/defects`, { headers: { Accept: "text/html" } })).text();
    expect(defects).toContain("/disagreements");
  });
});
