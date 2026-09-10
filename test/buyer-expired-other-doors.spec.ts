import { installExpiredPaymentFixture, refuseSpentVerification } from "./helpers/expired-payment";
import { expect, it, vi } from "vitest";
import { getPaymentStack } from "@/lib/payments";
import { KV_KEYS } from "@/lib/kv-keys";
import { installLaborAdmissionHarness, laborNetworks, signLabor, transfers } from "./helpers/labor-admission";
import { request, object, testEnv, sourceEnv, NOW } from "./helpers/buyer-harness";
import { decodePaymentRequired } from "./helpers/payment";

installLaborAdmissionHarness();
installExpiredPaymentFixture();
for (const network of laborNetworks()) for (const shelf of ["commission", "almanac", "gazette", "zodiac"]) {
  it(`${shelf} ${network}: expired payment retrieves the original goods without a key`, async () => {
    const id = crypto.randomUUID(), key = crypto.randomUUID();
    let path: string;
    if (shelf === "commission") {
      const row = { id, description: `SCVD-E2E-${id}`, contact: "fixture@example.com", date: NOW.toISOString(),
        offer_usdc: 25, status: "quoted", quote_usdc: 25, quote_window_hours: 72, quoted_at: NOW.toISOString(),
        quote_expires_at: new Date(NOW.getTime() + 86400000).toISOString(), quote_note: "Original scope" };
      await sourceEnv.ORDERS.put(KV_KEYS.commissionRequest(id), JSON.stringify(row));
      path = `/api/commission/pay/25?commission=${id}`;
    } else if (shelf === "almanac") {
      await sourceEnv.ORDERS.put(KV_KEYS.almanacEntry(id), JSON.stringify({ slug: id, title: id, teaser: id, date: NOW.toISOString(), markdown: `# SCVD-E2E-${id}` }));
      path = `/almanac/${id}`;
    } else if (shelf === "gazette") {
      await sourceEnv.ORDERS.put(KV_KEYS.gazetteIssue(999999), JSON.stringify({ issue_number: 999999, title: id,
        date: NOW.toISOString(), markdown: `# SCVD-E2E-${id}`, contributors: [], tip_ids: [], signature: "fixture", public_key: "fixture" }));
      path = "/gazette/issue-999999";
    } else {
      const index = object(await (await request("/zodiac/archive?view=compact")).json());
      path = String((index.pages as Record<string, unknown>[])[0]!.buy_url);
    }
    const quote = await request(path); expect(quote.status).toBe(402);
    const offer = decodePaymentRequired(quote).accepts.find(o => o.network === network)!;
    const payment = await signLabor(offer);
    const first = await request(path, { headers: { "PAYMENT-SIGNATURE": btoa(JSON.stringify(payment)), "Idempotency-Key": key } });
    expect(first.status).toBe(200);
    const original = await first.text();
    refuseSpentVerification();
    const settle = vi.spyOn(getPaymentStack(testEnv).httpServer, "processSettlement");
    const retry = await request(path, { headers: { "PAYMENT-SIGNATURE": btoa(JSON.stringify(payment)) } });
    expect(retry.status).toBe(200);
    expect(retry.headers.has("PAYMENT-REQUIRED")).toBe(false);
    if (shelf === "commission") expect(object(await retry.json())).toMatchObject(object(JSON.parse(original)));
    else expect(await retry.text()).toBe(original);
    expect(settle).not.toHaveBeenCalled(); expect(transfers).toBe(1);
  });
}
