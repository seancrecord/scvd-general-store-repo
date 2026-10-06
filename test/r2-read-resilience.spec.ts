import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { edgeOnError } from "@/lib/edge";
import { listAlerts } from "@/lib/alerts";
import { KV_KEYS } from "@/lib/kv-keys";
import { withPatientKv } from "@/lib/kv-retry";
import { corpusLandingRoutes } from "@/routes/corpus-landing";
import { forgetResolvedRecords, resolveRecord, type CorpusPointer, type CorpusRecord } from "@/services/corpus-list";
import { hydrateRound, type WardRound } from "@/services/ward-round";
import type { Env, HonoEnv } from "@/types";

const testEnv = env as unknown as Env;
const bucket = testEnv.CORPUS_R2!;
const at = "2026-10-05T10:47:50.017Z";
const round: WardRound = {
  week: "2026-W41", at, listed_resources: 0, coverage_suspect: false,
  capped: false, our_search_presence: false, hosts: [],
};
const record: CorpusRecord = {
  snapshot: { version: 1, sequence: 1, week: round.week, taken_at: at,
    previous_digest: null, source: "ward_round", round },
  digest: "test-digest", signature: "test-signature", public_key: "test-key",
};
const pointer: CorpusPointer = {
  pointer: true, sequence: 1, week: round.week, digest: record.digest,
  signature: record.signature, public_key: record.public_key, r2_key: "resilience/record.json",
};
const transient = () => new Error("get: We encountered an internal error. Please try again. (10001)");

function failingReads(failures: number, error = transient()) {
  const get = vi.fn(async (key: string) => {
    if (failures-- > 0) throw error;
    return bucket.get(key);
  });
  const wrapped = new Proxy(bucket, {
    get(target, property) {
      if (property === "get") return get;
      const value = Reflect.get(target, property);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  return { bindings: { ...testEnv, CORPUS_R2: wrapped }, get };
}

beforeEach(async () => {
  forgetResolvedRecords();
  for (const prefix of [KV_KEYS.corpusPrefix, "alert_log:", "alert_open:", "alert_sent:", "alert_mute:"]) {
    const listed = await testEnv.COUNTERS.list({ prefix });
    await Promise.all(listed.keys.map(({ name }) => testEnv.COUNTERS.delete(name)));
  }
  await bucket.put(pointer.r2_key, JSON.stringify(record));
  await bucket.put("resilience/hosts.json", "[]");
});
afterEach(() => vi.restoreAllMocks());

describe("R2 reads survive temporary service failures", () => {
  it("retries the archived record that host pages and the ledger read", async () => {
    const { bindings, get } = failingReads(2);
    expect(await resolveRecord(bindings, pointer)).toEqual(record);
    expect(get).toHaveBeenCalledTimes(3);
  });

  it("retries the round rows that the contact scout reads", async () => {
    const { bindings, get } = failingReads(1);
    expect(await hydrateRound(bindings, { ...round, hosts_r2_key: "resilience/hosts.json" })).toMatchObject({ hosts: [] });
    expect(get).toHaveBeenCalledTimes(2);
  });

  it("uses the existing longer cron budget", async () => {
    const { bindings, get } = failingReads(4);
    expect(await withPatientKv(() => resolveRecord(bindings, pointer))).toEqual(record);
    expect(get).toHaveBeenCalledTimes(5);
  });

  it("stops after the request budget and never turns an outage into missing data", async () => {
    const { bindings, get } = failingReads(Infinity);
    await expect(resolveRecord(bindings, pointer)).rejects.toThrow("10001");
    expect(get).toHaveBeenCalledTimes(3);
  });

  it("does not retry an authorization failure", async () => {
    const error = new Error("get: Access denied. (10003)");
    const { bindings, get } = failingReads(Infinity, error);
    await expect(resolveRecord(bindings, pointer)).rejects.toBe(error);
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("does not retry an object that is actually absent", async () => {
    const { bindings, get } = failingReads(0);
    expect(await resolveRecord(bindings, { ...pointer, r2_key: "resilience/absent.json" })).toBeNull();
    expect(get).toHaveBeenCalledTimes(1);
  });

  it.each([10043, 10058])("retries service error %i", async (code) => {
    const { bindings, get } = failingReads(1, new Error(`get: Temporary service failure. (${code})`));
    expect(await resolveRecord(bindings, pointer)).toEqual(record);
    expect(get).toHaveBeenCalledTimes(2);
  });

  it("reopens the object if its body read fails", async () => {
    const object = await bucket.get(pointer.r2_key);
    expect(object).not.toBeNull();
    vi.spyOn(object!, "text").mockRejectedValueOnce(transient());
    const { bindings, get } = failingReads(0);
    get.mockResolvedValueOnce(object);
    expect(await resolveRecord(bindings, pointer)).toEqual(record);
    expect(get).toHaveBeenCalledTimes(2);
  });

  it("does not retry malformed stored JSON", async () => {
    await bucket.put(pointer.r2_key, "broken json");
    const { bindings, get } = failingReads(0);
    await expect(resolveRecord(bindings, pointer)).rejects.toBeInstanceOf(SyntaxError);
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("keeps the corpus index usable without claiming an unreadable chain is empty", async () => {
    await testEnv.COUNTERS.put(`${KV_KEYS.corpusPrefix}000000001`, JSON.stringify(pointer));
    const { bindings } = failingReads(Infinity);
    const ctx = createExecutionContext();
    const response = await corpusLandingRoutes.request("https://scvd.store/corpus", {
      headers: { Accept: "text/html", "User-Agent": "Mozilla/5.0" },
    }, bindings, ctx);
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("could not be read");
    expect(html).not.toContain("The chain holds no signed week yet");
    expect(html).not.toContain("This week:");
    expect((await listAlerts(testEnv, 20))[0]?.identity).toBe("worker_health:corpus-wallet-facts-unavailable");
  });
});

it("groups exhausted R2 read emails while keeping separate request records and unrelated alarms", async () => {
  const sends = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}"));
  const { bindings } = failingReads(Infinity);
  const mailEnv = { ...bindings, RESEND_API_KEY: "test-key", ALERT_EMAIL: "keeper@example.com" };
  const app = new Hono<HonoEnv>();
  app.onError(edgeOnError);
  app.get("/corpus/host/:host", async (c) => c.json(await resolveRecord(c.env, pointer)));
  app.get("/profiles", () => { throw new TypeError("unrelated defect"); });
  for (const path of ["/corpus/host/one.example", "/corpus/host/two.example", "/corpus/host/one.example", "/profiles"]) {
    const ctx = createExecutionContext();
    const response = await app.fetch(new Request(`https://scvd.store${path}`), mailEnv, ctx);
    expect(response.status).toBe(500);
    await waitOnExecutionContext(ctx);
  }
  expect(sends).toHaveBeenCalledTimes(2);
  const rows = await listAlerts(testEnv, 20);
  expect(rows).toHaveLength(3);
  expect(rows.find((row) => row.detail.includes("one.example"))?.repeats).toBe(2);
  expect(rows.find((row) => row.detail.includes("one.example"))?.identity)
    .toBe("worker_health:http500:corpus:host:one.example:Error");
  expect(rows.find((row) => row.detail.includes("two.example"))).toBeDefined();
  expect(rows.find((row) => row.detail.includes("unrelated defect"))).toBeDefined();
});
