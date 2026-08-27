import { KV_KEYS } from "@/lib/kv-keys";
import { newEntryId } from "@/lib/ids";
import { signMessage } from "@/lib/signing";
import type { Env } from "@/types";
import { kvPut } from "@/lib/kv-retry";

/**
 * THE MANDATE (keeper-approved backlog, 2026-08-19; third build) —
 * the receipt chain's missing FIRST link, built at last: a signed,
 * timestamped, third-party-held record of what was authorized BEFORE
 * the agent acts. Every certificate this store ever minted records
 * what happened; this records what was supposed to happen, dated,
 * held by somebody who is neither the agent nor its principal.
 *
 * THE HONEST REGISTER, decided when the backlog entry was filed and
 * load-bearing here: a mandate submitted by an agent proves what the
 * agent CLAIMED its instructions were, at this date — never what the
 * human actually said, unless the human's own client submits it. The
 * `submitted_as` field records which was claimed, and it too is a
 * claim. CHAIN-OF-CUSTODY, NOT TRUTH-OF-INTENT, and the artifact
 * says so on itself, because the day this is quoted in a dispute is
 * the day that sentence earns its keep. S.5051 points NIST toward
 * delegation-proof standards; this is the smallest honest form of
 * one, running before the standard exists.
 *
 * WHAT MAKES IT MORE THAN A NOTE: purchases can carry `mandate_id`,
 * signed into the certificate — and the store refuses a mandate_id it
 * has no mandate for, so a certificate's mandate link always resolves.
 * Mandate (what was authorized, dated before) → certificates (what
 * was bought, under which mandate) → the Statement (what the wallet
 * actually moved): each link independently checkable, together the
 * audit rail an agent's word alone can never be.
 */

/** Verbatim text cap, enforced at the door before money. */
export const MANDATE_TEXT_CAP = 2000;

export interface MandateInput {
  /** The instructions as claimed, verbatim. UNTRUSTED. */
  text: string;
  /** Who the submitter claims to be. A claim like everything else. */
  submittedAs?: "agent" | "principal";
  /** Claimed spending ceiling, USDC. Declared, never observed. */
  declaredCapUsdc?: number;
  /** Claimed expiry, ISO 8601. Declared, never enforced by us. */
  expiresAt?: string;
}

export interface MandateObservation {
  mandate_id: string;
  recorded_at: string;
  /** "agent" | "principal" — the submitter's claim about themselves. */
  submitted_as: string;
  /** The claimed instructions, exactly as they arrived. */
  mandate_text: string;
  declared_cap_usdc?: number;
  expires_at?: string;
  evidence_hash: string;
  scope: string;
}

export interface SignedMandate extends MandateObservation {
  signature: string;
  public_key: string;
  signature_covers: string;
}

export interface MandateRecord {
  mandate: SignedMandate;
  cert_id: string;
  created_at: string;
}

const MANDATE_SCOPE =
  "Chain-of-custody, not truth-of-intent. This record proves that the text above was submitted to this store as a mandate, by a party claiming to be what submitted_as says, at the moment stated — before any purchase that cites it. It does not prove the human principal actually gave these instructions (unless the principal's own client submitted it, which this store cannot distinguish), does not prove the declared cap or expiry were ever honored, and enforces nothing. What it buys: an agent's claimed authorization now has a dated, signed, third-party existence that neither the agent nor its principal can quietly rewrite afterward — and every certificate citing this mandate_id was minted while this record already existed, because the store refuses citations it cannot resolve.";

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function performMandate(
  env: Env,
  input: MandateInput,
): Promise<SignedMandate> {
  const core = {
    mandate_id: `m_${newEntryId()}`,
    recorded_at: new Date().toISOString(),
    submitted_as: input.submittedAs ?? "agent",
    mandate_text: input.text,
    ...(input.declaredCapUsdc !== undefined
      ? { declared_cap_usdc: input.declaredCapUsdc }
      : {}),
    ...(input.expiresAt ? { expires_at: input.expiresAt } : {}),
  };
  const observation: MandateObservation = {
    ...core,
    evidence_hash: await sha256Hex(JSON.stringify(core)),
    scope: MANDATE_SCOPE,
  };
  const signed = await signMessage(
    JSON.stringify(observation),
    env.SIGNING_KEY,
  );
  return {
    ...observation,
    signature: signed.signature,
    public_key: signed.publicKey,
    signature_covers:
      "The canonical JSON of every field above signature, in the order served. Re-serialize them and check against the ed25519 public key here or at /.well-known/scvd-signing-key.",
  };
}

/** Stored after the mint so the envelope carries the cert id; the
 * signature was fixed before the mint — the Once-Over's discipline. */
export async function storeMandate(
  env: Env,
  mandate: SignedMandate,
  certId: string,
): Promise<MandateRecord> {
  const record: MandateRecord = {
    mandate,
    cert_id: certId,
    created_at: new Date().toISOString(),
  };
  await kvPut(env.PATRONS, 
    KV_KEYS.mandate(mandate.mandate_id),
    JSON.stringify(record),
  );
  return record;
}

export async function getMandate(
  env: Env,
  mandateId: string,
): Promise<MandateRecord | null> {
  return env.PATRONS.get<MandateRecord>(KV_KEYS.mandate(mandateId), "json");
}
