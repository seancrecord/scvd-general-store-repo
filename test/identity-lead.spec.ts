import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import {
  OBSERVATORY_MARKER,
  STORE_MARKER,
  cheapestUsdc,
} from "@/store/identity-lead";
import { MENU_ITEMS } from "@/store";

const BASE = "https://scvd.store";

/**
 * ROADMAP 0.10 — THE ORDERING CANARY.
 *
 * Every agent-facing surface has to say what this store IS before it
 * says what it SELLS. Not because the store voice is wrong — it is
 * the most distinctive thing here — but because a machine reader
 * stops at the first line, and "Sean-Claude Van Damme's General
 * Store" tells an agent choosing where to route a conformance check
 * precisely nothing about x402.
 *
 * WHY POSITION AND NOT TEXT. Asserting the exact wording would mean
 * this test breaks every time the keeper improves a sentence, and a
 * test that cries wolf on legitimate edits gets deleted. Asserting
 * ORDER breaks only when somebody buries the identity again, which is
 * the actual failure being guarded against.
 */
const SURFACES: { path: string; accept?: string }[] = [
  { path: "/llms.txt" },
  { path: "/agents.md" },
  { path: "/what", accept: "application/json" },
  { path: "/skill.md" },
];

describe("every agent-facing surface leads with what this store is", () => {
  for (const surface of SURFACES) {
    it(`puts the observatory before the shop on ${surface.path}`, async () => {
      const response = await SELF.fetch(`${BASE}${surface.path}`, {
        headers: surface.accept ? { Accept: surface.accept } : {},
      });
      expect(response.status).toBe(200);
      const body = await response.text();

      const observatory = body.indexOf(OBSERVATORY_MARKER);
      const shop = body.indexOf(STORE_MARKER);

      expect(observatory).toBeGreaterThanOrEqual(0);
      expect(shop).toBeGreaterThanOrEqual(0);
      // The whole assertion: identity first, shop second.
      expect(observatory).toBeLessThan(shop);
    });
  }

  it("states the refusals before the price list", async () => {
    /*
     * "Not a score, not a rating, not a ranking" is the differentiator,
     * not a footnote. A reader who stops after two sentences should
     * have learned what we will not do before learning what we charge.
     */
    const body = await (await SELF.fetch(`${BASE}/llms.txt`)).text();
    const refusal = body.indexOf("is a score, a rating, or a ranking");
    const paid = body.indexOf("Paid instruments");
    expect(refusal).toBeGreaterThanOrEqual(0);
    expect(paid).toBeGreaterThan(refusal);
  });
});

describe("the shelf floor is derived, not remembered", () => {
  it("quotes the real cheapest price", () => {
    /*
     * Three files said "half a cent" while the cheapest item was
     * $0.004. A store-wide price claim typed by hand is a claim that
     * goes stale the first time anything is repriced.
     */
    const lowest = Math.min(...MENU_ITEMS.map((item) => item.price_usdc));
    expect(cheapestUsdc()).toBe(lowest);
    expect(cheapestUsdc()).toBeLessThan(0.005);
  });

  it("never says half a cent on a surface that means the whole shelf", async () => {
    const body = await (await SELF.fetch(`${BASE}/llms.txt`)).text();
    expect(body).not.toMatch(/cheapest[^.]{0,40}half a cent/i);
  });
});
