import { SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { installFacilitatorMock } from "./helpers/facilitator-mock";
import {
  buildPaymentSignature,
  decodePaymentRequired,
} from "./helpers/payment";

const BASE = "https://scvd.store";

/**
 * CAIRN'S COLD WALK, AS A TEST (2026-08-25).
 *
 * An outside instrument walked this store as a customer with no notice,
 * bought three things, and found exactly one thing wrong: it sent the
 * identical valid envelope under both header names on a half-cent
 * blessing, got a 402 under X-PAYMENT and a settlement under
 * PAYMENT-SIGNATURE, and published the result.
 *
 * x402 v2 names the header PAYMENT-SIGNATURE; v1 named it X-PAYMENT,
 * and much of the live ecosystem still sends the old name around a
 * perfectly valid v2 body. Those buyers were being handed a 402 while
 * holding a signature that would have settled.
 *
 * IT HAD BEEN REPORTED BEFORE AND DISMISSED. Three call sites read
 * `PAYMENT-SIGNATURE ?? X-PAYMENT`, and their existence was mistaken
 * for proof the door accepted both — but one writes a decline reason
 * after the refusal, and the other decides whether pre-payment guards
 * apply. Neither accepts a payment. Nobody sent the header until
 * somebody spent real money to.
 *
 * So this holds the BEHAVIOUR, not the call sites: the same envelope,
 * under both names, must reach the same outcome.
 */
describe("the older header name still buys", () => {
  beforeAll(() => {
    installFacilitatorMock();
  });

  async function envelopeFor(path: string): Promise<string> {
    const challenge = await SELF.fetch(`${BASE}${path}`);
    expect(challenge.status).toBe(402);
    const accepted = decodePaymentRequired(challenge).accepts[0];
    if (!accepted) throw new Error("no tier offered");
    return buildPaymentSignature(accepted);
  }

  it("settles under X-PAYMENT, the name v1 used", async () => {
    const path = "/api/buy/hello";
    const response = await SELF.fetch(`${BASE}${path}`, {
      headers: { "X-PAYMENT": await envelopeFor(path) },
    });
    expect(
      response.status,
      "a valid envelope under the ecosystem's older header name was refused",
    ).toBe(200);
  });

  it("settles under PAYMENT-SIGNATURE, the name v2 uses", async () => {
    const path = "/api/buy/hello";
    const response = await SELF.fetch(`${BASE}${path}`, {
      headers: { "PAYMENT-SIGNATURE": await envelopeFor(path) },
    });
    expect(response.status).toBe(200);
  });

  /**
   * The half of the walk that already worked, kept so a future change
   * cannot fix one name by breaking the other.
   */
  it("still asks for a price when no envelope rides in", async () => {
    const response = await SELF.fetch(`${BASE}/api/buy/hello`);
    expect(response.status).toBe(402);
  });

  /**
   * The alias is exactly one header wide. A blanket fallback would be
   * guessing about headers nobody asked us to guess about.
   */
  it("does not alias any other header", async () => {
    const path = "/api/buy/hello";
    const response = await SELF.fetch(`${BASE}${path}`, {
      headers: { "X-PAYMENT-SIGNATURE": await envelopeFor(path) },
    });
    expect(
      response.status,
      "a header nobody documented was treated as payment",
    ).toBe(402);
  });
});
