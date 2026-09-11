import { expect, it } from "vitest";
import { MENU_ITEMS } from "@/store";
import { KV_KEYS } from "@/lib/kv-keys";
import { remainingInventory } from "@/services/orders";
import { installLaborAdmissionHarness, laborNetworks, signLabor, sendLabor, certificateId, transfers } from "./helpers/labor-admission";
import { items, shelves, baseline, call, request, object, testEnv, sourceEnv, facilitator, type Obj } from "./helpers/buyer-harness";
installLaborAdmissionHarness();
for (const menu of MENU_ITEMS.filter(item => item.weekly_inventory !== undefined)) {
  for (const door of ["mcp", "mcp-standard"] as const) for (const network of laborNetworks()) for (const paying of [false, true]) {
    it(`${menu.id} ${door} ${network} ${paying ? "signed" : "unpaid"}: refuses a new purchase after every weekly slot was sold`, async () => {
      const item = items.find(i => i.id === menu.id)!;
      const args = { ...baseline(item), detail: `SCVD-E2E-${crypto.randomUUID()}` };
      const quote = await call(item, "mcp", args, shelves(item)[0]!);
      expect(quote.quote).toBe(true);
      expect(quote.offers.map(o => o.network)).toEqual(expect.arrayContaining(laborNetworks()));
      const offer = quote.offers.find(o => o.network === network)!;
      const heldPayment = await signLabor(offer);
      let original: { args: Obj; payment: Obj; key: string; body: Obj } | undefined;
      for (let i = 0; i < menu.weekly_inventory!; i++) {
        const input = { ...args, detail: `${args.detail}-${i}` }, payment = await signLabor(offer), key = crypto.randomUUID();
        const purchased = await sendLabor(item.id, door, input, payment, key);
        expect(purchased.refused, JSON.stringify(purchased.body)).toBe(false);
        expect(purchased.body.order_id).toBeTruthy();
        original ??= { args: input, payment, key, body: purchased.body };
      }
      expect(transfers).toBe(menu.weekly_inventory);
      expect(await remainingInventory(testEnv, menu)).toBe(0);
      const beforeVerify = facilitator.verifyCalls;
      const refused = await sendLabor(item.id, door, args, paying ? heldPayment : undefined, crypto.randomUUID());
      expect(refused.quote).toBe(false);
      expect(refused.refused).toBe(true);
      expect(refused.body).toMatchObject({ code: "sold_out", charged: false, waitlist_method: "POST" });
      expect(refused.body.waitlist_url).toBe(`https://scvd.store/api/waitlist/${item.id}`);
      expect(facilitator.verifyCalls - beforeVerify).toBe(paying ? 1 : 0);
      expect(transfers).toBe(menu.weekly_inventory);
      expect((await sourceEnv.ORDERS.list({ prefix: KV_KEYS.orderPrefix })).keys).toHaveLength(menu.weekly_inventory!);
      expect((await sourceEnv.PATRONS.list({ prefix: KV_KEYS.certPrefix })).keys).toHaveLength(menu.weekly_inventory!);
      const http = await sendLabor(item.id, "http", args, paying ? heldPayment : undefined, crypto.randomUUID());
      expect(http.body).toMatchObject({ code: refused.body.code, charged: false, waitlist_url: refused.body.waitlist_url });
      // Admission is for new sales; the original paid result is still retrievable.
      const replay = await sendLabor(item.id, door, original!.args, original!.payment, original!.key);
      expect(replay.refused, JSON.stringify(replay.body)).toBe(false);
      expect(certificateId(replay.body)).toBe(certificateId(original!.body));
      expect(replay.body.order_id).toBe(original!.body.order_id);
      expect(transfers).toBe(menu.weekly_inventory);
      expect(object(await (await request(`/api/verify/${certificateId(replay.body)}`)).json()).valid).toBe(true);
    });
  }
}

it("MCP discovery explains weekly sold-out refusals and the waitlist", async () => {
  const response = await request("/mcp", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 8, method: "tools/list" }) });
  const tools = object(object(await response.json()).result).tools as Obj[];
  const purchases = tools.filter(tool => String(tool.name).startsWith("buy_"));
  expect(purchases.length).toBeGreaterThan(0);
  for (const tool of purchases) {
    const soldOut = (tool.errors as Obj[]).find(error => error.code === "sold_out");
    const ids = [tool.itemId, ...(Array.isArray(tool.itemIds) ? tool.itemIds : [])];
    const scarce = MENU_ITEMS.some(item => ids.includes(item.id) && (item.stocked || item.weekly_inventory !== undefined));
    if (scarce) {
      expect(String(soldOut?.means)).toMatch(/week/i);
      expect(String(soldOut?.what_to_do)).toMatch(/waitlist/i);
    } else expect(soldOut).toBeUndefined();
  }
});
