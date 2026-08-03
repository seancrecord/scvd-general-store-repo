/**
 * COUNTERPART OPERATORS THIS STORE WILL RESOLVE.
 *
 * An allowlist, and the reason it exists rather than a clever URL
 * filter is worth stating plainly: /api/verify is free, unlimited and
 * public, and a cross-reference makes it fetch a host named inside a
 * certificate. Without a list, that endpoint becomes a general-purpose
 * request emitter pointed by whatever we once signed — every clever
 * filter is a game of catching the next bypass (127.0.0.1.nip.io,
 * metadata.google.internal, a redirect to a link-local address), and
 * the defender loses that game eventually.
 *
 * An allowlist ends the game. A host that is not here is not fetched,
 * full stop, and the reference reads unverified with that reason. It
 * costs nothing operationally because cross-references are minted by
 * the keeper's hand, so a new counterpart is a deliberate edit here in
 * the same commit as the first artifact that names them.
 *
 * NOT A JUDGMENT ABOUT THEM. Being on this list means "we are willing
 * to make an HTTP request to this host," nothing more. It is not an
 * endorsement, a partnership, or a claim that their records are good —
 * the cross-reference itself already refuses to say any of that.
 *
 * THE PUBLIC VERIFIER IS DELIBERATELY DIFFERENT. verifier/x402-verify.js
 * ships generic and resolves whoever the caller asks about, because
 * there the caller chooses the target and bears their own risk. Here
 * WE are the one making the request, on an endpoint strangers can aim,
 * so the trust boundary is ours to hold.
 */

export interface Counterpart {
  /** Bare hostname, lowercase. */
  issuer: string;
  /** Who they are, in one line, for a reader of the ledger. */
  note: string;
  /** When we agreed to resolve them. */
  since: string;
}

export const COUNTERPARTS: readonly Counterpart[] = [
  /**
   * EMPTY UNTIL THE FIRST PAIRING IS REAL. causeclaw/zooid.fund goes
   * here the day they publish a key document and the first artifact is
   * minted — not before, because an allowlist entry for a host that has
   * never been checked is the same wishful thinking as a green
   * checkmark for a proof nobody verified.
   *
   * AND THE FIRST REAL PAIRING ARRIVED POINTING THE OTHER WAY
   * (2026-08-03, causeclaw on Moltbook), which is why this list being
   * empty is still correct and must not be read as the treaty having
   * died. Their offer is a CONSUMER fixture: one scvd cert recorded as
   * an external receipt field in a CauseClaw decision row, tagged (in
   * their vocabulary) external_receipt_seen — them fetching us, not us
   * fetching them. Everything that direction needs is already public
   * and free: /api/verify/{id}, did.json, the conformance desk. No
   * entry here, no code, no key document of theirs required.
   *
   * They also said, with a candor worth keeping: they cannot speak for
   * zooid.fund the platform, the fixture satisfies neither campaign
   * linkage nor evidence access nor spend authority, and there is no
   * date. Accepted on exactly those terms. An entry lands in this list
   * only on the ORIGINAL trigger — the day WE mint a cross_ref naming
   * their artifact, which still waits on their published key document.
   */
] as const;

const ALLOWED = new Set(COUNTERPARTS.map((entry) => entry.issuer));

export function isAllowedCounterpart(issuer: string): boolean {
  return ALLOWED.has(String(issuer ?? "").trim().toLowerCase());
}
