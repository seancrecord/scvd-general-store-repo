import { beforeEach, expect, it } from "vitest";
import { MENU_ITEMS } from "@/store";
import { getOrder } from "@/services/orders";
import { installLaborAdmissionHarness, laborNetworks, signLabor, sendLabor, transfers } from "./helpers/labor-admission";
import { items, baseline, call, shelves, testEnv, facilitator } from "./helpers/buyer-harness";

installLaborAdmissionHarness();
let verifiesBefore = 0;
beforeEach(() => { verifiesBefore = facilitator.verifyCalls; });
const human = MENU_ITEMS.filter(item => item.fulfillment === "human_queue");
// Independent boundary examples, not values derived from the validator.
const refusedCallbacks = ["x", "", "https://buyer.example/" + "a".repeat(2048),
  "http://buyer.example/hook", "https://buyer.example:8443/hook", "https://user:pass@buyer.example/hook",
  "https://127.0.0.1/hook", "https://2130706433/hook", "https://[::1]/hook", "https://[::ffff:127.0.0.1]/hook",
  "https://10.0.0.1/hook", "https://169.254.169.254/latest/meta-data", "https://service.internal/hook",
  "https://localhost/hook", "https://scvd.store/hook", "https://SCVD.STORE.:443/hook"];
for (const menu of human) for (const door of ["http", "mcp", "mcp-standard"] as const) {
  for (const callback_url of refusedCallbacks) it(`${menu.id} ${door}: refuses callback ${callback_url.slice(0,70)} before quoting`, async () => {
    const item = items.find(i => i.id === menu.id)!;
    const result = await sendLabor(item.id, door, { ...baseline(item), callback_url });
    expect(result.quote).toBe(false);
    expect(result.refused).toBe(true);
    expect(result.body).toMatchObject({ code: "callback_refused", input_field: "callback_url", charged: false });
    expect(facilitator.verifyCalls - verifiesBefore).toBe(0);
    expect(transfers).toBe(0);
  });
  for (const network of laborNetworks()) for (const callback_url of ["x", "https://169.254.169.254/hook"]) {
    it(`${menu.id} ${door} ${network}: a signed payment cannot bypass callback refusal (${callback_url})`, async () => {
      const item = items.find(i => i.id === menu.id)!, args = baseline(item);
      const quote = await call(item, "mcp", args, shelves(item)[0]!);
      expect(quote.quote).toBe(true);
      const payment = await signLabor(quote.offers.find(o => o.network === network)!);
      const result = await sendLabor(item.id, door, { ...args, callback_url }, payment, crypto.randomUUID());
      expect(result.quote).toBe(false);
      expect(result.refused).toBe(true);
      expect(result.body).toMatchObject({ code: "callback_refused", input_field: "callback_url", charged: false });
      expect(facilitator.verifyCalls - verifiesBefore).toBe(0);
      expect(transfers).toBe(0);
    });
  }
  for (const network of laborNetworks()) it(`${menu.id} ${door} ${network}: preserves a valid requested callback on the paid order`, async () => {
    const item = items.find(i => i.id === menu.id)!;
    const callback_url = "https://buyer.example/hook?reference=Original%2FCase";
    const args = { ...baseline(item), callback_url };
    const quote = await call(item, "mcp", args, shelves(item)[0]!);
    expect(quote.quote).toBe(true);
    const payment = await signLabor(quote.offers.find(o => o.network === network)!);
    const result = await sendLabor(item.id, door, args, payment, crypto.randomUUID());
    expect(result.refused, JSON.stringify(result.body)).toBe(false);
    expect(transfers).toBe(1);
    const order = await getOrder(testEnv, String(result.body.order_id));
    expect(order?.callback_url).toBe(callback_url);
  });
}

// The original affected probe products, plus A2A's previously protected path.
const probeProducts = ["standing_watch", "service_audit", "conformance_watch", "passport_refresh", "good_buyer",
  "trust_profile", "aura_walk", "signature_agent_card", "onpage_audit", "launch_check", "opening_day", "a2a_repair_kit"];
for (const id of probeProducts) for (const door of ["http", "mcp", "mcp-standard"] as const) for (const network of laborNetworks()) {
  it(`${id} ${door} ${network}: refuses the store's root-dot hostname before verification`, async () => {
    const item = items.find(i => i.id === id)!, args = baseline(item);
    const quote = await call(item, "mcp", args, shelves(item)[0]!);
    expect(quote.quote, JSON.stringify(quote.body)).toBe(true);
    const payment = await signLabor(quote.offers.find(o => o.network === network)!);
    const result = await sendLabor(id, door, { ...args, url: "https://SCVD.STORE.:443/api/hello" }, payment, crypto.randomUUID());
    expect(result.quote).toBe(false);
    expect(result.refused, JSON.stringify(result.body)).toBe(true);
    expect(result.body.charged).toBe(false);
    expect(String(result.body.error)).toMatch(/own|itself|store|home|mirror|target_refused/i);
    expect(facilitator.verifyCalls - verifiesBefore).toBe(0);
    expect(transfers).toBe(0);
  });
}
