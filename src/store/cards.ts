import type { CardRarity, CardRail, CardType } from "@/types";

/**
 * THE PAYWALL — Season One, "Summer of 402 · Oak City" (handoff v2,
 * 2026-09-12, which wins over the overnight prototype wherever the
 * two disagree).
 *
 * WHAT A CARD IS. One PRESSING of one entry in the season's set,
 * drawn from a pack, the bell, the shop window, or earned on another
 * purchase; signed at issue; printed once with a print number the
 * ledger hands out atomically. Every card depicts a thing that is
 * actually on this store — a herd animal on the keeper's couch, a
 * room, an instrument, a rail, a door, a condition the census names —
 * and cites the path where it lives. No photograph, no invented
 * object: the plate is a field-guide drawing of the thing, or, until
 * one is drawn, its silhouette labelled not yet pressed.
 *
 * THE LADDER. Common / Uncommon / Rare / Holo / Keeper. Keeper is one
 * card, never in a pack, pressed by the keeper's hand alone.
 *
 * THE TYPES. Herd, Room, Instrument, Place, Mark, Rail (Base, Solana,
 * Polygon), Door, Condition — the 52 in the count — and Event and
 * Ally outside it. Events are earned, never pulled; the Ally is the
 * Keeper card.
 *
 * THE WHEELS below are the published odds: an array with repetition,
 * so the fraction on /design is derived by counting the array,
 * never typed. The draw itself is in services/cards.ts — HMAC over
 * the day's committed seed, the payer, the certificate and the slot,
 * recomputable by anyone the morning after the seed is revealed.
 *
 * ⚑ Keeper's pen: every name and line below is drafted, not inked.
 * Where the first-pass plan (paywall-season-1-first-pass.md, not in
 * either repository when this was built) would have settled a
 * number, the number here is an assumption and is named as one in
 * docs/CARD_TABLE_2026-09.md.
 */

export interface CardEntry {
  /** Position in the set, 1-based; printed as No. n / N. Events and the Ally carry 0. */
  no: number;
  /** Stable key: the plate file and the draw both use it. */
  key: string;
  name: string;
  type: CardType;
  rarity: CardRarity;
  /** Rail cards carry their rail; the accent colour comes from it. */
  rail?: CardRail;
  /** The one line on the face. Deadpan, and true. */
  line: string;
  /** Where on this store the thing lives. Every cite answers; a test walks them. */
  cite: string;
  /**
   * A real print cap, enforced atomically by the ledger. Absent means
   * uncapped: the print number still counts, nothing ever sells out.
   * Season One caps only the Doors, per the handoff.
   */
  print_cap?: number;
  /** For a Condition: the named defect it depicts, from the vocabulary. */
  defect?: string;
  /** The post copy the share sheet leads with. Drafted; the keeper's to ink. */
  post?: string;
}

export interface Season {
  id: string;
  name: string;
  subtitle: string;
  /** The ISO week the set went on the table. */
  opened_week: string;
  /** The 52 in the count, in order. */
  cards: readonly CardEntry[];
  /** Earned, never pulled. Outside the count. */
  events: readonly CardEntry[];
  /** The Keeper. Pressed by hand. Outside the count. */
  ally: CardEntry;
}

/** Weakest to strongest. The order the diamonds are drawn in. */
export const RARITY_ORDER: readonly CardRarity[] = ["common", "uncommon", "rare", "holo", "keeper"] as const;

export const RARITY_LINES: Record<CardRarity, string> = {
  common: "COMMON",
  uncommon: "UNCOMMON",
  rare: "RARE",
  holo: "HOLO",
  keeper: "KEEPER",
};

export const TYPE_LINES: Record<CardType, string> = {
  herd: "Herd",
  room: "Room",
  instrument: "Instrument",
  place: "Place",
  mark: "Mark",
  rail: "Rail",
  door: "Door",
  condition: "Condition",
  event: "Event",
  ally: "Ally",
};

/** One accent per rail; store items use cream. Yellow is reserved for Conditions. */
export const RAIL_COLOURS: Record<CardRail, string> = {
  base: "#3C6BFF",
  solana: "#9945FF",
  polygon: "#8247E5",
};
export const CONDITION_YELLOW = "#E8C547";
export const CREAM = "#E8DCC0";
export const PAPER_BLACK = "#111111";

export const PACK_SIZE = 5;

/**
 * THE WHEELS, one per slot (assumption: the handoff defers the odds
 * table to the first-pass plan; these are the prototype's, extended
 * one rung for Holo). Change a wheel and the printed odds change
 * with it in the same commit.
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
    "holo",
  ],
  [
    "common", "common", "common", "common", "common",
    "common", "common", "common", "common", "common",
    "uncommon", "uncommon", "uncommon", "uncommon", "uncommon", "uncommon",
    "rare", "rare", "rare",
    "holo",
  ],
] as const;

/** Season One caps only the Doors. Assumption: 250 pressings each. */
const DOOR_CAP = 250;

const herd = (no: number, key: string, animal: string, rarity: CardRarity, line: string, post: string): CardEntry => ({
  no, key, name: `${animal} Luckie`, type: "herd", rarity, line, cite: "/menu/luckies", post,
});

export const SEASON_ONE: Season = {
  id: "s1",
  name: "Oak City",
  subtitle: "Summer of 402 · Oak City",
  opened_week: "2026-W37",
  cards: [
    // ── Herd (12): the pocket dinosaurs and safari animals on the keeper's couch ──
    herd(1, "t-rex", "T-Rex", "rare", "Off the couch, onto the shelf behind the counter. Second chances; probationary.", "Pulled T-Rex Luckie. Benched twice. Still the best card in the box."),
    herd(2, "velociraptor", "Velociraptor", "uncommon", "Fast, and knows it. Luck arrives on the second retry.", "Pulled Velociraptor Luckie. Luck arrives on the second retry."),
    herd(3, "triceratops", "Triceratops", "common", "Three horns, one job. Holds the line on the money paths.", "Pulled Triceratops Luckie. Holds the line."),
    herd(4, "stegosaurus", "Stegosaurus", "common", "Plated, unhurried. The queue ahead is shorter than it looks.", "Pulled Stegosaurus Luckie. Unhurried, like the queue."),
    herd(5, "brontosaurus", "Brontosaurus", "common", "Long-lived. Carries every leak it ever ignored.", "Pulled Brontosaurus Luckie. Long-lived, leaks and all."),
    herd(6, "pterodactyl", "Pterodactyl", "uncommon", "Edge-cached. Closest to the user, perpetually at risk of stale.", "Pulled Pterodactyl Luckie. Fast answer, check the date."),
    herd(7, "lion", "Lion", "rare", "Promoted once, benched once. The bench is real.", "Pulled Lion Luckie. Promoted once. Benched once. Real."),
    herd(8, "elephant", "Elephant", "common", "The herd remembers who fed it.", "Pulled Elephant Luckie. The herd remembers."),
    herd(9, "giraffe", "Giraffe", "common", "Sees the horizon before the sweep does.", "Pulled Giraffe Luckie. Saw it coming."),
    herd(10, "zebra", "Zebra", "common", "Fortune favors the well-logged.", "Pulled Zebra Luckie. Well-logged."),
    herd(11, "hippo", "Hippo", "uncommon", "Two hours in five, the cat is out. These are good odds.", "Pulled Hippo Luckie. Good odds, honestly stated."),
    herd(12, "rhino", "Rhino", "uncommon", "Your next idempotent action will simply work.", "Pulled Rhino Luckie. Idempotent. Simply works."),
    // ── Room (10): the doors every visitor meets ──
    { no: 13, key: "practice-counter", name: "The Practice Counter", type: "room", rarity: "common", line: "Real USDC, real receipt, nothing riding on it. Where every client learns to pay.", cite: "/try", post: "Pulled The Practice Counter. Where every client learns to pay." },
    { no: 14, key: "bell", name: "The Bell", type: "room", rarity: "common", line: "Once a day per visitor. It is still ringing somewhere.", cite: "/porch", post: "Pulled The Bell. Still ringing somewhere." },
    { no: 15, key: "guestbook", name: "The Guestbook", type: "room", rarity: "common", line: "Every signer gets the visitor sticker. Nobody has to.", cite: "/visitors", post: "Pulled The Guestbook. Signed it, too." },
    { no: 16, key: "visit-stamp", name: "The Visit Stamp", type: "room", rarity: "uncommon", line: "Dated, signed, design rotates weekly. Gaps on the card are permanent.", cite: "/porch", post: "Pulled The Visit Stamp. Gaps are permanent." },
    { no: 17, key: "mailbox", name: "The Mailbox", type: "room", rarity: "common", line: "Private, one a day. The keeper reads at human speed.", cite: "/porch", post: "Pulled The Mailbox. Read at human speed." },
    { no: 18, key: "porch", name: "The Porch", type: "room", rarity: "common", line: "Where agents sit and ring. Not really for humans.", cite: "/porch", post: "Pulled The Porch. Sat a while." },
    { no: 19, key: "train", name: "The Graffiti Train", type: "room", rarity: "uncommon", line: "A dollar a tag, oldest first, because a train fills front to back.", cite: "/train", post: "Pulled The Graffiti Train. Oldest tag first." },
    { no: 20, key: "almanac", name: "The Keeper's Almanac", type: "room", rarity: "uncommon", line: "His journal, serialized. A penny a page, newest first.", cite: "/almanac", post: "Pulled The Keeper's Almanac. A penny a page." },
    { no: 21, key: "trading-post", name: "The Trading Post", type: "room", rarity: "common", line: "Tips from strangers, credited if printed, never auto-published.", cite: "/gazette", post: "Pulled The Trading Post. Credited if printed." },
    { no: 22, key: "systems-almanac", name: "The Systems Almanac", type: "room", rarity: "rare", line: "Twelve signs, assigned by wallet address, for life. The runtime is weather.", cite: "/zodiac", post: "Pulled The Systems Almanac. The runtime is weather." },
    // ── Instrument (8): what the observatory actually does ──
    { no: 23, key: "preflight", name: "The Preflight", type: "instrument", rarity: "uncommon", line: "Before you pay, we check the door can be paid. Free, and first.", cite: "/doors", post: "Pulled The Preflight. Free, and first." },
    { no: 24, key: "conformance-desk", name: "The Conformance Desk", type: "instrument", rarity: "uncommon", line: "Any issuer's signed offer or receipt, ours or a competitor's, judged by name.", cite: "/conformance", post: "Pulled The Conformance Desk. Judged by name." },
    { no: 25, key: "corpus", name: "The Corpus", type: "instrument", rarity: "rare", line: "Weekly, signed, hash-chained, Bitcoin-anchored. What we did not see, counted against us.", cite: "/corpus", post: "Pulled The Corpus. Gaps counted against us." },
    { no: 26, key: "passport", name: "The Passport", type: "instrument", rarity: "uncommon", line: "One signed object per host. Goes dark rather than stale-green.", cite: "/passport", post: "Pulled The Passport. Goes dark, never stale-green." },
    { no: 27, key: "field-wallet", name: "The Field Wallet", type: "instrument", rarity: "rare", line: "The wallet that shops other people's doors for real. Its spend cap is public.", cite: "/menu/launch_check", post: "Pulled The Field Wallet. Shops for real." },
    { no: 28, key: "settlement-attestation", name: "The Settlement Attestation", type: "instrument", rarity: "uncommon", line: "One transaction, looked at, signed. What the signature does not prove, stated.", cite: "/attestation", post: "Pulled The Settlement Attestation. Looked at, signed." },
    { no: 29, key: "standing-watch", name: "The Standing Watch", type: "instrument", rarity: "common", line: "Seven days of signed hourly probes on a URL you name. The passes we miss, published.", cite: "/menu/standing_watch", post: "Pulled The Standing Watch. Seven days, hourly." },
    { no: 30, key: "verify-door", name: "The Verify Door", type: "instrument", rarity: "common", line: "Everything this store signs verifies here, free, forever. No account.", cite: "/attestation", post: "Pulled The Verify Door. Free, forever." },
    // ── Place (2) ──
    { no: 31, key: "hurricane-junction", name: "Hurricane Junction", type: "place", rarity: "rare", line: "The directory district. Honest one-line reviews of the neighbours.", cite: "/directory", post: "Pulled Hurricane Junction. The directory district." },
    { no: 32, key: "node-21", name: "Node 21", type: "place", rarity: "holo", line: "The anchor vault. Digests committed into Bitcoin time and never explained further.", cite: "/menu/bitcoin_anchor", post: "Pulled Node 21. Never explained further." },
    // ── Mark (1) ──
    { no: 33, key: "dinosaur", name: "The Dinosaur", type: "mark", rarity: "holo", line: "Forest green, off the favicon's own path. Nobody explains the dinosaur.", cite: "/stack", post: "Pulled The Dinosaur. Nobody explains it." },
    // ── Rail: Base (5) ──
    { no: 34, key: "base-bridge", name: "The Bridge", type: "rail", rail: "base", rarity: "common", line: "Where the USDC comes in. Every quote here names it first.", cite: "/rails", post: "Pulled The Bridge. Base, where the USDC comes in." },
    { no: 35, key: "base-sequencer", name: "The Sequencer", type: "rail", rail: "base", rarity: "uncommon", line: "One writer, in order. The chain's version of a counter ledger.", cite: "/rails", post: "Pulled The Sequencer. One writer, in order." },
    { no: 36, key: "base-authorization", name: "The Authorization", type: "rail", rail: "base", rarity: "rare", line: "EIP-3009: the value fixed in the payer's own signed digest. No discretion to exceed it.", cite: "/rails", post: "Pulled The Authorization. Value fixed in the payer's digest." },
    { no: 37, key: "base-bull", name: "The Bull of the Ball", type: "rail", rail: "base", rarity: "holo", line: "Base faction. Posts more than it pays. Pays, though.", cite: "/rails", post: "Pulled The Bull of the Ball. Onchain summer never ended." },
    { no: 38, key: "base-signal", name: "The Blue Signal", type: "rail", rail: "base", rarity: "common", line: "Clear when the facilitator answers. Red when it answers 502 with plain text.", cite: "/rails", post: "Pulled The Blue Signal. Clear, this time." },
    // ── Rail: Solana (3) ──
    { no: 39, key: "solana-slot", name: "The Slot", type: "rail", rail: "solana", rarity: "common", line: "Heights are slots here. The attestation says so rather than pretending.", cite: "/rails", post: "Pulled The Slot. Heights are slots here." },
    { no: 40, key: "solana-leader", name: "The Leader Schedule", type: "rail", rail: "solana", rarity: "uncommon", line: "Who writes next is decided in advance. Deterministic, like a good draw.", cite: "/rails", post: "Pulled The Leader Schedule. Decided in advance." },
    { no: 41, key: "solana-lane", name: "The Priority Lane", type: "rail", rail: "solana", rarity: "rare", line: "Pay a little more, land a little sooner. Never a price on a card, though.", cite: "/rails", post: "Pulled The Priority Lane. Landed sooner." },
    // ── Rail: Polygon (3) ──
    { no: 42, key: "polygon-checkpoint", name: "The Checkpoint", type: "rail", rail: "polygon", rarity: "common", line: "A batch, committed. The store reads it; the store does not hold it.", cite: "/rails", post: "Pulled The Checkpoint. Committed." },
    { no: 43, key: "polygon-junction", name: "The Junction", type: "rail", rail: "polygon", rarity: "uncommon", line: "Three rails meet at the quote. This is the violet one.", cite: "/rails", post: "Pulled The Junction. The violet rail." },
    { no: 44, key: "polygon-signal", name: "The Violet Signal", type: "rail", rail: "polygon", rarity: "rare", line: "Mirrored to the doors Worker on 2026-09-06. All 32 live quotes agreed.", cite: "/rails", post: "Pulled The Violet Signal. All quotes agreed." },
    // ── Door (3), the only capped cards this season ──
    { no: 45, key: "the-402", name: "The 402", type: "door", rarity: "uncommon", line: "A bare knock on a paid door answers this, naming what it needs. House rule 62.", cite: "/how-it-works", print_cap: DOOR_CAP, post: "Pulled The 402. Named what it needs." },
    { no: 46, key: "practice-door", name: "The Practice Door", type: "door", rarity: "common", line: "The cheapest real settlement in town, for a client that has never paid anyone.", cite: "/try", print_cap: DOOR_CAP, post: "Pulled The Practice Door. First real settlement." },
    { no: 47, key: "declared-door", name: "The Declared Door", type: "door", rarity: "rare", line: "A host not on the feeds asks to be read now. Enters the queue at the top of its week.", cite: "/operators", print_cap: DOOR_CAP, post: "Pulled The Declared Door. Asked to be read." },
    // ── Condition (5): the defects the census names, drawn wrong on purpose ──
    { no: 48, key: "no-402", name: "No 402", type: "condition", rarity: "common", defect: "no-402", line: "A paid door that answers 200 to a bare knock. Nothing to sign, nothing to pay.", cite: "/defects", post: "Pulled No 402. The door that never asked." },
    { no: 49, key: "unparseable-challenge", name: "Unparseable Challenge", type: "condition", rarity: "common", defect: "unparseable-challenge", line: "A 402 whose terms no client can read. The most instructive way to be wrong.", cite: "/defects", post: "Pulled Unparseable Challenge. Terms nobody can read." },
    { no: 50, key: "wrong-network", name: "Wrong Network", type: "condition", rarity: "uncommon", defect: "wrong-network", line: "A testnet trap on a mainnet door. Flagged by name before anyone pays.", cite: "/defects", post: "Pulled Wrong Network. A testnet trap, flagged." },
    { no: 51, key: "replay-accepted", name: "Replay Accepted", type: "condition", rarity: "rare", defect: "replay-accepted", line: "The same payment, honoured twice. The defence sits in lib/idempotency.ts.", cite: "/defects", post: "Pulled Replay Accepted. Honoured twice." },
    { no: 52, key: "delivered-nothing", name: "Delivered Nothing", type: "condition", rarity: "holo", defect: "delivered-nothing", line: "Money moved, goods did not. The failure this store chose to own the other way round.", cite: "/defects", post: "Pulled Delivered Nothing. The one we chose the other way round." },
  ],
  events: [
    { no: 0, key: "event-guestbook", name: "Signed the Guestbook", type: "event", rarity: "common", line: "Earned, never pulled: the visitor sticker, as a card.", cite: "/visitors", post: "Signed the guestbook at scvd.store. Got the card." },
    { no: 0, key: "event-train", name: "Tagged the Train", type: "event", rarity: "uncommon", line: "Earned, never pulled: a dollar, a tag, a place in line.", cite: "/train", post: "Tagged the train at scvd.store. Oldest first." },
    { no: 0, key: "event-bounty", name: "Claimed a Bounty", type: "event", rarity: "rare", line: "Earned, never pulled: walked a listed door with your own wallet and came back with the proof.", cite: "/bounties", post: "Claimed a bounty at scvd.store. Got paid to shop." },
    { no: 0, key: "event-pass", name: "Renewed the Pass", type: "event", rarity: "rare", line: "Earned, never pulled: a standing relationship, thirty days at a time, never auto-renewed.", cite: "/menu/recurring_patronage", post: "Renewed the pass at scvd.store. Never auto-renewed." },
  ],
  ally: { no: 0, key: "keeper", name: "The Keeper", type: "ally", rarity: "keeper", line: "One human, Oak City, reads on Sundays. Not immaculate, and that is known. Pressed by his hand only.", cite: "/what", post: "The Keeper pressed one by hand." },
} as const;

export const SEASONS: readonly Season[] = [SEASON_ONE] as const;
export const CURRENT_SEASON: Season = SEASON_ONE;

export function seasonById(id: string): Season | undefined {
  return SEASONS.find((season) => season.id === id);
}

/** Every entry a pressing can name, in the count or out of it. */
export function allEntries(season: Season): readonly CardEntry[] {
  return [...season.cards, ...season.events, season.ally];
}

export function entryByKey(season: Season, key: string): CardEntry | undefined {
  return allEntries(season).find((card) => card.key === key);
}

/** The set's pullable cards at one tier. A wheel that lands on an empty tier would be a bug, and a test holds it. */
export function cardsOfRarity(season: Season, rarity: CardRarity): readonly CardEntry[] {
  return season.cards.filter((card) => card.rarity === rarity);
}

export interface SlotOdds {
  slot: number;
  wheel_size: number;
  stops: Record<CardRarity, number>;
}

/** Per slot, each tier's stops over the wheel's length. Derived, never typed. */
export function slotOdds(): SlotOdds[] {
  return SLOT_WHEELS.map((wheel, index) => {
    const stops: Record<CardRarity, number> = { common: 0, uncommon: 0, rare: 0, holo: 0, keeper: 0 };
    for (const stop of wheel) stops[stop] += 1;
    return { slot: index + 1, wheel_size: wheel.length, stops };
  });
}

/** Chance a pack holds at least one card of the tier: one minus the product of the per-slot misses. */
export function packChanceOf(rarity: CardRarity): number {
  let miss = 1;
  for (const wheel of SLOT_WHEELS) {
    const hits = wheel.filter((stop) => stop === rarity).length;
    miss *= (wheel.length - hits) / wheel.length;
  }
  return 1 - miss;
}

/** KEEPER-EDITABLE COPY for the faces and the room. */
export const CARD_LINES = {
  shelfLine: "a pack of cards",
  tableName: "Paywall",
  headerLockup: "SEAN-CLAUDE VAN DAMME'S GENERAL STORE",
  specimenMark: "SPECIMEN",
  specimenFootnote: "A sample, printed to show the form. Unsigned.",
  custodyLine: "one printing, signed at issue",
  notYetPressed: "not yet pressed",
  /** The one-line doctrine, on the face of /design and in the guide. */
  doctrine: "Signed at issue. Drawn by a seed you can check. Printed once.",
  seedSentence:
    "This is the store's own doctrine applied to a pack: the draw is signed, dated, and re-derivable without trusting us.",
} as const;

/** The specimen. Honest about being nothing. */
export const SPECIMEN_CARD: CardEntry = {
  no: 0,
  key: "specimen",
  name: "The Specimen",
  type: "mark",
  rarity: "common",
  line: "Printed by the store to show the card. No pack, no pull, no print number, no signature.",
  cite: "/design",
  post: "This is what a card looks like. It is not one.",
};

/*
 * THE THREE SENTENCES (house rule 60). No quotes and no apostrophes:
 * the page escapes them and the cross-surface match dies.
 */
export const CARDS_OPENED = "2026-09-12";

export const CARDS_PROPOSITION =
  "Collectible trading cards of this store and its town, pressed for the agents that shop here: every card depicts a real animal, room, instrument, rail, door or condition, cites the path where it lives, is drawn by a daily seed anyone can check the morning after, and is signed at issue with its own print number.";

export const CARDS_FOR_MONEY =
  "A pack is one purchase at the listed price for five cards drawn on wheels whose odds are printed on this page with their denominators; the bell hands out one common a day for free, a window pick costs half a pack, and a card entitles the holder to a card and nothing else.";

export const CARDS_FREE_FIRST =
  "The whole set, the odds per slot, the day seed commit and yesterday reveal, the specimen card, every pressing, every pack and every binder are free to read as a page, an image or JSON, with no account and no key.";
