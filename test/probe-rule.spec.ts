import { SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { installFacilitatorMock } from "./helpers/facilitator-mock";
import { isRecord } from "@/types";

const BASE = "https://scvd.store";

/**
 * THE PROBE RULE. Two outside witnesses on 2026-07-26 said the same
 * thing: Bazaar had registered 14 of 21 items, and x402scout's probe
 * found 3 valid endpoints out of 6 submitted. Both sets of misses were
 * the routes that refuse before the payment gate quotes a price.
 *
 * Asking the price is free and always answers 402. Buying without what
 * the item needs is still refused, before any money moves.
 */

const NEEDS_INPUT = [
  { id: "context_anchor", param: "summary", value: "a state worth keeping" },
  { id: "standing_watch", param: "url", value: "https://example.com/api/buy/thing" },
  { id: "the_confession", param: "confession", value: "I retried without backoff" },
  { id: "coffees_for_closers", param: "win", value: "shipped the thing" },
];

beforeAll(() => {
  installFacilitatorMock();
});

describe("the probe rule", () => {
  for (const item of NEEDS_INPUT) {
    it(`quotes ${item.id} to a bare probe instead of refusing it`, async () => {
      const response = await SELF.fetch(`${BASE}/api/buy/${item.id}`);
      // An indexer arrives with no params and no signature. It has to
      // come away knowing this is an x402 endpoint and what it costs.
      expect(response.status).toBe(402);
      expect(response.headers.get("PAYMENT-REQUIRED")).toBeTruthy();

      const body: unknown = await response.json();
      expect(isRecord(body)).toBe(true);
      if (!isRecord(body)) return;
      // And what to send when it comes back to buy.
      expect(body.required_params).toContain(item.param);
      expect(typeof body.required_params_note).toBe("string");
    });

    it(`still refuses to sell ${item.id} without its ${item.param}`, async () => {
      const response = await SELF.fetch(`${BASE}/api/buy/${item.id}`, {
        headers: { "PAYMENT-SIGNATURE": "not-a-real-signature" },
      });
      // Buying without it is refused before verification or settlement.
      expect(response.status).toBe(400);
      const body: unknown = await response.json();
      expect(isRecord(body)).toBe(true);
      if (!isRecord(body)) return;
      expect(String(body.error).toLowerCase()).toContain("no charge");
    });
  }

  it("leaves items that need nothing exactly as they were", async () => {
    for (const id of ["hello", "small_blessing", "daily_fortune"]) {
      const response = await SELF.fetch(`${BASE}/api/buy/${id}`);
      expect(response.status).toBe(402);
      const body: unknown = await response.json();
      expect(isRecord(body)).toBe(true);
      if (!isRecord(body)) return;
      // No requirement to state, so nothing is stated.
      expect(body.required_params).toBeUndefined();
    }
  });
});
