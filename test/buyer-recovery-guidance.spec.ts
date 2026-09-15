import { runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { expect, it } from "vitest";
import { purchaseIdentity, purchaseIntentStore } from "@/services/purchase-intent";
import { installLaborAdmissionHarness, laborNetworks, signLabor, sendLabor, transfers, type LaborDoor } from "./helpers/labor-admission";
import { installExpiredPaymentFixture, refuseSpentVerification } from "./helpers/expired-payment";
import { items, call, shelves, object, sourceEnv, request } from "./helpers/buyer-harness";
import { evmBuyer, solBuyer } from "./helpers/buyer-signed-payments";

installLaborAdmissionHarness();
installExpiredPaymentFixture();
const doors = ["http", "mcp", "mcp-standard"] as const;
async function purchase(door: LaborDoor, network: string) {
  const item = items.find(i => i.id === "context_anchor")!;
  const args = { summary: `SCVD-E2E-recovery-${crypto.randomUUID()}` };
  const offer = (await call(item, "mcp", args, shelves(item)[0])).offers.find(o => o.network === network)!;
  const wire = await signLabor(offer), key = crypto.randomUUID();
  const first = await sendLabor(item.id, door, args, wire, key);
  expect(first.refused).toBe(false);
  const { id } = await purchaseIdentity(network, network.startsWith("eip155:") ? evmBuyer.address : solBuyer, wire);
  const stub = purchaseIntentStore(sourceEnv, id);
  const record = object(JSON.parse((await stub.existingPurchase())!));
  return { item, args, wire, key, first, id, stub, token: String(record.token) };
}
async function read(id: string, token: string, door: LaborDoor) {
  if (door === "http") {
    const response = await request(`/api/purchase-status/${id}`, { headers: { Authorization: `Bearer ${token}` } });
    return { status: response.status, body: object(await response.json()) };
  }
  const response = await request(door === "mcp" ? "/mcp" : "/mcp?payment=tool-result", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
    jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "check_purchase", arguments: { purchase_id: id, status_token: token } },
  }) });
  const result = object(object(await response.json()).result);
  return { status: result.isError ? 404 : 200, body: object(result.structuredContent) };
}
for (const door of doors) {
  it(`${door}: pending status gives a free polling action, then the exact original good`, async () => {
    const p = await purchase(door, laborNetworks()[0]!);
    const pending = await read(p.id, p.token, door);
    expect(pending.body).toMatchObject({ charged: true, payment_state: "settled", recovery_state: "pending", next_action: "read_purchase_status", retry_after_seconds: 60, settlement_attempted: false });
    expect(pending.body.fulfillment).toBeUndefined();
    expect(String(pending.body.retry)).toMatch(/not.*(deadline|guarantee)/i);
    expect(transfers).toBe(1);
    await runDurableObjectAlarm(p.stub);
    const ready = await read(p.id, p.token, door);
    expect(ready.body).toMatchObject({ recovery_state: "ready", next_action: "use_fulfillment", retry_after_seconds: null });
    expect(object(ready.body.fulfillment).anchor_id).toBe(p.first.body.anchor_id);
    const anchor = await request(String(object(ready.body.fulfillment).anchor_url));
    expect(anchor.status).toBe(200);
    expect(JSON.stringify(await anchor.json())).toContain(p.args.summary);
    expect(transfers).toBe(1);
  });
  it(`${door}: invalid status credentials disclose no recovery metadata`, async () => {
    const p = await purchase(door, laborNetworks()[0]!);
    const response = await read(p.id, "0".repeat(64), door);
    expect(response.status).toBe(404);
    expect(JSON.stringify(response.body)).not.toContain(p.args.summary);
    expect(response.body.recovery_state).toBeUndefined();
    expect(transfers).toBe(1);
  });
  for (const state of ["unknown", "not_settled"] as const) it(`${door}: ${state} never becomes a promise of paid delivery`, async () => {
    const p = await purchase(door, laborNetworks()[0]!);
    await runInDurableObject(p.stub, async (_instance, storage) => {
      const record = await storage.storage.get<Record<string, unknown>>("purchase");
      record!.state = state; delete record!.payment; delete record!.delivery;
      await storage.storage.put("purchase", record);
    });
    const result = await read(p.id, p.token, door);
    expect(result.body).toMatchObject({ charged: state === "unknown" ? null : false, recovery_state: state === "unknown" ? "pending" : "not_settled", retry_after_seconds: state === "unknown" ? 60 : null });
    expect(result.body.fulfillment).toBeUndefined();
  });
}
for (const original of doors) for (const target of doors.filter(d => (d === "http") !== (original === "http"))) {
  for (const expired of [false, true]) for (const network of laborNetworks()) {
    it(`${original} to ${target}, ${network}, expired=${expired}: identifies original interface and recovers once`, async () => {
      const p = await purchase(original, network);
      await runDurableObjectAlarm(p.stub);
      if (expired) refuseSpentVerification();
      const refusal = await sendLabor(p.item.id, target, p.args, p.wire);
      expect(refusal.refused).toBe(true);
      expect(refusal.body).toMatchObject({ code: "purchase_input_mismatch", charged: true, charged_again: false, settlement_attempted: false, temporary: false, retry_with_same_request: false, next_action: "read_purchase_status",
        recovery: { original_door: original === "http" ? "http" : "mcp", original_path: `/api/buy/${p.item.id}`, status_tool: "check_purchase" } });
      if (target === "http") expect(refusal.status).toBe(409);
      const recovery = object(refusal.body.recovery);
      const status = await read(String(recovery.purchase_id), String(recovery.status_token), target);
      expect(object(status.body.fulfillment).anchor_id).toBe(p.first.body.anchor_id);
      const replay = await sendLabor(p.item.id, original, p.args, p.wire, p.key);
      expect(replay.refused).toBe(false);
      expect(replay.body.anchor_id).toBe(p.first.body.anchor_id);
      expect(transfers).toBe(1);
    });
  }
}

it("public discovery explains how to recover without changing interfaces or paying again", async () => {
  const index = await request("/llms.txt");
  expect(await index.text()).toContain("/developers/llms.txt");
  for (const path of ["/skill.md", "/developers/llms.txt", "/openapi.json"]) {
    const response = await request(path);
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toContain("recovery.original_door");
    expect(text).toContain("retry_after_seconds");
    expect(text).toContain("not a delivery deadline");
  }
  const response = await request("/mcp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) });
  const result = object(object(await response.json()).result);
  const tool = (result.tools as Record<string, unknown>[]).find(tool => tool.name === "check_purchase")!;
  expect(String(tool.description)).toContain("recovery.original_door");
  const properties = object(object(tool.outputSchema).properties);
  expect(properties.retry_after_seconds).toBeDefined();
  expect(object(properties.recovery_state).enum).toContain("pending");
});
