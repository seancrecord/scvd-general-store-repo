import { SELF } from "cloudflare:test";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { installFacilitatorMock } from "./helpers/facilitator-mock";
import { buildPaymentSignature, decodePaymentRequired } from "./helpers/payment";

const BASE = "https://scvd.store";

let facilitator: ReturnType<typeof installFacilitatorMock>;
beforeAll(() => {
  facilitator = installFacilitatorMock();
});
afterEach(() => {
  delete facilitator.verifyAnswer;
});

/**
 * THE CLASSIFIER, BOTH WAYS, ON THE WIRE (2026-09-04, the keeper's
 * ruling on CV's spot_check decline). The facilitator can answer
 * verify two ways that are not a 200: a verdict wearing a 4xx (a body
 * with isValid: false and its reason — it read the payload and refused
 * it) and a bare refusal with no verdict (401 on our key, 429 on our
 * quota). This afternoon's classifier filed the first as "our
 * credentials, emergency" and the second as "transport, unknown".
 */
async function declineFor(): Promise<Record<string, unknown>> {
  const challenge = decodePaymentRequired(await SELF.fetch(`${BASE}/api/buy/hello`));
  const response = await SELF.fetch(`${BASE}/api/buy/hello`, {
    headers: { "PAYMENT-SIGNATURE": buildPaymentSignature(challenge.accepts[0]!) },
  });
  expect(response.status).toBe(402);
  const body = (await response.json()) as Record<string, unknown>;
  return body["payment_declined"] as Record<string, unknown>;
}

describe("a verdict wearing an error status books as the verdict", () => {
  it("carries the facilitator's own reason, never a verify_error class", async () => {
    facilitator.verifyAnswer = {
      status: 400,
      body: { isValid: false, invalidReason: "invalid_signature", invalidMessage: "signature does not recover to payer" },
    };
    const declined = await declineFor();
    expect(declined["reason"]).toBe("invalid_signature");
    expect(String(declined["message"] ?? "")).toContain("does not recover");
    // Judged: the buyer is NOT told to resend the same bytes.
    expect(declined["fault"]).not.toBe("upstream");
  });
});

describe("a refusal to talk to us books as the emergency", () => {
  it("files a bare 401 as upstream_auth, the one class that pages as ours", async () => {
    facilitator.verifyAnswer = { status: 401, body: { error: "unauthorized" } };
    const declined = await declineFor();
    expect(declined["reason"]).toBe("verify_error:upstream_auth");
    // Never judged: the buyer's payload was fine and may be resent.
    expect(declined["fault"]).toBe("upstream");
  });

  it("files a bare 400 with no verdict as a 4xx we cannot blame on anyone yet", async () => {
    facilitator.verifyAnswer = { status: 400, body: { error: "malformed request" } };
    const declined = await declineFor();
    expect(declined["reason"]).toBe("verify_error:upstream_4xx");
  });
});
