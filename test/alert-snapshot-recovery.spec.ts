import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "@/index";
import { listAlerts, sendAlert } from "@/lib/alerts";
import { KV_KEYS } from "@/lib/kv-keys";
import type { Env } from "@/types";

const testEnv = { ...env, RESEND_API_KEY: "", ALERT_EMAIL: "" } as unknown as Env;
const instant = Date.parse("2026-09-13T17:00:00.000Z");
const rooms = [
  { path: "/admin/counter", mark: KV_KEYS.alarmsSeenAtCounter, limit: 5 },
  { path: "/admin/reconciliation", mark: KV_KEYS.alarmsLastRead, limit: 10 },
] as const;

async function look(path: string, bindings = testEnv, expectedStatus = 200): Promise<string> {
  const ctx = createExecutionContext();
  const response = await app.fetch(new Request(`https://scvd.store${path}`, {
    headers: { Authorization: `Basic ${btoa(`keeper:${testEnv.ADMIN_PASSWORD}`)}` },
  }), bindings, ctx);
  await waitOnExecutionContext(ctx);
  expect(response.status).toBe(expectedStatus);
  return response.text();
}

function raise(key: string): Promise<void> {
  return sendAlert(testEnv, { condition: "worker_health", key, detail: `alert detail ${key}` });
}

// Interleave a real write AFTER the real KV snapshot has been read. Both
// the producer and app share Date; no sleeps or clock-dependent ordering.
function afterAlertRead(action: () => Promise<void>): Env {
  let fired = false;
  return { ...testEnv, COUNTERS: new Proxy(testEnv.COUNTERS, {
    get(target, property) {
      const value = Reflect.get(target, property);
      if (property !== "get") return typeof value === "function" ? value.bind(target) : value;
      return async (...args: unknown[]) => {
        const result = await Reflect.apply(value, target, args);
        const names = Array.isArray(args[0]) ? args[0] : [args[0]];
        if (!fired && names.some((name) => typeof name === "string" && name.startsWith("alert_log:"))) {
          fired = true;
          await action();
        }
        return result;
      };
    },
  }) };
}

function failOperation(method: "get" | "put", matches: (name: string) => boolean): Env {
  return { ...testEnv, COUNTERS: new Proxy(testEnv.COUNTERS, {
    get(target, property) {
      const value = Reflect.get(target, property);
      if (property !== method) return typeof value === "function" ? value.bind(target) : value;
      return async (...args: unknown[]) => {
        const names = Array.isArray(args[0]) ? args[0] : [args[0]];
        if (names.some((name) => typeof name === "string" && matches(name))) throw new Error("injected storage outage");
        return Reflect.apply(value, target, args);
      };
    },
  }) };
}

beforeEach(async () => {
  for (const prefix of ["alert_log:", "alert_open:", "alert_sent:", "alert_seen:"]) {
    const listed = await testEnv.COUNTERS.list({ prefix });
    await Promise.all(listed.keys.map(({ name }) => testEnv.COUNTERS.delete(name)));
  }
  await Promise.all(rooms.map(({ mark }) => testEnv.COUNTERS.delete(mark)));
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(instant);
});
afterEach(() => vi.useRealTimers());

it("retains ten simultaneous distinct problems and repeats only the matching identity", async () => {
  await Promise.all(Array.from({ length: 10 }, (_, i) => raise(`problem-${i}`)));
  await sendAlert(testEnv, { condition: "order_sla", key: "problem-0", detail: "different condition" });
  await sendAlert(testEnv, { condition: "worker_health", key: "problem-0", detail: "updated diagnosis" });
  const rows = await listAlerts(testEnv, 20);
  expect(rows).toHaveLength(11);
  expect(rows.find((row) => row.detail === "updated diagnosis")).toMatchObject({ condition: "worker_health", repeats: 2 });
  expect(rows.find((row) => row.detail === "different condition")).toMatchObject({ condition: "order_sla", repeats: 1 });
  for (let i = 1; i < 10; i++) expect(rows.find((row) => row.detail === `alert detail problem-${i}`)?.repeats).toBe(1);
});

describe.each(rooms)("$path acknowledges a displayed snapshot", ({ path, mark, limit }) => {
  it("recognizes an unseen alert even when the clock has not advanced since the visit", async () => {
    await look(path);
    await raise("same-millisecond");
    expect(await look(path)).toContain("[NEW]");
    expect(await look(path)).not.toContain("[NEW]");
  });

  it("leaves an alert arriving after the snapshot unread", async () => {
    await look(path);
    vi.setSystemTime(instant + 1);
    await raise("in-snapshot");
    const html = await look(path, afterAlertRead(async () => {
      vi.setSystemTime(instant + 2);
      await raise("arrived-during-render");
    }));
    expect(html).toContain("alert detail in-snapshot");
    expect(html).not.toContain("alert detail arrived-during-render");
    const next = await look(path);
    expect(next).toContain("alert detail arrived-during-render");
    expect(next.match(/\[NEW\]/g) ?? []).toHaveLength(1);
  });

  it("renders every acknowledged row and leaves the row beyond the page limit unread", async () => {
    await look(path);
    for (let i = 0; i <= limit; i++) {
      vi.setSystemTime(instant + i + 1);
      await raise(`bounded-${i}`);
    }
    const html = await look(path);
    for (let i = 1; i <= limit; i++) expect(html).toContain(`alert detail bounded-${i}`);
    expect(html).not.toContain("alert detail bounded-0");
    // The bounded-out row becomes visible after newer rows leave retention.
    const listed = await testEnv.COUNTERS.list({ prefix: "alert_log:" });
    for (const { name } of listed.keys.slice(0, limit)) await testEnv.COUNTERS.delete(name);
    const next = await look(path);
    expect(next).toContain("alert detail bounded-0");
    expect(next).toContain("[NEW]");
  });

  it("does not infer that a legacy row was displayed from the old global timestamp", async () => {
    await testEnv.COUNTERS.put("alert_log:legacy", JSON.stringify({
      condition: "worker_health", detail: "legacy retained row", at: new Date(instant - 1).toISOString(),
    }));
    await testEnv.COUNTERS.put(mark, new Date(instant).toISOString());
    expect(await look(path)).toContain("[NEW]");
    expect(await look(path)).not.toContain("[NEW]");
  });

  it.each(["rows", "visit", "receipts"] as const)("leaves alerts unread when the %s read fails", async (part) => {
    await look(path);
    vi.setSystemTime(instant + 1);
    await raise("read-failed");
    const bindings = failOperation("get", (name) => part === "rows"
      ? name.startsWith("alert_log:")
      : part === "visit" ? name === mark : name.startsWith("alert_seen:"));
    await look(path, bindings);
    expect(await look(path)).toContain("[NEW]");
  });

  it("still serves the rendered page when receipts cannot be saved, then allows a safe retry", async () => {
    await look(path);
    vi.setSystemTime(instant + 1);
    await raise("write-failed");
    const bindings = failOperation("put", (name) => name === mark || name.startsWith("alert_seen:"));
    expect(await look(path, bindings)).toContain("alert detail write-failed");
    expect(await look(path)).toContain("[NEW]");
    expect(await look(path)).not.toContain("[NEW]");
  });

  it("keeps receipts from both visits when the older snapshot finishes last", async () => {
    await look(path);
    await raise("older-snapshot");
    let release!: () => void;
    let captured!: () => void;
    const paused = new Promise<void>((resolve) => { release = resolve; });
    const snapshotRead = new Promise<void>((resolve) => { captured = resolve; });
    const older = look(path, afterAlertRead(async () => { captured(); await paused; }));
    try {
      await snapshotRead;
      vi.setSystemTime(instant + 1);
      await raise("newer-snapshot");
      expect(await look(path)).toContain("alert detail newer-snapshot");
    } finally {
      release();
    }
    expect(await older).not.toContain("alert detail newer-snapshot");
    expect(await look(path)).not.toContain("[NEW]");
  });

  it("does not acknowledge a page whose alarm rendering fails", async () => {
    await look(path);
    vi.setSystemTime(instant + 1);
    await sendAlert(testEnv, { condition: "order_sla", key: "render-failure", detail: "restored diagnosis" });
    const logKey = await testEnv.COUNTERS.get("alert_open:order_sla:render-failure");
    const original = await testEnv.COUNTERS.get(logKey!);
    // A malformed retained diagnosis makes the actual page renderer fail.
    // Restoring it must not uncover a receipt for a page that never rendered.
    await testEnv.COUNTERS.put(logKey!, JSON.stringify({ ...JSON.parse(original!), detail: null }));
    await look(path, testEnv, 500);
    await testEnv.COUNTERS.put(logKey!, original!);
    const html = await look(path);
    const row = html.match(/<li>[^]*?<\/li>/g)?.find((line) => line.includes("restored diagnosis"));
    expect(row).toContain("[NEW]");
  });
});

it("keeps the office read-only and the two rooms' receipts independent", async () => {
  await Promise.all(rooms.map(({ path }) => look(path)));
  await raise("rooms-independent");
  await look("/admin");
  expect(await look("/admin/counter")).toContain("[NEW]");
  expect(await look("/admin/reconciliation")).toContain("[NEW]");
  expect(await look("/admin/counter")).not.toContain("[NEW]");
});

it.each(["/admin/counter", "/admin/reconciliation", "/admin"])("%s reports an unavailable alarm reading instead of a quiet one", async (path) => {
  await raise("unavailable");
  const html = await look(path, failOperation("get", (name) => name.startsWith("alert_log:")));
  expect(html).not.toContain("The alarms have had nothing to say");
  expect(html).not.toContain("the alarm log is quiet");
  expect(html).not.toContain("The alarms are quiet");
  expect(html).toContain("Alarm reading unavailable");
});
