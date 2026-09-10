import { afterEach, expect, it, vi } from "vitest";
import { getPaymentStack } from "@/lib/payments";
import { KV_KEYS } from "@/lib/kv-keys";
import { installLaborAdmissionHarness, laborNetworks, signLabor, transfers } from "./helpers/labor-admission";
import { request, object, testEnv, sourceEnv, NOW } from "./helpers/buyer-harness";
import { decodePaymentRequired } from "./helpers/payment";

installLaborAdmissionHarness();
afterEach(() => vi.restoreAllMocks());
for (const network of laborNetworks()) for (const shelf of ["commission", "almanac", "gazette", "zodiac"]) {
  it(`${shelf} ${network}: competing fresh payments retain one original purchase`, async () => {
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
    const firstPayment = await signLabor(offer), secondPayment = await signLabor(offer);
    const send = (payment: Record<string, unknown>) => request(path, { headers: {
      "PAYMENT-SIGNATURE": btoa(JSON.stringify(payment)), "Idempotency-Key": key } });
    const stack = getPaymentStack(testEnv), settle = stack.httpServer.processSettlement.bind(stack.httpServer);
    let entered!: () => void, release!: () => void, submissions = 0;
    const firstEntered = new Promise<void>(resolve => { entered = resolve; });
    const hold = new Promise<void>(resolve => { release = resolve; });
    vi.spyOn(stack.httpServer, "processSettlement").mockImplementation(async (...args) => {
      if (++submissions === 1) { entered(); await hold; }
      return settle(...args);
    });
    const first = send(firstPayment);
    await firstEntered;
    let duplicate: Response;
    try { duplicate = await send(secondPayment); } finally { release(); }
    const winner = await first;
    expect(winner.status).toBe(200);
    expect(submissions).toBe(1); expect(transfers).toBe(1);
    expect(duplicate.status).toBe(503);
    const body = object(await duplicate.json());
    expect(body).toMatchObject({ charged: null, charged_again: false, settlement_attempted: false });
    const recovery = object(body.recovery);
    expect(recovery.purchase_id).toMatch(/^[a-f0-9]{64}$/);
    const original = await winner.text();
    const replay = await send(secondPayment);
    expect(replay.status).toBe(200);
    if (shelf !== "commission") expect(await replay.text()).toBe(original);
    else expect(object(await replay.json()).order_id).toBe(object(JSON.parse(original)).order_id);
    expect(submissions).toBe(1); expect(transfers).toBe(1);
  });
}
