import type { LuckyStatus, LuckyStrength } from "@/types";

/**
 * KEEPER-EDITABLE COPY for the lucky cards. The card is the record:
 * no photograph, no drawing of the object, the words carry it. The
 * rendering lives in src/services/lucky-svg.ts and never needs
 * touching for a wording change. Grades stay honest.
 */

export const LUCKY_CARD_LINES = {
  // lowercase, the keeper's orthography, not a typo
  shelfLine: "a lucky",
  provenanceLabel: "PROVENANCE",
  powerLabel: "WHAT IT DOES",
  strengthLabel: "STRENGTH, GRADED HONEST",
  custodyLine: "held with the rocks",
  specimenMark: "SPECIMEN",
  specimenFootnote: "A sample, printed to show the form.",
  specimenFootnote2: "Real cards are signed and verify.",
} as const;

export const LUCKY_STATUS_LINES: Record<LuckyStatus, string> = {
  in_service: "IN SERVICE",
  promoted: "PROMOTED",
  benched: "BENCHED",
};

/** The specimen on the sample card. Honest about being nothing. */
export const SPECIMEN_LUCKY: {
  name: string;
  provenance: string;
  power: string;
  strength: LuckyStrength;
} = {
  name: "the specimen",
  provenance:
    "Printed by the store to show the card. No shelf, no history, no object.",
  power:
    "Shows a buyer what the card records. That is all it does, and we grade honest.",
  strength: "faint",
};
