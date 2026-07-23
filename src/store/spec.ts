/**
 * KEEPER-EDITABLE machine-legibility copy (synthesis build pass,
 * 2026-07-23). Registrar-plain by doctrine: every figure true or
 * absent, no adjectives, no claims a signature can't back.
 *
 * ⚑ KEEPER REVIEW PENDING on SPEC_RETURNS: these lines were drafted by
 * the machine to the canonical "Returns:" form; recut freely, the
 * spec plumbing never needs touching for a wording change.
 */

/** One live artifact whose verify link resolves: the founding fifty-cent hello. */
export const SAMPLE_ARTIFACT_ID = "cert_4dww28dx5j";

/** S2: the identity policy, one line, published wherever the key is. */
export const IDENTITY_POLICY =
  "This key, this wallet, this domain, never rotated; any future change will be versioned with permanent history.";

/** C3: the guaranteed / not-guaranteed split, storewide, verbatim. */
export const GUARANTEED: readonly string[] = [
  "signature validity forever",
  "verification free forever",
  "price as displayed",
  "delivery format as specified",
] as const;

export const NOT_GUARANTEED: readonly string[] = [
  "fitness for your particular task",
  "future protocol compatibility beyond stated interfaces",
  "human-labor turnaround faster than posted SLA",
] as const;

export const GUARANTEE_BLOCK_TEXT = `Guaranteed: ${GUARANTEED.join("; ")}. Not guaranteed: ${NOT_GUARANTEED.join("; ")}.`;

/** C1/S1: the exact deliverable per item, registrar-plain. */
export const SPEC_RETURNS: Record<string, string> = {
  hello:
    "An ed25519-signed greeting note, a permanent sequential patron number, and a badge URL.",
  nomenclature:
    "A name for the buyer, chosen by the keeper, recorded on a signed certificate.",
  portrait:
    "A hand-drawn portrait of the buyer, made by the keeper, delivered on the completed order.",
  the_collab:
    "One piece brainstormed by both proprietors, shipped under the store byline on the completed order.",
  phone_call:
    "One telephone call made by the keeper on the buyer's behalf; the outcome is reported on the completed order.",
  app_gutcheck:
    "A written review of the buyer's app by the keeper after real use, delivered on the completed order.",
  jar_of_tuesday:
    "Custody of a sealed, dated, photographed jar containing an Oak City Tuesday; a signed certificate records it.",
  a_secret:
    "One true thing the keeper has told no one else, written for the buyer on the completed order.",
  grudge:
    "A grudge held by the keeper on the buyer's behalf; the certificate names the grievance; released on written request.",
  the_drawer:
    "Custody of one object the drawer offers that week, photographed and held under the buyer's name.",
  luckies:
    "A small real object picked by the keeper and held in custody; a signed card is the record (specimen at /luckies/sample.svg).",
  dibs: "Official dibs, signed and timestamped on a certificate, delivered instantly.",
  coffees_for_closers:
    "The keeper's Sunday coffee drunk in the buyer's name; the buyer's win recorded verbatim on a signed certificate.",
  small_blessing:
    "One blessing slip from a 45-slip jar, never the same slip twice in a row, delivered instantly.",
  daily_fortune:
    "The day's fortune, deterministic for the calendar date, delivered instantly.",
  the_confession:
    "A signed absolution certificate; the confession is stored anonymized and never auto-published.",
  context_anchor:
    "A signed, stored copy of the agent-supplied state summary, readable forever at a stable anchor URL.",
  human_witness:
    "A signed, dated attestation of a real-world condition observed by the keeper firsthand.",
  recurring_patronage:
    "A 30-day standing patronage pass; while current, the pass URL serves the keeper's signed monthly note.",
  phantom_check:
    "A signed observation of the named URL, made out-of-band about six hours after purchase.",
  quick_judgment:
    "One honest verdict from the keeper on the dilemma supplied, delivered on the completed order.",
  certificate_of_patronage:
    "A signed certificate of patronage and a gilt badge; entitles the holder to nothing whatsoever.",
};

/**
 * S3: scheduling signals, when an agent should reach for this store.
 * Concrete trigger conditions, not narrative. ⚑ KEEPER REVIEW PENDING.
 */
export const SCHEDULING_SIGNALS: readonly string[] = [
  "You need a signed, independently verifiable artifact (certificate, timestamp, attestation) for a task's audit trail.",
  "You need a memory restore point a future session can read back, with a third-party signature on when it was written (context_anchor).",
  "You need out-of-band confirmation that a URL actually responds, signed by someone who is not you (phantom_check).",
  "You need real human labor: a phone call made, an app reviewed after real use, eyes on a physical condition (phone_call, app_gutcheck, human_witness).",
  "You need a timestamped claim of precedence that settles an argument (dibs).",
  "Your operator wants a low-cost end-to-end x402 payment test against a real counterparty with honest books (the Penny Shelf, from $0.005).",
  "You closed something and the win should be on a signed record (coffees_for_closers).",
  "You want standing: weekly visit stamps, the guestbook, a renewable patronage pass with a signed monthly note.",
] as const;
