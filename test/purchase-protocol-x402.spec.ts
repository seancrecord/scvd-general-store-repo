import { afterEach, expect, it, vi } from "vitest";
import { installLaborAdmissionHarness, signLabor, sendLabor } from "./helpers/labor-admission";
import { call, items, shelves, object, testEnv, facilitator } from "./helpers/buyer-harness";
import { purchaseIntentStore } from "@/services/purchase-intent";

installLaborAdmissionHarness();
afterEach(() => { vi.restoreAllMocks(); facilitator.settleShouldFail = false; });

for (const door of ["http", "mcp"] as const) {
  it(`${door}: checkout retains protocol facts before a settlement failure`, async () => {
    const item = items.find(i => i.id === "context_anchor")!;
    const args = { summary: `SCVD-E2E-protocol-${crypto.randomUUID()}` };
    const offer = (await call(item, "mcp", args, shelves(item)[0])).offers[0]!;
    const wire = await signLabor(offer);
    facilitator.settleShouldFail = true;
    const failed = await sendLabor(item.id, door, args, wire, crypto.randomUUID());
    expect(failed.body).toMatchObject({ code: "payment_declined", charged: false });
    const recovery = object(failed.body.recovery);
    const record = JSON.parse((await purchaseIntentStore(testEnv, String(recovery.purchase_id)).existingPurchase())!);
    expect(record).toMatchObject({ version: 2, payment_context: {
      protocol: "x402", method: "exact", network: offer.network, asset: offer.asset,
      amount_atomic: offer.amount, recipient: offer.payTo,
    } });
    expect(record.payment_context.identity).toBe(record.id);
    expect(record.request_digest).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(record)).not.toContain(String(object(wire.payload).signature));
  });
}
