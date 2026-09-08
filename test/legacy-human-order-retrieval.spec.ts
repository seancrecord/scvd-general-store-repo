import { beforeAll, expect, it, vi } from "vitest";
import { BASE_NETWORK, POLYGON_NETWORK } from "@/lib/payments";
import { KV_KEYS } from "@/lib/kv-keys";
import { installBuyerHarness, items, shelves, baseline, call, request, object, sourceEnv, facilitator, testEnv, type Obj } from "./helpers/buyer-harness";
import { evmPayment, evmValid } from "./helpers/buyer-signed-payments";
import type { ChallengeRequirement } from "./helpers/payment";

installBuyerHarness();
beforeAll(() => {
  const inner = globalThis.fetch;
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    if (url.pathname.endsWith("/x402/verify")) {
      facilitator.verifyCalls++;
      const body = object(JSON.parse(String(init?.body))), wire = object(body.paymentPayload);
      return Response.json({ isValid: await evmValid(wire, body.paymentRequirements as ChallengeRequirement),
        payer: object(object(wire.payload).authorization).from });
    }
    return inner(input, init);
  });
});

import { mintCertificate } from "@/services/certificates";
import { createOrder } from "@/services/orders";
import { getMenuItem } from "@/store";
import { canonicalizeCertificateLegacy, signCertificate, signMessage } from "@/lib/signing";

// Synthetic pre-checkpoint purchases. Only the historical records survive.
async function seed(id: string, door: "http" | "mcp" | "standard", network: string, completed: boolean) {
  const item = items.find(item => item.id === id)!, tool = shelves(item)[0]!;
  const canary = `SCVD-E2E-${crypto.randomUUID()}`;
  const args: Obj & { detail: string } = { ...baseline(item), detail: `${canary} — original brief` };
  const quote = await call(item, door === "http" ? "http" : "mcp", args, tool);
  const wire = await evmPayment(quote.offers.find(offer => offer.network === network)!);
  const auth = object(object(wire.payload).authorization);
  const transaction = `0x${crypto.randomUUID().replaceAll("-", "").repeat(2)}`;
  const path = `/api/buy/${id}`;
  const intent = { path, transaction, payer: String(auth.from), paid_usdc: item.price_usdc,
    settled_at: "2026-09-04T12:00:00.000Z", query: "detail=truncated-preview" };
  await sourceEnv.COUNTERS.put(KV_KEYS.paymentNonce(String(auth.nonce)), JSON.stringify({ path, transaction }));
  await sourceEnv.ORDERS.put(KV_KEYS.deliveryIntent(transaction), JSON.stringify(intent));
  const minted = await mintCertificate(testEnv, { itemId: id, paidUsdc: item.price_usdc,
    payer: String(auth.from), network, settlementTx: transaction });
  const order = await createOrder(testEnv, { item: getMenuItem(id)!, paidUsdc: item.price_usdc,
    tipUsdc: 0, payer: String(auth.from), patronNumber: minted.patronNumber, certId: minted.certificate.cert_id,
    detail: args.detail, targetUrl: typeof args.url === "string" ? args.url : undefined,
    createdAt: intent.settled_at, slaHours: 24 });
  if (completed) {
    order.status = "completed"; order.deliverable = `${canary} — original completed work`;
    order.completed_at = "2026-09-05T11:00:00.000Z";
    await sourceEnv.ORDERS.put(KV_KEYS.order(order.order_id), JSON.stringify(order));
  }
  async function retry() {
    const payment = btoa(JSON.stringify(wire));
    const changed = { ...args, detail: `${canary} — replacement brief` };
    if (door !== "standard") return call(item, door, changed, tool, payment);
    const raw = object(await (await request("/mcp?payment=tool-result", { method: "POST",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1,
        method: "tools/call", params: { name: tool.name, arguments: { item_id: id, ...changed },
          _meta: { "x402/payment": payment } } }) })).json());
    const result = object(raw.result);
    return { body: object(result.structuredContent), protocolError: result.isError === true,
      quote: object(result._meta)["x402/payment-required"] !== undefined };
  }
  return { order, minted, transaction, intent, retry };
}

for (const id of ["aura_walk", "the_collab"]) for (const door of ["http", "mcp", "standard"] as const)
  for (const network of [BASE_NETWORK, POLYGON_NETWORK]) for (const completed of [false, true]) {
  it(`${id} ${door} ${network}: retrieves the original ${completed ? "completed" : "queued"} legacy order repeatedly`, async () => {
    const { order, minted, transaction, retry } = await seed(id, door, network, completed);
    const settles = facilitator.settleCalls;
    // Exercise the pre-index certificate scan, too.
    await sourceEnv.PATRONS.delete(KV_KEYS.settlementCert(transaction));
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = await retry();
      expect(result.protocolError).toBe(false);
      expect(result.quote).toBe(false);
      expect(result.body).toMatchObject({ charged: true, charged_again: false, settlement_attempted: false,
        order_id: order.order_id, status: order.status, created_at: order.created_at,
        sla_hours: order.sla_hours, paid_usdc: order.paid_usdc, network, transaction,
        original_request: { detail: order.detail } });
      expect(JSON.parse(String(result.body.signed_payload))).toMatchObject(minted.certificate);
      expect(door === "http" ? object(result.body.certificate).cert_id : result.body.cert_id).toBe(minted.certificate.cert_id);
      expect(result.body.deliverable).toBe(order.deliverable);
      expect(object(result.body.original_request).url).toBe(order.target_url);
      expect(result.body.order_url).toBe(`https://scvd.store/api/order/${order.order_id}`);
      const status = object(await (await request(String(result.body.order_url))).json());
      expect(status).toMatchObject({ order_id: order.order_id, status: order.status,
        created_at: order.created_at, sla_hours: order.sla_hours });
      expect(status.deliverable).toBe(order.deliverable);
      const verified = object(await (await request(String(result.body.verify_url))).json());
      expect(verified.valid).toBe(true);
      expect(JSON.parse((await sourceEnv.ORDERS.get(KV_KEYS.order(order.order_id)))!)).toEqual(order);
      expect(facilitator.settleCalls).toBe(settles);
      expect((await sourceEnv.ORDERS.list({ prefix: KV_KEYS.orderPrefix })).keys).toHaveLength(1);
      expect((await sourceEnv.PATRONS.list({ prefix: KV_KEYS.certPrefix })).keys).toHaveLength(1);
      expect(await sourceEnv.ORDERS.get(KV_KEYS.deliveryIntent(transaction))).toBeNull();
      if (!completed && attempt === 0) {
        order.status = "completed"; order.deliverable = `${order.detail} — later completed work`;
        order.completed_at = "2026-09-05T12:00:00.000Z";
        await sourceEnv.ORDERS.put(KV_KEYS.order(order.order_id), JSON.stringify(order));
      }
    }
  });
}

for (const door of ["http", "mcp", "standard"] as const)
  for (const defect of ["missing-order", "duplicate-order", "wrong-payer", "wrong-item", "wrong-amount",
    "wrong-patron", "wrong-order-key", "missing-brief", "missing-work", "bad-certificate", "wrong-chain",
    "malformed-row", "read-failure", "truncated-list", "missing-desk-record", "unsigned-payment-fields", "unrecognized-key", "certificate-payer", "certificate-item", "certificate-transaction"] as const) {
  it(`${door}: ${defect} cannot disclose or replace a legacy human order`, async () => {
    const { order, minted, transaction, intent, retry } = await seed("aura_walk", door, BASE_NETWORK, true);
    if (defect === "missing-order") await sourceEnv.ORDERS.delete(KV_KEYS.order(order.order_id));
    if (defect === "duplicate-order") await sourceEnv.ORDERS.put(KV_KEYS.order("other"), JSON.stringify({ ...order, order_id: "other" }));
    if (defect === "malformed-row") await sourceEnv.ORDERS.put(KV_KEYS.order("unreadable"), "not json");
    const mutations = { "wrong-payer": { payer: "0x1111111111111111111111111111111111111111" },
      "wrong-item": { item_id: "the_collab" }, "wrong-amount": { paid_usdc: order.paid_usdc + 1 },
      "wrong-patron": { patron_number: order.patron_number + 1 }, "wrong-order-key": { order_id: "elsewhere" },
      "missing-brief": { target_url: "" }, "missing-work": { deliverable: "" } };
    if (defect in mutations) await sourceEnv.ORDERS.put(KV_KEYS.order(order.order_id), JSON.stringify({ ...order, ...mutations[defect as keyof typeof mutations] }));
    if (defect === "bad-certificate" || defect === "wrong-chain" || defect.startsWith("certificate-")) {
      const record = JSON.parse((await sourceEnv.PATRONS.get(KV_KEYS.cert(minted.certificate.cert_id)))!);
      if (defect === "bad-certificate") record.signature = "00".repeat(64);
      else {
        if (defect === "wrong-chain") record.certificate.network = POLYGON_NETWORK;
        if (defect === "certificate-payer") record.certificate.payer = "0x1111111111111111111111111111111111111111";
        if (defect === "certificate-item") record.certificate.item = "the_collab";
        if (defect === "certificate-transaction") record.certificate.settlement_tx = `0x${"cd".repeat(32)}`;
        const signed = await signCertificate(record.certificate, testEnv.SIGNING_KEY);
        record.signature = signed.signature;
      }
      await sourceEnv.PATRONS.put(KV_KEYS.cert(minted.certificate.cert_id), JSON.stringify(record));
    }
    if (defect === "missing-desk-record") {
      await sourceEnv.ORDERS.delete(KV_KEYS.deliveryIntent(transaction));
      await sourceEnv.ORDERS.delete(KV_KEYS.order(order.order_id));
    }
    if (defect === "unsigned-payment-fields" || defect === "unrecognized-key") {
      const record = JSON.parse((await sourceEnv.PATRONS.get(KV_KEYS.cert(minted.certificate.cert_id)))!);
      const signed = defect === "unsigned-payment-fields"
        ? await signMessage(canonicalizeCertificateLegacy(record.certificate), testEnv.SIGNING_KEY)
        : await signCertificate(record.certificate, "01".repeat(32));
      record.signature = signed.signature; record.public_key = signed.publicKey;
      await sourceEnv.PATRONS.put(KV_KEYS.cert(minted.certificate.cert_id), JSON.stringify(record));
    }
    const original = testEnv.ORDERS;
    if (defect === "read-failure" || defect === "truncated-list") testEnv.ORDERS = new Proxy(original, {
      get(target, property) {
        if (property === "list") return async (options: KVNamespaceListOptions) => {
          if (options.prefix === KV_KEYS.orderPrefix) {
            if (defect === "read-failure") throw new Error("fixture storage read failure");
            return { keys: [], list_complete: false, cursor: "" };
          }
          return target.list(options);
        };
        const value = Reflect.get(target, property); return typeof value === "function" ? value.bind(target) : value;
      },
    });
    const settles = facilitator.settleCalls;
    try {
      const result = await retry();
      expect(result.protocolError).toBe(true);
      expect(result.quote).toBe(false);
      expect(result.body).toMatchObject({ code: defect === "missing-desk-record" ? "purchase_record_unavailable" : "delivery_failed",
        charged: defect === "missing-desk-record" ? null : true, charged_again: false });
      expect(result.body.order_id).toBeUndefined();
      expect(result.body.original_request).toBeUndefined();
      expect(result.body.deliverable).toBeUndefined();
      expect(facilitator.settleCalls).toBe(settles);
      expect(JSON.parse((await sourceEnv.ORDERS.get(KV_KEYS.deliveryIntent(transaction)))!)).toEqual(defect === "missing-desk-record" ? null : intent);
    } finally { testEnv.ORDERS = original; }
  });
}
