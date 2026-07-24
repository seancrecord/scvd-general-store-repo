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
  custodyLine: "held in custody",
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
  strength: "still proving itself",
};

/**
 * THE TOTEM REGISTER — keeper-approved paste block, 2026-07-24,
 * verbatim. Reference data for card copy and the grading register.
 * These are the keeper's OWN totems: not stock, not for sale, never
 * editorialized. Store stock draws ONLY from the pocket dinos and
 * safari animals ("The Luckies"); the herd is the entire randomness
 * mechanism. Re-grading canon: patron results may promote or bench a
 * charm's siblings; demotion for underperformance is canon (The
 * Luckies themselves are BENCHED as of this writing).
 */
export const TOTEM_REGISTER: readonly { totem: string; power: string }[] = [
  {
    totem: "Bobby Bonilla card",
    power: 'money zone; "the annuity deal \u2014 vibes are immaculate"',
  },
  {
    totem: "Blue stone",
    power: "powerful voice/speech (situational: presentations, right pocket)",
  },
  { totem: "Pot of gold", power: "feels like wealth" },
  { totem: "Gem ball", power: "confidence" },
  { totem: "Buddha", power: "belly rubs" },
  { totem: "Bull from Spain", power: "bullish" },
  { totem: "LT rookie card", power: "fantasy season only (seasonal)" },
  { totem: "Viking figurine", power: "roots" },
  {
    totem: "Arrowhead",
    power: `idk what it does but it's a fucking arrowhead`,
  },
  {
    totem: "The Luckies (pocket dinos/safari animals)",
    power: "luck, unevenly distributed (status: BENCHED)",
  },
] as const;

/**
 * THE HOUSE LUCKY — one dino off the couch, on the shelf behind the
 * counter, the store's own totem. Never explained beyond this.
 */
export const HOUSE_LUCKY = {
  totem: "one pocket dinosaur, off the couch",
  power: "second chances",
  rotation: "probationary",
} as const;
