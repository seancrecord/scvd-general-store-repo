import { SELF, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { Env } from "@/types";

const BASE = "https://scvd.store";
const testEnv = env as unknown as Env;

/**
 * /rails — the books' split, drawn (2026-08-21, the night the third
 * rail lit). What these pin: the page derives from the till's own
 * counters (seeded here, read back drawn), the table always rides
 * beside the picture so no reader depends on SVG, the three rails
 * are named in fixed order, and the JSON twin serves the same data.
 */
describe("/rails draws the books", () => {
  it("charts what the till counted, with the table beside the picture", async () => {
    await testEnv.COUNTERS.put("metric:2026-08:rail:base", "3");
    await testEnv.COUNTERS.put("metric:2026-08:rail:polygon", "2");
    await testEnv.COUNTERS.put("metric:2026-08:rail:solana", "1");
    const page = await (
      await SELF.fetch(`${BASE}/rails`, { headers: { Accept: "text/html" } })
    ).text();
    expect(page).toContain("<svg");
    // Fixed series order, all three named — legend + table headers.
    for (const label of ["Base", "Polygon", "Solana"]) {
      expect(page).toContain(label);
    }
    // The table carries the same numbers as the picture.
    expect(page).toContain("<td>2026-08</td><td>3</td><td>2</td><td>1</td>");
    // Native tooltips ride the marks.
    expect(page).toContain("organic settlement");
  });

  it("keeps house traffic out — railh counters never reach the page", async () => {
    await testEnv.COUNTERS.put("metric:2026-08:railh:base", "999");
    const response = await SELF.fetch(`${BASE}/rails`, {
      headers: { Accept: "application/json" },
    });
    const body = (await response.json()) as {
      by_month_from_the_till: { month: string; base: number }[];
    };
    const aug = body.by_month_from_the_till.find((m) => m.month === "2026-08");
    expect(aug?.base ?? 0).toBeLessThan(999);
  });

  it("serves the same data as JSON with the method named", async () => {
    const response = await SELF.fetch(`${BASE}/rails`, {
      headers: { Accept: "application/json" },
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.rails_accepted).toEqual(["eip155:8453", "eip155:137", "solana"]);
    expect(String(body.method)).toContain("till");
  });
});
