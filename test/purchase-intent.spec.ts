import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { getPaymentStack } from "@/lib/payments";
import { jcsCanonicalize } from "@/lib/jcs";
import { sha256Hex } from "@/lib/idempotency";
import { extractPaymentNonce } from "@/lib/replay-guard";
import { installLaborAdmissionHarness, laborNetworks, signLabor, sendLabor } from "./helpers/labor-admission";
import { call, items, shelves, request, object, testEnv, sourceEnv, NOW } from "./helpers/buyer-harness";
import { evmBuyer, solBuyer } from "./helpers/buyer-signed-payments";

installLaborAdmissionHarness();
const originalNamespace = testEnv.PAID_RECOVERIES!;
afterEach(() => { testEnv.PAID_RECOVERIES = originalNamespace; vi.restoreAllMocks(); vi.setSystemTime(NOW); });
beforeEach(() => { testEnv.PAID_RECOVERIES = originalNamespace; });

for (const door of ["http", "mcp", "mcp-standard"] as const) {
  for (const rail of [0, 1, 2, 3, 4]) {
    it(`${door} rail ${rail}: saves the full purchase before settlement; lost answers have one private stable status`, async () => {
      const network = laborNetworks()[rail]!;
      const item = items.find(i => i.id === "context_anchor")!;
      const args = { summary: "padding ".repeat(100) + `SCVD-E2E-${crypto.randomUUID()} 🧾 e\u0301`, purpose: "original purchase" };
      const offer = (await call(item, "mcp", args, shelves(item)[0])).offers.find(o => o.network === network)!;
      const payment = await signLabor(offer), key = crypto.randomUUID();
      const payer = network.startsWith("eip155:") ? evmBuyer.address.toLowerCase() : solBuyer;
      const identity = extractPaymentNonce(payment) ?? object(payment.payload).transaction;
      const purchaseId = await sha256Hex(jcsCanonicalize({ network, payer, identity }));
      const stub = originalNamespace.get(originalNamespace.idFromName(`purchase:${purchaseId}`));
      const stack = getPaymentStack(testEnv);
      const settle = stack.httpServer.processSettlement.bind(stack.httpServer);
      let submits = 0, landed = false;
      let captured: Record<string, unknown> = {};
      vi.spyOn(stack.httpServer, "processSettlement").mockImplementation(async (...a) => {
        submits++;
        // Observe the record before the processor runs; do not seed one here.
        const saved = await stub.existingPurchase();
        captured = saved ? object(JSON.parse(saved)) : {};
        const result = await settle(...a);
        landed = result.success;
        throw new TypeError("fixture loses the confirmed settlement response");
      });
      const first = await sendLabor(item.id, door, args, payment, key);
      expect(landed).toBe(true);
      expect(captured).toMatchObject({ payer, path: new URL(item.buy_url, "https://scvd.store").pathname, terms: offer, state: "unknown" });
      expect(door === "http" ? new URLSearchParams(String(captured.request)).get("summary") : object(JSON.parse(String(captured.request))).summary).toBe(args.summary);
      if (network.startsWith("eip155:")) expect(captured.authorization).toMatchObject({
        nonce: String(object(object(payment.payload).authorization).nonce).toLowerCase(),
        valid_before: object(object(payment.payload).authorization).validBefore,
      });
      expect(JSON.stringify(captured)).not.toContain(String(object(payment.payload).signature ?? object(payment.payload).transaction));
      expect(first.body).toMatchObject({ code: "settlement_unknown", charged: null });
      const recovery = object(first.body.recovery);
      expect(recovery.purchase_id).toBe(purchaseId);
      expect(recovery.status_url).toBe(`https://scvd.store/api/purchase-status/${purchaseId}`);
      expect(String(recovery.status_token)).toMatch(/^[a-f0-9]{64}$/);
      const read = (token = String(recovery.status_token)) => request(String(recovery.status_url), { headers: { Authorization: `Bearer ${token}` } });
      const status = await read();
      expect(status.status).toBe(200);
      expect(status.headers.get("Cache-Control")).toBe("no-store");
      expect(object(await status.json())).toMatchObject({ purchase_id: purchaseId, payment_state: "unknown", charged: null, terms: offer });
      expect((await request(String(recovery.status_url))).status).toBe(404);
      expect((await read("0".repeat(64))).status).toBe(404);
      const mcpStatus = async (token: string) => object(await (await request(door === "mcp-standard" ? "/mcp?payment=tool-result" : "/mcp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        jsonrpc: "2.0", id: 29, method: "tools/call", params: { name: String(recovery.status_tool), arguments: { purchase_id: purchaseId, status_token: token } },
      }) })).json());
      const readOverMcp = object((await mcpStatus(String(recovery.status_token))).result);
      expect(readOverMcp.isError).not.toBe(true);
      expect(readOverMcp.structuredContent).toMatchObject({ purchase_id: purchaseId, charged: null, terms: offer, request: captured.request });
      expect(object((await mcpStatus("0".repeat(64))).result).isError).toBe(true);
      // Lose both the response and the best-effort reconciliation row. The
      // second request must retrieve the same record, never resubmit payment.
      if (recovery.reference) await sourceEnv.COUNTERS.delete(String(recovery.reference));
      const second = await sendLabor(item.id, door, args, payment, key);
      expect(object(second.body.recovery)).toMatchObject({ purchase_id: purchaseId, status_token: recovery.status_token });
      const changed = await sendLabor(item.id, door, { ...args, summary: "wrong subject" }, payment, crypto.randomUUID());
      expect(changed.refused).toBe(true);
      expect(object(changed.body.recovery).purchase_id).toBe(purchaseId);
      expect(submits).toBe(1);
      const saved = object(JSON.parse((await stub.readPurchase(String(recovery.status_token)))!));
      expect(saved.request).not.toContain("wrong subject");
      // The capability remains readable after authorization expiry, including
      // while payment verification is down. Polling cannot submit a payment.
      vi.setSystemTime(new Date(NOW.getTime() + 86400_000));
      vi.spyOn(stack.httpServer, "processHTTPRequest").mockRejectedValue(new Error("fixture verifier down"));
      expect((await read()).status).toBe(200);
      expect(object((await mcpStatus(String(recovery.status_token))).result).isError).not.toBe(true);
      expect(submits).toBe(1);
    });
  }
}

for (const door of ["http", "mcp", "mcp-standard"] as const) {
  it(`${door}: unavailable durable storage never reaches settlement`, async () => {
    const item = items.find(i => i.id === "context_anchor")!, args = { summary: `SCVD-E2E-${crypto.randomUUID()}` };
    const offer = (await call(item, "mcp", args, shelves(item)[0])).offers[0]!;
    const payment = await signLabor(offer);
    testEnv.PAID_RECOVERIES = undefined;
    const spy = vi.spyOn(getPaymentStack(testEnv).httpServer, "processSettlement");
    const failed = await sendLabor(item.id, door, args, payment, crypto.randomUUID());
    expect(failed.body).toMatchObject({ code: "purchase_record_unavailable", charged: null, settlement_attempted: false });
    expect(spy).not.toHaveBeenCalled();
  });
}

for (const door of ["http", "mcp", "mcp-standard"] as const) {
  it(`${door}: concurrent first attempts submit one payment and retain one record`, async () => {
    const item = items.find(i => i.id === "context_anchor")!, args = { summary: `SCVD-E2E-race-${crypto.randomUUID()}` };
    const offer = (await call(item, "mcp", args, shelves(item)[0])).offers[0]!;
    const payment = await signLabor(offer), key = crypto.randomUUID();
    const spy = vi.spyOn(getPaymentStack(testEnv).httpServer, "processSettlement").mockRejectedValue(new Error("fixture acknowledgement lost"));
    const replies = await Promise.all(Array.from({ length: 4 }, () => sendLabor(item.id, door, args, payment, key)));
    expect(spy).toHaveBeenCalledTimes(1);
    const references = replies.map(reply => object(reply.body.recovery).purchase_id);
    expect(references[0]).toMatch(/^[a-f0-9]{64}$/);
    expect(new Set(references).size).toBe(1);
  });
}

it("publishes the authenticated status contract in OpenAPI and both payment refusal contracts", async () => {
  const doc = object(await (await request("/openapi.json")).json());
  const operation = object(object(object(doc.paths)["/api/purchase-status/{purchase_id}"]).get);
  expect(operation.security).toEqual([{ purchaseStatusToken: [] }]);
  expect(object(object(doc.components).securitySchemes).purchaseStatusToken).toMatchObject({ type: "http", scheme: "bearer" });
  const { BUY_REFUSAL_CODES, MCP_REFUSAL_CODES } = await import("@/store/surface-contract");
  for (const codes of [BUY_REFUSAL_CODES, MCP_REFUSAL_CODES]) {
    const entry = codes.find(row => row.code === "settlement_unknown")!;
    expect(entry.what_to_do).toContain("status_token");
  }
});

for (const door of ["http", "mcp", "mcp-standard"] as const) {
  it(`${door}: an unknown human purchase survives the shelf closing without claiming no charge`, async () => {
    const item = items.find(i => i.id === "the_collab")!, args = { detail: `SCVD-E2E-brief-${crypto.randomUUID()}` };
    const offer = (await call(item, "mcp", args, shelves(item)[0])).offers[0]!;
    const payment = await signLabor(offer), key = crypto.randomUUID();
    const spy = vi.spyOn(getPaymentStack(testEnv).httpServer, "processSettlement").mockRejectedValue(new Error("fixture unknown settlement"));
    const first = await sendLabor(item.id, door, args, payment, key);
    expect(first.body.charged).toBeNull();
    const { KV_KEYS } = await import("@/lib/kv-keys");
    await sourceEnv.COUNTERS.delete(KV_KEYS.keeperLastSeen);
    const retry = await sendLabor(item.id, door, args, payment, key);
    expect(retry.body).toMatchObject({ code: "settlement_unknown", charged: null });
    expect(object(retry.body.recovery).purchase_id).toBe(object(first.body.recovery).purchase_id);
    expect(spy).toHaveBeenCalledTimes(1);
  });
}

function storageFault(method: "beginPurchase" | "updatePurchase", after: boolean) {
  let hits = 0;
  testEnv.PAID_RECOVERIES = new Proxy(originalNamespace, { get(target, property) {
    if (property === "get") return (...args: Parameters<typeof target.get>) => {
      const stub = target.get(...args);
      return new Proxy(stub, { get(inner, key) {
        const member = Reflect.get(inner, key);
        if (key === method) return async (...args: unknown[]) => {
          hits++;
          if (after) await Reflect.apply(member, inner, args);
          throw new Error("fixture storage write acknowledgement lost");
        };
        return typeof member === "function" ? (...args: unknown[]) => Reflect.apply(member, inner, args) : member;
      } });
    };
    const member = Reflect.get(target, property);
    return typeof member === "function" ? member.bind(target) : member;
  } });
  return () => hits;
}

for (const door of ["http", "mcp", "mcp-standard"] as const) {
  it(`${door}: lost capture acknowledgement cannot settle, and retry finds the retained purchase`, async () => {
    const item = items.find(i => i.id === "context_anchor")!, args = { summary: `SCVD-E2E-capture-${crypto.randomUUID()}` };
    const offer = (await call(item, "mcp", args, shelves(item)[0])).offers[0]!;
    const payment = await signLabor(offer), key = crypto.randomUUID();
    const hits = storageFault("beginPurchase", true);
    const spy = vi.spyOn(getPaymentStack(testEnv).httpServer, "processSettlement");
    const first = await sendLabor(item.id, door, args, payment, key);
    expect(first.body).toMatchObject({ code: "purchase_record_unavailable", settlement_attempted: false });
    expect(hits()).toBe(1);
    testEnv.PAID_RECOVERIES = originalNamespace;
    const retry = await sendLabor(item.id, door, args, payment, key);
    expect(retry.body).toMatchObject({ code: "settlement_unknown", charged: null });
    expect(object(retry.body.recovery).purchase_id).toMatch(/^[a-f0-9]{64}$/);
    expect(spy).not.toHaveBeenCalled();
  });

  it(`${door}: a post-settlement status-write failure cannot prevent the original good or cached replay`, async () => {
    const item = items.find(i => i.id === "context_anchor")!, args = { summary: `SCVD-E2E-status-write-${crypto.randomUUID()}` };
    const offer = (await call(item, "mcp", args, shelves(item)[0])).offers[0]!;
    const payment = await signLabor(offer), key = crypto.randomUUID();
    const hits = storageFault("updatePurchase", false);
    const spy = vi.spyOn(getPaymentStack(testEnv).httpServer, "processSettlement");
    const first = await sendLabor(item.id, door, args, payment, key);
    expect(first.refused).toBe(false);
    expect(hits()).toBe(1);
    testEnv.PAID_RECOVERIES = originalNamespace;
    const retry = await sendLabor(item.id, door, args, payment, key);
    expect(retry.refused).toBe(false);
    const cert = (body: Record<string, unknown>) => body.cert_id ?? object(body.certificate).cert_id;
    expect(cert(first.body)).toMatch(/^cert_/);
    expect(cert(retry.body)).toBe(cert(first.body));
    expect(spy).toHaveBeenCalledTimes(1);
  });
}

it("the derived function-calling example keeps the status token out of its URL", async () => {
  const doc = object(await (await request("/openapi-tools.json")).json());
  const entry = (doc.tools as Record<string, unknown>[]).find(row => object(row.function).name === "check_purchase")!;
  expect(entry).toBeDefined();
  const metadata = object(entry["x-scvd"]), example = object(metadata.worked_call);
  expect(object(metadata.http).bearer_argument).toBe("status_token");
  const curl = String(example.curl);
  expect(curl).toContain("-H 'Authorization: Bearer ");
  expect(curl.split(" -H ")[0]).not.toContain("status_token");
});
