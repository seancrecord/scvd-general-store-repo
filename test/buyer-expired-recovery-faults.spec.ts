import { expect, it, vi } from "vitest";
import { runInDurableObject } from "cloudflare:test";
import { getPaymentStack } from "@/lib/payments";
import { purchaseIdentity, purchaseIntentStore } from "@/services/purchase-intent";
import { KV_KEYS } from "@/lib/kv-keys";
import { installLaborAdmissionHarness, laborNetworks, signLabor, sendLabor, transfers } from "./helpers/labor-admission";
import { installExpiredPaymentFixture, refuseSpentVerification } from "./helpers/expired-payment";
import { items, call, shelves, object, testEnv, sourceEnv } from "./helpers/buyer-harness";
import { evmBuyer, solBuyer, solPayment } from "./helpers/buyer-signed-payments";

installLaborAdmissionHarness();
installExpiredPaymentFixture();
for (const door of ["http", "mcp", "mcp-standard"] as const) for (const network of laborNetworks()) {
  for (const fault of ["missing_journal", "missing_response", "verifier_throws", "initialization_fails", "unknown_settlement"]) {
    it(`${door} ${network}: ${fault} retains the original purchase without a new payment`, async () => {
      const item = items.find(i => i.id === "context_anchor")!, args = { summary: `SCVD-E2E-${crypto.randomUUID()}` };
      const offer = (await call(item, "mcp", args, shelves(item)[0])).offers.find(o => o.network === network)!;
      const wire = await signLabor(offer), stack = getPaymentStack(testEnv);
      const settlement = vi.spyOn(stack.httpServer, "processSettlement");
      if (fault === "unknown_settlement") settlement.mockRejectedValue(new Error("fixture loses settlement acknowledgement"));
      const first = await sendLabor(item.id, door, args, wire, crypto.randomUUID());
      expect(first.refused).toBe(fault === "unknown_settlement");
      const { id } = await purchaseIdentity(network, network.startsWith("eip155:") ? evmBuyer.address : solBuyer, wire);
      const stub = purchaseIntentStore(sourceEnv, id), record = object(JSON.parse((await stub.existingPurchase())!));
      if (fault === "missing_journal") await runInDurableObject(stub, async (_instance, state) => { await state.storage.delete("purchase"); await state.storage.deleteAlarm(); });
      if (fault === "missing_response") {
        const tx = String(object(record.payment).transaction), ns = sourceEnv.PAID_RECOVERIES!;
        await runInDurableObject(ns.get(ns.idFromName(`${network}:${tx}`)), async (_instance, state) => { await state.storage.delete("artifact:response"); });
      }
      refuseSpentVerification();
      if (fault === "verifier_throws") vi.spyOn(stack.httpServer, "processHTTPRequest").mockRejectedValueOnce(new Error("fixture verifier transport failed"));
      settlement.mockClear();
      const count = (await sourceEnv.PATRONS.list({ prefix: KV_KEYS.certPrefix })).keys.length;
      const initialized = stack.initialized;
      if (fault === "initialization_fails") { stack.initialized = Promise.reject(new Error("fixture startup sync failed")); void stack.initialized.catch(() => undefined); }
      let retry: Awaited<ReturnType<typeof sendLabor>>;
      try { retry = await sendLabor(item.id, door, args, wire); } finally { stack.initialized = initialized; }
      expect(retry.quote).toBe(false);
      if (fault === "missing_response" || fault === "unknown_settlement") {
        expect(retry.refused).toBe(true);
        expect(retry.body).toMatchObject({ charged: fault === "unknown_settlement" ? null : true, settlement_attempted: false });
        expect(object(retry.body.recovery).purchase_id).toBe(id);
      } else {
        expect(retry.refused).toBe(false); expect(retry.body).toMatchObject(first.body);
      }
      expect(settlement).not.toHaveBeenCalled();
      expect(transfers).toBe(fault === "unknown_settlement" ? 0 : 1);
      expect((await sourceEnv.PATRONS.list({ prefix: KV_KEYS.certPrefix })).keys).toHaveLength(count);
    });
  }
}
for (const door of ["http", "mcp", "mcp-standard"] as const) {
  it(`${door}: a versioned Solana transaction recovers with a distinct fee payer`, async () => {
    const network = laborNetworks().find(n => n.startsWith("solana:"))!;
    const item = items.find(i => i.id === "context_anchor")!, args = { summary: `SCVD-E2E-${crypto.randomUUID()}` };
    const offer = (await call(item, "mcp", args, shelves(item)[0])).offers.find(o => o.network === network)!;
    const wire = await solPayment(offer, { versioned: true });
    const first = await sendLabor(item.id, door, args, wire); expect(first.refused).toBe(false);
    refuseSpentVerification();
    const retry = await sendLabor(item.id, door, args, wire);
    expect(retry.refused).toBe(false); expect(retry.body).toMatchObject(first.body); expect(transfers).toBe(1);
  });
}

for (const door of ["http", "mcp", "mcp-standard"] as const) for (const network of [laborNetworks()[0]!, laborNetworks().find(n => n.startsWith("solana:"))!]) {
  for (const condition of ["closed_shelf", "completed_work", "unreadable_storage"]) {
    it(`${door} ${network}: ${condition} preserves expired human-purchase recovery`, async () => {
      const item = items.find(i => i.id === "the_collab")!, args = { detail: `SCVD-E2E-private-${crypto.randomUUID()}` };
      const offer = (await call(item, "mcp", args, shelves(item)[0])).offers.find(o => o.network === network)!;
      const wire = await signLabor(offer), first = await sendLabor(item.id, door, args, wire);
      expect(first.refused).toBe(false);
      if (condition === "closed_shelf") await sourceEnv.COUNTERS.delete(KV_KEYS.keeperLastSeen);
      if (condition === "completed_work") {
        const { completeOrder } = await import("@/services/orders");
        expect((await completeOrder(testEnv, String(first.body.order_id), "SCVD-E2E-original completed work"))?.status).toBe("completed");
      }
      refuseSpentVerification();
      const namespace = testEnv.PAID_RECOVERIES!;
      if (condition === "unreadable_storage") testEnv.PAID_RECOVERIES = new Proxy(namespace, { get(target, property) {
        if (property === "get") return (...args: Parameters<typeof target.get>) => {
          const stub = target.get(...args);
          return new Proxy(stub, { get(inner, key) {
            if (key === "existingPurchase") return async () => { throw new Error("fixture storage unavailable"); };
            const member = Reflect.get(inner, key); return typeof member === "function" ? member.bind(inner) : member;
          } });
        };
        const member = Reflect.get(target, property); return typeof member === "function" ? member.bind(target) : member;
      } });
      const settle = vi.spyOn(getPaymentStack(testEnv).httpServer, "processSettlement");
      let retry: Awaited<ReturnType<typeof sendLabor>>;
      try { retry = await sendLabor(item.id, door, args, wire); } finally { testEnv.PAID_RECOVERIES = namespace; }
      expect(retry.quote).toBe(false);
      if (condition === "unreadable_storage") {
        expect(retry.refused).toBe(true);
        expect(retry.body).toMatchObject({ code: "purchase_record_unavailable", charged: null, settlement_attempted: false });
        expect(JSON.stringify(retry.body)).not.toContain(args.detail);
      } else {
        expect(retry.refused).toBe(false); expect(retry.body.order_id).toBe(first.body.order_id);
        if (condition === "completed_work") expect(retry.body).toMatchObject({ status: "completed", deliverable: "SCVD-E2E-original completed work" });
      }
      expect(settle).not.toHaveBeenCalled(); expect(transfers).toBe(1);
    });
  }
}
