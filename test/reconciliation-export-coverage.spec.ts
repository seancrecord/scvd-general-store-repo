import { env } from "cloudflare:test";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { KV_KEYS } from "@/lib/kv-keys";
import { exportReconciliationEvidence } from "@/services/reconciliation-export";
import { RAISE_LOG_KEY } from "@/services/counter-raise";
import type { Env } from "@/types";

const fault = vi.hoisted(() => ({ truncate: "", failList: "", failRead: "", missing: "" }));
vi.mock("@/lib/kv-list", async original => {
  const actual = await original<typeof import("@/lib/kv-list")>();
  return { ...actual, listKeys: async (...args: Parameters<typeof actual.listKeys>) => {
    if (args[1].prefix === fault.failList) throw new Error("PRIVATE_ERROR_DETAIL");
    const result = await actual.listKeys(...args);
    return args[1].prefix === fault.truncate ? { ...result, truncated: true } : result;
  } };
});
vi.mock("@/lib/kv-bulk", async original => {
  const actual = await original<typeof import("@/lib/kv-bulk")>();
  return { ...actual, bulkGetText: async (...args: Parameters<typeof actual.bulkGetText>) => {
    if (args[1].includes(fault.failRead)) throw new Error("PRIVATE_ERROR_DETAIL");
    const values = await actual.bulkGetText(...args);
    if (fault.missing) values.delete(fault.missing);
    return values;
  } };
});

const kv = (env as unknown as Env).COUNTERS;
const at = "2026-10-01T00:00:00.000Z";
const now = new Date("2026-10-13T12:00:00.000Z");
const wallet = "CaseSensitiveSolanaBuyer";
const settleKey = KV_KEYS.payerSettle(wallet, "nonce_unknown");
const payerKey = KV_KEYS.payer(wallet);
const counterKey = KV_KEYS.metric("2026-10", "paid", "hello");
const fixtures = [
  [settleKey, JSON.stringify({ item: "hello", at })],
  [payerKey, JSON.stringify({ address: wallet, purchases: 3, first_seen: at, last_seen: at })],
  [counterKey, "3"],
  [RAISE_LOG_KEY, JSON.stringify({ at, records_scanned: 1, records_truncated: true, raised: [{ key: counterKey, from: 2, to: 3, extra: "EXCLUDED" }], payer_rows_raised: [], extra: "EXCLUDED" })],
] as const;
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(now);
  await Promise.all(fixtures.map(([key, value]) => kv.put(key, value)));
});
afterEach(async () => {
  fault.truncate = fault.failList = fault.failRead = fault.missing = "";
  vi.useRealTimers();
  await Promise.all(fixtures.map(([key]) => kv.delete(key)));
});
const capture = () => exportReconciliationEvidence({ COUNTERS: kv }, now);

it("preserves unknown transaction/house, Solana case, payer floors and historical raise coverage", async () => {
  const result = await capture();
  expect(result.complete).toBe(true);
  expect(result.summary?.payer_purchases).toBe(3);
  expect(result.summary?.unexplained).toBe(0);
  const row = result.sources.find(source => source.kind === "settlements")!.rows[0]!;
  expect(row.key).toContain(wallet);
  expect(row.value).toEqual({ item: "hello", at });
  expect(result.sources.find(source => source.kind === "latest_raise")!.rows[0]!.value).toMatchObject({ records_truncated: true });
  expect(JSON.stringify(result)).not.toContain("EXCLUDED");
});

it("names a capped accounting scan and withholds arithmetic", async () => {
  fault.truncate = KV_KEYS.payerSettlePrefix();
  const result = await capture();
  expect(result.complete).toBe(false);
  expect(result.summary).toBeNull();
  expect(result.sources[0]).toMatchObject({ listing_complete: false, issue: "key_limit" });
});

it("a failed listing is incomplete rather than an empty ledger", async () => {
  fault.failList = KV_KEYS.payerPrefix;
  const result = await capture();
  expect(result.complete).toBe(false);
  expect(result.summary).toBeNull();
  expect(result.sources.find(source => source.kind === "payers")).toMatchObject({ issue: "list_unavailable", listing_complete: false });
  expect(JSON.stringify(result)).not.toContain("PRIVATE_ERROR_DETAIL");
});

it.each(["missing", "failRead"] as const)("names a %s value without inventing a zero", async mode => {
  fault[mode] = counterKey;
  const result = await capture();
  expect(result.complete).toBe(false);
  expect(result.summary).toBeNull();
  expect(result.sources.flatMap(source => source.rows).find(row => row.key === counterKey)?.status).toBe(mode === "missing" ? "missing" : "unavailable");
  expect(JSON.stringify(result)).not.toContain("PRIVATE_ERROR_DETAIL");
});

it.each([
  { label: "invalid JSON", raw: "not json", status: "invalid_json" },
  { label: "wrong house type", raw: JSON.stringify({ item: "hello", at, house: "false" }), status: "invalid_record" },
  { label: "transaction/key mismatch", raw: JSON.stringify({ item: "hello", at, transaction: "different-tx" }), status: "invalid_record" },
  { label: "oversized", raw: JSON.stringify({ item: "hello", at, extra: "x".repeat(65536) }), status: "oversized" },
])("marks $label evidence incomplete", async ({ raw, status }) => {
  await kv.put(settleKey, raw);
  const result = await capture();
  expect(result.complete).toBe(false);
  expect(result.summary).toBeNull();
  expect(result.sources[0]!.rows[0]).toEqual({ key: settleKey, status });
});

it("does not parse malformed counter text as an amount", async () => {
  await kv.put(counterKey, "3bad");
  const result = await capture();
  expect(result.complete).toBe(false);
  expect(result.summary).toBeNull();
});

it("reads without any KV mutation", async () => {
  const write = vi.fn(() => { throw new Error("Export attempted a write"); });
  const readOnly = new Proxy(kv, { get(target, prop) {
    if (prop === "put" || prop === "delete") return write;
    const value = Reflect.get(target, prop);
    return typeof value === "function" ? value.bind(target) : value;
  } });
  expect((await exportReconciliationEvidence({ COUNTERS: readOnly }, now)).complete).toBe(true);
  expect(write).not.toHaveBeenCalled();
});
