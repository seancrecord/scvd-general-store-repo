/**
 * EVERY KEY THIS STORE HAS EVER SIGNED WITH.
 *
 * Written 2026-07-31, to close a gap between a claim and a capability.
 * /attestation publishes the form a handover would take — announced
 * before the new key signs anything, the announcement signed by the
 * outgoing key, the retired key never re-signing. None of that was
 * implementable: there was no notion of a retired key anywhere in the
 * code, so the page described a procedure the store could not have
 * carried out. A published protocol with no mechanism under it is the
 * defect class this store keeps finding in itself, and leaving one
 * under the page that exists to stop it would have been the worst
 * possible place for it.
 *
 * BUILT BEFORE IT WAS NEEDED AND INDEPENDENT OF WHETHER IT WILL BE.
 * At the time of writing it is unresolved whether the keeper still has
 * a recoverable copy of the current seed. If he does, nothing here
 * ever gets used and the store simply gains a working version of a
 * thing it was already describing. If he does not, this is the
 * machinery the first handover runs on. Either way the honest state is
 * the same: RETIRED_KEYS is empty, no rotation has happened, and every
 * surface says so.
 *
 * THE CURRENT KEY IS NOT LISTED HERE, deliberately. It is derived from
 * the live secret at request time, so it cannot be stale and cannot
 * disagree with what the store is actually signing with. A key
 * hardcoded beside a secret is a second source of truth for the one
 * fact that must have exactly one.
 *
 * RETIRED KEYS ARE PUBLISHED FOREVER, which is the whole point of the
 * file. An artifact carries the public key it was signed with, so it
 * keeps verifying after a rotation on its own terms — but if that key
 * matches nothing the store publishes, it is only internally
 * consistent, and a careful holder can no longer tie it to us. Keeping
 * every retired key public is what preserves attribution across a
 * handover. Removing an entry here silently orphans every artifact
 * signed under it.
 */

export interface RetiredKey {
  /** The public key, hex, exactly as it was published while in service. */
  public_key: string;
  /** ISO date the key stopped signing. */
  retired_on: string;
  /** ISO date it started, so a holder can place an artifact in time. */
  in_service_from: string;
  /** Why, in plain words, including when the reason is unflattering. */
  reason: string;
  /** The public key that replaced it. */
  succeeded_by: string;
  /**
   * The id of the signed handover announcement, verifiable at
   * /api/verify/{id}. This is the load-bearing field: it is what lets
   * a holder confirm the OUTGOING key blessed its successor, rather
   * than taking this file's word for the succession.
   */
  announcement_id: string;
}

/**
 * Empty, and an empty list here is a claim: this store has never
 * rotated its signing key. Every surface derives its rotation count
 * from this array rather than stating a number, so the claim cannot go
 * stale the way a typed "no rotation" line would.
 */
export const RETIRED_KEYS: readonly RetiredKey[] = [
  {
    public_key:
      "d98ebec640489852c7076aee66615705200971e7d32c54964e173aea3d37e1af",
    in_service_from: "2026-07-22",
    retired_on: "2026-07-31",
    reason:
      "No recoverable copy of the private key existed. It was generated, pushed into a Cloudflare Worker secret, and no copy kept — not as a decision, but because nobody thought that far ahead yet. Worker secrets are write-only, which is right, and is why there was nothing to retrieve when the paper-backup procedure was written on 2026-07-31. Nothing was broken by that: this key worked, and everything signed under it verifies and always will. What did not exist was any way to survive losing it. Retired in favour of a key written on paper before it ever signed anything.",
    succeeded_by:
      "8c22f61add201ecefa75c5d027371b64bed3c0ff739056a7b255f8322ffcb550",
    announcement_id: "handover_1",
  },
];

/**
 * When the first key entered service: the day the Worker went live at
 * scvd.store, per the project log. Published beside the key so a
 * holder can place any artifact against a key's term of service
 * without asking us. A date rather than "since launch", because
 * "launch" is not a thing anybody outside can look up.
 */
export const FIRST_KEY_IN_SERVICE_FROM = "2026-07-22";

/**
 * WHEN THE KEY NOW IN THE LOCK ENTERED SERVICE.
 *
 * DERIVED, after the first handover published it wrong. The endpoint
 * served a constant — correct for key #1, and still saying 2026-07-22
 * about key #2 the instant the secret changed, which dated the new key
 * nine days before it existed. A key's service window is exactly the
 * fact a holder uses to place an artifact in time, so getting it wrong
 * is not cosmetic: it would have vouched for the new key over a period
 * when it had signed nothing.
 *
 * A key enters service the day the one before it retired. That is a
 * fact the registry already holds, so it is read rather than typed,
 * and the next handover cannot repeat this.
 */
export function currentKeyInServiceFrom(currentPublicKeyHex: string): string {
  const retired = retiredKeysFor(currentPublicKeyHex);
  if (retired.length === 0) {
    return FIRST_KEY_IN_SERVICE_FROM;
  }
  return retired
    .map((entry) => entry.retired_on)
    .sort()
    .slice(-1)[0] as string;
}

export type KeyStatus = "current" | "retired" | "unrecognised";

export interface KeyAttribution {
  status: KeyStatus;
  /** Present only for a retired key. */
  retired_on?: string;
  announcement_id?: string;
  /** What a holder should take from this, stated rather than implied. */
  means: string;
}

const CURRENT_MEANS =
  "Signed with the key this store publishes today. Check it against /.well-known/scvd-signing-key.";

const RETIRED_MEANS =
  "Signed with a key this store used to publish and has since retired. That is expected on an artifact issued before the handover — and whether THIS artifact was is not left to reassurance: its own date is checked against the key's published service window and the verdict reported beside this field as service_window. Inside the window, retirement does not weaken the signature: the key remains published in key_history precisely so artifacts signed under it stay attributable to this store, and the handover itself is signed by the retiring key and verifiable at its own URL. Dated AFTER the window, the artifact is the exact shape a stolen retired key produces, and service_window says so in those words.";

/**
 * THE HONEST THIRD ANSWER, and the reason this function exists at all.
 *
 * Verification here checks a signature against the public key stored in
 * the artifact's own record. That proves the record is internally
 * consistent; on its own it does NOT prove this store issued it,
 * because a record carrying somebody else's keypair would verify just
 * as cleanly. What ties an artifact to us is that its key is one we
 * publish — a tie that was implicit while there was exactly one key
 * and nothing checked it.
 *
 * So an unrecognised key gets said out loud rather than being allowed
 * to ride under a green `valid: true`. It is the same discipline as the
 * legacy `signature_gap` field: name the thing the check does not
 * cover, on the artifact, rather than leave a holder to assume it did.
 */
const UNRECOGNISED_MEANS =
  "This signature is internally consistent, but it was made with a key this store does not publish and has never published — not the current key, and not any retired one. Do NOT treat it as ours. A genuine artifact from this store always carries a key listed at /.well-known/scvd-signing-key. Report it: the mailbox is free and it goes on /corrections.";

export function attributeKey(
  publicKeyHex: string,
  currentPublicKeyHex: string,
): KeyAttribution {
  const key = publicKeyHex.trim().toLowerCase();
  if (key === currentPublicKeyHex.trim().toLowerCase()) {
    return { status: "current", means: CURRENT_MEANS };
  }
  const retired = RETIRED_KEYS.find(
    (entry) => entry.public_key.toLowerCase() === key,
  );
  if (retired) {
    return {
      status: "retired",
      retired_on: retired.retired_on,
      announcement_id: retired.announcement_id,
      means: RETIRED_MEANS,
    };
  }
  return { status: "unrecognised", means: UNRECOGNISED_MEANS };
}

/**
 * THE SWAP WINDOW, AND WHY THE REGISTRY IS FILTERED RATHER THAN READ
 * STRAIGHT.
 *
 * A handover happens in two moves that cannot be simultaneous: the
 * announcement is signed and deployed while the outgoing key is still
 * live, and the secret is replaced afterwards. That leaves a window —
 * minutes, but real — in which a key is listed here as retired and is
 * still the key the store is signing with.
 *
 * Neither naive order is acceptable. Publish the entry after the swap
 * and every artifact signed by the old key reads `unrecognised` in the
 * meantime, which tells a holder in strong terms that a genuine
 * certificate may be forged. Publish it before and key_history shows
 * one key as both current and retired, which is simply false.
 *
 * So the live secret decides. A key that is still signing is current
 * and is not listed as retired, whatever this file says; the moment
 * the secret changes, the same entry starts applying with no deploy
 * and no window in either direction. The registry states intent; the
 * key in the lock states fact, and where they disagree the lock wins.
 */
export function retiredKeysFor(
  currentPublicKeyHex: string,
): readonly RetiredKey[] {
  const current = currentPublicKeyHex.trim().toLowerCase();
  return RETIRED_KEYS.filter(
    (entry) => entry.public_key.toLowerCase() !== current,
  );
}

/**
 * How many handovers this store has actually performed — counted from
 * the same filtered view, so it reads 0 until the secret genuinely
 * changes rather than from the moment the entry is written.
 */
export function rotationsPerformed(currentPublicKeyHex: string): number {
  return retiredKeysFor(currentPublicKeyHex).length;
}
