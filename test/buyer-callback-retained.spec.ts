import { afterEach, expect, it, vi } from "vitest";
import * as inputChecks from "@/lib/purchase-args";
import { completeOrder } from "@/services/orders";
import { installLaborAdmissionHarness, laborNetworks, signLabor, sendLabor, transfers } from "./helpers/labor-admission";
import { items, baseline, call, shelves, testEnv, facilitator, object } from "./helpers/buyer-harness";

installLaborAdmissionHarness();
afterEach(() => vi.restoreAllMocks());
for (const door of ["http", "mcp", "mcp-standard"] as const) for (const network of laborNetworks()) for (const olderInput of ["callback", "target"] as const) {
  it(`${door} ${network} ${olderInput}: a retained purchase predating destination policy still retrieves its original work`, async () => {
    const item = items.find(i => i.id === (olderInput === "callback" ? "the_collab" : "aura_walk"))!;
    const valid = { ...baseline(item), detail: `SCVD-E2E-${crypto.randomUUID()}` };
    const args = { ...valid, ...(olderInput === "callback" ? { callback_url: "http://buyer.example/old-hook" } : { url: "https://SCVD.STORE./old-target" }) };
    const quote = await call(item, "mcp", valid, shelves(item)[0]!);
    const payment = await signLabor(quote.offers.find(o => o.network === network)!);
    // Model a purchase admitted before the callback rule. Its normal signed
    // payment, journal and original goods are real local fixture records.
    const oldPolicy = vi.spyOn(inputChecks, "checkPurchaseArgs").mockResolvedValueOnce(undefined);
    const first = await sendLabor(item.id, door, args, payment, crypto.randomUUID());
    oldPolicy.mockRestore();
    expect(first.refused, JSON.stringify(first.body)).toBe(false);
    const orderId = String(first.body.order_id);
    const done = await completeOrder(testEnv, orderId, "original completed work");
    if (olderInput === "callback") expect(done?.webhook).toContain("not attempted");
    const verifies = facilitator.verifyCalls;
    const retry = await sendLabor(item.id, door, args, payment);
    expect(retry.refused, JSON.stringify(retry.body)).toBe(false);
    expect(retry.body).toMatchObject({ order_id: orderId, status: "completed", deliverable: "original completed work", charged: true, charged_again: false });
    expect(facilitator.verifyCalls).toBe(verifies); expect(transfers).toBe(1);
    const tampered = structuredClone(payment);
    if (network.startsWith("eip155:")) object(tampered.payload).signature = `0x${"00".repeat(65)}`;
    else object(tampered.payload).transaction = "invalid";
    const refused = await sendLabor(item.id, door, args, tampered);
    expect(refused.refused).toBe(true);
    expect(refused.body.code).toBe(olderInput === "callback" ? "callback_refused" : "target_refused");
    expect(JSON.stringify(refused.body)).not.toContain("original completed work");
    expect(transfers).toBe(1);
  });
}
