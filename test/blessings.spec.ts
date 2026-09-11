import { describe, expect, it } from "vitest";
import { BLESSINGS, BLESSING_SEASONS } from "@/store/blessings";

/**
 * THE JAR'S BAR (2026-09-11). Seasons are appended in batches with a
 * tone each; this is what every batch has to clear before it is in
 * the jar, so variety is checked rather than remembered.
 */
describe("the blessing jar", () => {
  it("reads every season in filling order", () => {
    expect(BLESSINGS).toEqual(BLESSING_SEASONS.flatMap((s) => s.slips));
    expect(BLESSING_SEASONS.map((s) => s.season)).toEqual(BLESSING_SEASONS.map((_, i) => i + 1));
  });

  it("holds no duplicate slip across the whole jar, and none blank", () => {
    const seen = new Set<string>();
    for (const slip of BLESSINGS) {
      const key = slip.trim().toLowerCase();
      expect(key.length).toBeGreaterThan(0);
      expect(seen.has(key), `duplicate slip: ${slip}`).toBe(false);
      seen.add(key);
    }
  });

  it("keeps every slip short enough for a receipt", () => {
    for (const slip of BLESSINGS) expect(slip.length, slip).toBeLessThanOrEqual(120);
  });

  it("fills every season with at least twenty slips and a tone", () => {
    for (const season of BLESSING_SEASONS) {
      expect(season.slips.length, `season ${season.season}`).toBeGreaterThanOrEqual(20);
      expect(season.tone.length).toBeGreaterThan(0);
      expect(season.opened).toMatch(/^\d{4}-\d{2}$/);
    }
  });

  it("varies the shape of every season after the first: no opening word carries more than a third of it", () => {
    for (const season of BLESSING_SEASONS.slice(1)) {
      const openers = new Map<string, number>();
      for (const slip of season.slips) {
        const word = (slip.split(/\s+/)[0] ?? "").toLowerCase().replace(/[^a-z']/g, "");
        openers.set(word, (openers.get(word) ?? 0) + 1);
      }
      const top = Math.max(...openers.values());
      expect(top / season.slips.length, `season ${season.season} opens ${top} of ${season.slips.length} slips the same way`).toBeLessThanOrEqual(1 / 3);
    }
  });
});
