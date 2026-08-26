import { SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { installFacilitatorMock } from "./helpers/facilitator-mock";

/**
 * THE DOOR ADVERTISES BOTH DIALECTS IT HONOURS (2026-08-26, a hygiene
 * note from an outside instrument, verified and accepted).
 *
 * Since the v1 dialect shim, the till accepts X-PAYMENT beside
 * PAYMENT-SIGNATURE — but the 402 still said `Vary:
 * PAYMENT-SIGNATURE` alone, and its body told buyers to "retry with
 * the PAYMENT-SIGNATURE header" without mentioning the v1 header at
 * all. cache-control: no-store means no live cache risk, which makes
 * this hygiene rather than a defect — and hygiene today is where the
 * cache bug comes from the day an edge layer appears. Worse, the
 * body's own instructions would convince a v1 client it cannot pay
 * here, which is the exact confusion the shim exists to end.
 */

describe("the 402 advertises both payment dialects", () => {
  beforeAll(installFacilitatorMock);

  it("Vary names every payment header the door honours", async () => {
    const response = await SELF.fetch("https://scvd.store/api/buy/hello");
    expect(response.status).toBe(402);
    const vary = response.headers.get("Vary") ?? "";
    expect(vary).toContain("PAYMENT-SIGNATURE");
    expect(vary).toContain("X-PAYMENT");
  });

  it("the body's instructions mention the v1 header too", async () => {
    const response = await SELF.fetch("https://scvd.store/api/buy/hello");
    const body = (await response.json()) as { note?: string };
    expect(body.note).toContain("PAYMENT-SIGNATURE");
    expect(body.note).toContain("X-PAYMENT");
  });
});
