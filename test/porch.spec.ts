import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { catIsOut, porchAmbience } from "@/services/porch";
import { PORCH_AMBIENCE } from "@/store/porch";

/**
 * The porch: free, deterministic per hour, nothing for sale.
 */

const BASE = "https://scvd.store";

async function json(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

describe("the porch", () => {
  it("shares one night per hour and counts the seats", async () => {
    const first = await json(await SELF.fetch(`${BASE}/porch`));
    const second = await json(await SELF.fetch(`${BASE}/porch`));
    expect(first["tonight"]).toBe(second["tonight"]);
    expect(PORCH_AMBIENCE).toContain(first["tonight"]);
    expect(["out", "elsewhere"]).toContain(first["cat"]);
    expect(Number(second["seat_tonight"])).toBe(
      Number(first["seat_tonight"]) + 1,
    );
    expect(String(first["note"])).toContain("You don't have to buy anything");
  });

  it("serves humans the night in HTML", async () => {
    const response = await SELF.fetch(`${BASE}/porch`, {
      headers: { Accept: "text/html" },
    });
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("NOTHING FOR SALE OUT HERE");
    expect(html).toContain("to sit tonight");
  });

  it("keeps the same night for the same hour, a different one later", () => {
    const anHour = new Date("2026-07-22T21:10:00Z");
    const sameHour = new Date("2026-07-22T21:55:00Z");
    expect(porchAmbience(anHour)).toBe(porchAmbience(sameHour));
    // The cat's schedule is its own, but it is a schedule.
    expect(catIsOut(anHour)).toBe(catIsOut(sameHour));
  });
});

describe("the paper rooms (regression)", () => {
  /**
   * REWRITTEN 2026-07-30, when the stylesheet was replaced and this
   * test failed for the wrong reason. It asserted the string
   * "--wood-dark" — a colour variable from the old palette — so it was
   * pinning a fixture rather than the behaviour it was named for. A
   * restyle is not a regression, and a test that cannot tell the
   * difference will be deleted by whoever is in a hurry.
   *
   * What it actually guards is that the small rooms are styled by ONE
   * SHARED SHEET rather than each inventing its own: that is the thing
   * that would silently stop being true, and it is checkable without
   * naming a single colour.
   */
  it("styles the smaller rooms from one shared stylesheet", async () => {
    const rooms = ["/directory", "/gazette", "/corrections"];
    const sheets: string[] = [];
    for (const room of rooms) {
      const html = await (
        await SELF.fetch(`${BASE}${room}`, { headers: { Accept: "text/html" } })
      ).text();
      expect(html, `${room} lost its paper wrapper`).toContain('class="paper"');
      const style = /<style>([\s\S]*?)<\/style>/.exec(html)?.[1] ?? "";
      // The sheet's structural contract, not its palette: these are the
      // class names every room's markup depends on.
      expect(style, `${room} has no stylesheet`).toContain(".paper");
      expect(style, `${room} does not style shelf lines`).toContain(
        ".menu-desc",
      );
      sheets.push(style);
    }
    // Same bytes on every room. A page that starts carrying its own
    // variant is the drift this test exists to catch.
    expect(new Set(sheets).size, "the rooms disagree on their stylesheet").toBe(
      1,
    );
  });
});
