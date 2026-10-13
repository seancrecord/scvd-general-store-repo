import { SELF, env } from "cloudflare:test";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { KV_KEYS } from "@/lib/kv-keys";
import { FOUNDING_SETTLES_WITHOUT_PAYER_ROW } from "@/lib/metrics";
import type { Env } from "@/types";

const bindings = env as unknown as Env;
const url = "https://scvd.store/admin/export/reconciliation.json";
const auth = { Authorization: `Basic ${btoa(`keeper:${bindings.ADMIN_PASSWORD}`)}` };
const payer = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const at = "2026-10-01T12:00:00.000Z";
const rows = [
  [KV_KEYS.payer(payer), JSON.stringify({ address: payer, purchases: 1, first_seen: at, last_seen: at, private_note: "EXCLUDED" })],
  [KV_KEYS.payerSettle(payer, "0xfirst"), JSON.stringify({ item: "retired_item", at, transaction: "0xfirst", house: true })],
  [KV_KEYS.payerSettle(payer, "0xsecond"), JSON.stringify({ item: "hello", at, transaction: "0xsecond" })],
  [KV_KEYS.metric("2026-10", "paid", "hello"), "2"],
  [KV_KEYS.metric("2026-10", "paidh", "retired_item"), "1"],
  [KV_KEYS.metric("2026-10", "nopayer", "hello"), "0"],
  [`house_reclass:${payer}`, JSON.stringify({ address: payer, settles: 1, at, reason: "<untrusted visitor text>", extra: "EXCLUDED" })],
  ["letter:private-export-test", "EXCLUDED"],
  [KV_KEYS.metric("2026-10", "402", "noise"), "9000"],
] as const;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-13T12:00:00.000Z"));
  await Promise.all(rows.map(([key, value]) => bindings.COUNTERS.put(key, value)));
});
afterEach(async () => {
  vi.useRealTimers();
  await Promise.all(rows.map(([key]) => bindings.COUNTERS.delete(key)));
});

it("downloads scoped evidence with reproducible arithmetic and leaves accounting untouched", async () => {
  const response = await SELF.fetch(url, { headers: auth });
  expect(response.status).toBe(200);
  expect(response.headers.get("Content-Disposition")).toContain("attachment;");
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  const text = await response.text();
  const result = JSON.parse(text);
  expect(result.format).toBe("scvd-reconciliation-evidence/v1");
  expect(result.complete).toBe(true);
  expect(result.summary).toMatchObject({
    counter_settles: FOUNDING_SETTLES_WITHOUT_PAYER_ROW + 3,
    payer_purchases: 2,
    founding: FOUNDING_SETTLES_WITHOUT_PAYER_ROW,
    unattributed: 0,
    unexplained: 1,
  });
  expect(text).toContain("retired_item");
  expect(text).toContain("<untrusted visitor text>");
  expect(text).not.toContain("EXCLUDED");
  expect(text).not.toContain(bindings.ADMIN_PASSWORD);
  expect(text).not.toContain("402:noise");
  for (const [key, value] of rows) expect(await bindings.COUNTERS.get(key)).toBe(value);
});

it("requires admin authentication and does not cache refusals", async () => {
  const response = await SELF.fetch(url);
  expect(response.status).toBe(401);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
});

it("offers the download on the existing books page", async () => {
  const response = await SELF.fetch("https://scvd.store/admin/reconciliation", { headers: auth });
  expect(await response.text()).toContain('href="/admin/export/reconciliation.json"');
});
