import { signJcs } from "@/lib/jcs";
import { bulkGetJson } from "@/lib/kv-bulk";
import { KV_KEYS } from "@/lib/kv-keys";
import { listKeys } from "@/lib/kv-list";
import { ProbeTargetRefused, checkProbeTarget } from "@/lib/probe-target";
import { signMessage } from "@/lib/signing";
import { issuePassport } from "@/services/passport";
import type { Env } from "@/types";
import { kvGetJson, kvPut } from "@/lib/kv-retry";

/**
 * THE HOSTED TRUST PROFILE — the store's first recurring door
 * (keeper-ruled 2026-08-21: "why not right? we can always remove
 * them"; the $19 price is ⚑ drafted inside his named $9–49 shape).
 *
 * What the money buys, said exactly: a STANDING page at
 * /profiles/{host} for one paid term, aggregating everything the
 * store's instruments already publish about that host — the live
 * passport, the chip, the signed per-host history — plus a signed,
 * dated record that the operator maintains the profile. It does NOT
 * buy a verdict, a rank, or a kind word: the page derives its state
 * from the same corpus everyone reads free, and a host that breaks
 * mid-term shows BROKEN on its own profile. The check is bought; the
 * grade never is (rule 43 all the way down).
 *
 * THE TERM IS THE PRODUCT: x402 has no subscriptions, so "monthly"
 * is an EXPIRING artifact — 30 days per purchase, and a renewal
 * EXTENDS from whichever is later, now or the current expiry, so
 * renewing early never burns days. Latest-wins, like the refresh.
 *
 * THE CONSENT LINE, walked precisely: the /profiles INDEX lists only
 * hosts whose profile is inside its term AND whose latest evidence is
 * on the ready side — names on the ready side, everywhere. The
 * profile PAGE itself keeps serving through breakage and past expiry
 * (marked plainly), because the operator commissioned the page about
 * themselves and yanking evidence mid-term would be the quiet kind of
 * dishonesty this store exists to refuse.
 */

export const PROFILE_TERM_DAYS = 30;

/** The index never grows unbounded reads: one KV list page, capped. */
const INDEX_CAP = 100;

export interface TrustProfileRecord {
  artifact: "trust_profile";
  host: string;
  url: string;
  /** This purchase's moment. */
  commissioned_at: string;
  /** The first purchase's moment, carried through every renewal. */
  active_since: string;
  /** Term end; a renewal extends from max(now, current expiry). */
  expires: string;
  term_days: number;
  /** Purchases to date, this one included. */
  renewals: number;
  /** The gate that let the mint happen — always "ready" by law. */
  verdict_at_commission: "ready";
  profile_url: string;
  passport_url: string;
  chip_url: string;
  what_this_buys: string;
  not_a_guarantee: string;
}

export interface SignedTrustProfile {
  record: TrustProfileRecord;
  evidence_hash: string;
  signed_payload: string;
  signature: string;
  signature_jcs: string;
  public_key: string;
}

/** A refusal with a buyer-facing reason; thrown pre-mint, charges nothing. */
export class TrustProfileRefused extends Error {}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function readTrustProfile(
  env: Env,
  host: string,
): Promise<SignedTrustProfile | null> {
  return kvGetJson<SignedTrustProfile>(env.COUNTERS, 
    KV_KEYS.trustProfile(host.toLowerCase()),
    "json",
  );
}

/**
 * The index's ground truth: every stored profile, capped and read in
 * bulk (the scalability audit's two laws — a list with a cap that
 * reports truncation, and no read-per-key loop behind it). The ROUTE
 * applies the consent filter (in-term AND ready-side); this returns
 * everything so the filter is testable on its own.
 */
export async function listTrustProfiles(
  env: Env,
): Promise<SignedTrustProfile[]> {
  const { names } = await listKeys(env.COUNTERS, {
    prefix: "trust_profile:",
    cap: INDEX_CAP,
  });
  const values = await bulkGetJson<SignedTrustProfile>(env.COUNTERS, names);
  return [...values.values()].filter(
    (profile): profile is SignedTrustProfile => profile !== null,
  );
}

export async function performTrustProfile(
  env: Env,
  rawUrl: string,
  now: Date = new Date(),
): Promise<SignedTrustProfile> {
  const url = new URL(rawUrl); // unparseable throws pre-402; validated in buy.ts like the audits
  const ownHost = new URL(env.STORE_BASE_URL).host.toLowerCase();
  const target = checkProbeTarget(url, ownHost);
  if (!target.ok) {
    throw new ProbeTargetRefused(target.reason ?? "probe target refused");
  }
  const host = url.host.toLowerCase();
  if (host === ownHost) {
    throw new ProbeTargetRefused(
      "That is this store's own hostname; the house profile is /trust, free.",
    );
  }
  /**
   * THE READY GATE, re-derived AT the mint (verified-fact law): the
   * middleware checked before the 402, but evidence can move between
   * the quote and the coin, and the index's consent line depends on
   * this record having been true when minted. A refusal here fails
   * the delivery before payment settles — nothing charged.
   */
  const gate = await issuePassport(env, host, now);
  if (!gate.issued) {
    throw new TrustProfileRefused(
      `No profile minted: ${gate.detail} Nothing charged.`,
    );
  }
  const existing = await readTrustProfile(env, host);
  const base = env.STORE_BASE_URL;
  const extendFrom =
    existing && existing.record.expires > now.toISOString()
      ? new Date(existing.record.expires)
      : now;
  const record: TrustProfileRecord = {
    artifact: "trust_profile",
    host,
    url: url.toString(),
    commissioned_at: now.toISOString(),
    active_since: existing?.record.active_since ?? now.toISOString(),
    expires: new Date(
      extendFrom.getTime() + PROFILE_TERM_DAYS * 86_400_000,
    ).toISOString(),
    term_days: PROFILE_TERM_DAYS,
    renewals: (existing?.record.renewals ?? 0) + 1,
    verdict_at_commission: "ready",
    profile_url: `${base}/profiles/${host}`,
    passport_url: `${base}/passport/${host}`,
    chip_url: `${base}/badges/passport/${host}.svg`,
    what_this_buys: `A standing hosted page for ${PROFILE_TERM_DAYS} days per purchase, aggregating this store's public evidence about the host. Never a verdict: the page derives from the same signed corpus everyone reads free, and a host that breaks mid-term shows broken on its own profile.`,
    not_a_guarantee:
      "A profile is a hosted view of evidence, not an endorsement — nothing about delivery quality, solvency, or anything the instruments did not observe. Not an escrow, not a guarantor. The index lists only in-term, ready-side hosts; the page itself stays honest in both directions.",
  };
  const signedPayload = JSON.stringify(record);
  const { signature, publicKey } = await signMessage(
    signedPayload,
    env.SIGNING_KEY,
  );
  const profile: SignedTrustProfile = {
    record,
    evidence_hash: await sha256Hex(signedPayload),
    signed_payload: signedPayload,
    signature,
    signature_jcs: await signJcs(
      record as unknown as Record<string, unknown>,
      env.SIGNING_KEY,
    ),
    public_key: publicKey,
  };
  // Latest-only, like the refresh: the record IS the current term;
  // the purchase certificates are the history of renewals.
  await kvPut(env.COUNTERS, KV_KEYS.trustProfile(host), JSON.stringify(profile));
  return profile;
}
