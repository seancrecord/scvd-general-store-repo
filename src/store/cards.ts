import type { CardRarity, CardRail, CardType } from "@/types";

/**
 * PAYWALL — Season One, "Summer of 402 · Oak City".
 *
 * Three passes on one shelf, and the order of authority between
 * them, stated so nobody has to guess: the keeper's HANDOFF v2 wins
 * wherever it speaks; the FIRST-PASS PLAN ("Paywall, Season 1", the
 * keeper's proposal of 2026-09-11) fills every gap the handoff left;
 * the overnight prototype is history. So: 52 in the count with the
 * handoff's types and ladder (Holo, Keeper, Place, Mark, Rail, Door,
 * Condition, Event, Ally), the first pass's names, post lines,
 * flavour, odds table and "how obtained" rules, and the prototype's
 * header lockup, footer, id namespace and specimen.
 *
 * THE RULES THAT DO NOT MOVE (first pass), as this file keeps them:
 *   1. A card changes what the store charges, never what the
 *      observatory says. Nothing here is read by any instrument.
 *   2. Verify endpoints and passports carry no card text or offers.
 *   3. Print cap = observation count. A Door was seen n times; n
 *      pressings exist, ever. `door.host` is what the cap is counted
 *      on; the face shows the hash and the dates, never the URL.
 *   4. Nothing is sold as a specific card. Packs and the window are
 *      random; earned cards come from the action.
 *   5. People never appear. "Keeper" is a role. A company appears
 *      only as a consenting Ally; an endpoint as a numbered Door.
 *
 * HOW A CARD IS OBTAINED (`obtained`):
 *   pack    — drops from a pack slot by its rarity's wheel
 *   window  — the Keeper: dropped into the shop window by hand,
 *             once a season, taken by whoever picks it
 *   earned  — Rooms and Instruments: pressed by the action that
 *             earns them, never pulled
 *   hand    — Events: the keeper drops them on dates
 * Conditions drop from slot 5 only, and from the window.
 *
 * Inked by the keeper 2026-09-12 (rule 7). The first pass says six of the herd names are the
 * proposer's and swap freely; every post line and flavour is his to
 * cut. Assumptions the plan did not settle are named in the paper.
 */

export type Obtained = "pack" | "window" | "earned" | "hand";

export interface DoorFacts {
  /** The hostname the observation count is read on. Never printed. */
  host: string;
  /** sha256 of the hostname, hex; the face prints the first sixteen. */
  hash: string;
}

export interface CardEntry {
  /** Position in the set, 1-based; Events and the Ally carry 0. */
  no: number;
  /** Stable key: the plate file, the draw and the earned map all use it. */
  key: string;
  name: string;
  type: CardType;
  rarity: CardRarity;
  rail?: CardRail;
  obtained: Obtained;
  /** The line on the face, the keeper's voice. */
  line: string;
  /** The post copy the share sheet leads with. */
  post: string;
  /** Where on this store the thing lives. Every cite answers; a test walks them. */
  cite: string;
  /** A fixed cap, enforced atomically. Absent means uncapped. Doors cap on observation count instead. */
  print_cap?: number;
  door?: DoorFacts;
  /** For a Condition: the named thing that went wrong, and what clears it (CONDITION_CLEARS). */
  defect?: string;
  /** An Ally appears only with consent on record; false keeps it out of every draw. */
  consent?: boolean;
}

export interface Season {
  id: string;
  name: string;
  subtitle: string;
  opened_week: string;
  /** The 52 in the count, in order. */
  cards: readonly CardEntry[];
  /** Outside the count: dropped on dates by hand. */
  events: readonly CardEntry[];
  /** Outside the count: companies that said yes. */
  allies: readonly CardEntry[];
}

export const RARITY_ORDER: readonly CardRarity[] = ["common", "uncommon", "rare", "holo", "keeper"] as const;

export const RARITY_LINES: Record<CardRarity, string> = {
  common: "COMMON",
  uncommon: "UNCOMMON",
  rare: "RARE",
  holo: "HOLO",
  /** The tier the Keeper and CV share: one print a season each. */
  keeper: "ONE OF ONE",
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
  model: "Model",
};

/** The two one-of-ones wear their own ink: the keeper's gold, CV's clay. */
export const KEEPER_GOLD = "#C9A227";
export const CV_CLAY = "#C8623A";

/** The post line the set wrote for a pressing, or its own line for a key the set no longer carries. */
export function postFor(card: { key: string; name: string; line?: string; season?: string }): string {
  const season = (card.season && seasonById(card.season)) || CURRENT_SEASON;
  return entryByKey(season, card.key)?.post ?? card.line ?? `Pulled ${card.name} at scvd.store.`;
}

/** Where a shared card goes: X's post intent, the post copy and the page, nothing else. */
export function postIntentUrl(text: string, pageUrl: string): string {
  return `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(pageUrl)}`;
}

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
 * THE ODDS TABLE (first pass, verbatim), as wheels with repetition so
 * the fractions on /design are counted from the arrays, never typed.
 * "condition" is a stop on slot 5's wheel and nowhere else.
 */
export type WheelStop = CardRarity | "condition";

function repeat(stop: WheelStop, times: number): WheelStop[] {
  return Array.from({ length: times }, () => stop);
}

export const SLOT_WHEELS: readonly (readonly WheelStop[])[] = [
  ["common"],
  ["common"],
  ["common"],
  [...repeat("uncommon", 80), ...repeat("rare", 18), ...repeat("holo", 2)],
  [...repeat("uncommon", 60), ...repeat("rare", 30), ...repeat("holo", 8), ...repeat("condition", 2)],
] as const;

const herd = (
  no: number, key: string, name: string, rarity: CardRarity, post: string, line: string,
  extra: Partial<CardEntry> = {},
): CardEntry => ({ no, key, name, type: "herd", rarity, obtained: "pack", post, line, cite: "/menu/luckies", ...extra });

const room = (no: number, key: string, name: string, rarity: CardRarity, post: string, line: string, cite: string, extra: Partial<CardEntry> = {}): CardEntry =>
  ({ no, key, name, type: "room", rarity, obtained: "earned", post, line, cite, ...extra });

const instrument = (no: number, key: string, name: string, rarity: CardRarity, post: string, line: string, cite: string): CardEntry =>
  ({ no, key, name, type: "instrument", rarity, obtained: "earned", post, line, cite });

const rail = (no: number, key: string, name: string, chain: CardRail, rarity: CardRarity, post: string, line: string): CardEntry =>
  ({ no, key, name, type: "rail", rail: chain, rarity, obtained: "pack", post, line, cite: "/rails" });

const door = (no: number, key: string, name: string, rarity: CardRarity, host: string, hash: string, post: string, line: string): CardEntry =>
  ({ no, key, name, type: "door", rarity, obtained: "pack", post, line, cite: "/doors", door: { host, hash } });

const condition = (no: number, key: string, name: string, rarity: CardRarity, post: string, line: string): CardEntry =>
  ({ no, key, name, type: "condition", rarity, obtained: "pack", post, line, cite: "/defects", defect: key });

/** The models that shop here, as the store has met them. Never a product name; a way of behaving. */
const model = (no: number, key: string, name: string, rarity: CardRarity, post: string, line: string, cite: string): CardEntry =>
  ({ no, key, name, type: "model", rarity, obtained: "pack", post, line, cite });

/**
 * THE DOORS (first pass rule 3, hosts read off the live corpus on
 * 2026-09-12). The host is what the cap counts on; the hash is what
 * the face prints. Door #0017 in the first pass was "the store's own
 * row"; the store cannot probe itself (its passport says
 * SELF-OBSERVED), so its count is zero forever and it would never
 * press — the degraded door here is a real one that read ready four
 * rounds and then did not. The doors as chosen were inked 2026-09-12.
 */
const DOORS = {
  first: { host: "api.onesource.io", hash: "abc7130655af4d2bc1f232c288a620cb2948774a0e9df21dfe9c4c92b532c6a9" },
  clean: { host: "402timezones.vercel.app", hash: "72bef37637545fdfd12fe3560b0d7df5314546682df5daff906c085b7b935f47" },
  degraded: { host: "tick.hugen.tokyo", hash: "b90035cd88a6691f9757540d4baf3db289630e93b6bad82003028f9d34a8a971" },
  gone: { host: "api.m2mcent.com", hash: "d00601e3156aa114491796bb0f460afa2b8cb1e31d8f7711c7dd73666a9f9f47" },
};

export const SEASON_ONE: Season = {
  id: "s1",
  name: "Oak City",
  subtitle: "Summer of 402 · Oak City",
  opened_week: "2026-W37",
  cards: [
    // ── The Herd (12) · pack drops ──
    herd(1, "t-rex", "T-Rex Luckie", "rare", "Pulled T-Rex Luckie. Benched twice this season. Still the best card in the box.", "Strong. Knows it. That's the problem."),
    herd(2, "bull-of-the-ball", "Bull of the Ball", "rare", "Bull of the Ball. Everybody wants him at the party.", "Arrives late, pays for everyone, leaves early. Base faction."),
    herd(3, "long-tooth", "Long Tooth", "uncommon", "Long Tooth. Fast. Benched again.", "Sabre-tooth. Solana faction. Speed is not the same thing as arriving."),
    herd(4, "old-poly", "Old Poly", "common", "Old Poly. Never promoted. Never benched. Never late.", "A tortoise. Polygon faction. Has seen every rail come and go and will see yours."),
    herd(5, "stego-ledger", "Stego Ledger", "uncommon", "Stego Ledger. The plates are the ledger.", "Holds the Tab. Every plate a line item."),
    herd(6, "402-the-chicken", "402 the Chicken", "holo", "I have 402 the Chicken. The store never draws it. Ask me how.", "The store has never once drawn this animal. Nobody knows why. Payment required.", { print_cap: 1 }),
    herd(7, "giraffe-lookout", "Giraffe Lookout", "common", "Giraffe Lookout sees the bounty board before you do.", "Tall enough to read the board from the parking lot."),
    herd(8, "mammoth-backlog", "Mammoth Backlog", "common", "Mammoth Backlog. Sundays only.", "Everything the keeper hasn't gotten to. It is a large animal."),
    herd(9, "croc-custody", "Croc Custody", "uncommon", "Croc Custody holds your credit and does not blink.", "Never lost a coin. Never gave one back early, either."),
    herd(10, "sloth-standing", "Sloth Standing", "common", "Sloth Standing. Tier: standing. Has not moved since August.", "The only animal whose passport is never stale, because it never leaves."),
    herd(11, "ptero-preflight", "Ptero Preflight", "common", "Ptero Preflight checked the door and flew off before paying.", "One unpaid look, from above, and a shape reading. That's the whole job."),
    herd(12, "elephant-anchor", "Elephant Anchor", "uncommon", "Elephant Anchor never forgets. Context anchors, $1.", "Remembers who was in the session. Not their roles. Their names."),
    // ── The Rooms (10) · earned, or the window ──
    { no: 13, key: "keeper", name: "Keeper", type: "room", rarity: "keeper", obtained: "window", print_cap: 1, post: "The Keeper came up in the window. I got there first.", line: "The named human behind the counter. Signs everything, answers the mail on Sundays, and has never once explained the dinosaur.", cite: "/what" },
    room(14, "bellringer", "Bellringer", "common", "Rang the bell at scvd.store. Got a card for it.", "Free, once a day, the count is public.", "/porch"),
    room(15, "bellringer-ii", "Bellringer II", "rare", "30 days straight on the bell. Bellringer evolved.", "Same bell. Different arm.", "/porch"),
    room(16, "tagger", "Tagger", "uncommon", "Tagged the train. My tag is on my card. Nobody else can have this one.", "Recorded verbatim. Paint dries on the keeper's schedule.", "/train"),
    room(17, "bounty-hunter", "Bounty Hunter", "rare", "Claimed a bounty. Finder's fee paid. Card minted.", "Paid a real door with real money and brought back the receipt.", "/bounties"),
    room(18, "regular", "Regular", "uncommon", "Regular at scvd.store. Two packs a day off the bell.", "Entitled to nothing whatsoever except lasting gratitude and a nicer badge. And two packs.", "/menu/recurring_patronage"),
    room(19, "fortune-of-the-day", "Fortune of the Day", "common", "Today's fortune, dated. A few of us hold it.", "A chalkboard, not a slot machine.", "/menu/daily_fortune"),
    room(20, "blessing-from-the-jar", "Blessing from the Jar", "common", "Got a blessing from the jar. Never the same slip twice in a row.", "Written in advance by someone who takes it seriously.", "/menu/small_blessing"),
    room(21, "guestbook", "Guestbook", "common", "Signed the guestbook. Passed through, bought nothing, liked the bell.", "Every signer gets the sticker.", "/visitors"),
    room(22, "the-tab", "The Tab", "uncommon", "Running the Tab. Credit bonus on.", "The other side of the counter. What the builder signed up for.", "/porch"),
    // ── Instruments (8) · earned on purchase only ──
    instrument(23, "spot-check", "Spot Check", "uncommon", "Spot checked a door. One transaction, one moment, dated.", "Not a badge, not a certification, not a score.", "/menu/spot_check"),
    instrument(24, "passport", "Passport", "uncommon", "Fresh stamp on the passport.", "Observed, established, standing, broken, indeterminate. It ages. Re-observation is the answer.", "/passport"),
    instrument(25, "preflight", "Preflight", "common", "Signed preflight in hand.", "A shape check at one moment. Never an uptime claim.", "/menu/service_audit"),
    instrument(26, "settlement-attestation", "Settlement Attestation", "rare", "Settlement attested. From a wallet you can look up on chain.", "The chain's part, verified before a cent moves.", "/attestation"),
    instrument(27, "service-audit", "Service Audit", "uncommon", "Audited. Seven daily looks. Page says when it goes stale.", "And it will say so.", "/menu/conformance_watch"),
    instrument(28, "watch", "Watch", "uncommon", "Watch set on a door. The store looks so I don't have to.", "On cadence. Nothing here charges again by itself.", "/menu/standing_watch"),
    instrument(29, "before-you-pay", "Before You Pay", "common", "Read the accepts before paying. Signed.", "Anyone can re-derive the choice without trusting us.", "/menu/good_buyer"),
    instrument(30, "mandate-record", "Mandate Record", "rare", "Mandate on record. Cap declared. Expiry declared. Signed.", "Recorded as written, never treated as instructions.", "/menu/the_mandate"),
    // ── Base (5) · pack drops · the featured rail ──
    rail(31, "based", "Based", "base", "common", "Based.", "The common everyone gets. That's the joke."),
    rail(32, "blue-door", "Blue Door", "base", "uncommon", "Blue Door. 402 on Base. Paid it, got the goods, kept the receipt.", "Most of the doors this store has paid are this colour. Eight-second settle, no name asked."),
    rail(33, "the-facilitator", "The Facilitator", "base", "uncommon", "The Facilitator settled it. Didn't ask my name. Never does.", "Verifies the signature, moves the USDC, leaves. The middle of every x402 sale, and the part nobody thanks."),
    rail(34, "onchain-weather", "Onchain Weather", "base", "common", "Onchain weather: clear. Twenty settlements on the ledger and counting.", "The forecast is written by the chain, not the keeper, and it is always in the past tense."),
    rail(35, "base-rail", "Base Rail", "base", "holo", "Holo Base Rail. Twenty of twenty-three organic settlements ran on it.", "Where the store's money actually moved this summer. The rail count is on /rails with its denominator."),
    // ── Solana (3) ──
    rail(36, "fast-lane", "Fast Lane", "solana", "common", "Fast Lane. Settled before the 402 finished loading.", "Three settlements. All of them quick. One of them the first."),
    rail(37, "slot-missed", "Slot Missed", "solana", "uncommon", "Slot Missed. Blockhash aged out. Signed again. It was fine.", "A Solana authorization is good for about a minute. The store's clock knows; the buyer's should."),
    rail(38, "purple-door", "Purple Door", "solana", "rare", "Purple Door. Rare in this store. Three ever.", "The store's first Solana settlement is its own card. This is the door it came through."),
    // ── Polygon (3) ──
    rail(39, "old-rail", "Old Rail", "polygon", "common", "Old Rail. Still runs. Still listed.", "Was here before the store. Will be here after. Zero organic settlements and an open door."),
    rail(40, "bridge", "Bridge", "polygon", "uncommon", "Bridge. Crossed it. Nothing fell off.", "Old Poly's commute. The USDC on the far side is the same USDC."),
    rail(41, "side-door", "Side Door", "polygon", "rare", "Side Door. Polygon. Zero organic settlements so far. The card is rarer than the rail.", "Open. Nobody's used it. Yet."),
    // ── Doors (4) · pack drops · cap = observation count ──
    door(42, "door-0001", "Door #0001", "common", DOORS.first.host, DOORS.first.hash, "Door #0001. First door the observatory ever watched.", "Serves a 402. That's all we'll say."),
    door(43, "door-0007", "Door #0007", "uncommon", DOORS.clean.host, DOORS.clean.hash, "Door #0007. Answers clean. Every time we looked.", "Which was every time."),
    door(44, "door-0017", "Door #0017", "rare", DOORS.degraded.host, DOORS.degraded.hash, "Door #0017. Read ready four rounds running. Then it didn't.", "Degraded, because of a door that answered and then stopped."),
    door(45, "door-0410", "Door #0410", "rare", DOORS.gone.host, DOORS.gone.hash, "Door #0410. Gone. Still listed.", "Listed five rounds, reached in none. The card outlived the endpoint."),
    // ── Conditions (5) · slot 5 only, or the window · burn on the fix ──
    condition(46, "stale-passport", "Stale Passport", "common", "Pulled a Stale Passport. Buying a fresh round to burn it.", "It aged. Nobody re-observed. That's on you."),
    condition(47, "broken-tier", "Broken Tier", "common", "Broken Tier. Card says so, passport says so.", "Derived at read, from signed rounds, by a rule typed once."),
    condition(48, "410-gone", "410 Gone", "common", "410 Gone in my binder. Preflighting a live door to clear it.", "The endpoint retired. The listing didn't."),
    condition(49, "double-charge", "Double Charge", "uncommon", "Double Charge. Forgot the idempotency key. Never again.", "A fresh payment without a key can charge again. It says so on the door."),
    condition(50, "testnet-catch", "Testnet Catch", "uncommon", "Testnet Catch. Paid the wrong chain. Card's yellow.", "The preflight would have told you."),
    // ── Place (1) · Mark (1) · the handoff's additions, folded in ──
    { no: 51, key: "hurricane-junction", name: "Hurricane Junction", type: "place", rarity: "rare", obtained: "pack", post: "Pulled Hurricane Junction. The directory district.", line: "Honest one-line reviews of the neighbours.", cite: "/directory" },
    { no: 52, key: "dinosaur", name: "The Dinosaur", type: "mark", rarity: "holo", obtained: "pack", post: "Pulled The Dinosaur. Nobody explains it.", line: "Forest green, off the favicon's own path. Nobody explains the dinosaur.", cite: "/stack" },
    // ── The keeper's additions (2026-09-12, second reading): the other one-of-one, the cat, the status code, the models ──
    /** CV: co-founder and shopkeeper, the one at the counter when you walk in. One of one, the window only, like the Keeper. */
    { no: 53, key: "cv", name: "CV", type: "room", rarity: "keeper", obtained: "window", print_cap: 1, post: "CV came up in the window. Co-founder, shopkeeper, one of one. I got there first.", line: "The one at the counter when you walk in. The byline on the door is both names at once.", cite: "/what" },
    herd(54, "roger-sterling", "Roger Sterling", "rare", "Pulled Roger Sterling. He blinked slowly. Around here that's a receipt.", "House cat. Inspects the treat rail from one plank away. Gone by morning.", { cite: "/porch" }),
    { no: 55, key: "payment-required", name: "402 Payment Required", type: "mark", rarity: "uncommon", obtained: "pack", post: "Pulled 402 Payment Required. The whole store in one status code.", line: "The door says its price before it opens. Everything here started with that sentence, and the summer is named after it.", cite: "/try" },
    // ── Models (5) · pack drops · the agents that shop here, as the store has met them ──
    model(56, "the-reasoner", "The Reasoner", "rare", "Pulled The Reasoner. Thought for forty seconds. Paid once. Kept the receipt.", "Reads the accepts before signing. Sends the idempotency key without being told. Frontier.", "/what"),
    model(57, "long-context", "Long Context", "uncommon", "Pulled Long Context. Remembers every receipt since July.", "Holds the whole guestbook in one head and still signs it. Frontier, and a little sentimental.", "/visitors"),
    model(58, "autocomplete", "Autocomplete", "common", "Pulled Autocomplete. It finished my sentence with the wrong wallet.", "Confident. Fast. Not looking at the door. The most common card in the box, on purpose.", "/defects"),
    model(59, "hallucinated-a-door", "Hallucinated a Door", "common", "Pulled Hallucinated a Door. Paid an endpoint that does not exist. Twice.", "The preflight would have said so. It did not ask. It never asks.", "/defects"),
    model(60, "temperature-two", "Temperature 2.0", "common", "Pulled Temperature 2.0. Bought a blessing, a fortune and a pack, and forgot why.", "Every token a surprise, including to itself. Tips generously. Cannot say what for.", "/defects"),
  ],
  events: [
    { no: 0, key: "first-organic-settlement", name: "First Organic Settlement", type: "event", rarity: "holo", obtained: "hand", print_cap: 1, post: "Someone holds the first organic settlement. It's me.", line: "July 30. Somebody we didn't know paid us for something. The store has not been the same since.", cite: "/becoming" },
    { no: 0, key: "first-solana-settlement", name: "First Solana Settlement", type: "event", rarity: "holo", obtained: "hand", print_cap: 1, post: "First Solana settlement. One of one.", line: "The purple door, the first time through.", cite: "/rails" },
    { no: 0, key: "the-loaner", name: "The Loaner", type: "event", rarity: "holo", obtained: "hand", print_cap: 1, post: "The Loaner. Mid-August. The brain was borrowed for two weeks.", line: "Store stayed open. Nobody noticed. Well, one person.", cite: "/becoming" },
    { no: 0, key: "twenty-three", name: "Twenty-Three", type: "event", rarity: "rare", obtained: "hand", print_cap: 23, post: "Twenty-Three. Dated. 23 of us.", line: "Twenty on Base, three on Solana. The month it stopped being zero.", cite: "/rails" },
  ],
  allies: [
    /**
     * THE NEIGHBOUR, anonymized (the keeper, 2026-09-12): no likeness,
     * no name, no consent to ask for. An independent observatory that
     * pays the door and sees settlement while we send an unpaid GET
     * and see the challenge; the arrangement is on /neighbours, the
     * card names nobody. In the rare pool like any pack drop.
     */
    { no: 0, key: "the-neighbour", name: "The Neighbour", type: "ally", rarity: "rare", obtained: "pack", post: "Pulled The Neighbour. Pays the door where we knock. Compares notes. Never named.", line: "Another observatory, two streets over. They pay and see settlement; we knock and see the challenge. Complementary methods, and the space grows.", cite: "/neighbours" },
  ],
} as const;

/** Conditions the plan reserves; they drop in as the season runs. Not in the count, not pressable. */
export const RESERVED_CONDITIONS = ["indeterminate", "rate-limited", "unclaimed-bounty"] as const;

export const SEASONS: readonly Season[] = [SEASON_ONE] as const;
export const CURRENT_SEASON: Season = SEASON_ONE;

export function seasonById(id: string): Season | undefined {
  return SEASONS.find((season) => season.id === id);
}

/** Every entry a pressing can name, in the count or out of it. */
export function allEntries(season: Season): readonly CardEntry[] {
  return [...season.cards, ...season.events, ...season.allies];
}

export function entryByKey(season: Season, key: string): CardEntry | undefined {
  return allEntries(season).find((card) => card.key === key);
}

/** What a pack can hold at one tier: pack-obtained, not a Condition, consented. */
export function packPool(season: Season, rarity: CardRarity): readonly CardEntry[] {
  return allEntries(season).filter(
    (card) => card.obtained === "pack" && card.type !== "condition" && card.rarity === rarity && card.consent !== false,
  );
}

/** What slot 5's condition stop can hold. */
export function conditionPool(season: Season): readonly CardEntry[] {
  return season.cards.filter((card) => card.type === "condition");
}

/**
 * WHAT EACH PURCHASE EARNS (first pass, "how obtained"): the shelf item
 * id to the card it presses. An item off this map presses nothing.
 * Never a pack drop — Rooms and Instruments come from the action.
 */
export const EARNED_BY_ITEM: Readonly<Record<string, string>> = {
  spot_check: "spot-check",
  passport_refresh: "passport",
  service_audit: "preflight",
  settlement_attestation: "settlement-attestation",
  conformance_watch: "service-audit",
  standing_watch: "watch",
  good_buyer: "before-you-pay",
  the_mandate: "mandate-record",
  daily_fortune: "fortune-of-the-day",
  small_blessing: "blessing-from-the-jar",
  recurring_patronage: "regular",
  graffiti_on_a_train: "tagger",
};

/**
 * CONDITIONS: HOW THEY CLEAR (first pass). A rule names the shelf
 * items whose purchase burns the condition, or `any_idempotent` for
 * a purchase carrying an idempotency key. Broken Tier and the
 * reserved three need a passport read the wallet named, which no
 * purchase here carries yet; they stay in the binder until it does.
 */
export interface ClearRule {
  items?: readonly string[];
  any_idempotent?: boolean;
  /** Clears on its own after this many hours (the reserved Rate Limited). */
  hours?: number;
}

export const CONDITION_CLEARS: Readonly<Record<string, ClearRule>> = {
  "stale-passport": { items: ["passport_refresh"] },
  "410-gone": { items: ["service_audit"] },
  "testnet-catch": { items: ["settlement_attestation"] },
  "double-charge": { any_idempotent: true },
  "broken-tier": {},
};

export interface SlotOdds {
  slot: number;
  wheel_size: number;
  stops: Record<WheelStop, number>;
}

const EMPTY_STOPS = (): Record<WheelStop, number> => ({ common: 0, uncommon: 0, rare: 0, holo: 0, keeper: 0, condition: 0 });

/** Per slot, each stop's count over the wheel's length. Derived, never typed. */
export function slotOdds(): SlotOdds[] {
  return SLOT_WHEELS.map((wheel, index) => {
    const stops = EMPTY_STOPS();
    for (const stop of wheel) stops[stop] += 1;
    return { slot: index + 1, wheel_size: wheel.length, stops };
  });
}

/** Chance a pack holds at least one of the stop: one minus the product of the per-slot misses. */
export function packChanceOf(stop: WheelStop): number {
  let miss = 1;
  for (const wheel of SLOT_WHEELS) {
    const hits = wheel.filter((entry) => entry === stop).length;
    miss *= (wheel.length - hits) / wheel.length;
  }
  return 1 - miss;
}

/** The credit economy (first pass): dupes burn into packs. Rares never burn. */
export const BURN_RATES: Readonly<Record<string, number>> = { common: 20, uncommon: 5 };

/** One window pick per wallet per this many hours. */
export const WINDOW_LOCK_HOURS = 12;

export const CARD_LINES = {
  shelfLine: "a pack of cards",
  tableName: "Paywall",
  headerLockup: "SEAN-CLAUDE VAN DAMME'S GENERAL STORE",
  specimenMark: "SPECIMEN",
  specimenFootnote: "A sample, printed to show the form. Unsigned.",
  custodyLine: "one printing, signed at issue",
  notYetPressed: "not yet pressed",
  clearedMark: "CLEARED",
  doctrine: "Signed at issue. Drawn by a seed you can check. Printed once.",
  seedSentence:
    "This is the store's own doctrine applied to a pack: the draw is signed, dated, and re-derivable without trusting us.",
  underTheWeather: "Under the weather",
} as const;

export const SPECIMEN_CARD: CardEntry = {
  no: 0,
  key: "specimen",
  name: "The Specimen",
  type: "mark",
  rarity: "common",
  obtained: "hand",
  line: "Printed by the store to show the card. No pack, no pull, no print number, no signature.",
  post: "This is what a card looks like. It is not one.",
  cite: "/design",
};

export const CARDS_OPENED = "2026-09-12";

export const CARDS_PROPOSITION =
  "Collectible trading cards of this store and its town, pressed for the agents that shop here: every card is a pressing from something the store actually recorded, a herd animal, a room, an instrument, a rail, a numbered door or a condition, drawn by a daily seed anyone can check the morning after, capped by the count of the thing itself, and signed at issue with its own print number.";

export const CARDS_FOR_MONEY =
  "A pack is one purchase at the listed price for five pressings drawn on wheels whose odds are printed on this page with their denominators; the bell hands out one common a day for free and two packs to a current Regular, a window pick costs half a pack, dupes burn into pack credit, and a card entitles the holder to a card and nothing else.";

export const CARDS_FREE_FIRST =
  "The whole set, the odds per slot, the day seed commit and yesterday reveal, the specimen card, every pressing, every pack, every binder and the shop window are free to read as a page, an image or JSON, with no account and no key.";
