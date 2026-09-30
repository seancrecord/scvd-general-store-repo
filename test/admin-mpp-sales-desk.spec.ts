import { SELF, env, runInDurableObject } from "cloudflare:test";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Env } from "@/types";

/**
 * THE MPP SALES DESK (2026-09-28). The take said "1 MPP sale" and no
 * page held the row: the keeper could not tell who paid, on which
 * transaction, or for what. Every retained sale is a row here, with
 * the purchase inspection and the settlement lookup one link away.
 */
const bindings = env as unknown as Env;
const BASE = "https://scvd.store";
const auth = { Authorization: `Basic ${btoa(`keeper:${bindings.ADMIN_PASSWORD}`)}` };
const now = new Date("2026-09-16T12:00:00.000Z");
const month = now.toISOString().slice(0, 7);
const ledger = () => bindings.COUNTER_LEDGER!.get(bindings.COUNTER_LEDGER!.idFromName(`${month}/mpp-sales`));
const payer = `0x${"7e".repeat(20)}`;
const tx = `0x${"a0".repeat(32)}`;
const id = "b".repeat(64);

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(now);
  await runInDurableObject(ledger(), async (_instance, state) => { await state.storage.deleteAll(); });
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

async function sale() {
  await runInDurableObject(ledger(), async (_instance, state) => {
    state.storage.sql.exec("CREATE TABLE IF NOT EXISTS mpp_sales (id TEXT PRIMARY KEY, evidence TEXT NOT NULL)");
    state.storage.sql.exec("INSERT INTO mpp_sales (id, evidence) VALUES (?, ?)", id,
      JSON.stringify({ id, month, payer, transaction: tx, amount: "1000", house: false, item: "spot_check" }));
  });
}

it("is the keeper's and nobody else's", async () => {
  expect((await SELF.fetch(`${BASE}/admin/mpp-sales`)).status).toBe(401);
});

it("lists every retained MPP sale as a row: who, which settlement, what, and whether house", async () => {
  await sale();
  const json = await (await SELF.fetch(`${BASE}/admin/mpp-sales`, { headers: { ...auth, Accept: "application/json" } })).json() as {
    rows: Array<{ id: string; payer: string; transaction: string; item?: string; house: boolean; month: string }>;
    months: string[]; months_unreadable: string[]; malformed: number;
  };
  expect(json.rows).toEqual([{ id, month, payer, transaction: tx, amount: "1000", house: false, item: "spot_check", effective_house: false, classification: "confirmed" }]);
  expect(json.months).toContain(month);
  expect(json.months_unreadable).toEqual([]);
  expect(json.malformed).toBe(0);

  const html = await (await SELF.fetch(`${BASE}/admin/mpp-sales`, { headers: { ...auth, Accept: "text/html" } })).text();
  expect(html).toContain("spot_check");
  expect(html).toContain(`title="${payer}"`);
  expect(html).toContain(`href="/admin/purchases/${id}"`);
  expect(html).toContain(`href="/admin/settlement/${tx}"`);
  expect(html).toContain("$0.001");
});

it("says so when there is nothing, rather than rendering a blank", async () => {
  const json = await (await SELF.fetch(`${BASE}/admin/mpp-sales`, { headers: { ...auth, Accept: "application/json" } })).json() as { rows: unknown[] };
  expect(json.rows).toEqual([]);
  const html = await (await SELF.fetch(`${BASE}/admin/mpp-sales`, { headers: { ...auth, Accept: "text/html" } })).text();
  expect(html).toContain("No MPP sales retained");
});
