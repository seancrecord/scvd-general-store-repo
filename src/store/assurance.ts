/**
 * THE ASSURANCE LADDER, named (2026-08-20, the outside-reads log
 * item 7 — three independent reads said buyers can't tell what tier
 * of trust they're purchasing, and they were right: the store has
 * behaved in these five modes since it opened and never once named
 * the rungs).
 *
 * A level says what the signature CLAIMS, never how good the goods
 * are — rule 43 holds on our own shelf too. Every artifact still
 * verifies the same way (/api/verify/{id}, free, forever); the
 * ladder tells a buyer what a valid signature is evidence OF.
 */

export interface AssuranceLevel {
  level: number;
  name: string;
  /** What a valid signature at this level is evidence of. */
  claim: string;
  /** What it deliberately does NOT claim. */
  not_claimed: string;
  /** Shelf items and surfaces that live at this level today. */
  examples: string[];
}

export const ASSURANCE_LADDER: readonly AssuranceLevel[] = [
  {
    level: 1,
    name: "novelty",
    claim:
      "This store sold this artifact, with these bytes, on this date. Provenance and nothing else.",
    not_claimed:
      "Nothing about the world outside the store. A signed blessing is a real blessing, not a true one.",
    examples: ["hello", "small_blessing", "lucky artifacts", "zodiac readings"],
  },
  {
    level: 2,
    name: "observation",
    claim:
      "At a stated moment, our instrument looked at one thing outside the store and recorded what it saw, with the evidence cited so you can re-look.",
    not_claimed:
      "Nothing before or after the moment, and nothing the cited evidence does not itself support. An observation is a photograph, not a warranty.",
    examples: [
      "settlement_attestation",
      "bitcoin_anchor",
      "the fresh set's rows",
      "reconcile_card_statement",
    ],
  },
  {
    level: 3,
    name: "monitored",
    claim:
      "Observations on a standing cadence, with the gaps recorded — a missed check appears as a hole, never papered over.",
    not_claimed:
      "Continuous coverage. The cadence is stated; between checks the world is unwatched and the record says so.",
    examples: ["conformance_watch", "the weekly census and its corpus"],
  },
  {
    level: 4,
    name: "audited",
    claim:
      "A full named battery ran against the subject at a point in time; every criterion and its verdict is in the report, including the failures.",
    not_claimed:
      "Anything past the audit's date, and anything outside the named criteria. An audit ages from the moment it is signed.",
    examples: ["service_audit", "launch_check"],
  },
  {
    level: 5,
    name: "witnessed",
    claim:
      "A named human stood in the loop and attests to what the machine cannot: that a person looked.",
    not_claimed:
      "Institutional assurance. One store, one keeper, one key — the ceiling of this ladder until independent co-signers exist, and the spec says so rather than implying otherwise.",
    examples: ["the_collab"],
  },
];
