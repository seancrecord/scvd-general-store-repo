import { SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { registeredCount } from "@/store/published-counts";
import { installMultiPurchaseFacilitatorMock } from "./helpers/facilitator-mock";
import { buildPaymentSignature, decodePaymentRequired } from "./helpers/payment";

const BASE = "https://scvd.store";

/**
 * THE TILL, BY ITEM, PUBLIC (ruling R3, 2026-09-21): /stats serves the
 * per-item settle counts raw, with the reclassification caveat and a
 * register row beside them, never ordered.
 */

beforeAll(() => {
  installMultiPurchaseFacilitatorMock();
});

describe("the per-item till on the public books", () => {
  it("shows a settle under its item, with the caveat and the denominator rows", async () => {
    const url = `${BASE}/api/buy/hello?agent_name=till-spec`;
    const challenge = decodePaymentRequired(await SELF.fetch(url));
    const paid = await SELF.fetch(url, { headers: { "PAYMENT-SIGNATURE": buildPaymentSignature(challenge.accepts[0]!) } });
    expect(paid.status, await paid.clone().text()).toBe(200);
    const stats = (await (await SELF.fetch(`${BASE}/stats`, { headers: { Accept: "application/json" } })).json()) as {
      till_by_item: Record<string, { organic: number; house: number }>;
      till_by_item_note: string;
    };
    expect(stats.till_by_item["hello"]?.organic).toBeGreaterThanOrEqual(1);
    expect(stats.till_by_item_note).toContain("reclassification");
    expect(stats.till_by_item_note).toContain("Never a ranking");
    expect(registeredCount("/stats", "till_by_item.hello.organic")?.population).toContain("before reclassification");
    expect(registeredCount("/stats", "till_by_item.hello.house")).toBeDefined();
  });
});
