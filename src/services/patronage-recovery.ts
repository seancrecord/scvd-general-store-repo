import { sha256Hex } from "@/lib/idempotency";
import { KV_KEYS } from "@/lib/kv-keys";
import { kvGetJson, kvPut } from "@/lib/kv-retry";
import { jcsCanonicalize } from "@/lib/jcs";
import { signMessage } from "@/lib/signing";
import { purchaseRecoveryAlarmAt } from "@/lib/purchase-recovery-clock";
import { PASS_DAYS } from "@/services/patronage";
import type { WatchCommission } from "@/services/watch-recovery";
import type { Env, PatronagePass } from "@/types";

export interface PreparedPatronage { passId: string; at: string; existing?: PatronagePass; agentName?: string }
export interface PatronageGrantInput { prepared: PreparedPatronage; patronNumber: number; certId: string }
interface PatronageGrant { input: string; pass: PatronagePass; renewed: boolean; commission: WatchCommission }
export function patronageCoordinator(env: Env, passId: string) {
  if (!env.PAID_RECOVERIES) throw new Error("Patronage coordinator unavailable");
  return env.PAID_RECOVERIES.get(env.PAID_RECOVERIES.idFromName(`patronage:${passId}`));
}

/** One pass, many immutable purchase grants. The queue orders publication;
 * durable grants, rather than an in-memory flag, prevent a second extension. */
export class PatronageRecoveryStore {
  private running: Promise<void> = Promise.resolve();
  constructor(private readonly storage: DurableObjectStorage, private readonly env: Env) {}

  async read(passId: string): Promise<PatronagePass | null> {
    const pass = await this.storage.get<PatronagePass>("patronage:current");
    if (pass && pass.pass_id !== passId) throw new Error("Patronage identity mismatch");
    return pass ?? kvGetJson<PatronagePass>(this.env.PATRONS, KV_KEYS.patronagePass(passId));
  }

  private async publish(): Promise<void> {
    const pass = await this.storage.get<PatronagePass>("patronage:current");
    if (!pass) throw new Error("Patronage journal incomplete");
    await this.storage.setAlarm(purchaseRecoveryAlarmAt(300_000));
    await kvPut(this.env.PATRONS, KV_KEYS.patronagePass(pass.pass_id), JSON.stringify(pass));
    await this.storage.deleteAlarm();
  }

  async repair(): Promise<boolean> {
    if (!await this.storage.get("patronage:current")) return false;
    const work = this.running.then(() => this.publish());
    this.running = work.then(() => undefined, () => undefined);
    try { await work; } catch { /* The wake-up remains armed until publication succeeds. */ }
    return true;
  }

  async grant(input: PatronageGrantInput): Promise<PatronageGrant> {
    const work = this.running.then(async () => {
      const key = `patronage:grant:${input.certId}`, identity = jcsCanonicalize(input);
      let grant = await this.storage.get<PatronageGrant>(key);
      if (grant && grant.input !== identity) throw new Error("Patronage purchase mismatch");
      if (!grant) {
        const p = input.prepared;
        const current = await this.read(p.passId) ?? p.existing;
        if (!!current !== !!p.existing) throw new Error("Patronage target mismatch");
        const startsAt = Math.max(Date.parse(p.at), current ? Date.parse(current.expires_at) : 0);
        if (!Number.isFinite(startsAt)) throw new Error("Original patronage dates unavailable");
        const pass: PatronagePass = current ? { ...current, renewals: current.renewals + 1,
          expires_at: new Date(startsAt + PASS_DAYS * 86400_000).toISOString() } : {
          pass_id: p.passId, patron_number: input.patronNumber, started_at: p.at,
          expires_at: new Date(startsAt + PASS_DAYS * 86400_000).toISOString(), renewals: 0,
          ...(p.agentName !== undefined ? { agent_name: p.agentName } : {}),
        };
        const signed_payload = jcsCanonicalize({ type: "scvd.patronage-grant.v1", cert_id: input.certId,
          preparation_hash: await sha256Hex(jcsCanonicalize(p)), pass_id: pass.pass_id, purchased_at: p.at, starts_at: new Date(startsAt).toISOString(),
          expires_at: pass.expires_at, renewal_number: pass.renewals, agent_name: p.agentName ?? null });
        const signed = await signMessage(signed_payload, this.env.SIGNING_KEY);
        const commission = { signed_payload, signature: signed.signature, public_key: signed.publicKey,
          signature_covers: "UTF-8 bytes of signed_payload, RFC 8785 canonical JSON. This grant binds the original purchased term to its certificate; later renewals have separate grants." };
        pass.commission = commission;
        grant = { input: identity, pass, renewed: !!current, commission };
        await this.storage.transaction(async txn => {
          await txn.put(key, grant!);
          await txn.put("patronage:current", pass);
          await txn.setAlarm(purchaseRecoveryAlarmAt(300_000));
        });
      }
      await this.publish();
      return grant;
    });
    this.running = work.then(() => undefined, () => undefined);
    return work;
  }
}
