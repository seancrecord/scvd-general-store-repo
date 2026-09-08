import { env, runInDurableObject, runDurableObjectAlarm } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { prepareA2AKit, kitStore, signA2AReading, a2aWatchSummary, type PreparedA2AKit } from "@/services/a2a-kit";
import { readCard } from "@/lib/a2a-instrument";
import { jcsCanonicalize } from "@/lib/jcs";
import { verifyAsync } from "@noble/ed25519";
import { fulfillPurchase } from "@/services/fulfillment";
import { getMenuItem } from "@/store";
import { pendingPaymentStub } from "./helpers/payment";
import { CARD_URL, fixture, authorization } from "./helpers/a2a-fixture";
import type { Env } from "@/types";
const testEnv = env as Env;
afterEach(() => vi.unstubAllGlobals());
const hex = (value: string) => Uint8Array.from(value.match(/../g)!.map(x => parseInt(x, 16)));
async function prepared(now = Date.now()): Promise<PreparedA2AKit> { vi.stubGlobal("fetch", fixture().fetchImpl); return prepareA2AKit(testEnv, CARD_URL, now); }

describe("the signed A2A repair kit", () => {
  it("has tamper-evident observations and keeps repair advice outside their signature", async () => {
    const f = fixture(); const signed = await signA2AReading(testEnv, await readCard(CARD_URL, f.fetchImpl));
    const verify = () => verifyAsync(hex(signed.signature), new TextEncoder().encode(jcsCanonicalize(signed.observation)), hex(signed.public_key));
    expect(await verify()).toBe(true); signed.observation.counts.fail = 999; expect(await verify()).toBe(false);
  });
  it("does not settle when permission is absent", async () => {
    vi.stubGlobal("fetch", fixture({ authorization: { ...authorization(), allow_scvd_audit: false } }).fetchImpl);
    const pending = { paidUsdc: 49, tipUsdc: 0, settle: async () => { throw new Error("must not settle"); } };
    const settle = vi.spyOn(pending, "settle");
    await expect(fulfillPurchase(testEnv, getMenuItem("a2a_repair_kit")!, pending, { targetUrl: CARD_URL })).rejects.toThrow("authorization_required");
    expect(settle).not.toHaveBeenCalled();
  });
  it("reads immediately, hides the token and preserves the original through a single recheck", async () => {
    const kit = await prepared(); const store = kitStore(testEnv, kit.id); await store.save(kit, "cert-fixture");
    const first = await store.read(); expect(first?.report.evidence_hash).toBe(kit.report.evidence_hash); expect(JSON.stringify(first)).not.toContain(kit.recheck_token);
    expect((await store.recheck("wrong")).status).toBe("unauthorized");
    const results = await Promise.all([store.recheck(kit.recheck_token), store.recheck(kit.recheck_token)]);
    expect(results.some(r => r.status === "complete")).toBe(true);
    const again = await store.recheck(kit.recheck_token); expect(again.status).toBe("complete");
    expect((await store.read())?.report.evidence_hash).toBe(first?.report.evidence_hash);
  });
  it("counts missed slots by their identity rather than subtracting duplicate rows", async () => {
    const kit = await prepared(); const start = Date.parse(kit.report.observation.observed_at);
    const summary = a2aWatchSummary([{ slot: 0, report: kit.report }, { slot: 0, report: kit.report }, { slot: 2, report: kit.report }], start, start + 3 * 86400000);
    expect(summary.slots_missed).toEqual([1, 3]); expect(summary.slots_recorded).toBe(2);
  });
  it("ends the watch without renewal or late catch-up probes", async () => {
    const kit = await prepared(Date.now() - 8 * 86400000); const store = kitStore(testEnv, kit.id);
    await store.save(kit, "cert-fixture");
    const calls = vi.fn(fixture().fetchImpl); vi.stubGlobal("fetch", calls);
    await runDurableObjectAlarm(store);
    expect(calls).not.toHaveBeenCalled();
    const report = await store.read(); expect(report?.watch.complete).toBe(true); expect(report?.watch.slots_missed).toEqual([1,2,3,4,5,6]);
  });
  it("a daily alarm only reads the card and signs that day's scope", async () => {
    const kit = await prepared(); const store = kitStore(testEnv, kit.id); const start = Date.now(); await store.save(kit, "cert-fixture");
    const f = fixture(); vi.stubGlobal("fetch", f.fetchImpl);
    await runInDurableObject(store, async instance => { await instance.observeSlot(start + 86400000); });
    expect(f.calls).toHaveLength(1); expect(f.calls[0]?.url).toBe(CARD_URL); expect(f.calls[0]?.init?.method).toBe("GET");
    const report = await store.read(); expect(report?.watch.passes.at(-1)?.report.observation.mode).toBe("card");
  });
  it("enforces the recheck deadline independently of alarm cleanup", async () => {
    const kit = await prepared(Date.now() - 31 * 86400000); const store = kitStore(testEnv, kit.id); await store.save(kit, "cert-fixture");
    expect((await store.recheck(kit.recheck_token)).status).toBe("expired");
  });
  it("enforces the free budget atomically across concurrent callers", async () => {
    const store = kitStore(testEnv, crypto.randomUUID());
    const results = await Promise.all(Array.from({ length: 40 }, () => store.takeBudget(60000)));
    expect(results.filter(Boolean)).toHaveLength(30);
    expect(await store.takeBudget(120000)).toBe(true);
  });
});
