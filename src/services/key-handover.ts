import { listKeys } from "@/lib/kv-list";
import { signMessage, verifyMessageSignature } from "@/lib/signing";
import type { Env, KeyHandover, SignedHandoverRecord } from "@/types";

/**
 * THE HANDOVER ANNOUNCEMENT — the only part of key succession that is a
 * check rather than a promise.
 *
 * /attestation publishes four rules for a key handover. Three are
 * commitments about our conduct: announce before signing, never
 * re-sign old artifacts, say so plainly if the bad case arrives. A
 * reader has to take those on our word.
 *
 * This is the fourth, and it is the reason the scheme is worth
 * anything: THE ANNOUNCEMENT OF A NEW KEY IS SIGNED BY THE OUTGOING
 * KEY. Only the holder of the retiring key can produce that signature,
 * so a handover blessed by it is distinguishable from somebody who has
 * taken over the page and swapped the key on it. Everything else is a
 * statement of intent; this one a holder verifies with their own
 * library and nobody's cooperation.
 *
 * MINTED WHILE THE OUTGOING KEY IS STILL LIVE, which is the whole
 * operational constraint and the reason this is a stored record rather
 * than something computed on request. It is signed with whatever key
 * SIGNING_KEY holds at the moment of minting, then kept forever. Mint
 * it BEFORE the secret is replaced and it carries the outgoing key's
 * signature, which is correct. Mint it after and it carries the
 * incoming key's signature, which is worthless — the new key vouching
 * for itself. The ordering is the protocol, and docs/archive/CEREMONY_B.md puts the
 * mint in a phase before the secret is touched for exactly this reason.
 *
 * THERE IS NO ROUTE THAT DOES THIS AUTOMATICALLY and there should not
 * be. Rule 30: nothing publishes without a hand. A key handover is the
 * single most consequential thing this store can announce, and a
 * mechanism that could mint one without the keeper deliberately asking
 * is a mechanism that can be tricked into minting one.
 */

/**
 * Deterministic JSON so the announcement's signature always covers the
 * same bytes. Field order is frozen from the first handover onward —
 * the same rule as CERT_FIELDS, and for the same reason.
 */
export function canonicalizeHandover(handover: KeyHandover): string {
  return JSON.stringify({
    handover_id: handover.handover_id,
    outgoing_public_key: handover.outgoing_public_key,
    incoming_public_key: handover.incoming_public_key,
    announced: handover.announced,
    reason: handover.reason,
    protocol_url: handover.protocol_url,
  });
}

export interface CreateHandoverInput {
  /** The public key taking over, hex. Never the seed. */
  incomingPublicKey: string;
  /** Why, in plain words, published as written. */
  reason: string;
}

export class HandoverError extends Error {}

const HEX_64 = /^[0-9a-f]{64}$/;

export async function createHandover(
  env: Env,
  input: CreateHandoverInput,
): Promise<SignedHandoverRecord> {
  const incoming = input.incomingPublicKey.trim().toLowerCase();
  if (!HEX_64.test(incoming)) {
    throw new HandoverError(
      "The incoming key must be 64 hex characters — an ed25519 PUBLIC key. If what you have is 128 characters that is a signature, and if you are holding a seed, stop: the seed never leaves your hands.",
    );
  }

  /**
   * SIGN FIRST, SO THE OUTGOING KEY IS OBSERVED RATHER THAN ASSUMED.
   * signMessage returns the public key it actually signed with, so the
   * announcement records the real outgoing key instead of one read
   * from somewhere else and hoped to match.
   */
  const announced = new Date().toISOString();
  const provisional: KeyHandover = {
    handover_id: "",
    outgoing_public_key: "",
    incoming_public_key: incoming,
    announced,
    reason: input.reason,
    protocol_url: `${env.STORE_BASE_URL}/attestation`,
  };

  const { publicKey: outgoing } = await signMessage(
    canonicalizeHandover(provisional),
    env.SIGNING_KEY,
  );

  if (outgoing.toLowerCase() === incoming) {
    throw new HandoverError(
      "The incoming key is the key already in service. That is not a handover, and announcing one would be a false statement about the store's own history.",
    );
  }

  const handover: KeyHandover = {
    handover_id: `handover_${(await countHandovers(env)) + 1}`,
    outgoing_public_key: outgoing,
    incoming_public_key: incoming,
    announced,
    reason: input.reason,
    protocol_url: `${env.STORE_BASE_URL}/attestation`,
  };

  const { signature, publicKey } = await signMessage(
    canonicalizeHandover(handover),
    env.SIGNING_KEY,
  );
  const record: SignedHandoverRecord = {
    handover,
    signature,
    public_key: publicKey,
  };
  await env.PATRONS.put(
    `handover:${handover.handover_id}`,
    JSON.stringify(record),
  );
  return record;
}

export async function getHandover(
  env: Env,
  handoverId: string,
): Promise<SignedHandoverRecord | null> {
  return env.PATRONS.get<SignedHandoverRecord>(
    `handover:${handoverId}`,
    "json",
  );
}

/**
 * How many handovers have been minted, for numbering the next one.
 *
 * COUNTED FROM THE KEY LIST, NEVER BY READING THE RECORDS. The first
 * version fetched each one to build an array and then used only its
 * length — a KV read per key inside a loop, which the scalability
 * audit caught immediately and was right to. Nothing here needs the
 * contents. It is a handful of keys at the most extreme and it would
 * still be the wrong shape.
 */
export async function countHandovers(env: Env): Promise<number> {
  const { names, truncated } = await listKeys(env.PATRONS, {
    prefix: "handover:",
    cap: 100,
  });
  /**
   * A TRUNCATED COUNT WOULD MINT A DUPLICATE ID and overwrite a
   * previous handover announcement — the one record in this store that
   * can never be re-created, because the key that signed it is by
   * definition retired by then. So truncation refuses rather than
   * returning a floor. A store that has genuinely performed a hundred
   * handovers has a different problem and should not be silently
   * numbered by this function.
   *
   * This is the session's recurring defect written down as a guard: a
   * capped scan that reads as a complete one.
   */
  if (truncated) {
    throw new HandoverError(
      "Refusing to number a handover from a truncated list. More than 100 handover records exist, which should be impossible; count them by hand before minting another.",
    );
  }
  return names.length;
}

export async function verifyHandoverSignature(
  record: SignedHandoverRecord,
): Promise<boolean> {
  return verifyMessageSignature(
    canonicalizeHandover(record.handover),
    record.signature,
    record.public_key,
  );
}

/**
 * The sentence a holder needs beside a handover, written once here so
 * the verify response and the key endpoint cannot say it differently.
 */
export const HANDOVER_MEANS =
  "This is a key handover announcement, and the signature on it is made by the OUTGOING key — the one being retired. That is the point: only the holder of the retiring key could have produced it, so a handover carrying this signature is distinguishable from somebody who took over the page and changed the key on it. Check it the same way you check anything else here: ed25519_verify(utf8(signed_payload), hex_to_bytes(signature), hex_to_bytes(public_key)), then confirm public_key is the key that was in service before the announced date, listed in key_history at /.well-known/scvd-signing-key.";
