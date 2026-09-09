import type { Env } from "@/types";
import type { RefreshObservation, SignedPassportRefresh } from "@/services/passport-refresh";
import type { SignedTrustProfile } from "@/services/trust-profile";
import { KV_KEYS } from "@/lib/kv-keys";
import { kvGetJson, kvPut } from "@/lib/kv-retry";

export interface HostedPurchase { id: string; digest: string }
export type HostedObservation =
  | { kind: "passport_refresh"; report: SignedPassportRefresh }
  | { kind: "trust_profile"; report: SignedTrustProfile };
export interface HostedGrant { purchase: HostedPurchase; observation: HostedObservation }

export const hostedHost = (value: HostedObservation): string => value.kind === "passport_refresh"
  ? value.report.observation.host : value.report.record.host;
const hostedDate = (value: HostedObservation): string => value.kind === "passport_refresh"
  ? value.report.observation.observed_at : value.report.record.expires;
const newer = (a: HostedObservation, b: HostedObservation) => hostedDate(a) >= hostedDate(b) ? a : b;

export function hostedCoordinator(env: Env, kind: HostedObservation["kind"], host: string) {
  if (!env.PAID_RECOVERIES) throw new Error("Hosted observation coordinator unavailable");
  return env.PAID_RECOVERIES.get(env.PAID_RECOVERIES.idFromName(`hosted:${kind}:${host}`));
}

export function hostedPurchase(url: string, purchase?: HostedPurchase): HostedPurchase {
  // Non-checkout callers represent a new commission on each invocation. Paid
  // checkout supplies its verified authorization identity and complete input digest.
  return purchase ?? { id: crypto.randomUUID(), digest: url };
}

export async function publishHostedObservation(env: Env, observation: HostedObservation): Promise<void> {
  await hostedCoordinator(env, observation.kind, hostedHost(observation)).publishHostedObservation(observation);
}

/** One instance per kind/host, alongside the existing purchase coordinators.
 * The grants and current record are durable. The promise only orders bounded
 * KV projection work within an incarnation; it never authorizes a commission.
 * Probes, readiness checks and settlement run outside this object.
 */
export class HostedObservationStore {
  private publication: Promise<void> = Promise.resolve();
  constructor(private readonly storage: DurableObjectStorage, private readonly env: Env) {}

  async read(purchase: HostedPurchase): Promise<HostedObservation | null> {
    const saved = await this.storage.get<HostedGrant>(`hosted:grant:${purchase.id}`);
    if (saved && saved.purchase.digest !== purchase.digest) throw new Error("Hosted purchase input mismatch");
    return saved?.observation ?? null;
  }

  async retainRefresh(purchase: HostedPurchase, report: SignedPassportRefresh): Promise<SignedPassportRefresh> {
    const selected = await this.storage.transaction(async txn => {
      const key = `hosted:grant:${purchase.id}`;
      const saved = await txn.get<HostedGrant>(key);
      if (saved) {
        if (saved.purchase.digest !== purchase.digest || saved.observation.kind !== "passport_refresh" ||
          hostedHost(saved.observation) !== report.observation.host) throw new Error("Hosted purchase input mismatch");
        return saved.observation.report;
      }
      const observation: HostedObservation = { kind: "passport_refresh", report };
      const current = await txn.get<HostedObservation>("hosted:current");
      await txn.put(key, { purchase, observation } satisfies HostedGrant);
      await txn.put("hosted:current", current ? newer(observation, current) : observation);
      return report;
    });
    return selected;
  }

  async prepareProfile(purchase: HostedPurchase, url: string, at: string): Promise<SignedTrustProfile> {
    const host = new URL(url).host.toLowerCase();
    const seed = await kvGetJson<SignedTrustProfile>(this.env.COUNTERS, KV_KEYS.trustProfile(host), "json");
    const { signTrustProfile } = await import("@/services/trust-profile");
    return this.storage.transaction(async txn => {
      const key = `hosted:grant:${purchase.id}`;
      const saved = await txn.get<HostedGrant>(key);
      if (saved) {
        if (saved.purchase.digest !== purchase.digest || saved.observation.kind !== "trust_profile" ||
          hostedHost(saved.observation) !== host) throw new Error("Hosted purchase input mismatch");
        return saved.observation.report;
      }
      const current = await txn.get<HostedObservation>("hosted:current");
      if (current && current.kind !== "trust_profile") throw new Error("Hosted observation kind mismatch");
      const prior = current?.report;
      const existing = seed && (!prior || seed.record.expires > prior.record.expires) ? seed : prior ?? null;
      const report = await signTrustProfile(this.env, new URL(url), existing, new Date(at));
      const observation: HostedObservation = { kind: "trust_profile", report };
      await txn.put(key, { purchase, observation } satisfies HostedGrant);
      await txn.put("hosted:current", observation);
      return report;
    });
  }

  async publish(observation: HostedObservation): Promise<void> {
    const work = this.publication.catch(() => undefined).then(async () => {
      // A saved purchase can restore a lost projection without renewing or
      // observing. Always project the newest retained value, never the caller's
      // older purchase over a newer one. KV remains an eventually consistent view.
      const selected = await this.storage.transaction(async txn => {
        const current = await txn.get<HostedObservation>("hosted:current");
        if (current && (current.kind !== observation.kind || hostedHost(current) !== hostedHost(observation))) {
          throw new Error("Hosted observation subject mismatch");
        }
        const value = current ? newer(current, observation) : observation;
        await txn.put("hosted:current", value);
        return value;
      });
      const host = hostedHost(selected);
      if (selected.kind === "passport_refresh") {
        const key = KV_KEYS.passportRefresh(host);
        const existing = await kvGetJson<RefreshObservation>(this.env.COUNTERS, key, "json");
        if (!existing || existing.observed_at <= selected.report.observation.observed_at) {
          await kvPut(this.env.COUNTERS, key, JSON.stringify(selected.report.observation));
        }
      } else {
        const key = KV_KEYS.trustProfile(host);
        const existing = await kvGetJson<SignedTrustProfile>(this.env.COUNTERS, key, "json");
        if (!existing || existing.record.expires <= selected.report.record.expires) {
          await kvPut(this.env.COUNTERS, key, JSON.stringify(selected.report));
        }
      }
    });
    this.publication = work;
    await work;
  }
}
