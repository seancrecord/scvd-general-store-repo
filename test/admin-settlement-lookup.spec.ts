import { SELF, env } from "cloudflare:test";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { KV_KEYS } from "@/lib/kv-keys";
import type { CertificateRecord, Env } from "@/types";

/**
 * WHAT THE BOOKS HOLD FOR ONE SETTLEMENT (2026-09-28). The bank walk
 * paged a hash as a possibly-undelivered sale, the delivery desk was
 * empty, and there was no page to put the hash into. This is that
 * page: our records only, each named, and "could not see" kept apart
 * from "none".
 */
const bindings = env as unknown as Env;
const BASE = "https://scvd.store";
const auth = { Authorization: `Basic ${btoa(`keeper:${bindings.ADMIN_PASSWORD}`)}` };
const now = new Date("2026-09-26T01:31:00.000Z");
const payer = `0x${"7e".repeat(20)}`;
const tx = `0x${"a0".repeat(32)}`;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(now);
  for (const [kv, prefix] of [[bindings.PATRONS, KV_KEYS.certPrefix], [bindings.PATRONS, "settle_cert:"],
    [bindings.COUNTERS, "payer"], [bindings.COUNTERS, KV_KEYS.settledDeliveryPrefix], [bindings.ORDERS, "delivery"]] as const) {
    const keys = await kv.list({ prefix });
    await Promise.all(keys.keys.map(key => kv.delete(key.name)));
  }
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

async function lookup(id: string) {
  const response = await SELF.fetch(`${BASE}/admin/settlement/${id}`, { headers: auth });
  return { status: response.status, body: await response.json() as Record<string, any> };
}

it("is the keeper's and refuses anything that is not a settlement id", async () => {
  expect((await SELF.fetch(`${BASE}/admin/settlement/${tx}`)).status).toBe(401);
  expect((await lookup("not%20a%20hash")).status).toBe(400);
});

it("names every record the store holds for a booked settlement", async () => {
  const cert: CertificateRecord = { certificate: { cert_id: "cert_lookup01", patron_number: 9, item: "spot_check",
    date: now.toISOString(), paid_usdc: 0.001, asset: "USDC", payer, settlement_tx: tx, network: "eip155:8453" },
    signature: "test", public_key: "test" };
  await bindings.PATRONS.put(KV_KEYS.cert("cert_lookup01"), JSON.stringify(cert));
  await bindings.PATRONS.put(KV_KEYS.settlementCert(tx), "cert_lookup01");
  await bindings.COUNTERS.put(KV_KEYS.settledDelivery(tx), now.toISOString());
  await bindings.COUNTERS.put(KV_KEYS.payerSettle(payer, tx), JSON.stringify({ item: "spot_check", at: now.toISOString(), transaction: tx }));

  const { status, body } = await lookup(tx);
  expect(status).toBe(200);
  expect(body.certificate).toMatchObject({ cert_id: "cert_lookup01", certain: true, item: "spot_check", payer, paid_usdc: 0.001 });
  expect(body.delivered_settlement.recorded_at).toBe(now.toISOString());
  expect(body.delivery_intent).toEqual({ open: null, resolved: null });
  expect(body.legacy_settle_records).toEqual({ rows: [{ payer, item: "spot_check", at: now.toISOString(), house: false }], truncated: false });
  expect(body.native_sale_ids).toEqual([]);
  expect(body.reading).toContain("READ: the books know this settlement.");
});

it("says plainly when no record anywhere names the hash, and keeps an open intent visible", async () => {
  const { body } = await lookup(tx);
  expect(body.certificate).toEqual({ cert_id: null, certain: true });
  expect(body.reading).toContain("READ: no record anywhere in the books names this settlement.");

  await bindings.ORDERS.put(KV_KEYS.deliveryIntent(tx), JSON.stringify({ path: "/api/buy/spot_check", transaction: tx, payer, paid_usdc: 0.001, settled_at: now.toISOString() }));
  const open = await lookup(tx);
  expect(open.body.delivery_intent.open).toMatchObject({ path: "/api/buy/spot_check", transaction: tx });
  expect(open.body.reading).toContain("A delivery intent is OPEN");
});
