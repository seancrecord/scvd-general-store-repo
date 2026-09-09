import { KV_KEYS } from "@/lib/kv-keys";
import { newEntryId } from "@/lib/ids";
import { listKeys } from "@/lib/kv-list";
import { bulkGetJson } from "@/lib/kv-bulk";
import { signMessage, verifyMessageSignature } from "@/lib/signing";
import type { Env } from "@/types";
import { kvGetJson, kvPut } from "@/lib/kv-retry";

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
  purchasedAt?: string,
): Promise<MandateRecord> {
  const record: MandateRecord = {
    mandate,
    cert_id: certId,
    created_at: purchasedAt ?? mandate.recorded_at,
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
  return kvGetJson<MandateRecord>(env.PATRONS, KV_KEYS.mandate(mandateId), "json");
}

/**
 * THE COUNTER-ATTESTATION (2026-09-09) — the answer to the objection
 * this product's own scope note has always printed against itself.
 *
 * MANDATE_SCOPE says a mandate "does not prove the human principal
 * actually gave these instructions (unless the principal's own client
 * submitted it, which this store cannot distinguish)". That
 * parenthesis is the hole: the obvious complaint about any mandate is
 * that the agent wrote its own authorization, and until today the
 * record had no way to answer it.
 *
 * A counter-attestation is the distinguisher. A second party — the
 * principal, a counterparty, anyone holding a key — signs this
 * mandate's id and evidence hash with their OWN key, and the store
 * files what they signed. Two keys attesting to one text is a
 * different and much harder thing to wave away than one.
 *
 * THE STORE ADDS NO CLAIM OF ITS OWN. It does not re-sign the
 * mandate, does not say the parties AGREED — agreement is a legal
 * conclusion and this desk does not draw those — and does not say
 * anyone is bound, performed, or owes anything. It says: these keys
 * signed this id and this hash, at these times, and here is each
 * signature so you can check it yourself without believing us. The
 * mandate's own signature is untouched, so a record verified before
 * an attestation arrived still verifies byte-for-byte after.
 *
 * WHOEVER OPENS THE RECORD PAYS; ATTESTING IS FREE. If the second
 * party had to pay, the store would be the buyer's instrument and the
 * record would tilt toward whoever bought it. Free is what keeps it
 * neutral, and it is why this is a route rather than an item.
 *
 * SIGNED ONLY — there is no weaker "they echoed the text back" tier,
 * considered and dropped. A store assertion that someone submitted a
 * matching string is a claim only this store can vouch for, sitting
 * in a record whose entire value is that it needs no such vouching.
 * Every attestation here is self-verifying by a stranger, or absent.
 */

/** How many keys may attest to one mandate. ⚑ keeper dial. */
export const MANDATE_ATTESTATION_CAP = 20;

/** An ed25519 public key, 32 bytes of lowercase hex. */
const HEX_KEY = /^[0-9a-f]{64}$/;
/** An ed25519 signature, 64 bytes of lowercase hex. */
const HEX_SIGNATURE = /^[0-9a-f]{128}$/;
/** The attestor's claimed name for themselves. A claim, like the rest. */
export const ATTESTATION_LABEL_CAP = 80;

export interface MandateAttestation {
  /** The attesting key, lowercase hex. Verified before it was filed. */
  public_key: string;
  /** Their signature over the exact string in `signature_covers`. */
  signature: string;
  /** What they signed, stated so a stranger can rebuild and check it. */
  signature_covers: string;
  /** This store's clock at filing. */
  attested_at: string;
  /** What the attestor calls themselves. UNVERIFIED, like every name here. */
  label?: string;
}

/**
 * THE STRING AN ATTESTOR SIGNS. The mandate id is in it deliberately:
 * the evidence hash alone would let a signature made for one mandate
 * be replayed onto a different mandate carrying identical text, and
 * two parties agreeing the same words twice is a normal thing to do.
 */
export function attestationPayload(
  mandateId: string,
  evidenceHash: string,
): string {
  return `scvd-mandate-attestation:${mandateId}:${evidenceHash}`;
}

export type AttestationResult =
  | { ok: true; attestation: MandateAttestation; total: number }
  | { ok: false; reason: "no_such_mandate" }
  | { ok: false; reason: "bad_key" }
  | { ok: false; reason: "bad_signature_shape" }
  | { ok: false; reason: "signature_did_not_verify"; payload: string }
  | { ok: false; reason: "full"; cap: number };

export async function attestMandate(
  env: Env,
  mandateId: string,
  input: { publicKey: unknown; signature: unknown; label?: string },
): Promise<AttestationResult> {
  const record = await getMandate(env, mandateId);
  if (!record) {
    return { ok: false, reason: "no_such_mandate" };
  }
  const publicKey = String(input.publicKey ?? "").trim().toLowerCase();
  const signature = String(input.signature ?? "").trim().toLowerCase();
  if (!HEX_KEY.test(publicKey)) {
    return { ok: false, reason: "bad_key" };
  }
  if (!HEX_SIGNATURE.test(signature)) {
    return { ok: false, reason: "bad_signature_shape" };
  }
  const payload = attestationPayload(mandateId, record.mandate.evidence_hash);
  if (!(await verifyMessageSignature(payload, signature, publicKey))) {
    return { ok: false, reason: "signature_did_not_verify", payload };
  }
  /*
   * The cap is checked against keys ALREADY FILED, and a key that has
   * attested before writes its own key again — so a retry costs
   * nothing and never consumes a slot.
   */
  const { attestations: existing } = await listAttestations(env, mandateId);
  const known = existing.some((entry) => entry.public_key === publicKey);
  if (!known && existing.length >= MANDATE_ATTESTATION_CAP) {
    return { ok: false, reason: "full", cap: MANDATE_ATTESTATION_CAP };
  }
  const attestation: MandateAttestation = {
    public_key: publicKey,
    signature,
    signature_covers: payload,
    attested_at: new Date().toISOString(),
    ...(input.label ? { label: input.label.slice(0, ATTESTATION_LABEL_CAP) } : {}),
  };
  await kvPut(
    env.PATRONS,
    KV_KEYS.mandateAttestation(mandateId, publicKey),
    JSON.stringify(attestation),
  );
  return {
    ok: true,
    attestation,
    total: known ? existing.length : existing.length + 1,
  };
}

export interface AttestationList {
  /** Every key that has attested, oldest first — as far as the read saw. */
  attestations: MandateAttestation[];
  /**
   * TRUE WHEN THERE WERE MORE THAN THE READ COULD SEE. The read is
   * capped at MANDATE_ATTESTATION_CAP and the door refuses a new key
   * past the same cap, so this is only ever true if the keeper lowers
   * the dial below what was already filed. A record that says "these
   * signed" while silently dropping some who did would be the exact
   * failure this artifact exists to prevent, so the flag rides out to
   * the page rather than being dropped here.
   */
  truncated: boolean;
}

/** Every key that has attested to one mandate, oldest first, and whether that was all of them. */
export async function listAttestations(
  env: Env,
  mandateId: string,
): Promise<AttestationList> {
  const listed = await listKeys(env.PATRONS, {
    prefix: KV_KEYS.mandateAttestationPrefix(mandateId),
    cap: MANDATE_ATTESTATION_CAP,
  });
  if (listed.names.length === 0) {
    return { attestations: [], truncated: listed.truncated };
  }
  const values = await bulkGetJson<MandateAttestation>(
    env.PATRONS,
    listed.names,
  );
  return {
    attestations: [...values.values()]
      .filter((entry): entry is MandateAttestation => Boolean(entry?.public_key))
      .sort((a, b) => a.attested_at.localeCompare(b.attested_at)),
    truncated: listed.truncated,
  };
}
