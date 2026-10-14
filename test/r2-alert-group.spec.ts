import { env } from "cloudflare:test";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ALERT_CONDITIONS, ALL_CONDITIONS, listAlerts, sendAlert } from "@/lib/alerts";
import { muteAlarm } from "@/lib/alert-mutes";
import type { Env } from "@/types";

const testEnv = { ...env, RESEND_API_KEY: "test-key", ALERT_EMAIL: "keeper@example.com" } as unknown as Env;
const groupKey = "alert_sent:group:worker_health:r2_read_unavailable";
const raise = (key: string) => sendAlert(testEnv, {
  condition: "worker_health", key, detail: `R2 unavailable at ${key}`, emailGroup: "r2_read_unavailable",
});

beforeEach(async () => {
  for (const prefix of ["alert_log:", "alert_open:", "alert_sent:", "alert_mute:"]) {
    const listed = await testEnv.COUNTERS.list({ prefix });
    await Promise.all(listed.keys.map(({ name }) => testEnv.COUNTERS.delete(name)));
  }
});
afterEach(() => vi.restoreAllMocks());

it("shares the email window, not the log identity", async () => {
  const send = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}"));
  await raise("host-a");
  await raise("host-b");
  await raise("host-a");
  expect(send).toHaveBeenCalledTimes(1);
  expect(String(send.mock.calls[0]?.[1]?.body)).toContain("Related R2 read failures");
  const rows = await listAlerts(testEnv, 20);
  expect(rows).toHaveLength(2);
  expect(rows.find((row) => row.identity === "worker_health:host-a")?.repeats).toBe(2);
});

it("pages again after the group window even for the same frequently failing route", async () => {
  const send = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}"));
  await raise("host-a");
  await raise("host-a");
  // Expire only the shared window; the route's longer backoff still exists.
  await testEnv.COUNTERS.delete(groupKey);
  await raise("host-a");
  expect(send).toHaveBeenCalledTimes(2);
  expect((await listAlerts(testEnv, 20))[0]?.repeats).toBe(3);
});

it("does not let a muted route spend another route's email window", async () => {
  const send = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}"));
  await muteAlarm(testEnv, { scope: "alarm", target: "worker_health:host-a" }, ALL_CONDITIONS, ALERT_CONDITIONS);
  await raise("host-a");
  expect(send).not.toHaveBeenCalled();
  expect(await testEnv.COUNTERS.get(groupKey)).toBeNull();
  await raise("host-b");
  expect(send).toHaveBeenCalledTimes(1);
});

it("leaves money alarms and unrelated worker failures independent", async () => {
  const send = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}"));
  await raise("host-a");
  await sendAlert(testEnv, { condition: "worker_health", key: "cron-failed", detail: "unrelated cron failure" });
  for (const key of ["order-a", "order-b"]) {
    await sendAlert(testEnv, { condition: "undelivered_sale", key, detail: "delivery failed", emailGroup: "r2_read_unavailable" });
  }
  expect(send).toHaveBeenCalledTimes(4);
});

it.each(["rejected", "network"])("does not suppress the next alarm after a %s email send", async (failure) => {
  const send = vi.spyOn(globalThis, "fetch");
  if (failure === "rejected") send.mockResolvedValueOnce(new Response("unavailable", { status: 503 }));
  else send.mockRejectedValueOnce(new Error("network failed"));
  send.mockResolvedValue(new Response("{}"));
  await raise("host-a");
  expect(await testEnv.COUNTERS.get(groupKey)).toBeNull();
  expect(await testEnv.COUNTERS.get("alert_sent:worker_health:host-a")).toBeNull();
  await raise("host-a");
  expect(send).toHaveBeenCalledTimes(2);
  expect((await listAlerts(testEnv, 20))[0]?.repeats).toBe(2);
});
