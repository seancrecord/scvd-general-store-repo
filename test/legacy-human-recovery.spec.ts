import { beforeAll, expect, it, vi } from "vitest";
import { BASE_NETWORK, POLYGON_NETWORK } from "@/lib/payments";
import { KV_KEYS } from "@/lib/kv-keys";
import { installBuyerHarness, items, shelves, baseline, call, request, object, sourceEnv, facilitator, type Obj } from "./helpers/buyer-harness";
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

// These are synthetic pre-capture records, not claims about production buyers.
// A 600-byte desk preview cannot authenticate either brief below: they share it.
for (const id of ["aura_walk", "the_collab"]) for (const door of ["http", "mcp", "standard"] as const)
  for (const network of [BASE_NETWORK, POLYGON_NETWORK]) for (const changed of [false, true])
    for (const owner of ["same", "missing", "other", "wrong-path", "wrong-transaction"] as const) {
    it(`${id} ${door} ${network} ${owner} record: an old preview cannot authorize ${changed ? "changed" : "original"} work`, async () => {
      const item = items.find(item => item.id === id)!, tool = shelves(item)[0]!;
      const prefix = `SCVD-E2E-${crypto.randomUUID()}-${"x".repeat(610)}`;
      const args = { ...baseline(item), detail: `${prefix}-ORIGINAL` };
      const quote = await call(item, door === "http" ? "http" : "mcp", args, tool);
      expect(quote.quote).toBe(true);
      const wire = await evmPayment(quote.offers.find(offer => offer.network === network)!);
      const authorization = object(object(wire.payload).authorization);
      const transaction = `0x${crypto.randomUUID().replaceAll("-", "").repeat(2)}`;
      const path = `/api/buy/${id}`;
      const intent = { path: owner === "wrong-path" ? "/api/buy/hello" : path,
        transaction: owner === "wrong-transaction" ? `0x${"ab".repeat(32)}` : transaction,
        ...(owner === "missing" ? {} : { payer: owner === "other" ?
          "0x1111111111111111111111111111111111111111" : authorization.from }), paid_usdc: item.price_usdc,
        settled_at: "2026-09-04T12:00:00.000Z", query: new URLSearchParams(args).toString().slice(0, 600) };
      await sourceEnv.COUNTERS.put(KV_KEYS.paymentNonce(String(authorization.nonce)), JSON.stringify({ path, transaction }));
      await sourceEnv.ORDERS.put(KV_KEYS.deliveryIntent(transaction), JSON.stringify(intent));
      const payment = btoa(JSON.stringify(wire));
      const retryArgs = { ...args, detail: `${prefix}-${changed ? "CHANGED" : "ORIGINAL"}` };
      const settles = facilitator.settleCalls;
      let body: Obj, failed: boolean;
      if (door === "standard") {
        const raw = object(await (await request("/mcp?payment=tool-result", { method: "POST",
          headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1,
            method: "tools/call", params: { name: tool.name, arguments: { item_id: id, ...retryArgs },
              _meta: { "x402/payment": payment } } }) })).json());
        const result = object(raw.result);
        body = object(result.structuredContent); failed = result.isError === true;
        expect(object(result._meta)["x402/payment-required"]).toBeUndefined();
      } else {
        const retry = await call(item, door, retryArgs, tool, payment);
        body = retry.body; failed = retry.protocolError;
        if (door === "http") expect(retry.status).toBe(owner === "same" ? 500 : 503);
        expect(retry.quote).toBe(false);
      }
      expect(failed).toBe(true);
      if (owner === "same") {
        expect(body).toMatchObject({ code: "delivery_failed", charged: true, charged_again: false,
          transaction, recovery_reason: "original_inputs_unavailable" });
      } else {
        expect(body).toMatchObject({ code: "purchase_record_unavailable", charged: null, charged_again: false });
        expect(body.transaction).toBeUndefined();
        expect(body.paid_usdc).toBeUndefined();
        expect(body.payer).toBeUndefined();
      }
      expect(object(body.recovery).contact_url).toBe("https://scvd.store/api/letter");
      expect(String(object(body.recovery).do_not_retry)).toContain("original payment");
      expect(body.order_id).toBeUndefined();
      expect(body.network).toBeUndefined(); // The old row did not retain a chain; today's offer is no proof.
      expect(facilitator.settleCalls).toBe(settles);
      expect((await sourceEnv.ORDERS.list({ prefix: KV_KEYS.orderPrefix })).keys).toHaveLength(0);
      expect((await sourceEnv.PATRONS.list({ prefix: KV_KEYS.certPrefix })).keys).toHaveLength(0);
      expect(JSON.parse((await sourceEnv.ORDERS.get(KV_KEYS.deliveryIntent(transaction)))!)).toEqual(intent);
    });
  }
