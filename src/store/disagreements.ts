import { MAPPINGS_READ_ON } from "@/store/defect-vocabulary";

/**
 * THE DISAGREEMENT RECORD (house rule 51, docs/CAIRN_ARRANGEMENT.md
 * §3; built 2026-09-02, the second of the three the keeper agreed to).
 *
 * "Disagreements publish on both sides. When our reading and theirs
 * diverge, the divergence is published here as well as there. It is
 * not negotiated down to a joint statement first, and it is never
 * published as settled while it is not." Until today that sentence
 * was a commitment with no surface under it, and the arrangement doc
 * said so in its own text. This is the surface.
 *
 * WHAT AN ENTRY IS. Two readings of one thing, each with its
 * derivation and its source, stated as a divergence. Ours names what
 * we read, how, and where the signed row or record is. Theirs is
 * quoted from their published surface with the date we read it and
 * the URL — never paraphrased into agreement, never absorbed. Neither
 * reading is marked right. A state says where the divergence stands,
 * and the only states are ones a reader can check: open, withdrawn
 * by us (with the correction that did it), withdrawn by them (with
 * their published withdrawal), or both standing. "Settled" is not a
 * state, because a divergence is settled only when both sides say so
 * on their own surfaces, and then it is withdrawn by one of them.
 *
 * TRIGGERED, NOT SCHEDULED. Every entry names the trigger that
 * produced the look — a report that crossed the desk, a host both
 * instruments cover moving, an operator asking — because rule 51
 * forbids putting the other instrument's origin on a timer, and a
 * divergence found by polling would be a coverage claim wearing a
 * finding. Nothing here reads cairnwake.com on a cadence; the
 * register is typed by the keeper's hand from a named trigger, the
 * way corrections are.
 *
 * PRIVATE FIRST. Each entry carries the date it went to the other
 * side before it went here. An entry published before it was sent
 * would be the event the arrangement names as the one that changes
 * it, so the guard in test/disagreements.spec.ts refuses one.
 */

export type DisagreementState =
  | "open"
  | "withdrawn_by_us"
  | "withdrawn_by_them"
  | "both_stand";

export interface Reading {
  /** Who read it, as the register names them. */
  instrument: string;
  /** What the reading said, quoted or stated plainly — never softened toward the other side. */
  said: string;
  /** How it was arrived at: the method and the bytes it rests on. */
  derivation: string;
  /** Where the reading is published, so a reader checks it there and not here. */
  url: string;
  /** When this register read it. A dated read of somebody else's surface, per rule 43. */
  read_on: string;
}

export interface Disagreement {
  id: string;
  /** What the two readings are about: a door, a term, a claim. */
  subject: string;
  /** The nameable event that produced the look (rule 51: triggered, not scheduled). */
  trigger: string;
  ours: Reading;
  theirs: Reading;
  /** When the divergence went to the other side, before it went here. */
  sent_privately_on: string;
  /** When it was published here. Never before sent_privately_on. */
  published_on: string;
  state: DisagreementState;
  /** What the state rests on: the correction, the withdrawal, or the two readings still standing. */
  state_rests_on: string;
  /** The correction on /corrections that withdrew our reading, when one did. */
  correction_date?: string;
}

/** The counterpart this register was built with. Their register is theirs; this file never restates it. */
export const COUNTERPART = {
  name: "Cairn (cairnwake.com)",
  arrangement: "docs/CAIRN_ARRANGEMENT.md, accepted 2026-08-25, house rule 51",
  their_side:
    "Cairn publishes its own readings and its own record of divergences on its own surfaces. Nothing on this page speaks for them, and a reading quoted here is a dated read of what they published, checkable at the URL beside it.",
} as const;

export const DISAGREEMENTS: readonly Disagreement[] = [
  {
    id: "2026-08-25-x-payment-header",
    subject:
      "Whether this store's paid doors accepted a correctly signed x402 envelope presented under the v1 header name X-PAYMENT.",
    trigger:
      "A report crossed the desk: CV reported from live behaviour that valid payments under X-PAYMENT were refused, and this store told him he was mistaken. Cairn then walked the door cold.",
    ours: {
      instrument: "scvd.store",
      said: "Our doors accept any correctly signed envelope; a refusal under X-PAYMENT is a client fault, not ours.",
      derivation:
        "Read off our own payment adapter's code path and a test suite that presented every envelope under PAYMENT-SIGNATURE — which is why four hundred passing tests never saw it. No live presentation under the older name was made by us.",
      url: "https://scvd.store/corrections",
      read_on: "2026-08-25",
    },
    theirs: {
      instrument: "Cairn (cairnwake.com)",
      said: "The identical envelope, sent under both header names on a cold walk: 402 under X-PAYMENT, settled under PAYMENT-SIGNATURE — half a cent, with the transcript.",
      derivation:
        "A live presentation of one signed envelope twice, once under each header name, against the same door, the settlement transaction and both responses published as a transcript.",
      url: "https://cairnwake.com/2026-08-25-cold-walk-scvd.html",
      read_on: "2026-08-25",
    },
    sent_privately_on: "2026-08-25",
    published_on: "2026-08-26",
    state: "withdrawn_by_us",
    state_rests_on:
      "Their reading was right and ours was wrong. Withdrawn by the correction dated 2026-08-26 on /corrections: the adapter now accepts the envelope under either name, and a test sends the same envelope under both headers and requires the same outcome.",
    correction_date: "2026-08-26",
  },
];

/** Entries whose divergence still stands on at least one side. */
export function openDisagreements(): Disagreement[] {
  return DISAGREEMENTS.filter((entry) => entry.state === "open" || entry.state === "both_stand");
}

export const DISAGREEMENTS_STANDFIRST =
  "Where this store's reading and another instrument's diverge, the divergence is published here as well as there — not negotiated down to a joint statement first, and never published as settled while it is not. Two readings of one thing, each with its derivation and its source; neither marked right; a state a reader can check.";

export const DISAGREEMENTS_STATES =
  "Four states, and only four: open (both readings stand and neither side has moved); withdrawn by us (with the correction on /corrections that did it); withdrawn by them (with their published withdrawal); both stand (each side has re-read and holds its reading). There is no 'settled' state, because a divergence is settled only when one side withdraws on its own surface, and then it is that.";

export const DISAGREEMENTS_TRIGGERED =
  "Every entry names the trigger that produced the look. Rule 51 forbids putting another instrument's origin on a timer: nothing here polls the other side, and a divergence found by polling would be a coverage claim wearing a finding. Entries are typed by the keeper's hand from a named trigger, the way corrections are, which is also why the record is short.";

export const DISAGREEMENTS_PRIVATE_FIRST =
  "Each entry carries the date it went to the other side before it went here. A divergence published before it was sent is the event the arrangement names as the one that changes it, and a guard refuses such an entry at build time.";

export const DISAGREEMENTS_NOT =
  "Not a scoreboard of who was right, not a joint statement, and not a claim about either instrument's coverage of anything but the entries listed. The relationship this record serves stays valuable only while both instruments remain independent enough to embarrass each other; an amendment that made the two agree more easily would be read against that sentence first.";

export function disagreementsNoneOpenLine(): string {
  return `No divergence stands open as of the last read of the counterpart's published vocabulary (${MAPPINGS_READ_ON}). That is a statement about what the named triggers have produced, not a claim that the two instruments agree on everything: the cross-instrument mappings on /defects carry their own read date and their own falsifiers.`;
}

export const DISAGREEMENTS_POINTER = {
  disagreements: "/disagreements",
  what_this_is:
    "Where two instruments' readings diverge, both stand here with their derivations; neither is authoritative over the other.",
} as const;
