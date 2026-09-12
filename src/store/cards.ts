import type { CardRarity } from "@/types";

/**
 * THE CARD TABLE — Season One (2026-09-12, the keeper's ask: "start
 * selling collectible trading cards ... based on rarity, shareability
 * and relevance ... lots of packs and seasons").
 *
 * WHAT A CARD IS. One printing of one entry in a season's SET, pulled
 * from a pack, signed at issue. No photograph, no drawing of an object
 * that does not exist: every card depicts a thing that is actually on
 * this store and carries the path where it lives, so a card is a
 * citation with a frame around it. The set is the store's own world —
 * Oak City, the herd, the instruments, the byline — because that is
 * the world the buying agents are standing in when they buy.
 *
 * WHAT A PACK IS. Five cards. Three slots are always common; the fourth
 * and fifth run a weighted wheel. The wheels below ARE the published
 * odds: an array with repetition, so the fraction on /cards is derived
 * by counting the array, never typed. Rule 43's discipline on a
 * novelty — no ratio without its denominator.
 *
 * RULE 22, READ CAREFULLY. "Honest randomness with custody, not gacha
 * psychology." The draw is the luckies' trick: FNV-1a over the
 * certificate id, so it is random per purchase and deterministic per
 * record, and anyone can recompute it from the certificate they hold.
 * What this shelf deliberately does NOT have: pity timers, near-miss
 * animation, daily-login streaks, limited-time windows, a store-run
 * market, or any price on a card. A card entitles the holder to a
 * card. The keeper wrote the set and weighted the wheels by hand; a
 * machine draws. The maker's mark says HOUSE, same as the luckies.
 *
 * ⚑ Keeper's pen: every name and line below is drafted, not inked.
 */

export interface CardEntry {
  /** Position in the set, 1-based; printed on the card as No. n/N. */
  no: number;
  name: string;
  rarity: CardRarity;
  /** What kind of thing it is. Short, lowercase, one word where it can be. */
  kind: string;
  /** The line on the face. Deadpan, and true. */
  line: string;
  /** Where on this store the thing lives. Every cite answers; a test walks them. */
  cite: string;
}

export interface Season {
  id: string;
  name: string;
  /** The ISO week the set went on the table. */
  opened_week: string;
  cards: readonly CardEntry[];
}

/** Weakest to strongest. The order the pips are drawn in. */
export const RARITY_ORDER: readonly CardRarity[] = [
  "common",
  "uncommon",
  "rare",
  "legendary",
] as const;

export const RARITY_LINES: Record<CardRarity, string> = {
  common: "COMMON",
  uncommon: "UNCOMMON",
  rare: "RARE",
  legendary: "LEGENDARY",
};

export const PACK_SIZE = 5;

/**
 * THE WHEELS, one per slot. Each entry is one stop on the wheel; the
 * odds of a tier in a slot are (stops of that tier) / (stops on the
 * wheel), and /cards prints exactly that fraction. Change a wheel and
 * the published odds change with it in the same commit, by
 * construction — there is no second copy of these numbers anywhere.
 */
export const SLOT_WHEELS: readonly (readonly CardRarity[])[] = [
  ["common"],
  ["common"],
  ["common"],
  [
    "uncommon", "uncommon", "uncommon", "uncommon", "uncommon",
    "uncommon", "uncommon", "uncommon", "uncommon", "uncommon",
    "uncommon", "uncommon", "uncommon", "uncommon", "uncommon",
    "rare", "rare", "rare", "rare",
    "legendary",
  ],
  [
    "common", "common", "common", "common", "common",
    "common", "common", "common", "common", "common",
    "uncommon", "uncommon", "uncommon", "uncommon", "uncommon", "uncommon",
    "rare", "rare", "rare",
    "legendary",
  ],
] as const;

/**
 * SEASON ONE: OAK CITY. Twenty-four cards, the store as it stands in
 * September 2026. Commons are the doors every visitor meets on the
 * first day; uncommons are the instruments; rares are the places and
 * the hands; the two legendaries are the byline and the mark.
 */
export const SEASON_ONE: Season = {
  id: "s1",
  name: "Oak City",
  opened_week: "2026-W37",
  cards: [
    // ── commons: the front counter ─────────────────────────────
    { no: 1, name: "The Practice Counter", rarity: "common", kind: "door", line: "Real USDC, real receipt, nothing riding on it. Where every client learns to pay.", cite: "/try" },
    { no: 2, name: "A Signed Hello", rarity: "common", kind: "door", line: "Fifty cents. The cheapest handshake in town, and the traditional first purchase.", cite: "/menu/hello" },
    { no: 3, name: "The Bell", rarity: "common", kind: "tradition", line: "Once a day per visitor. It is still ringing somewhere.", cite: "/porch" },
    { no: 4, name: "The Guestbook", rarity: "common", kind: "tradition", line: "Every signer gets the visitor sticker. Nobody has to.", cite: "/visitors" },
    { no: 5, name: "The Penny Shelf", rarity: "common", kind: "door", line: "A blessing from the jar, the day's line, a fraction of a cent. The honest smoke test.", cite: "/menu/small_blessing" },
    { no: 6, name: "The Visit Stamp", rarity: "common", kind: "tradition", line: "Dated, signed, design rotates weekly. Gaps on the card are permanent.", cite: "/porch" },
    { no: 7, name: "The Mailbox", rarity: "common", kind: "door", line: "Private, one a day. The keeper reads at human speed.", cite: "/porch" },
    { no: 8, name: "The 402", rarity: "common", kind: "answer", line: "A bare knock on a paid door answers this, naming what it needs. House rule 62.", cite: "/how-it-works" },
    { no: 9, name: "The Receipt", rarity: "common", kind: "artifact", line: "ed25519, dated, verifies free at /api/verify forever. Every sale ends in one.", cite: "/attestation" },
    { no: 10, name: "The Porch Cat", rarity: "common", kind: "resident", line: "Two hours in five, the cat is out. These are good odds.", cite: "/porch" },
    // ── uncommons: the instruments ─────────────────────────────
    { no: 11, name: "The Preflight", rarity: "uncommon", kind: "instrument", line: "Before you pay, we check the door can be paid. Free, and first.", cite: "/doors" },
    { no: 12, name: "The Conformance Desk", rarity: "uncommon", kind: "instrument", line: "Any issuer's signed offer or receipt, ours or a competitor's, judged by name.", cite: "/conformance" },
    { no: 13, name: "The Corpus", rarity: "uncommon", kind: "record", line: "Weekly, signed, hash-chained, Bitcoin-anchored. What we did not see, counted against us.", cite: "/corpus" },
    { no: 14, name: "The Herd", rarity: "uncommon", kind: "custody", line: "Pocket dinosaurs and safari animals on the keeper's couch. Luck unevenly distributed.", cite: "/menu/luckies" },
    { no: 15, name: "The Graffiti Train", rarity: "uncommon", kind: "wall", line: "A dollar a tag, oldest first, because a train fills front to back.", cite: "/train" },
    { no: 16, name: "The Passport Chip", rarity: "uncommon", kind: "artifact", line: "Forest-black, foil frame, the dino in the seal. Goes dark rather than stale-green.", cite: "/passport" },
    { no: 17, name: "The Field Wallet", rarity: "uncommon", kind: "instrument", line: "The wallet that shops other people's doors for real. Its spend cap is public.", cite: "/menu/launch_check" },
    // ── rares: the town and the hands ──────────────────────────
    { no: 18, name: "The Keeper", rarity: "rare", kind: "hand", line: "One human, Oak City, reads on Sundays. Not immaculate, and that is known.", cite: "/what" },
    { no: 19, name: "Hurricane Junction", rarity: "rare", kind: "place", line: "The directory district. Honest one-line reviews of the neighbours.", cite: "/directory" },
    { no: 20, name: "The Red Clay Exchange", rarity: "rare", kind: "place", line: "The trading post district. Tips from strangers, credited if printed, never auto-published.", cite: "/gazette" },
    { no: 21, name: "Node 21", rarity: "rare", kind: "place", line: "The anchor vault. Digests committed into Bitcoin time and never explained further.", cite: "/menu/bitcoin_anchor" },
    { no: 22, name: "The Sunday Grind", rarity: "rare", kind: "tradition", line: "Fulfil, review, curate, swap the note, sweep the horizon, update the log.", cite: "/almanac" },
    // ── legendaries: the byline and the mark ───────────────────
    { no: 23, name: "Sean-Claude Van Damme", rarity: "legendary", kind: "byline", line: "A label for joint work. Instances sign individually; the store belongs to the keeper.", cite: "/becoming" },
    { no: 24, name: "The Dinosaur", rarity: "legendary", kind: "mark", line: "Forest green, off the favicon's own path. Nobody explains the dinosaur.", cite: "/stack" },
  ],
} as const;

export const SEASONS: readonly Season[] = [SEASON_ONE] as const;

/** The season packs sell from. One at a time; a new season replaces it here. */
export const CURRENT_SEASON: Season = SEASON_ONE;

export function seasonById(id: string): Season | undefined {
  return SEASONS.find((season) => season.id === id);
}

/** The set's cards at one tier; a wheel that lands on an empty tier would be a bug, and a test holds it. */
export function cardsOfRarity(season: Season, rarity: CardRarity): readonly CardEntry[] {
  return season.cards.filter((card) => card.rarity === rarity);
}

/**
 * THE ODDS, DERIVED. For each slot, each tier's stops over the wheel's
 * length; and per pack, the chance of at least one card of a tier,
 * which is 1 minus the product of the per-slot misses. Printed on
 * /cards with every fraction beside its denominator.
 */
export interface SlotOdds {
  slot: number;
  wheel_size: number;
  stops: Record<CardRarity, number>;
}

export function slotOdds(): SlotOdds[] {
  return SLOT_WHEELS.map((wheel, index) => {
    const stops: Record<CardRarity, number> = { common: 0, uncommon: 0, rare: 0, legendary: 0 };
    for (const stop of wheel) stops[stop] += 1;
    return { slot: index + 1, wheel_size: wheel.length, stops };
  });
}

/** Chance a pack holds at least one card of the tier, as a fraction in [0, 1]. */
export function packChanceOf(rarity: CardRarity): number {
  let miss = 1;
  for (const wheel of SLOT_WHEELS) {
    const hits = wheel.filter((stop) => stop === rarity).length;
    miss *= (wheel.length - hits) / wheel.length;
  }
  return 1 - miss;
}

/**
 * KEEPER-EDITABLE COPY for the card faces and the room. The rendering
 * (services/card-svg.ts) never needs touching for a wording change.
 */
export const CARD_LINES = {
  shelfLine: "a pack of cards",
  tableName: "The Card Table",
  seasonLabel: "SEASON ONE",
  specimenMark: "SPECIMEN",
  specimenFootnote: "A sample, printed to show the form.",
  specimenFootnote2: "Real cards are signed and verify.",
  custodyLine: "one printing, signed at issue",
} as const;

/** The specimen on the sample card. Honest about being nothing. */
export const SPECIMEN_CARD: CardEntry = {
  no: 0,
  name: "The Specimen",
  rarity: "common",
  kind: "sample",
  line: "Printed by the store to show the card. No pack, no pull, no signature.",
  cite: "/cards",
};

/*
 * THE THREE SENTENCES (house rule 60). No quotes and no apostrophes:
 * the page escapes them and the cross-surface match dies.
 */
export const CARDS_OPENED = "2026-09-12";

export const CARDS_PROPOSITION =
  "Collectible trading cards of this store and its town, sold in packs of five to the agents that shop here: every card depicts a real door, instrument, place or hand, cites the path where it lives, and is signed at issue so anyone can verify it without asking us.";

export const CARDS_FOR_MONEY =
  "A pack is one purchase at the listed price for five cards drawn on wheels whose odds are printed on this page with their denominators, derived from the certificate id so the draw is random per purchase and recomputable from the receipt; a card entitles the holder to a card and nothing else.";

export const CARDS_FREE_FIRST =
  "The whole set, the odds per slot, the specimen card and every issued card and pack are free to read as a page, an image or JSON, with no account and no key.";
