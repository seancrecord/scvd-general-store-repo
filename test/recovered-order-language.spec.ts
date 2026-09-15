import { expect, it } from "vitest";
import { runDurableObjectAlarm } from "cloudflare:test";
import { claimedGood } from "@/services/claimed-good";
import { completeOrder } from "@/services/orders";
import { purchaseIdentity, purchaseIntentStore, readPurchaseStatus } from "@/services/purchase-intent";
import { installLaborAdmissionHarness, laborNetworks, signLabor, sendLabor, certificateId, transfers } from "./helpers/labor-admission";
import { installExpiredPaymentFixture, refuseSpentVerification } from "./helpers/expired-payment";
import { evmBuyer } from "./helpers/buyer-signed-payments";
import { items, shelves, call, request, object, testEnv, sourceEnv } from "./helpers/buyer-harness";

installLaborAdmissionHarness();
installExpiredPaymentFixture();
for (const door of ["http", "mcp", "mcp-standard"] as const) for (const recovery of ["wallet", "status", "original-payment"] as const) {
  it(`${door} ${recovery}: completed work never tells its recipient to wait for the keeper`, async () => {
    const item = items.find(i => i.id === "the_collab")!, network = laborNetworks()[0]!;
    const args = { detail: `SCVD-E2E original completed brief ${crypto.randomUUID()}` };
    const offer = (await call(item, "mcp", args, shelves(item)[0])).offers.find(o => o.network === network)!;
    const wire = await signLabor(offer), first = await sendLabor(item.id, door, args, wire);
    expect(first.refused).toBe(false);
    const { id } = await purchaseIdentity(network, evmBuyer.address, wire);
    const stub = purchaseIntentStore(sourceEnv, id);
    if (recovery === "status") await runDurableObjectAlarm(stub);
    const orderId = String(first.body.order_id), finished = `Completed work for ${args.detail}`;
    const order = await completeOrder(testEnv, orderId, finished);
    expect(order?.status).toBe("completed");
    const canonical = object(await (await request(String(first.body.order_url))).json());
    let good: Record<string, unknown>;
    if (recovery === "wallet") {
      // Claims authenticates this fixture wallet in wallet-original-good.spec.
      const result = await claimedGood(testEnv, evmBuyer.address, String(certificateId(first.body)));
      expect(result.status).toBe(200);good = object(result.body.fulfillment);
    } else if (recovery === "status") {
      const record = object(JSON.parse((await stub.existingPurchase())!));
      const result = await readPurchaseStatus(testEnv, id, record.token);
      expect(result.status).toBe(200);good = object(result.body.fulfillment);
    } else {
      refuseSpentVerification();
      const result = await sendLabor(item.id, door, args, wire);
      expect(result.refused).toBe(false);good = result.body;
    }
    expect(good).toMatchObject({ order_id: orderId, status: "completed", deliverable: finished });
    expect(good.message).toBe(canonical.message);
    expect(good.message).not.toBe(first.body.message);
    expect(good.completed_at).toBe(canonical.completed_at);
    expect(good.completion_proof).toEqual(canonical.completion_proof);
    expect(transfers).toBe(1);
  });
}
