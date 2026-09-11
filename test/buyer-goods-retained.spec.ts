import { afterEach, expect, it, vi } from "vitest";
import * as inputChecks from "@/lib/purchase-args";
import { NAME_CAP } from "@/lib/sanitize";
import { installLaborAdmissionHarness, laborNetworks, signLabor, sendLabor, transfers, certificateId } from "./helpers/labor-admission";
import { items, baseline, call, shelves, facilitator, object } from "./helpers/buyer-harness";
installLaborAdmissionHarness();
afterEach(() => vi.restoreAllMocks());
for (const door of ["http", "mcp", "mcp-standard"] as const) for (const network of laborNetworks()) for (const oldInput of ["name", "constraint"] as const) {
  it(`${door} ${network} ${oldInput}: tighter inputs preserve authenticated original paid goods`, async () => {
    const item = items.find(i => i.id === (oldInput === "name" ? "hello" : "settlement_attestation"))!, valid = baseline(item);
    const args = { ...valid, ...(oldInput === "name" ? { agent_name: "n".repeat(NAME_CAP + 1) } : { payer: "old-invalid-optional-payer" }) };
    const quote = await call(item, "mcp", valid, shelves(item)[0]!);
    const payment = await signLabor(quote.offers.find(o => o.network === network)!);
    // Reproduce an older admission and its old shortened name while retaining
    // the original requested bytes, payment identity and real fixture journal.
    const oldPolicy = vi.spyOn(inputChecks, "checkPurchaseArgs").mockResolvedValueOnce(undefined);
    const map = inputChecks.purchaseInputFrom;
    const oldMap = vi.spyOn(inputChecks, "purchaseInputFrom").mockImplementation((bought, supplied) => {
      const input = map(bought, supplied);
      if (oldInput === "name" && input.agentName) input.agentName = input.agentName.slice(0, NAME_CAP);
      return input;
    });
    const first = await sendLabor(item.id, door, args, payment, crypto.randomUUID());
    oldPolicy.mockRestore(); oldMap.mockRestore();
    expect(first.refused).toBe(false);
    const verifies = facilitator.verifyCalls, retry = await sendLabor(item.id, door, args, payment);
    expect(retry.refused).toBe(false);
    expect(certificateId(retry.body)).toBe(certificateId(first.body));
    expect(certificateId(first.body)).toEqual(expect.any(String));
    expect(retry.body).toMatchObject({ charged: true, charged_again: false });
    expect(retry.body.signed_payload).toBe(first.body.signed_payload);
    expect(retry.body.signature).toBe(first.body.signature);
    expect(retry.body.deliverable).toEqual(first.body.deliverable);
    if (oldInput === "constraint") expect(retry.body.attestation).toEqual(first.body.attestation);
    else expect(object(JSON.parse(String(retry.body.signed_payload))).name).toBe("n".repeat(NAME_CAP));
    expect(facilitator.verifyCalls).toBe(verifies); expect(transfers).toBe(1);
    const tampered = structuredClone(payment);
    if (network.startsWith("eip155:")) object(tampered.payload).signature = `0x${"00".repeat(65)}`;
    else object(tampered.payload).transaction = "invalid";
    const refused = await sendLabor(item.id, door, args, tampered);
    expect(refused.refused).toBe(true); expect(refused.body.code).toBe("bad_request");
    expect(refused.body.cert_id).toBeUndefined(); expect(transfers).toBe(1);
  });
}
