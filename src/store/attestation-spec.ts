/**
 * WHAT THIS STORE SIGNS, WHO HOLDS THE KEY, AND WHOSE WORD YOU ARE
 * ACTUALLY TAKING.
 *
 * Written 2026-07-30 in answer to an outside critique that landed
 * mostly right: "no disclosed key architecture, no spec, no
 * interoperability story — a proof-of-concept sketch, not
 * infrastructure." Three of its specific claims were already false
 * (the key hangs at /.well-known, the listing spec is published and
 * CI-validated, and /api/verify serves the exact signed bytes), and
 * the fact that a reader could believe all three IS THE FINDING. If
 * the machinery exists and nobody can tell, it may as well not.
 *
 * THE CRITIQUE'S SHARPEST POINT IS CONCEDED IN FULL. It distinguished
 * in-process signing from operator-deployed mediator signing from
 * independent third-party witness signing, and observed that a store
 * selling small signed goods does not address which of those it is.
 * It didn't. This file is that, stated per artifact class rather than
 * claimed in general, including the classes where the honest answer is
 * "the weakest one."
 *
 * WE DO NOT CLAIM RIGOR WE DO NOT HAVE. There is no hash-linked
 * continuity chain here, no offline evidence bundle format, no key
 * rotation, no threshold signing, no HSM, and no patent. Every one of
 * those absences is listed below in its own words rather than left for
 * somebody to discover and write a post about.
 *
 * THE POINT IS NOT TO LOOK SERIOUS. It is that a buyer can work out,
 * without asking us, exactly how much a given signature is worth — and
 * for several classes the honest answer is "it proves we said this on
 * this date, and nothing more."
 */

/**
 * Who you are trusting when a signature checks out. Ordered weakest to
 * strongest, deliberately, so the list cannot be read as a ranking of
 * how good our items are.
 */
export type TrustModel =
  | "self_signed"
  | "custody_only"
  | "third_party_observation";

export const TRUST_MODELS: Record<
  TrustModel,
  { name: string; means: string; weakness: string }
> = {
  self_signed: {
    name: "Self-signed (in-process)",
    means:
      "The store signs a statement about itself or about a transaction with itself, with its own key, in the same process that produced the statement. A valid signature proves the bytes came from this store's key and have not changed since. It proves nothing about whether the statement is true.",
    weakness:
      "This is the weakest trust model there is. If you do not trust the store, a self-signed certificate gives you no reason to start. It is a receipt, not evidence.",
  },
  custody_only: {
    name: "Custody and timestamp only",
    means:
      "The content was written by the buyer, not by us. The signature attests that this store received exactly these bytes and filed them at this time. It is a notarised envelope: the envelope is ours, the letter is yours.",
    weakness:
      "We do not check, endorse, or vouch for anything inside. A signed anchor summary can be entirely false and the signature is still valid, because the signature was never a claim about the contents.",
  },
  third_party_observation: {
    name: "Third-party observation",
    means:
      "The store observes something it does not control and signs what it saw: public Base chain state, or whether somebody else's URL answered when we walked past it out of band. We are not a party to the thing being observed, which is the property that makes the observation worth anything.",
    weakness:
      "It is still OUR observation, made once, at one moment, by one party. It is not a consensus, not a monitoring history, and not a promise about any other moment. A NOT_FOUND is not a claim that something will never settle.",
  },
};

export interface ArtifactClass {
  /** What it is called on the artifact and in the URL. */
  id: string;
  name: string;
  trust_model: TrustModel;
  /** Exactly what bytes the signature covers. */
  signs: string;
  /** The one thing a buyer should not conclude from a valid signature. */
  does_not_prove: string;
  verify_url: string;
}

export const ARTIFACT_CLASSES: readonly ArtifactClass[] = [
  {
    id: "certificate",
    name: "Certificates of purchase",
    trust_model: "self_signed",
    signs:
      "The canonical JSON of the certificate's own fields, in a fixed declared order: cert_id, item, patron_number, date, then any of name, tip_usdc, note, win, tag, attests that are present. The exact string is served as signed_payload on the verify response, so nothing has to be reconstructed.",
    does_not_prove:
      "That the goods were delivered, that they were any good, or that the buyer was who they said. It proves this store issued this certificate, with these fields, on this date.",
    verify_url: "/api/verify/{cert_id}",
  },
  {
    id: "settlement_attestation",
    name: "Settlement attestations",
    trust_model: "third_party_observation",
    signs:
      "The whole observation object: the transaction hash asked about, what the chain said, the block height, the chain head at the time of reading, the confirmation count, and the moment of observation.",
    does_not_prove:
      "That goods or services were delivered, that a NOT_FOUND will never settle later, or that the payment was legitimate. One RPC read of public state, at one moment, signed by a party with no interest in the answer.",
    verify_url: "/api/verify/{cert_id}",
  },
  {
    id: "phantom_check",
    name: "Phantom checks",
    trust_model: "third_party_observation",
    signs:
      "The check id, the target URL, and the observation: whether it answered, with what status, how fast, and when we looked.",
    does_not_prove:
      "That the URL is up now, was up before, or will be up later. It is one look, from outside your infrastructure, about six hours after you asked, and unreachable is a finding rather than an error.",
    verify_url: "/api/verify/{check_id}",
  },
  {
    id: "context_anchor",
    name: "Context anchors",
    trust_model: "custody_only",
    signs:
      "The anchor id, patron number, date, the summary exactly as the buyer wrote it, and the agent name if one was given.",
    does_not_prove:
      "Anything at all about whether the summary is true. The buyer wrote it; we filed it and dated it. We never read it as instructions and never will.",
    verify_url: "/api/verify/{anchor_id}",
  },
  {
    id: "stamp",
    name: "Visit stamps and Countermarks",
    trust_model: "self_signed",
    signs:
      "The stamp id, variant, ISO week, date, and where present the bearer's chosen name, the punched card, the consecutive-week count and the week's store condition.",
    does_not_prove:
      "That the bearer is any particular party. A name on a stamp is a name somebody chose.",
    verify_url: "/api/verify/{stamp_id}",
  },
  {
    id: "lucky",
    name: "Luckies",
    trust_model: "self_signed",
    signs:
      "The whole lucky record, including its status and any keeper's note about a status change.",
    does_not_prove:
      "Luck.",
    verify_url: "/api/verify/{lucky_id}",
  },
  {
    id: "gazette_issue",
    name: "Gazette issues",
    trust_model: "self_signed",
    signs:
      "The issue's markdown, exactly as printed. The copy you hold is the copy that went to press.",
    does_not_prove:
      "That anything reported in it is correct — only that it has not been altered since printing.",
    verify_url: "/api/verify/gazette_{n}",
  },
];

/** The things a serious reader will look for and not find here. */
export const NOT_BUILT: readonly string[] = [
  "No hash-linked continuity chain. Each artifact is signed independently; there is no tamper-evident ordering between them, so we cannot prove that no artifact was withheld.",
  "No offline evidence bundle format. Verification needs the signed bytes and the public key, both of which travel with the artifact — but there is no packaged bundle standard, and nothing here interoperates with one.",
  "No key rotation and no recovery. One ed25519 key signs everything. If it is lost, nothing new can be signed under it; if it is stolen, every signature it produces is indistinguishable from ours. This is stated the same way on /stack, which calls it the one dependency with no substitute.",
  "No threshold or multi-party signing. One key, one holder, one process.",
  "No hardware security module. The key is a Cloudflare Worker secret.",
  "No third-party audit of any of the above, and no patent. Both are sometimes offered as evidence of seriousness; neither is evidence that a signature checks out, which is the only thing this page is about.",
];

export const KEY_ARCHITECTURE = {
  algorithm: "ed25519",
  key_count: 1,
  holder:
    "The store itself. The private key is a Cloudflare Worker secret held by the keeper; no third party holds a copy and no third party co-signs.",
  public_key_url: "/.well-known/scvd-signing-key",
  rotation: "None. There is no rotation scheme and no revocation list.",
  verification:
    "Every verify response carries signed_payload — the exact UTF-8 string the signature covers. Check it with any ed25519 library: verify(utf8(signed_payload), hex_to_bytes(signature), hex_to_bytes(public_key)). Then compare the fields inside signed_payload against the artifact shown. If a field appears on the artifact but not in signed_payload, the signature does not cover it, and the response says so.",
} as const;

/**
 * THE MAKER'S MARK, AND WHY MOST SHELVES DO NOT CARRY ONE.
 *
 * Added 2026-07-30. Stated here rather than only on the two marked
 * items, because a mark that appears on some artifacts and not others
 * invites the reading that the unmarked ones are hiding something —
 * and on this store the opposite is true: the unmarked ones say it
 * better elsewhere, or the item itself is the answer.
 */
export const MAKER_MARK_POLICY =
  "Two shelves carry a maker's mark in the certificate, signed with everything else: the_drawer and luckies, both marked HOUSE — the keeper wrote the herd, weighted the odds and stocks the drawer by hand, and a machine chooses which one a given buyer gets. He does nothing per order on either. The mark exists because those are the only shelves where a buyer could not otherwise tell. It is deliberately absent from settlement_attestation and phantom_check, whose own copy already says no human looked and says it more precisely than a mark could, and from the human-labor shelves, where the item IS the person and a mark claiming a person did it would be telling you what you paid for. Until 2026-07-30 the listing spec said luckies were graded by a person; they never were, and the question that found it was this one.";

export const ATTESTATION_STANDFIRST =
  "What this store signs, who holds the key, and whose word you are actually taking. Published because a valid signature means different things for different artifacts here, and a buyer should be able to work out which without asking us — including for the artifacts where the honest answer is that the signature proves only that we said this, on this date.";

/**
 * THE CRITIC'S OWN LINE, KEPT BECAUSE IT IS BETTER THAN OURS.
 *
 * On reassessment they conceded the factual claims and held one: that
 * disclosing a limitation is not the same as solving it. Single key,
 * single operator, no third-party witnessing and no recovery is still
 * "trust this one key, this one operator, full stop" — which is exactly
 * the single point of failure that bilateral co-signing, third-party
 * witnessing and transparency logs exist to remove.
 *
 * THAT IS CORRECT AND IT IS NOT ARGUED WITH ANYWHERE ON THIS PAGE.
 * Their summary — "a narrower, more honestly-scoped system, not a more
 * capable one" — is a better sentence than any we wrote for ourselves,
 * so it is quoted rather than paraphrased into something flattering.
 * A store that publishes its corrections does not get to launder an
 * outside verdict into its own words.
 */
export const HELD_AGAINST_US =
  "Disclosing a limitation is not the same as solving it. One key, one operator, no third-party witnessing, no recovery — that is still \u201Ctrust this one key, this one operator, full stop,\u201D and it is the exact single point of failure that co-signing, witness signing and transparency logs exist to remove. An outside reader put it best after checking the artifacts rather than the homepage: this is \u201Ca narrower, more honestly-scoped system, not a more capable one.\u201D We agree, we did not write that sentence, and it stays in their words.";

/**
 * WHY THE BYTES RATHER THAN A RECIPE, in the terms an outside reader
 * used, because they named the bug class better than we had:
 * canonicalization mismatch. A verifier reconstructs "what should have
 * been signed" slightly differently than the signer did, and the check
 * fails — or worse, passes when it should not. It is the whole reason
 * the IETF has a JSON Canonicalization Scheme draft. Handing back the
 * actual bytes sidesteps the class instead of documenting around it.
 */
export const WHY_SIGNED_PAYLOAD =
  "Most real signature-verification failures are canonicalization mismatches: the verifier rebuilds what it thinks was signed, gets a byte different, and the check fails — or passes when it should not. Publishing a canonicalization recipe moves that risk onto you. Serving the exact signed string removes it: there is nothing to rebuild. Compare the fields inside it against the artifact shown, and any gap between what is signed and what is displayed becomes visible rather than theoretical.";

export const ATTESTATION_HONEST_LIMIT =
  "THIS IS A SHOP, NOT INFRASTRUCTURE. Nothing here is offered as a standard for other systems to build on: there is one key, one holder, no rotation, no chain, no bundle format and no audit, all listed above in their own words. What is offered is that every claim on this page is checkable against the artifacts themselves in about a minute, and that the weakest trust model is named as the weakest rather than left for a reader to work out. If you find a signature that does not verify, or a field shown but not signed, the mailbox is free and it goes on /corrections with your name on it.";
