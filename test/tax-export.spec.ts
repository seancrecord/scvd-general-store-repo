import { SELF, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { KV_KEYS } from "@/lib/kv-keys";
import { mintCertificate } from "@/services/certificates";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";
const AUTH = {
  Authorization: `Basic ${btoa(`keeper:${testEnv.ADMIN_PASSWORD}`)}`,
};

/**
 * THE TAX DRAWER: one CSV, sales off the certificates, refunds as
 * their own negative rows, house flagged and never omitted. What
 * these pin: the route is gated, the rows carry the audit-proof
 * fields (settlement tx above all), the house flag comes from the
 * same register the public books use, and a refund arrives as an
 * offsetting event rather than a guessed join.
 */
describe("the tax drawer", () => {
  it("needs the keeper's key", async () => {
    const response = await SELF.fetch(`${BASE}/admin/export/tax.csv`);
    expect(response.status).toBe(401);
  });

  it("exports sales with tx, house flag, and refunds as negative rows", async () => {
    // A house sale (the founding burner is in the register)...
    const house = await mintCertificate(testEnv, {
      itemId: "small_blessing",
      paidUsdc: 0.005,
      payer: "0x137ae5e3c7ed176744226f67223de50ca3a19e5a",
      settlementTx: `0xtax${"a".repeat(60)}`,
      network: "eip155:8453",
    });
    // ...an organic sale from a stranger...
    const organic = await mintCertificate(testEnv, {
      itemId: "hello",
      paidUsdc: 0.5,
      tipUsdc: 0.25,
      payer: "0x9f00000000000000000000000000000000000abc",
      settlementTx: `0xtax${"b".repeat(60)}`,
      network: "eip155:8453",
    });
    // ...and a refund on the books.
    await testEnv.ORDERS.put(
      KV_KEYS.refund("rf_taxtest"),
      JSON.stringify({
        refund_id: "rf_taxtest",
        item: "hello",
        amount_usdc: 0.5,
        payer: "0x9f00000000000000000000000000000000000abc",
        status: "refund_paid",
        created_at: "2026-08-04T12:00:00.000Z",
        paid_at: "2026-08-04T13:00:00.000Z",
        tx_hash: `0xtax${"c".repeat(60)}`,
      }),
    );

    const response = await SELF.fetch(`${BASE}/admin/export/tax.csv`, {
      headers: AUTH,
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/csv");
    const csv = await response.text();
    const lines = csv.trim().split("\n");
    expect(lines[0]).toBe(
      "date,row_type,cert_id,item,patron_number,amount_usdc,tip_usdc,asset,network,payer,settlement_tx,house_flagged,refund_status",
    );

    const houseRow = lines.find((line) => line.includes(house.certificate.cert_id));
    expect(houseRow, "the house sale is IN the export, flagged").toContain(",house,");
    expect(houseRow).toContain(`0xtax${"a".repeat(60)}`);

    const organicRow = lines.find((line) =>
      line.includes(organic.certificate.cert_id),
    );
    expect(organicRow).toContain(",organic,");
    expect(organicRow).toContain(",0.5,0.25,");

    const refundRow = lines.find((line) => line.includes("rf_taxtest") || (line.includes(",refund,") && line.includes(`0xtax${"c".repeat(60)}`)));
    expect(refundRow, "the refund is its own offsetting row").toBeDefined();
    expect(refundRow).toContain(",-0.5,");
    expect(refundRow).toContain("refund_paid");

    await testEnv.ORDERS.delete(KV_KEYS.refund("rf_taxtest"));
  });

  it("keeps the free shelf out — no money, no taxable event", async () => {
    const free = await mintCertificate(testEnv, { itemId: "stamp_test_free" });
    const response = await SELF.fetch(`${BASE}/admin/export/tax.csv`, {
      headers: AUTH,
    });
    const csv = await response.text();
    expect(csv).not.toContain(free.certificate.cert_id);
  });
});
