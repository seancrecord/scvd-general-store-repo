import { SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { installFacilitatorMock } from "./helpers/facilitator-mock";
import { isRecord } from "@/types";

const BASE = "https://scvd.store";

/** The old bare-402 discovery policy is superseded by BUY-002. A scanner
 * learns prices and inputs free, then requests terms for a valid purchase. */

const NEEDS_INPUT = [
  { id: "context_anchor", param: "summary", value: "a state worth keeping" },
  { id: "standing_watch", param: "url", value: "https://example.com/api/buy/thing" },
  { id: "the_confession", param: "confession", value: "I retried without backoff" },
  { id: "coffees_for_closers", param: "win", value: "shipped the thing" },
];

beforeAll(() => {
  installFacilitatorMock();
});

describe("strict purchase inputs and free discovery", () => {
  for (const item of NEEDS_INPUT) {
    it(`routes a bare ${item.id} probe to its free contract before quoting`, async () => {
      const response = await SELF.fetch(`${BASE}/api/buy/${item.id}`);
      expect(response.status).toBe(400);
      expect(response.headers.get("PAYMENT-REQUIRED")).toBeNull();
      const body = await response.json() as Record<string, unknown>;
      expect(body.input_field).toBe(item.param);
      const discovery = await SELF.fetch(String(body.input_contract_url));
      expect(discovery.status).toBe(200);
      expect(discovery.headers.get("PAYMENT-REQUIRED")).toBeNull();
      const contract = await discovery.json() as Record<string, unknown>;
      expect(typeof contract.price_usdc).toBe("number");
      const url = new URL(`${BASE}/api/buy/${item.id}`);
      url.searchParams.set(item.param, item.value);
      const quote = await SELF.fetch(url);
      expect(quote.status).toBe(402);
      expect(quote.headers.get("PAYMENT-REQUIRED")).toBeTruthy();
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
    for (const id of ["hello", "small_blessing"]) {
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
