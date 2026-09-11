import { expect, it } from "vitest";
import { installLaborAdmissionHarness, sendLabor, transfers } from "./helpers/labor-admission";
import { items, baseline, facilitator } from "./helpers/buyer-harness";

installLaborAdmissionHarness();
const fields = {
  settlement_attestation: ["payer", "recipient", "amount_usdc", "nonce", "payment_payload"],
  settlement_reconciliation: ["payer", "recipient", "declared_cap_usdc"],
  the_case_file: ["payer", "recipient", "expected_amount_usdc"],
  good_buyer: ["max_usd", "no_spend_controls"],
};
for (const [id, names] of Object.entries(fields)) for (const field of names) for (const door of ["http", "mcp", "mcp-standard"] as const) {
  it(`${id} ${door}: empty supplied ${field} is not omission`, async () => {
    const item = items.find(item => item.id === id)!, verifies = facilitator.verifyCalls;
    const result = await sendLabor(id, door, { ...baseline(item), [field]: "" });
    expect(result.quote).toBe(false);
    expect(result.body).toMatchObject({ code: "bad_request", charged: false, input_field: field });
    expect(facilitator.verifyCalls).toBe(verifies);
    expect(transfers).toBe(0);
  });
}
