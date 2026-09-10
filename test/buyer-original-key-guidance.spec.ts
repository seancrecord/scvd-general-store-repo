import { expect, it } from "vitest";
import { installLaborAdmissionHarness, laborNetworks, signLabor, sendLabor } from "./helpers/labor-admission";
import { installExpiredPaymentFixture, refuseSpentVerification } from "./helpers/expired-payment";
import { call, items, shelves, object, request } from "./helpers/buyer-harness";

installLaborAdmissionHarness();
installExpiredPaymentFixture();
for (const door of ["http", "mcp", "mcp-standard"] as const) for (const network of laborNetworks()) {
  it(`${door} ${network}: refusal preserves the submitted key after the minute changes`, async () => {
    const item = items.find(i => i.id === "context_anchor")!, args = { summary: "SCVD-E2E-original-key" };
    const offer = (await call(item, "mcp", args, shelves(item)[0])).offers.find(o => o.network === network)!;
    const wire = await signLabor(offer), key = `original-${crypto.randomUUID()}`;
    refuseSpentVerification();
    if (door === "mcp-standard") {
      const raw = object(await (await request("/mcp?payment=tool-result", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: shelves(item)[0]!.name, arguments: { item_id: item.id, ...args },
          _meta: { "x402/payment": wire, "x402/idempotency-key": key } },
      }) })).json());
      expect(object(object(raw.result)._meta)["x402/idempotency-key"]).toBe(key);
    } else {
      const result = await sendLabor(item.id, door, args, wire, key);
      expect(result.refused).toBe(true);
      expect(object(result.body.idempotency).suggested_key).toBe(key);
    }
  });
}
