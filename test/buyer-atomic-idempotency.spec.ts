import { afterEach, expect, it, vi } from "vitest";
import { MENU_ITEMS } from "@/store";
import { getPaymentStack } from "@/lib/payments";
import { installLaborAdmissionHarness, laborNetworks, signLabor, sendLabor, transfers } from "./helpers/labor-admission";
import { baseline, call, items, shelves, object, testEnv, request } from "./helpers/buyer-harness";

installLaborAdmissionHarness();
afterEach(() => vi.restoreAllMocks());

for (const [door, retryDoor] of [["http", "http"], ["mcp", "mcp"], ["mcp-standard", "mcp-standard"], ["mcp", "mcp-standard"]] as const) {
  for (const network of laborNetworks()) {
    for (const itemId of door === retryDoor && network === laborNetworks()[0] ? MENU_ITEMS.map(item => item.id) : ["context_anchor"]) {
    it(`${door} → ${retryDoor} ${network} ${itemId}: fresh concurrent authorizations share one payment and recovery`, async () => {
      const item = items.find(i => i.id === itemId)!;
      const args = { ...baseline(item), purpose: `SCVD-E2E-atomic-${crypto.randomUUID()}` }, key = crypto.randomUUID();
      const offer = (await call(item, "mcp", args, shelves(item)[0])).offers.find(o => o.network === network)!;
      const firstPayment = await signLabor(offer), secondPayment = await signLabor(offer);
      const stack = getPaymentStack(testEnv), settle = stack.httpServer.processSettlement.bind(stack.httpServer);
      let entered!: () => void, release!: () => void;
      const firstEntered = new Promise<void>(resolve => { entered = resolve; });
      const holdFirst = new Promise<void>(resolve => { release = resolve; });
      let submissions = 0;
      vi.spyOn(stack.httpServer, "processSettlement").mockImplementation(async (...args) => {
        if (++submissions === 1) { entered(); await holdFirst; }
        return settle(...args);
      });
      const first = sendLabor(item.id, door, args, firstPayment, key);
      await firstEntered;
      let duplicate: Awaited<ReturnType<typeof sendLabor>>;
      try { duplicate = await sendLabor(item.id, retryDoor, args, secondPayment, key); }
      finally { release(); }
      const winner = await first;
      expect(winner.refused).toBe(false);
      expect(submissions).toBe(1);
      expect(transfers).toBe(1);
      expect(duplicate.refused).toBe(true);
      expect(duplicate.quote).toBe(false);
      expect(duplicate.body).toMatchObject({ charged: null, charged_again: false, settlement_attempted: false });
      const recovery = object(duplicate.body.recovery);
      expect(recovery.purchase_id).toMatch(/^[a-f0-9]{64}$/);
      const status = await request(String(recovery.status_url), { headers: { Authorization: `Bearer ${recovery.status_token}` } });
      expect(status.status).toBe(200);
      expect(object(await status.json())).toMatchObject({ payment_state: "settled", charged: true });
      const retry = await sendLabor(item.id, retryDoor, args, secondPayment, key);
      expect(retry.refused).toBe(false);
      expect(submissions).toBe(1);
      expect(transfers).toBe(1);
    });
    }
  }
}
