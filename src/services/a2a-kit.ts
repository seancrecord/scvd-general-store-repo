import { DurableObject } from "cloudflare:workers";
import { authorize, readCard, runRuntime, A2A_WATCH_DAYS, A2A_RECHECK_DAYS, A2A_FREE_REQUESTS_PER_MINUTE, type A2AReading } from "@/lib/a2a-instrument";
import { jcsCanonicalize } from "@/lib/jcs";
import { signMessage } from "@/lib/signing";
import { STORE_CONTACT_EMAIL } from "@/store/metadata";
import { repairRows } from "@/store/a2a-repair";
import type { Env } from "@/types";

const DAY = 86400000;
export interface SignedA2AReading { observation: A2AReading; evidence_hash: string; signature: string; public_key: string; signature_covers: string }
export async function signA2AReading(env: Env, observation: A2AReading): Promise<SignedA2AReading> {
  const preimage = jcsCanonicalize(observation);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(preimage));
  const evidence_hash = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
  const signed = await signMessage(preimage, env.SIGNING_KEY);
  return { observation, evidence_hash, signature: signed.signature, public_key: signed.publicKey, signature_covers: "RFC 8785 canonical JSON of observation only; evidence_hash is SHA-256 of those same bytes. Check the issuer key independently at /.well-known/scvd-signing-key. Repair suggestions are outside the signature." };
}
export interface PreparedA2AKit { id: string; report: SignedA2AReading; recheck_token: string }
export async function prepareA2AKit(env: Env, url: string, now = Date.now()): Promise<PreparedA2AKit> {
  if (!env.A2A_KITS) throw new Error("A2A kit storage unavailable");
  const reading = await readCard(url);
  const authorized = await authorize(reading);
  const id = `a2akit_${crypto.randomUUID()}`;
  const result = await runRuntime(reading, authorized);
  result.entitlement = { kit_id: id, started_at: new Date(now).toISOString(), ends_at: new Date(now + A2A_WATCH_DAYS * DAY).toISOString(), recheck_until: new Date(now + A2A_RECHECK_DAYS * DAY).toISOString() };
  const report = await signA2AReading(env, result);
  return { id, report, recheck_token: crypto.randomUUID() + crypto.randomUUID() };
}
interface Kit { id: string; cert_id: string; report: SignedA2AReading; token: string; started_at: string; ends_at: string; recheck_until: string }
interface WatchPass { slot: number; report: SignedA2AReading }
export interface RecheckResult { status: "complete" | "running" | "unavailable" | "unauthorized" | "expired" | "authorization_required"; report?: SignedA2AReading }
export function a2aWatchSummary(passes: WatchPass[], started: number, now: number) {
  const due = Math.max(0, Math.min(A2A_WATCH_DAYS, Math.floor((now - started) / DAY) + 1));
  const observed = new Set(passes.filter(p => p.report.observation.exchanges[0]?.gap === null).map(p => p.slot));
  const recorded = new Set(passes.map(p => p.slot));
  return { slots_due: due, slots_recorded: recorded.size, slots_observed: observed.size, slots_missed: Array.from({ length: due }, (_, i) => i).filter(i => !recorded.has(i)), slots_without_observation: Array.from({ length: due }, (_, i) => i).filter(i => !observed.has(i)) };
}
/** A record owns its one recheck and finite schedule. No cross-edge KV claim races. */
export class A2AKitStore extends DurableObject<Env> {
  async takeBudget(now = Date.now()): Promise<boolean> {
    return this.ctx.storage.transaction(async txn => {
      const minute = Math.floor(now / 60000);
      const previous = await txn.get<{ minute: number; used: number }>("budget");
      const used = previous?.minute === minute ? previous.used : 0;
      if (used >= A2A_FREE_REQUESTS_PER_MINUTE) return false;
      await txn.put("budget", { minute, used: used + 1 }); return true;
    });
  }
  async save(prepared: PreparedA2AKit, certId: string): Promise<void> {
    await this.ctx.storage.transaction(async txn => {
      if (await txn.get("kit")) return;
      const terms = prepared.report.observation.entitlement;
      if (!terms || terms.kit_id !== prepared.id) throw new Error("Signed A2A entitlement missing");
      const kit: Kit = { id: prepared.id, cert_id: certId, report: prepared.report, token: prepared.recheck_token, started_at: terms.started_at, ends_at: terms.ends_at, recheck_until: terms.recheck_until };
      await txn.put("kit", kit);
      // The first day's observation is the purchased card reading; subsequent slots read only the card.
      await txn.put("pass:0", { slot: 0, report: prepared.report } satisfies WatchPass);
      await txn.setAlarm(Date.parse(kit.started_at) + DAY);
    });
  }
  async read(now = Date.now()) {
    const kit = await this.ctx.storage.get<Kit>("kit"); if (!kit) return null;
    const passes = [...(await this.ctx.storage.list<WatchPass>({ prefix: "pass:" })).values()];
    const { token: _token, ...publicKit } = kit;
    return { ...publicKit, repairs: repairRows(kit.report.observation), recheck: await this.ctx.storage.get<RecheckResult>("recheck") ?? null, watch: { scope: "Daily card reads only; runtime behavior is tested at purchase and the buyer-triggered recheck.", ...a2aWatchSummary(passes, Date.parse(kit.started_at), now), complete: now >= Date.parse(kit.ends_at), passes } };
  }
  async recheck(token: string): Promise<RecheckResult> {
    const kit = await this.ctx.storage.get<Kit>("kit");
    if (!kit || !token || token.length !== kit.token.length || !crypto.subtle.timingSafeEqual(new TextEncoder().encode(token), new TextEncoder().encode(kit.token))) return { status: "unauthorized" };
    const existing = await this.ctx.storage.get<RecheckResult>("recheck"); if (existing) return existing;
    if (Date.now() >= Date.parse(kit.recheck_until)) return { status: "expired" };
    // Read permission again before claiming or acting: removal or expiry revokes runtime permission.
    const reading = await readCard(kit.report.observation.card_url);
    let permission: Awaited<ReturnType<typeof authorize>>;
    try { permission = await authorize(reading); } catch { return { status: "authorization_required" }; }
    const claimed = await this.ctx.storage.transaction(async txn => {
      if (await txn.get("recheck")) return false;
      await txn.put("recheck", { status: "running" } satisfies RecheckResult); return true;
    });
    if (!claimed) return await this.ctx.storage.get<RecheckResult>("recheck") ?? { status: "running" };
    try {
      reading.association = { kit_id: kit.id, role: "recheck", baseline_hash: kit.report.evidence_hash };
      const result: RecheckResult = { status: "complete", report: await signA2AReading(this.env, await runRuntime(reading, permission)) };
      await this.ctx.storage.put("recheck", result); return result;
    } catch {
      // No automatic replay after an uncertain task execution. The gap remains visible.
      const result: RecheckResult = { status: "unavailable" };
      await this.ctx.storage.put("recheck", result); return result;
    }
  }
  async alarm(): Promise<void> { await this.observeSlot(Date.now()); }
  async observeSlot(now: number): Promise<void> {
    const kit = await this.ctx.storage.get<Kit>("kit"); if (!kit) return;
    const start = Date.parse(kit.started_at);
    const slot = Math.floor((now - start) / DAY);
    if (slot < 1 || slot >= A2A_WATCH_DAYS) return;
    // Book the next slot first so a failed signing or storage write does not silently end the week.
    if (slot + 1 < A2A_WATCH_DAYS) await this.ctx.storage.setAlarm(start + (slot + 1) * DAY);
    if (await this.ctx.storage.get(`pass:${slot}`)) return;
    const reading = await readCard(kit.report.observation.card_url, fetch, now);
    reading.association = { kit_id: kit.id, role: "watch", baseline_hash: kit.report.evidence_hash, slot, scheduled_for: new Date(start + slot * DAY).toISOString() };
    await this.ctx.storage.put(`pass:${slot}`, { slot, report: await signA2AReading(this.env, reading) } satisfies WatchPass);
  }
}
export function kitStore(env: Env, id: string) { if (!env.A2A_KITS) throw new Error("A2A kit storage unavailable"); return env.A2A_KITS.get(env.A2A_KITS.idFromName(id)); }
export async function deliverA2AKit(env: Env, prepared: PreparedA2AKit, certId: string) {
  await kitStore(env, prepared.id).save(prepared, certId);
  const path = `/api/a2a/kits/${prepared.id}`;
  return { deliverable: "Your A2A repair kit is ready: signed observations, suggested fixes, regression tests, an included recheck and a seven-day card watch.", extras: { kit_id: prepared.id, report_url: path, report: prepared.report, repairs: repairRows(prepared.report.observation), runner_url: "/api/a2a/runner.mjs", recheck: { url: `${path}/recheck`, method: "POST", body: { token: prepared.recheck_token }, keep_private: "This token authorizes your one recheck. It is omitted from the readable report." }, implementation: { status: "separately_scoped", contact: `mailto:${STORE_CONTACT_EMAIL}`, instructions: "For a code repair quote, provide this kit ID, a public repository link, stack and desired scope. No credentials or keys. No implementation work is purchased by this kit." } } };
}
