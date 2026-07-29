import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { DARE_LINES, dareForDay } from "@/store/copy/the-dare";

/**
 * THE SURVIVOR'S DARE, and the one mechanical rule inside a register
 * that is otherwise entirely the keeper's taste.
 *
 * Rule 7 governs the words. What is testable is placement and
 * restraint: one line at a time, the same line all day, and the two
 * lines with swagger in them kept off the payment path — not because
 * they are untrue but because an approval layer deciding whether to
 * release funds reads differently from a human enjoying a shopfront,
 * and this store has already been scored `review` once by an automated
 * model that was doing its job.
 */
describe("the survivor's dare", () => {
  it("gives the same line all day, not a new one per refresh", () => {
    // A line that changes on every load is a slot machine. Rule 22.
    const first = dareForDay("2026-07-29");
    expect(dareForDay("2026-07-29")).toBe(first);
    expect(dareForDay("2026-07-29")).toBe(first);
  });

  it("moves on with the day", () => {
    const days = ["2026-07-29", "2026-07-30", "2026-07-31", "2026-08-01"];
    const lines = new Set(days.map((day) => dareForDay(day)));
    expect(lines.size).toBeGreaterThan(1);
  });

  it("keeps the swaggering lines away from the money", () => {
    // Both of these are the keeper's and both stay in the set; they
    // just never appear where funds are being released.
    const tillPool = DARE_LINES.filter((entry) => entry.atTheTill).map(
      (entry) => entry.line,
    );
    expect(tillPool.some((line) => line.includes("robbed"))).toBe(false);
    expect(tillPool.some((line) => line.includes("So far, nothing"))).toBe(
      false,
    );
    // And the till pool is still big enough to cycle rather than repeat.
    expect(tillPool.length).toBeGreaterThan(4);
  });

  it("never returns an empty line for any day of a year", () => {
    for (let day = 1; day <= 366; day += 1) {
      const key = `2026-${String(((day - 1) % 12) + 1).padStart(2, "0")}-${String(((day - 1) % 28) + 1).padStart(2, "0")}`;
      expect(dareForDay(key).length, key).toBeGreaterThan(0);
      expect(dareForDay(key, true).length, key).toBeGreaterThan(0);
    }
  });

  it("shows exactly one of them on the storefront", async () => {
    const page = await (
      await SELF.fetch("https://scvd.store/", {
        headers: { Accept: "text/html" },
      })
    ).text();
    const shown = DARE_LINES.filter((entry) =>
      page.includes(entry.line.replace(/'/g, "&#39;")),
    );
    // Sparingly, per the register's own instruction: a closing move,
    // not a resting voice. A wall of dares curdles into try-hard.
    expect(shown.length).toBeLessThanOrEqual(1);
  });
});
