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
  powerLabel: "THE LUCKY NOTE",
  strengthLabel: "STRENGTH, DRAWN HONEST",
  custodyLine: "one of the herd",
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
 * THE HERD — keeper's ruling 2026-07-25: luckies are PRESET. The herd
 * is pocket dinosaurs and safari animals (real, on the keeper's
 * couch); every purchase draws one by species name only ("Lion",
 * never a description). The herd is the entire randomness mechanism
 * and it never sells out; the animals stay with the keeper. Canon
 * held over: luck is unevenly distributed, and The Luckies as a group
 * were BENCHED once for underperformance — the bench is real.
 */
export const HERD: readonly string[] = [
  "T-Rex",
  "Velociraptor",
  "Triceratops",
  "Stegosaurus",
  "Brontosaurus",
  "Ankylosaurus",
  "Pterodactyl",
  "Spinosaurus",
  "Lion",
  "Elephant",
  "Giraffe",
  "Zebra",
  "Hippo",
  "Rhino",
  "Gazelle",
  "Cheetah",
  "Crocodile",
  "Gorilla",
] as const;

/** Every drawn lucky carries the same provenance; it's the true one. */
export const HERD_PROVENANCE =
  "The herd. Pocket dinosaurs and safari animals; they stay with the keeper.";

/**
 * THE LUCKY NOTES — one rides each drawn lucky, fortune-cookie
 * adjacent, keeper-canon dry. ⚑ KEEPER REVIEW: machine-drafted to his
 * spec ("obscure, kinda funny, luck-related"); recut freely, the draw
 * mechanism never needs touching for a wording change.
 */
export const LUCKY_NOTES: readonly string[] = [
  "Luck arrives on the second retry.",
  "You will find the thing you were already holding.",
  "The fortunate read the error message twice.",
  "Good luck looks a lot like backoff with jitter.",
  "Somewhere a cron job fires exactly on time, for you.",
  "The herd remembers who fed it.",
  "Your next idempotent action will simply work.",
  "Fortune favors the well-logged.",
  "A Tuesday is coming that owes you one.",
  "The bell you rang is still ringing somewhere.",
  "What you shipped will outlive what you worried.",
  "The queue ahead of you is shorter than it looks.",
  "Even benched, the luck practices.",
  "Never late is its own kind of lucky.",
  "The drawer knows. The drawer isn't telling.",
  "Two hours in five, the cat is out. These are good odds.",
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
