import { SELF, env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { houseWallets } from "@/lib/channel";
import { KV_KEYS } from "@/lib/kv-keys";
import { recordSettlement } from "@/lib/metrics";
import { readBuyers } from "@/services/buyers";
import { certificatesAgainstSettles } from "@/services/settle-sources";
import type { Env, PayerRecord } from "@/types";

const testEnv = env as unknown as Env;
const AUTH = { Authorization: `Basic ${btoa(`keeper:${testEnv.ADMIN_PASSWORD}`)}`, Accept: "text/html" };
const A = "0x1111111111111111111111111111111111111111";
const B = "0x2222222222222222222222222222222222222222";

async function clear(ns: KVNamespace, prefix: string): Promise<void> {
  let cursor: string | undefined;
  for (;;) {
    const listed = await ns.list({ prefix, limit: 1000, ...(cursor ? { cursor } : {}) });
    for (const key of listed.keys) await ns.delete(key.name);
    if (listed.list_complete) break;
    cursor = listed.cursor;
  }
}
async function cert(id: string, item: string, date: string, payer?: string, paid = 0.005): Promise<void> {
  await testEnv.PATRONS.put(KV_KEYS.cert(id), JSON.stringify({
    certificate: { cert_id: id, item, patron_number: 1, date, ...(payer ? { payer } : {}), paid_usdc: paid },
    signature: "", public_key: "",
  }));
}
async function payerRow(address: string, purchases: number): Promise<void> {
  const row: PayerRecord = { address, first_seen: "2026-08-01T00:00:00.000Z", last_seen: "2026-09-01T00:00:00.000Z", purchases };
  await testEnv.COUNTERS.put(KV_KEYS.payer(address), JSON.stringify(row));
}

beforeEach(async () => {
  await clear(testEnv.PATRONS, KV_KEYS.certPrefix);
  await clear(testEnv.COUNTERS, KV_KEYS.payerPrefix);
  await clear(testEnv.COUNTERS, "evt:");
});

describe("the buyers, off the certificates", () => {
  it("groups by wallet, in order, and sees the handoff", async () => {
    await cert("cert_a1", "hello", "2026-08-10T10:00:00.000Z", A, 0.5);
    await cert("cert_a2", "settlement_attestation", "2026-08-10T10:05:00.000Z", A, 0.004);
    await cert("cert_b1", "small_blessing", "2026-08-12T00:00:00.000Z", B);
    await cert("cert_old", "hello", "2026-07-20T00:00:00.000Z"); // before payer recording
    await payerRow(A, 2);
    await payerRow(B, 1);
    const r = await readBuyers(testEnv);
    expect(r.summary.distinct_buyers).toBe(2);
    expect(r.summary.repeat_buyers).toBe(1);
    expect(r.summary.followed_handoff).toBe(1);
    expect(r.certificates_without_payer).toBe(1);
    const a = r.buyers.find((b) => b.address === A)!;
    expect(a.purchases.map((p) => p.item)).toEqual(["hello", "settlement_attestation"]);
    expect(a.followed_handoff).toBe(true);
    expect(a.paid_usdc).toBeCloseTo(0.504, 6);
    expect(a.payer_row_purchases).toBeUndefined(); // row agrees
    expect(r.items_bought).toEqual({ hello: 1, settlement_attestation: 1, small_blessing: 1 });
  });

  it("names a wallet whose payer row disagrees with its certificates", async () => {
    await cert("cert_b1", "small_blessing", "2026-08-12T00:00:00.000Z", B);
    await cert("cert_b2", "hello", "2026-08-13T00:00:00.000Z", B);
    await payerRow(B, 1); // one purchase lost from the row
    const r = await readBuyers(testEnv);
    expect(r.buyers[0]?.payer_row_purchases).toBe(1);
    expect(r.summary.rows_disagreeing).toBe(1);
  });

  it("leaves the house out", async () => {
    const house = houseWallets(testEnv)[0];
    if (!house) return; // nothing to exclude in this environment
    await cert("cert_h", "hello", "2026-08-12T00:00:00.000Z", house);
    const r = await readBuyers(testEnv);
    expect(r.house_purchases_excluded).toBe(1);
    expect(r.buyers.length).toBe(0);
  });

  it("renders, behind the keeper's door", async () => {
    await cert("cert_b1", "small_blessing", "2026-08-12T00:00:00.000Z", B);
    const page = await SELF.fetch("https://scvd.store/admin/buyers", { headers: AUTH });
    expect(page.status).toBe(200);
    expect(await page.text()).toContain("0x222222");
    expect((await SELF.fetch("https://scvd.store/admin/buyers")).status).toBe(401);
  });
});

describe("the third witness on the books check", () => {
  it("sides with the counters when a certificate exists and the row does not", async () => {
    await cert("cert_b1", "small_blessing", "2026-08-12T00:00:00.000Z", B);
    await cert("cert_b2", "hello", "2026-08-13T00:00:00.000Z", B);
    await payerRow(B, 1);
    const c = await certificatesAgainstSettles(testEnv, {
      counter_settles: 3, payer_purchases: 1, founding: 1, unattributed: 0, unexplained: 1,
      does_not_cover: "", delivery_audit: "",
    } as never);
    expect(c.certificates_with_payer).toBe(2);
    expect(c.wallets_disagreeing).toEqual([{ address: B, payer_row_purchases: 1, certificates: 2 }]);
    expect(c.reading).toContain("side with the COUNTERS");
    expect(c.reading).toContain(B);
  });

  it("sides with the rows when no certificate carries the settle", async () => {
    await cert("cert_b1", "small_blessing", "2026-08-12T00:00:00.000Z", B);
    await payerRow(B, 1);
    const c = await certificatesAgainstSettles(testEnv, {
      counter_settles: 3, payer_purchases: 1, founding: 1, unattributed: 0, unexplained: 1,
      does_not_cover: "", delivery_audit: "",
    } as never);
    expect(c.reading).toContain("side with the PAYER ROWS");
    expect(c.reading).toContain("/admin/deliveries");
  });
});

describe("the payer row fold writes before it deletes", () => {
  it("keeps the legacy row's purchases and removes the legacy key", async () => {
    // A base58-looking address whose lowercased form is a different key.
    const mixed = "DGxcPrAHL9YM3hW7iXuHFJmr87Zr6AMA4jCYHBpuvMgE";
    const legacyKey = `${KV_KEYS.payerPrefix}${mixed.toLowerCase()}`;
    await testEnv.COUNTERS.put(legacyKey, JSON.stringify({ address: mixed.toLowerCase(), first_seen: "2026-08-01T00:00:00.000Z", last_seen: "2026-08-01T00:00:00.000Z", purchases: 2 }));
    await recordSettlement(testEnv, "/api/buy/hello", { payer: mixed, paidUsdc: 0.5, minimumUsdc: 0.5, userAgent: "buyer-client/1.0" });
    const merged = await testEnv.COUNTERS.get(KV_KEYS.payer(mixed), "json") as PayerRecord | null;
    expect(merged?.purchases).toBe(3);
    expect(await testEnv.COUNTERS.get(legacyKey)).toBeNull();
  });
});
