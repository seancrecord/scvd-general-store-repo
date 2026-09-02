import { SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { installFacilitatorMock } from "./helpers/facilitator-mock";
import { MENU_ITEMS } from "@/store";

const BASE = "https://scvd.store";

/**
 * A 402 IS NOT A PAGE (2026-09-02). Every paid door answers 402 to a
 * plain GET and every one is linked from the menu, so Search Console
 * filed them all under "blocked due to other 4xx". The challenge is
 * correct; indexing it is not. One header on every 402, wherever it
 * was minted, derived over the whole shelf rather than a typed list.
 */
describe("X-Robots-Tag on every 402", { timeout: 120_000 }, () => {
  beforeAll(() => {
    installFacilitatorMock();
  });

  it("marks every paid door's challenge noindex", async () => {
    let challenges = 0;
    for (const item of MENU_ITEMS) {
      const response = await SELF.fetch(`${BASE}/api/buy/${item.id}`, {
        headers: { "User-Agent": "Googlebot/2.1", Accept: "text/html" },
      });
      if (response.status !== 402) continue;
      challenges += 1;
      expect(response.headers.get("x-robots-tag"), item.id).toContain("noindex");
    }
    expect(challenges).toBeGreaterThan(10);
  });

  it("leaves a 200 page alone", async () => {
    const response = await SELF.fetch(`${BASE}/what`, { headers: { Accept: "text/html" } });
    expect(response.status).toBe(200);
    expect(response.headers.get("x-robots-tag")).toBeNull();
  });
});
