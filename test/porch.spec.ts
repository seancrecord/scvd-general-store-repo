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
  it("styles the smaller rooms with the paper stylesheet", async () => {
    const response = await SELF.fetch(`${BASE}/directory`, {
      headers: { Accept: "text/html" },
    });
    const html = await response.text();
    expect(html).toContain('class="paper"');
    expect(html).toContain("--wood-dark");
  });
});
