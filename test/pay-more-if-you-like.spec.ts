import { SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { installFacilitatorMock } from "./helpers/facilitator-mock";
import { decodePaymentRequired } from "./helpers/payment";
import { PENNY_PAGE_USDC } from "@/lib/payments";

const BASE = "https://scvd.store";
const PAGE = "/almanac/notes-from-a-tuesday-in-oak-city";

/**
 * A FLOOR WITH ROOM ABOVE IT, NOT A PRICE RISE.
 *
 * Keeper's call after the store's first sale to a stranger turned out to
 * be an almanac page: keep it listed at a penny, and add somewhere to
 * pay more for anyone who thinks it was worth more.
 *
 * The distinction is the whole test. If the first tier ever stops being
 * the penny, every index, listing and discovery file in the store starts
 * quoting a price the till will not take at the bottom — which is a
 * quiet price rise dressed as an option, and the opposite of what was
 * asked for.
 */
describe("penny pages: a penny, and somewhere to pay more", () => {
  beforeAll(() => {
    installFacilitatorMock();
  });

  it("still quotes a penny as the price", async () => {
    const response = await SELF.fetch(`${BASE}${PAGE}`);
    expect(response.status).toBe(402);
    const body = (await response.clone().json()) as Record<string, unknown>;
    expect(body["price_usdc"]).toBe(PENNY_PAGE_USDC);
  });

  it("offers the penny FIRST, so the cheap door is still the door", async () => {
    const challenge = decodePaymentRequired(
      await SELF.fetch(`${BASE}${PAGE}`),
    );
    expect(challenge.accepts.length).toBeGreaterThan(1);
    // Atomic units: a penny of USDC is 10000.
    expect(challenge.accepts[0]?.amount).toBe("10000");
  });

  it("offers higher amounts, ascending, none of them mandatory", async () => {
    const challenge = decodePaymentRequired(
      await SELF.fetch(`${BASE}${PAGE}`),
    );
    const amounts = challenge.accepts.map((tier) => Number(tier.amount));
    expect([...amounts].sort((a, b) => a - b)).toEqual(amounts);
    expect(amounts[amounts.length - 1]).toBeGreaterThan(amounts[0] ?? 0);
  });

  it("says paying more buys nothing extra", async () => {
    // The one sentence that keeps this from being a tier system. No
    // shelf here is better than another shelf; the page is the page.
    const body = (await (
      await SELF.fetch(`${BASE}${PAGE}`)
    ).json()) as Record<string, unknown>;
    const note = String(body["pay_more_if_you_like"]);
    expect(note).toContain("exactly the same page");
    expect(note).toContain("recorded as a tip");
    expect(note).toContain("No tier is better than any other");
  });

  it("keeps the Gazette on the same footing when an issue exists", async () => {
    // Both penny surfaces share one route config, so they cannot drift
    // apart by accident. Conditional because the press may not have run
    // in this environment, and asserting on an issue that was never
    // printed would be testing the fixture rather than the store.
    const response = await SELF.fetch(`${BASE}/gazette/issue-1`);
    if (response.status !== 402) {
      expect(response.status).toBe(404);
      return;
    }
    const challenge = decodePaymentRequired(response);
    expect(challenge.accepts[0]?.amount).toBe("10000");
    expect(challenge.accepts.length).toBeGreaterThan(1);
  });
});
