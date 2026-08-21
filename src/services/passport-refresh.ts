import { signJcs } from "@/lib/jcs";
import { KV_KEYS } from "@/lib/kv-keys";
import { ProbeTargetRefused, checkProbeTarget } from "@/lib/probe-target";
import { signMessage } from "@/lib/signing";
import type { Env } from "@/types";

/**
 * THE PASSPORT REFRESH — the paid fresh check (the keeper's "both"
 * ruling, 2026-08-21; the $1 keeper-confirmed same day). Payment buys ONE thing: the
 * census's own instrument pointed at your door RIGHT NOW, with the
 * result folded into your passport wherever it is newest. It never
 * buys a grade: a refresh that finds the door broken updates the
 * passport to BROKEN and turns the chip off — that is the product
 * working, not failing, and every surface says so before the coin
 * drops.
 *
 * THE INSTRUMENT IS THE CENSUS'S OWN (probeHost), not the audit
 * battery — passports derive from census observations, so a
 * buyer-commissioned observation must be byte-comparable with the
 * weekly ones or the passport would silently mix two instruments'
 * verdicts. The full named-criteria report remains service_audit's
 * job (different door, different job; the consolidation law holds).
 */

export interface RefreshObservation {
  artifact: "passport_refresh";
  host: string;
  url: string;
  observed_at: string;
  verdict: "ready" | "not_ready" | "unreachable";
  failed: string[];
  advisories: string[];
  instrument: string;
  what_this_buys: string;
}

export interface SignedPassportRefresh {
  observation: RefreshObservation;
  evidence_hash: string;
  signed_payload: string;
  signature: string;
  signature_jcs: string;
  public_key: string;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function readPassportRefresh(
  env: Env,
  host: string,
): Promise<RefreshObservation | null> {
  return env.COUNTERS.get<RefreshObservation>(
    KV_KEYS.passportRefresh(host.toLowerCase()),
    "json",
  );
}

export async function performPassportRefresh(
  env: Env,
  rawUrl: string,
  now: Date = new Date(),
): Promise<SignedPassportRefresh> {
  const url = new URL(rawUrl); // an unparseable URL throws before the 402 — validated pre-payment in buy.ts, same as the audits
  const ownHost = new URL(env.STORE_BASE_URL).host.toLowerCase();
  const target = checkProbeTarget(url, ownHost);
  if (!target.ok) {
    throw new ProbeTargetRefused(target.reason ?? "probe target refused");
  }
  const { probeHost } = await import("@/services/ward-round");
  const probe = await probeHost(env, url.toString());
  const observation: RefreshObservation = {
    artifact: "passport_refresh",
    host: url.host.toLowerCase(),
    url: url.toString(),
    observed_at: now.toISOString(),
    verdict: probe.verdict === "not_probed" ? "unreachable" : probe.verdict,
    failed: probe.failed,
    advisories: probe.advisories,
    instrument:
      "the weekly census's own probe (one GET, Web Bot Auth) — buyer-commissioned observations stay byte-comparable with the weekly ones",
    what_this_buys:
      "One fresh observation, folded into the endpoint passport wherever it is newest. Never a grade: a broken door refreshes to a broken passport and a dark chip, and that is the product working.",
  };
  const signedPayload = JSON.stringify(observation);
  const { signature, publicKey } = await signMessage(
    signedPayload,
    env.SIGNING_KEY,
  );
  const record: SignedPassportRefresh = {
    observation,
    evidence_hash: await sha256Hex(signedPayload),
    signed_payload: signedPayload,
    signature,
    signature_jcs: await signJcs(
      observation as unknown as Record<string, unknown>,
      env.SIGNING_KEY,
    ),
    public_key: publicKey,
  };
  // Latest-only: the passport wants the newest observation, and a
  // history of refreshes is what the census chain already is.
  await env.COUNTERS.put(
    KV_KEYS.passportRefresh(observation.host),
    JSON.stringify(observation),
  );
  return record;
}
