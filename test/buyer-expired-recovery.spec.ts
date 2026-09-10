import { installExpiredPaymentFixture, refuseSpentVerification } from "./helpers/expired-payment";
import { expect, it, vi } from "vitest";
import { MENU_ITEMS } from "@/store";
import { purchaseIdentity, purchaseIntentStore } from "@/services/purchase-intent";
import { getPaymentStack } from "@/lib/payments";
import { installLaborAdmissionHarness, laborNetworks, signLabor, sendLabor, transfers } from "./helpers/labor-admission";
import { baseline, call, items, shelves, object, sourceEnv, testEnv, NOW } from "./helpers/buyer-harness";
import { evmBuyer, solBuyer } from "./helpers/buyer-signed-payments";

installLaborAdmissionHarness();
installExpiredPaymentFixture();

for (const door of ["http", "mcp", "mcp-standard"] as const) for (const network of laborNetworks()) {
  for (const itemId of network === laborNetworks()[0] ? MENU_ITEMS.map(item => item.id) : ["context_anchor"]) {
    for (const keyMode of itemId === "context_anchor" ? ["missing", "changed", "original"] : ["missing"]) {
      it(`${door} ${network} ${itemId}: expired spent payment recovers with ${keyMode} key`, async () => {
        const item = items.find(item => item.id === itemId)!;
        const args = { ...baseline(item), purpose: `SCVD-E2E-${crypto.randomUUID()}` };
        const offer = (await call(item, "mcp", args, shelves(item)[0])).offers.find(o => o.network === network)!;
        const wire = await signLabor(offer), key = crypto.randomUUID();
        const first = await sendLabor(item.id, door, args, wire, key);
        expect(first.refused).toBe(false);
        expect(transfers).toBe(1);
        const identity = await purchaseIdentity(network, network.startsWith("eip155:") ? evmBuyer.address : solBuyer, wire);
        const record = object(JSON.parse((await purchaseIntentStore(sourceEnv, identity.id).existingPurchase())!));
        expect(record.state).toBe("settled");
        refuseSpentVerification();
        if (network.startsWith("eip155:")) expect(Number(object(object(wire.payload).authorization).validBefore)).toBeLessThan(Date.now() / 1000);
        const settle = vi.spyOn(getPaymentStack(testEnv).httpServer, "processSettlement");
        const retry = await sendLabor(item.id, door, args, wire, keyMode === "original" ? key : keyMode === "changed" ? crypto.randomUUID() : undefined);
        expect(retry.refused).toBe(false);
        expect(retry.quote).toBe(false);
        expect(retry.body).toMatchObject(first.body);
        expect(settle).not.toHaveBeenCalled();
        expect(transfers).toBe(1);
      });
    }
  }
}
