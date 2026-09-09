import { env, runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { expect, it } from "vitest";
import { canonicalizeProbe, startWatch, WATCH_DURATION_HOURS, type WatchProbe } from "@/services/standing-watch";
import { signMessage, verifyMessageSignature } from "@/lib/signing";
import { KV_KEYS } from "@/lib/kv-keys";
import type { Env } from "@/types";

it("retains a complete signed week larger than one Durable Object storage value", async () => {
  const bindings = env as unknown as Env;
  const { record } = await startWatch(bindings, "https://buyer-fixture.example/large-history");
  const probes: WatchProbe[] = [];
  for (let hour = 0; hour < WATCH_DURATION_HOURS; hour++) {
    const observation = { at: new Date(Date.parse(record.started_at) + hour * 3600_000).toISOString(),
      verdict: "not_ready" as const, failed: ["status-402"], evidence: {
        challenge_bytes: null, headers: { server: "SCVD-E2E-large-header".padEnd(16 * 1024, "x") },
        body_sha256: null, body_bytes: 0, body_truncated: true, tls: "unavailable-from-this-vantage" as const,
      } };
    const signed = await signMessage(canonicalizeProbe(record.watch_id, record.url, observation), bindings.SIGNING_KEY);
    probes.push({ ...observation, signature: signed.signature, public_key: signed.publicKey });
  }
  const full = { ...record, probes };
  expect(new TextEncoder().encode(JSON.stringify(full)).byteLength).toBeGreaterThan(2 * 1024 * 1024);
  const key = KV_KEYS.standingWatch(record.watch_id);
  const stub = bindings.PAID_RECOVERIES!.get(bindings.PAID_RECOVERIES!.idFromName(`watch:${key}`));
  await stub.publishWatch({ kind: "standing", record: full });
  await bindings.ORDERS.delete(key);
  // An explicit repair must recover every original row, never a shortened week.
  await runInDurableObject(stub, async (_instance, state) => state.storage.setAlarm(Date.now() + 60_000));
  expect(await runDurableObjectAlarm(stub)).toBe(true);
  expect(await bindings.ORDERS.get(key, "json")).toEqual(full);
  expect(await runDurableObjectAlarm(stub)).toBe(false);
  for (const probe of probes) expect(await verifyMessageSignature(canonicalizeProbe(record.watch_id, record.url, probe), probe.signature, probe.public_key)).toBe(true);
});
