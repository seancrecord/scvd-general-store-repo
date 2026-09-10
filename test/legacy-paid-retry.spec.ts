import { expect, it } from "vitest";
import { MENU_ITEMS } from "@/store";
import { KV_KEYS } from "@/lib/kv-keys";
import { sha256Hex } from "@/lib/idempotency";
import { jcsCanonicalize } from "@/lib/jcs";
import { installLaborAdmissionHarness, laborNetworks, signLabor, sendLabor, transfers } from "./helpers/labor-admission";
import { items, baseline, call, object, sourceEnv, NOW, request } from "./helpers/buyer-harness";
import { decodePaymentRequired } from "./helpers/payment";
import { solFacts } from "./helpers/buyer-signed-payments";

installLaborAdmissionHarness();

// Genuine pre-capture state: no purchase journal, artifact snapshot, or order.
// Even a complete matching request digest proves neither the old observed
// evidence nor the particular random good that was sold.
for (const product of MENU_ITEMS) for (const door of ["http", "mcp", "mcp-standard"] as const) {
  it(`${product.id} ${door}: every rail keeps an unrecoverable historical good owed`, async () => {
    const item = items.find(item => item.id === product.id)!;
    const args = { ...baseline(item), purpose: `SCVD-E2E-${crypto.randomUUID()}` };
    const quote = await call(item, "http", args);
    expect(quote.quote).toBe(true);
    for (const network of laborNetworks()) {
      const offer = quote.offers.find(offer => offer.network === network)!;
      expect(offer).toBeTruthy();
      const wire = await signLabor(offer), auth = object(object(wire.payload).authorization);
      const sol = network.startsWith("solana:") ? await solFacts(wire) : null;
      const transaction = sol?.tx ?? `0x${crypto.randomUUID().replaceAll("-", "").repeat(2)}`;
      const payer = String(sol?.payer ?? auth.from), path = `/api/buy/${item.id}`;
      const payment = { transaction, payer, network, paidUsdc: Number(offer.amount) / 1e6, tipUsdc: 0, settleHeaders: {} };
      const intent = { path, transaction, payer, paid_usdc: payment.paidUsdc, settled_at: NOW.toISOString(),
        query: new URLSearchParams(args).toString().slice(0, 600),
        mcp_retry: { input_digest: await sha256Hex(jcsCanonicalize({ item_id: item.id, ...args })), payment } };
      const key = KV_KEYS.deliveryIntent(transaction), raw = JSON.stringify(intent);
      if (!sol) await sourceEnv.COUNTERS.put(KV_KEYS.paymentNonce(String(auth.nonce)), JSON.stringify({ path, transaction }));
      await sourceEnv.ORDERS.put(key, raw);
      const before = await sourceEnv.PATRONS.list({ prefix: KV_KEYS.certPrefix });
      for (const changed of [false, true]) {
        const result = await sendLabor(item.id, door, changed ? { ...args, purpose: "SCVD-E2E-REPLACEMENT" } : args, wire);
        expect(result.refused).toBe(true);
        expect(result.quote).toBe(false);
        expect(result.body).toMatchObject({ code: "delivery_failed", charged: true, charged_again: false,
          settlement_attempted: false, transaction, recovery_reason: "original_inputs_unavailable" });
        expect(result.body.network).toBeUndefined(); // The historical row itself had no rail.
        expect(object(result.body.recovery).contact_url).toBe("https://scvd.store/api/letter");
        expect(String(object(result.body.recovery).do_not_retry)).toContain("original payment");
        expect(result.body.deliverable).toBeUndefined();
        expect(result.body.cert_id).toBeUndefined();
        expect(result.body.order_id).toBeUndefined();
        expect(transfers).toBe(0);
        expect(await sourceEnv.ORDERS.get(key)).toBe(raw);
        expect((await sourceEnv.PATRONS.list({ prefix: KV_KEYS.certPrefix })).keys).toEqual(before.keys);
        expect((await sourceEnv.ORDERS.list({ prefix: KV_KEYS.orderPrefix })).keys).toHaveLength(0);
      }
    }
  });
}

for (const shelf of ["commission", "almanac", "gazette", "zodiac"]) {
  it(`${shelf}: historical HTTP payment cannot buy today's publication or brief on any rail`, async () => {
    const id = crypto.randomUUID(); let url: string;
    if (shelf === "commission") {
      await sourceEnv.ORDERS.put(KV_KEYS.commissionRequest(id), JSON.stringify({ id, description: `SCVD-E2E-${id}`,
        contact: "private@example.com", date: NOW.toISOString(), offer_usdc: 25, status: "quoted", quote_usdc: 25,
        quote_window_hours: 72, quoted_at: NOW.toISOString(), quote_expires_at: new Date(+NOW + 86400000).toISOString() }));
      url = `/api/commission/pay/25?commission=${id}`;
    } else if (shelf === "almanac") {
      await sourceEnv.ORDERS.put(KV_KEYS.almanacEntry(id), JSON.stringify({ slug: id, title: id, teaser: id,
        date: NOW.toISOString(), markdown: `SCVD-E2E-REPLACEMENT-${id}` }));
      url = `/almanac/${id}`;
    } else if (shelf === "gazette") {
      await sourceEnv.ORDERS.put(KV_KEYS.gazetteIssue(999999), JSON.stringify({ issue_number: 999999, title: id,
        date: NOW.toISOString(), markdown: `SCVD-E2E-REPLACEMENT-${id}`, contributors: [], tip_ids: [], signature: "fixture", public_key: "fixture" }));
      url = "/gazette/issue-999999";
    } else {
      const index = object(await (await request("/zodiac/archive?view=compact")).json());
      url = String((index.pages as Record<string, unknown>[])[0]!.buy_url);
    }
    const quote = await request(url); expect(quote.status).toBe(402);
    for (const network of laborNetworks()) {
      const offer = decodePaymentRequired(quote).accepts.find(offer => offer.network === network)!;
      const wire = await signLabor(offer), auth = object(object(wire.payload).authorization);
      const sol = network.startsWith("solana:") ? await solFacts(wire) : null;
      const transaction = sol?.tx ?? `0x${crypto.randomUUID().replaceAll("-", "").repeat(2)}`;
      const payer = String(sol?.payer ?? auth.from), path = new URL(url, "https://scvd.store").pathname;
      const raw = JSON.stringify({ path, transaction, payer, paid_usdc: Number(offer.amount) / 1e6, settled_at: NOW.toISOString() });
      await sourceEnv.ORDERS.put(KV_KEYS.deliveryIntent(transaction), raw);
      if (!sol) await sourceEnv.COUNTERS.put(KV_KEYS.paymentNonce(String(auth.nonce)), JSON.stringify({ path, transaction }));
      const retry = await request(url, { headers: { "PAYMENT-SIGNATURE": btoa(JSON.stringify(wire)) } });
      expect(retry.status).toBe(500);
      expect(retry.headers.has("PAYMENT-REQUIRED")).toBe(false);
      expect(object(await retry.json())).toMatchObject({ code: "delivery_failed", charged: true, charged_again: false,
        settlement_attempted: false, transaction, recovery_reason: "original_inputs_unavailable" });
      expect(await sourceEnv.ORDERS.get(KV_KEYS.deliveryIntent(transaction))).toBe(raw);
      expect(transfers).toBe(0);
    }
  });
}

for (const door of ["http", "mcp", "mcp-standard"] as const) {
  it(`${door}: unbound or malformed historical identities disclose no paid-good facts`, async () => {
    const item = items.find(item => item.id === "hello")!, quote = await call(item, "http", {});
    for (const network of laborNetworks()) for (const defect of ["missing-payer", "different-payer", "invalid-amount", "invalid-time"]) {
      const offer = quote.offers.find(offer => offer.network === network)!;
      const wire = await signLabor(offer), auth = object(object(wire.payload).authorization);
      const sol = network.startsWith("solana:") ? await solFacts(wire) : null;
      const transaction = sol?.tx ?? `0x${crypto.randomUUID().replaceAll("-", "").repeat(2)}`;
      const payer = String(sol?.payer ?? auth.from), path = "/api/buy/hello";
      const raw = JSON.stringify({ path, transaction,
        ...(defect === "missing-payer" ? {} : { payer: defect === "different-payer" ? sol ? payer.toLowerCase() : "0x1111111111111111111111111111111111111111" : payer }),
        paid_usdc: defect === "invalid-amount" ? "1" : Number(offer.amount) / 1e6,
        settled_at: defect === "invalid-time" ? "yesterday" : NOW.toISOString() });
      await sourceEnv.ORDERS.put(KV_KEYS.deliveryIntent(transaction), raw);
      if (!sol) await sourceEnv.COUNTERS.put(KV_KEYS.paymentNonce(String(auth.nonce)), JSON.stringify({ path, transaction }));
      const retry = await sendLabor(item.id, door, {}, wire);
      expect(retry.refused).toBe(true); expect(retry.quote).toBe(false);
      expect(retry.body).toMatchObject({ code: "purchase_record_unavailable", charged: null, charged_again: false, settlement_attempted: false });
      for (const field of ["transaction", "payer", "paid_usdc", "network", "deliverable", "cert_id"]) expect(retry.body[field]).toBeUndefined();
      expect(await sourceEnv.ORDERS.get(KV_KEYS.deliveryIntent(transaction))).toBe(raw);
      expect(transfers).toBe(0);
    }
  });
}

for (const door of ["http", "mcp", "mcp-standard"] as const) {
  it(`${door}: an unlinked spent payment never becomes a new payment quote`, async () => {
    const item = items.find(item => item.id === "hello")!, quote = await call(item, "http", {});
    for (const network of laborNetworks()) for (const kind of ["different-item", "old-nonce"]) {
      if (network.startsWith("solana:") && kind === "old-nonce") continue;
      const wire = await signLabor(quote.offers.find(offer => offer.network === network)!);
      const auth = object(object(wire.payload).authorization), sol = network.startsWith("solana:") ? await solFacts(wire) : null;
      const transaction = sol?.tx ?? `0x${crypto.randomUUID().replaceAll("-", "").repeat(2)}`;
      const path = kind === "old-nonce" ? "/api/buy/hello" : "/api/buy/small_blessing";
      if (!sol) await sourceEnv.COUNTERS.put(KV_KEYS.paymentNonce(String(auth.nonce)), kind === "old-nonce" ? path : JSON.stringify({ path, transaction }));
      else await sourceEnv.ORDERS.put(KV_KEYS.deliveryIntent(transaction), JSON.stringify({ path, transaction,
        payer: sol.payer, paid_usdc: 1, settled_at: NOW.toISOString() }));
      const result = await sendLabor(item.id, door, {}, wire);
      expect(result.quote).toBe(false);
      expect(result.refused).toBe(true);
      if (door === "http") expect(result.status).toBe(503);
      expect(result.body).toMatchObject({ code: "purchase_record_unavailable", charged: null, charged_again: false, settlement_attempted: false });
      expect(object(result.body.recovery).contact_url).toBe("https://scvd.store/api/letter");
      expect(result.body.transaction).toBeUndefined();
      expect(transfers).toBe(0);
    }
  });
}
