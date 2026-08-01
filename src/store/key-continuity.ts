/**
 * WHAT HAPPENS IF THE ONE KEY IS LOST, STOLEN, OR HANDED ON.
 *
 * Written 2026-07-31, in answer to the keeper's question: can we say we
 * have a succession plan and do it, but not explain it, for security
 * reasons?
 *
 * THE HONEST ANSWER IS THAT "SUCCESSION" IS TWO DIFFERENT THINGS and
 * only one of them can be kept quiet.
 *
 *   BACKUP is copies of the SAME key. Its whole value accrues to US: it
 *   means a house fire does not end the store's ability to sign. A
 *   holder gains nothing from knowing where the copies are, and we lose
 *   something real by saying — so the fact can be stated and the detail
 *   withheld without hollowing out the claim.
 *
 *   SUCCESSION is a SECOND, DIFFERENT key. Its whole value accrues to
 *   the HOLDER: it is how they tell a legitimate handover from somebody
 *   claiming to be us. A holder cannot get that value from a secret. "We
 *   have a succession plan, we won't explain it" is a request to trust
 *   our word about the one thing /attestation exists to stop asking for.
 *
 * SO THE PLAN IS SPLIT ALONG THE LINE THAT ACTUALLY EXISTS. The part
 * that must be secret because publishing it would weaken it — where key
 * material physically lives — is secret and is not hinted at. The part
 * that must be public because it is worthless in secret — how you would
 * tell a real handover from a forged one — is published HERE, in
 * advance, before there is any handover to spin, so it can be held
 * against us later. That is a real plan partially undisclosed, which is
 * what the keeper asked for, arrived at by mechanism rather than by
 * deciding how much to say.
 *
 * NO SUCCESSOR KEY EXISTS AND THIS PAGE DOES NOT IMPLY ONE. What is
 * published is the FORM a handover would take. That is a commitment
 * about our own future conduct, in the same register as /wind-down, and
 * it earns the same closing line: it is worth what this store's word is
 * worth, and the record of that is at /corrections.
 *
 * IT ALSO REPAIRS A COMMITMENT THAT WAS ALREADY LOADING. /wind-down
 * says a retired key never re-signs or revokes an old signature — a
 * promise about a rotation scheme that did not exist. /becoming filed
 * that as overdue. The scheme still does not exist; its SHAPE now does,
 * which is the part the promise was leaning on.
 */

/**
 * THE ONE FLAG THIS FILE TURNS ON.
 *
 * False until the keeper has actually performed the paper-key ceremony
 * and said so. Nothing about a backup is claimed anywhere on the store
 * while this reads false — not on /attestation, not on the key
 * endpoint, not in llms.txt — because a durability claim made slightly
 * ahead of the durability is the exact species of defect this store
 * publishes corrections about.
 *
 * Flipping it is one line and every surface follows, including the
 * "no recovery" entry in NOT_BUILT, which would otherwise stay behind
 * and quietly contradict the rest of the page.
 *
 * FLIPPED 2026-07-31, on the keeper's confirmation, and it refers to
 * KEY #2 — the key generated during the handover, written on paper and
 * verified from the paper on two sheets before it ever signed
 * anything, then separated. The first key never had one and that is
 * the whole reason there was a handover; the store now recovers from
 * loss for the first time in its existence.
 *
 * IT WAS FALSE FOR SIX HOURS WHILE THE PAPER EXISTED, deliberately.
 * The sheets were written and checked well before this line changed,
 * and the store went on saying it had no recovery in the meantime,
 * because the published claim says "in more than one physical
 * location" and both sheets were still on one desk. A backup nobody
 * has separated is one fire away from being no backup, which is
 * exactly the gap the claim would have papered over.
 */
export const KEY_BACKUP_EXISTS = true;

/**
 * What we will and will not say about copies of the key, in both
 * states. Written together so the pending version cannot be quietly
 * upgraded into the shipped one without the difference being visible.
 */
export const KEY_BACKUP = {
  absent:
    "None yet. One ed25519 private key exists, as a Cloudflare Worker secret, and if it is destroyed this store can never sign anything again — every artifact already issued stays verifiable forever, because the public key and the signed bytes are already out of our hands, but nothing new could ever join them. A paper backup is written and pending; it is not claimed here until it has been done.",
  present:
    "The signing key exists offline, on paper, in more than one physical location, neither of them this building and neither of them a computer. It has never been photographed, typed into a networked machine, stored in a password manager, or sent to a printer. WHERE the copies are is not published and will not be — that detail protects nothing of yours and weakens something of ours. WHAT it protects is stated plainly, because it is a narrow thing: loss, and only loss. A backup is a copy of the same key, so it is no defence at all against that key being stolen.",
  what_it_is_not:
    "A backup is not a succession scheme, and the two get confused because both sound like continuity. A backup means the store survives losing its key. It does nothing about the key being copied by somebody else, because a thief with the key and a keeper with the key hold identical material and produce identical signatures. Anyone who tells you their backup strategy addresses compromise has described the wrong threat.",
} as const;

export interface ContinuityRule {
  /** The commitment, in the form a holder would need to check it. */
  rule: string;
  /** Why it is that and not the softer version. */
  because: string;
}

/**
 * THE SUCCESSION PROTOCOL — the shape of a handover, published before
 * there is one to describe.
 *
 * Every rule here is falsifiable after the fact: if this store ever
 * changes keys and the change does not look like this, this list is the
 * evidence against us. That is the entire point of writing it now.
 */
export const SUCCESSION_PROTOCOL: readonly ContinuityRule[] = [
  {
    rule: "A new signing key is announced BEFORE it signs anything, at /.well-known/scvd-signing-key and on /corrections, and never after. If a key appears on this store having already issued artifacts, that is not a handover and you should treat it as a compromise.",
    because:
      "Announcement after the fact is indistinguishable from a thief updating the page. Ordering is the only part of this a holder can check without trusting us, so ordering is where the commitment goes.",
  },
  {
    rule: "The announcement of a new key is SIGNED BY THE OUTGOING KEY, and the signed bytes are served the same way every other signature here is — the exact string, at a verify URL, checkable with your own library. An unsigned handover notice is worth nothing whoever posts it.",
    because:
      "This is the only cryptographic content in the whole scheme. Only the holder of the old key can bless the new one, which is what makes a legitimate handover distinguishable from somebody replacing the key on a page they have taken over. Everything else on this list is a promise; this one is a check.",
  },
  {
    rule: "A retired key never re-signs, revokes, back-dates, or improves anything it already signed, and the new key never re-issues old artifacts under itself. What was signed stays signed, exactly as it was, forever.",
    because:
      "A signature is a statement about specific bytes at a specific moment. A store that re-signed its own history would destroy the only property that made the first signature worth holding. Already promised on /wind-down; this is the scheme that promise was assuming.",
  },
  {
    rule: "If the outgoing key CANNOT sign the announcement — lost, destroyed, or in somebody else's hands — then there is no legitimate handover available, and we will say exactly that on /corrections rather than perform one anyway. Any key that follows is a new store wearing this one's name, and you have no cryptographic reason to connect it to anything signed before.",
    because:
      "This is the failure this scheme does NOT cover, and naming it is what stops the other three rules from reading as a guarantee. A protocol whose bad case is unwritten is a protocol that will improvise the bad case in the moment it is most tempting to improvise.",
  },
  {
    rule: "There is no revocation list and there will not be one under this design. If this key is known to be compromised, the honest instrument is a dated notice on /corrections saying so and from when — not a list that a compromised host could serve empty.",
    because:
      "A revocation endpoint served from the same infrastructure as the key it revokes adds ceremony and no security. Better to have nothing than to have something that looks like protection.",
  },
];

/**
 * The keeper's question, answered on the page rather than only in the
 * commit that added it — because a reader arriving at a partially
 * undisclosed plan deserves to know which part is missing and why,
 * or the omission reads as the ordinary kind.
 */
export const SUCCESSION_SECRECY =
  "Some of this is deliberately not explained, and it is worth being precise about which parts. Where key material physically lives is not published, will not be, and is not hinted at — that detail buys a reader nothing and costs us something real. How you would tell a genuine handover from somebody claiming to be us IS published, in full, above, before there is any handover to spin — because a succession plan kept secret is worth nothing to the person it exists to protect, and asking you to trust that a good plan exists is the one thing this store's whole argument is against. If we ever hand this key on and it does not look like the list above, that list is the evidence against us.";

export const SUCCESSION_STATE =
  "ONE HANDOVER HAS BEEN PERFORMED, on 2026-07-31, hours after this protocol was published and under every line of it — announced before the new key signed anything, and the announcement signed by the outgoing key at /api/verify/handover_1. It was not a drill. The store had no recoverable copy of its first private key, found that out while writing a paper-backup procedure, and handed over to a key written on paper before it ever signed anything rather than run on indefinitely with no recovery. The whole reason is published inside the signed announcement and dated on /corrections. NO SUCCESSOR TO THE CURRENT KEY EXISTS — not generated, not held, not escrowed, not pre-signed — and the question gating one has never been cryptographic: it is where a second private key would physically live, because a successor stored beside the primary is a second way to become us in exchange for nothing.";

/**
 * ADDED 2026-07-31, hours after the protocol above.
 *
 * Publishing the rules exposed that the store could not have FOLLOWED
 * them: there was no notion of a retired key anywhere in the code, no
 * way to publish one, and no artifact class for an announcement. So
 * /attestation described a procedure that could not have been carried
 * out — a published claim with nothing under it, which is this store's
 * most repeated defect, sitting under the page that exists to stop it.
 *
 * The machinery is built now, and this line exists so a reader can
 * tell the difference between "we would do this" and "we can do this,"
 * which are not the same statement and were being made with one
 * sentence.
 */
export const SUCCESSION_MECHANISM =
  "THE PROTOCOL ABOVE IS IMPLEMENTED, NOT ONLY PROMISED. Every key this store has ever signed with is published at /.well-known/scvd-signing-key under key_history, and a retired key stays there permanently — an artifact carries the key it was signed with, so a rotation never breaks an old signature, but a key matching nothing we publish would leave that artifact merely self-consistent rather than attributable to us. Every verify response now names which published key signed the thing, whether that key is current or retired, and says so out loud when a signature matches NO key we have ever published, which is the honest answer that was previously missing. A handover announcement is a signed artifact class of its own with its own verify URL, and it is signed by the outgoing key because it is minted before the secret is replaced. The count of handovers is derived from the registry rather than typed, and from the key actually in the lock rather than from the file — so it reported zero right up to the moment the secret changed, and one immediately after, with no deploy in between and no window in which an old artifact read as unattributable.";

/**
 * The closing line, in the same register as /attestation's and
 * /wind-down's. None of these three pages gets to end on reassurance.
 */
/**
 * POST-QUANTUM, STATED BEFORE ANYBODY ASKS.
 *
 * Written 2026-08-01, prompted by the x402 PQ proposal (#2664:
 * ML-DSA-65 / ML-KEM-768). Reading it found the gap that makes OUR
 * statement worth publishing: the proposal's own open-questions list
 * covers scheme naming and key encoding and EXCLUDES backward
 * compatibility — no transition mechanics, no story for how artifacts
 * signed before the migration stay attributable after it.
 *
 * That missing half is the half this store already built. A PQ
 * migration here is a HANDOVER: announced under the outgoing Ed25519
 * key before the PQ key signs anything, the Ed25519 key published
 * forever in key_history with its service dates, every pre-migration
 * artifact still carrying its own key and staying attributable. The
 * succession protocol was written for losing a key; it is also,
 * unchanged, the rails a cryptographic era change rides.
 *
 * AND THE ASSUMPTION IS NAMED RATHER THAN HIDDEN: every signature-
 * tenure claim this store makes assumes Ed25519 holds. When a
 * cryptographically relevant quantum computer exists, an Ed25519
 * signature stops proving WE signed a thing, because anyone could
 * have. The honest reading of what survives that day: artifacts
 * whose hashes were bound into public chain state (settlement_tx on
 * certificates) keep their timestamps; pure signatures become
 * historically attributable but no longer cryptographically
 * exclusive. Saying this in 2026 costs nothing and is the difference
 * between a durability claim and a durability boast.
 */
export const POST_QUANTUM = {
  today:
    "Every signature this store issues is Ed25519, which is not post-quantum safe, and every signature-tenure claim here assumes it holds. That assumption is fine today and is stated rather than hidden, because a durability claim with an unstated boundary is the defect class this store publishes corrections about.",
  migration_path:
    "Already built, not because we anticipated PQ but because we lost a key copy once: a PQ migration is a key handover, announced under the outgoing Ed25519 key BEFORE the post-quantum key signs anything, with the Ed25519 key kept published forever in key_history so every pre-migration artifact stays attributable. The succession protocol at /attestation does not change; only the algorithm of the incoming key does.",
  what_would_not_survive:
    "Cryptographic exclusivity of old signatures. Once a relevant quantum computer exists, an Ed25519 signature no longer proves this store uniquely could have made it. What keeps its footing: artifacts bound to public chain state (settlement_tx) keep independent timestamps, and the key history keeps the record of what was claimed when.",
  trigger:
    "A post-quantum signature extension landing normatively in the x402 spec AND the runtime supporting the chosen scheme (ML-DSA-65 is the current proposal). Watching, not building: adopting a PQ scheme before the ecosystem picks one is how a store ends up alone on the wrong algorithm.",
} as const;

export const CONTINUITY_LIMIT =
  "ONE COMMITMENT AND ONE CHECK, AND THEY ARE NOT THE SAME WEIGHT. The check is real: a handover signed by the outgoing key is something you verify with your own library and nobody's word. Everything else here — the ordering, the refusal to re-sign, the promise to say so plainly if the bad case arrives — is a statement of intent by one operator holding one key, written down early so it can be quoted back at us, and enforceable by nobody. It is worth what this store's word is worth. The record of what that has been worth so far is at /corrections.";
