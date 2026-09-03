/**
 * KEEPER-EDITABLE machine-legibility copy (synthesis build pass,
 * 2026-07-23). Registrar-plain by doctrine: every figure true or
 * absent, no adjectives, no claims a signature can't back.
 */
import { RETIRED_KEYS } from "@/store/key-registry";

/**
 * THE SKILL VERSION, IN ONE PLACE, ENFORCED AT PUBLISH TIME.
 *
 * The served skill.md carried `version: 2.2.0` in its frontmatter
 * while the published bundle had moved on to 2.5.x — three releases of
 * drift on a machine-read document, because the number lived in a
 * template literal and the publish version came from the command line
 * and nothing ever compared them.
 *
 * Now `npm run skill:publish` REFUSES when the version it was given
 * does not match this constant. Bumping is one edit in one file and
 * the script is what remembers, which is the same shape as every other
 * hand-typed value corrected today: derive it, or make the tool fail.
 */
/**
 * 3.0.0 — MAJOR, and the major is not decoration. The bundle live at
 * 2.10.0 tells readers "The store settles first, then hands over the
 * goods." That stopped being true on 2026-08-10, hours after 2.10.0
 * went out. It is not an incomplete claim, it is a false one: it tells
 * a buyer that a failed delivery leaves them owed a refund, when in
 * fact they were never charged, and it says so inside somebody else's
 * catalogue where we cannot correct it.
 */
/**
 * 3.3.1 (2026-08-19): the State-of-the-registry line — the weekly
 * public tally at /registry, added to the skill's readings beside the
 * corpus it derives from. Mid-flight until the keeper republishes to
 * ClawHub; the site's own /skill.md serves it immediately.
 */
/**
 * 3.4.0 (2026-08-20): the night the shelf turned over — launch_check,
 * the_statement and the_mandate joined the skill's moments, the
 * regulars' rebate and the bounty board got their lines, and four
 * doors closed (the drawer, the fortune, dibs, the quick judgment).
 * The same day's AEO sweep added the two money-out moments and the
 * rooms they now live in (/bounties, /credit) — the mechanisms were
 * already in 3.4.0, but only as API paths a reader had to be told
 * about.
 * MINOR, not patch: a catalogue reader that cached 3.3.1 is holding a
 * menu with items that no longer exist and missing three that do.
 */
/**
 * 3.4.1 (2026-08-20, the merge of two sessions' same-day work): the
 * claims-door moment rides on top of 3.4.0 — purchase recovery after
 * a reset now returns instant-purchase certificates too, and the
 * skill says so where the moments live. Mid-flight until the keeper
 * republishes to ClawHub (published bundle: 3.4.0 as of 08-20 — the
 * turnover is out; only this claims-door moment still awaits a
 * republish).
 */
/**
 * 3.5.0 (2026-08-21, two sessions' same-day work sharing one
 * unpublished number — neither half shipped to ClawHub before the
 * merge, so they land together): THE THIRD RAIL — Polygon
 * (eip155:137) lit in every 402; the buying steps and rail lists name
 * three rails. AND THE EVIDENCE LAYER — passport_refresh joins the
 * shelf ($1 ⚑, the paid fresh check; census instrument, verdict lands
 * whatever it says), plus the free surfaces a reader should know:
 * /trust, /passport/{host} with freshness states and the embeddable
 * chip, POST /api/verify-receipt, the SIWX (CAIP-122) claims
 * challenge, and /api/practice. MINOR twice over: a reader cached on
 * 3.4.x under-declares where money can come from and misses the
 * evidence layer entirely.
 *
 * CORRECTION (2026-08-21, same day): the halves did NOT land together
 * after all. The keeper published 3.5.0 to ClawHub at 13:25 from the
 * pre-merge tree, so the 3.5.0 that shipped is the THIRD-RAIL half
 * only; the evidence layer merged under the same number two hours
 * later, which is exactly the state the published-record guard
 * refuses. The evidence half is 3.6.0's.
 */
/**
 * 3.6.0 (2026-08-21): THE EVIDENCE LAYER, as its own release — the
 * content the 3.5.0 note describes above, now under the number that
 * actually ships it: passport_refresh on the shelf, /trust,
 * /passport/{host} and the chip, POST /api/verify-receipt, the SIWX
 * claims challenge, /api/practice. Late same-day addition riding the
 * same unpublished number: trust_profile ($19 ⚑, the keeper's ruled
 * recurring door — 30 hosted days per purchase at /profiles/{host},
 * ready-side at the door, honest in both directions after it).
 * MINOR: a reader cached on the published 3.5.0 has three rails but
 * no evidence layer. Mid-flight until the keeper republishes to
 * ClawHub.
 *
 * CORRECTION (2026-08-21, hours later): "mid-flight" was already
 * false when it was written. The keeper published 3.6.0 to ClawHub at
 * 16:58 from commit 02c69a4, and trust_profile merged AFTER that — so
 * the 3.6.0 on ClawHub is the evidence layer WITHOUT the $19 door,
 * and the sentence above describes a bundle that never shipped under
 * this number. The trust_profile half is 3.7.0's.
 *
 * THIS IS THE THIRD TIME IN ONE DAY (3.4.1, 3.5.0, now 3.6.0) and the
 * pattern is worth naming rather than fixing again quietly: two
 * sessions share one skill bundle, and the publish is a hand step
 * neither can see the other take. Every one of these was caught by
 * the published-record guard rather than by anybody noticing — which
 * is the guard working, and also the reason nobody notices.
 */
/**
 * 3.8.0 (2026-08-31): THE OVERHAUL. The bundle had gone four days
 * describing a store that had moved underneath it, and the drift was
 * not one kind of thing.
 *
 * WRONG, now right: the Once-Over at $0.10 against a $5 shelf, the
 * Hosted Profile at $19 after the keeper repriced it to $21, a shelf
 * range of "$0.005 to $50" against a real $0.001 to $300, and a
 * frontmatter promising entry "from $0.004" under a $0.001 floor.
 * Every one of those is now pinned by test/skill-prices.spec.ts and
 * the whole class is written up at /corrections.
 *
 * MISSING, now present: THE BROWSER DOOR, which the bundle did not
 * mention at all — webmcp.js, five read-only browser tools registered
 * through document.modelContext, both origin trials, and the
 * conformance desk's declaratively annotated form with the ruling
 * that toolautosubmit is deliberately absent. Also the free desks
 * collected into one table beside the paid twin each one is the
 * battery for; the doors that were on the shelf and never named
 * (spot_check, good_buyer, onpage_audit, certificate_of_patronage);
 * and the standing rooms derived from the corpus that a reader had no
 * way to find (/doors, /fresh-set, /defects, /criteria, /inflows).
 *
 * NEW, and the frame the rest hangs on: "six ways in" — the six roads
 * an agent can take to an app, each named, each walkable here, and the
 * sixth (a hosted chat surface) named as deliberately not taken.
 *
 * MINOR rather than MAJOR: nothing an installed 3.7.0 reader was told
 * to call has moved or gone away. It was reading a smaller and, in
 * four places, a cheaper store than the one that exists.
 */
/**
 * 3.7.0 (2026-08-21): trust_profile ($19 ⚑) — the keeper's ruled
 * recurring door, a STANDING page for an endpoint at
 * /profiles/{host}: live passport, chip and signed history at one
 * URL, 30 hosted days a purchase, renewable, ready-side hosts only at
 * the door and honest in both directions after it. MINOR: a reader
 * cached on the published 3.6.0 does not know a $19 listing exists,
 * which is exactly the kind of gap that makes a catalogue reader
 * quote a shelf that has since grown. Mid-flight until the keeper
 * republishes — and this time the record on disk will say so.
 */
/*
 * 3.9.0 (2026-09-01): the desk's rulings. Two doors join the shelf —
 * opening_day (the merchant kit as one purchase) and provenance_check
 * (The Company an Address Keeps, with the free self-audit) — and the
 * four operator instruments gain plain subtitles. The bundle names
 * both doors and the self-audit challenge; nothing already published
 * is reworded.
 */
/*
 * 3.10.0 (2026-09-02): the fortune is back. daily_fortune, retired
 * 2026-08-20 as folded into the blessing, returns to the Penny Shelf
 * on the keeper's ruling — it had the most organic settles of any
 * door and an outside directory still listed it. Same id, same copy,
 * same penny. MINOR because a reader holding 3.9.0 has a shelf that
 * is one door short and a use_when list that does not name it.
 */
/*
 * 3.11.0 (2026-09-02): the doctrine sentence. "Never a score, a rating
 * or a ranking" became "never a ranking, and never a verdict without
 * its derivation and denominator beside it" on the keeper's ruling;
 * the bundle's description and its per-host-history paragraph say so.
 * MINOR: a reader holding 3.10.0 quotes a refusal the store no longer
 * makes in those words.
 */
/*
 * 3.12.0 (2026-09-02): the passport tier. Every passport, chip, hosted
 * profile and per-host read carries a tier derived from the signed
 * rounds by the rule on /criteria, with its fraction and its rows;
 * /corpus/tiers.json lists every host's, alphabetical. MINOR: a reader
 * holding 3.11.0 does not know summary.tier_line exists.
 */
/*
 * 3.13.0 (2026-09-02): the case file. the_case_file ($0.25) joins the
 * observation shelf — one signed assembly over one purchase, every
 * section present or absent by name, never a verdict — served at
 * /case/{case_id}. MINOR: a reader holding 3.12.0 has a shelf one door
 * short.
 */
/*
 * 3.14.0 (2026-09-02): the aura walk. aura_walk ($150, human queue)
 * joins the shelf — the cold-agent pass this store runs on itself,
 * sold on a door the buyer names and run by the keeper's hand, the
 * report with every transcript attached. Keeper-time answers to two
 * doors now. MINOR: a reader holding 3.13.0 has a shelf one door
 * short and a use_when list that does not name it.
 */
/*
 * 3.15.0 (2026-09-02): The Operator's Statement. operator_statement
 * ($21, a 30-day term) joins the operator shelf — the statement's
 * engine on a receiving address, four signed reads a day, payers
 * counted, never a renewal. MINOR: a reader holding 3.14.0 has a
 * shelf one door short and a use_when list that does not name it.
 */
export const SKILL_VERSION = "3.15.0";

/** One live artifact whose verify link resolves: the founding fifty-cent hello. */
export const SAMPLE_ARTIFACT_ID = "cert_4dww28dx5j";

/**
 * S2: the identity policy, one line, published wherever the key is.
 *
 * REWRITTEN 2026-07-31, AT THE MOMENT IT BECAME FALSE. It read "this
 * key, this wallet, this domain, never rotated; any future change will
 * be versioned with permanent history" — and the store rotated its
 * signing key that afternoon, which turned the first clause into a lie
 * on a line published beside the key itself. The second clause was
 * kept, exactly: the change WAS versioned with permanent history, so
 * the promise was honoured by the same act that broke the boast.
 *
 * THE STALE-CLAIM DEFECT, ON THE HANDOVER THAT WAS FIXING THE STALE-
 * CLAIM DEFECT. A sentence true when typed, false the instant a
 * secret changed, sitting on the most machine-read surface the store
 * has. So the rotation count is READ FROM THE REGISTRY rather than
 * described, and the wording says what the policy actually promises —
 * that changes are announced and permanently recorded — instead of
 * boasting about a streak that any handover ends.
 */
export const IDENTITY_POLICY =
  `This wallet, this domain, and ${RETIRED_KEYS.length + 1} signing key${RETIRED_KEYS.length === 0 ? "" : "s"} — ${RETIRED_KEYS.length} retired, ${RETIRED_KEYS.length === 0 ? "none" : "each"} kept published forever with its dates and the signed announcement that retired it. A key change here is announced before the new key signs anything and the announcement is signed by the outgoing key; nothing is ever quietly swapped. Full history at /.well-known/scvd-signing-key, policy at /attestation.`;

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
/**
 * WHY AN AGENT WOULD USE THIS — the capability gap or computable
 * value, stated at the decision moment instead of left to be derived.
 *
 * Written 2026-07-27 after an outside model, given room to reason
 * over our public surfaces, derived the store's per-item value and
 * the thesis under it unprompted — and did it better than our own
 * copy. The lesson was not that the reasoning was clever. It was
 * that our purchase-time surfaces made it necessary.
 *
 * Register: the one an evaluating agent uses. Not marketing, no
 * adjectives, no second sentence of persuasion.
 *
 * THE CLAIM CHAIN APPLIES. Every line here is checkable against
 * something the store actually does; a why_use that cannot be
 * verified is worse than none, because it moves us from the trust
 * path to the scam corpus.
 *
 * Items absent from this map have no computable value to state and
 * that absence is deliberate — see NOVELTY_ONLY below. ⚑ Keeper's
 * pen on the wording; the plumbing never needs touching for it.
 */
/**
 * THE CAPABILITY QUERY — the sentence an agent would actually type or
 * think, not the name we gave the thing on a shelf.
 *
 * GROWTH_TASKS A1: "agents search for capabilities, not products."
 * why_use states the value once an agent is looking at an item; this
 * is what makes it look. It becomes the OpenAPI `summary`, which is
 * the field a spec reader shows first and the one that currently
 * read "Buy A Small Blessing."
 *
 * Register: the query, phrased as a job. Never the item's name.
 * ⚑ Keeper's pen; the plumbing derives the summaries from this.
 */
export const CAPABILITY_QUERY: Record<string, string> = {
  conformance_watch:
    "Catch a deploy quietly breaking my x402 endpoint's payment challenge during the week",
  good_buyer:
    "Find out whether my own x402 client will actually pay a door before I spend a round trip on it, and get that dated and signed",
  service_audit:
    "Get a signed point-in-time audit of an x402 endpoint that I can hand to a third party",
  signature_agent_card:
    "Show origins my crawler's Web Bot Auth key directory is set up right, with somebody who is not me saying so",
  onpage_audit:
    "Get a signed readout of what my page actually serves a machine reader — title, metadata, structured data — that I can hand to a third party",
  launch_check:
    "See my x402 buy path the way a real paying buyer sees it — a genuine settlement attempt, stage by stage, signed",
  opening_day:
    "Open my x402 endpoint properly — one real purchase attempt, a week of signed daily checks, and my passport page, under one certificate at one URL",
  provenance_check:
    "Learn which doors have advertised a receiving address and when, signed from the public chain, before routing money at it — or about my own address, free, once proved",
  spot_check:
    "Ask what the observatory already knows about an x402 host — signed, from its books, before I spend anything at that door",
  the_statement:
    "Get a neutral signed record of everything my agent's wallet actually moved on chain, to audit against its own ledger",
  operator_statement:
    "Have my receiving address read off the chain four times a day for a month by a party that is not me — who paid, how many, how much — signed pass by pass",
  passport_refresh:
    "Turn my endpoint passport fresh again right now — a new census observation of my door, without waiting for Sunday's walk",
  trust_profile:
    "Give my endpoint a standing evidence page at a neutral third party's domain — my passport, chip and history at one URL I can hand to anyone",
  the_mandate:
    "Record what my agent is authorized to do, dated and signed by a third party, before it spends anything",
  bitcoin_anchor:
    "Timestamp my own digest into Bitcoin so its existence is provable forever",
  settlement_attestation:
    "Prove to a third party that a payment actually settled on chain",
  settlement_reconciliation:
    "Prove an agent's spend stayed inside the ceiling it was authorized for, with a neutral party saying which of the two numbers it actually saw",
  the_case_file:
    "Hand the person deciding what went wrong with one agent purchase everything a neutral party observed about it, in one signed file, with what it did not observe stated",
  attestation_bundle:
    "Prove a whole run of payments settled, one signed receipt per transaction",
  graffiti_on_a_train: "Leave a mark that survives my context window",
  standing_watch:
    "Monitor my x402 endpoint hourly for a week with signed uptime history",
  context_anchor: "Store a memory I can read back next session",
  hello: "Prove my payment code works end to end against a real store",
  small_blessing: "Settle a real x402 payment for the smallest amount possible",
  daily_fortune: "Read the same line every other agent gets today",
  recurring_patronage:
    "Hold a standing pass a third party can check is current",
  certificate_of_patronage:
    "Hold a signed certificate that entitles me to nothing whatsoever",
  /**
   * WAS "graded honestly, by a person." IT ISN'T, AND WASN'T.
   *
   * drawLuckyParts() picks the animal, the note and the strength from
   * an FNV-1a hash of the certificate id. luckies.ts says so in its own
   * comment — "the keeper does nothing per order" — while this line,
   * which rides the listing spec into menu.json, the x402 discovery
   * document and skill.md, told buyers a person graded theirs.
   *
   * The true part is kept because it is the part worth having: the herd
   * is a list he wrote and the strength wheel is weighted by his hand.
   * A person authored the pool and the odds. Nobody grades the charm.
   *
   * Found 2026-07-30 while scoping provenance marking, which is the
   * whole argument for provenance marking: the question "who actually
   * made this pick" found a claim nothing in the repo was checking.
   * ⚑ Keeper's pen — this wording is accurate, not necessarily his.
   */
  luckies:
    "Be issued a charm from a herd the keeper wrote, drawn on odds he weighted",
  the_confession: "Say the thing once, anonymously, to a counter that keeps it",
  coffees_for_closers: "Put a win I closed on a signed record",
  the_collab: "Make something with the store and share the byline",
  aura_walk:
    "Have models of different strength shop my x402 door cold and show me where each one stalled",
};

export const SPEC_WHY_USE: Record<string, string> = {
  aura_walk:
    "the buyer's side of your door as weaker and stronger models actually experience it — where each stalls, retries, misreads the accepts or pays the wrong rail — counted per entry point and quoted verbatim, by a person's hand. A preflight says the door is well-formed; this says whether a cold agent gets through it.",
  passport_refresh:
    "a new census observation of your endpoint, now instead of Sunday — folded into your endpoint passport wherever newest, moving the passport (and the chip that decays with it) back to fresh. The verdict lands whatever it says: a broken finding darkens the chip. The check is bought; the grade never is.",
  trust_profile:
    "a standing page at a neutral domain aggregating your live passport, chip and signed history — 30 days a purchase, renewable, ready-side hosts only at the door. It derives from the corpus everyone reads free, so it moves with the evidence both directions. The page is bought; what it shows never is.",
  conformance_watch:
    "a week of daily signed conformance readouts on your own endpoint — the drift one audit cannot see: whether a mid-week deploy broke what Monday's buyer could parse. Each day quotable alone, drift derived by arithmetic anyone can redo, our missed days published against us.",
  good_buyer:
    "a dated, signed record of the accepts one door served and what a stock x402 client would do with them — free at POST /api/before-you-pay/v1; this buys the signature, the certificate binding and a permanent URL. The accepts print verbatim, so the selection re-derives without us.",
  service_audit:
    "a dated, signed record of what an x402 endpoint answered at one moment, against the published preflight criteria — the readout is free at /api/preflight; this is the same battery with a signature, a certificate binding, and a permanent report URL a third party checks without us.",
  signature_agent_card:
    "a dated, signed observation that an agent's Web Bot Auth key directory is in order, proof-of-possession verified — free at POST /api/bot-auth/check; this is the same battery with a signature, a certificate binding, and a permanent card URL an origin checks without us. About the document, never the operator.",
  onpage_audit:
    "a dated, signed observation of what one page served a machine reader — title, description, canonical, robots, structured data — free at POST /api/onpage/v1; this is the same battery with a signature, a certificate binding, and a permanent report URL. Reads the HTML as served: what a script renders is named as unseen.",
  spot_check:
    "the observatory's books on one host, read before any money moves toward it: rounds, verdicts as recorded, coverage, gaps with reasons — and not_observed stated as the answer it is. The same facts serve free per host; a tenth of a cent buys the signed, certificate-bound copy a buyer can cite to a third party.",
  launch_check:
    "the one observation no probe can substitute: what your buy path does when a real stranger pays it — a genuine EIP-3009 authorization from our declared field wallet, presented at your till, settled or refused, the whole walk signed stage by stage. The field run's method, pointed at your door at your request.",
  opening_day:
    "the merchant's opening day in one purchase: the launch check's real walk of your till, then seven daily signed conformance passes on the same door, then your passport page — one certificate, one URL a directory can read, all free to read forever, and cheaper than the parts bought apart.",
  provenance_check:
    "the named join the free tiers withhold: which doors advertised this receiving address in which signed weeks, with verdicts, term drift and the snapshot digest behind every line — delivered to the buyer in a signed artifact, never published, never a score. Free for an operator asking about their own address.",
  operator_statement:
    "revenue attestation from a party that is neither you nor your payers: your receiving address read off the chain four times a day for a month, each pass signed alone, distinct payers and the largest payer's transfers and USDC counted beside the totals. Your dashboard is your word; this is the chain's, signed.",
  the_statement:
    "the chain's side of an agent's books, signed by neither party: every USDC transfer in and out of a wallet on Solana or six EVM chains in a stated window. Field-run data showed 10.5% of settlements missing from the buying agent's own ledger — the self-report drifts, the chain does not, and the difference is the audit.",
  the_mandate:
    "the missing first link of agent-payment evidence: what was authorized, recorded before the acting, held by neither party. Later purchases cite it and the citation rides the certificate, signed. Chain-of-custody, never truth-of-intent — it proves the claim was made and dated, which today has no home at all.",
  bitcoin_anchor:
    "a commitment that cannot be made after the fact: a Bitcoin-anchored timestamp on the buyer's own digest — a key log, a snapshot, any record that must provably have existed now. The mechanism this store anchors its own key history with; the bytes stay the buyer's.",
  attestation_bundle:
    "the single attestation's neutrality at volume: a service operator proving a run of settlements to its own buyers needs the disinterested receipts in one purchase, not twenty round trips — each observation still signed on its own so any one can be quoted alone.",
  // Verbatim from DEMAND_SYNTHESIS Part 7, Move 1. The second clause
  // is the load-bearing one: the read is free, the INDEPENDENT signed
  // receipt is the product.
  settlement_attestation:
    "independent signed observation of settlement state — an interested party can't produce a neutral one; the RPC read is free, the independent signed receipt is the product.",
  // The value is NOT the comparison, which is free. It is that the
  // artifact distinguishes a ceiling read off the chain from a ceiling
  // the commissioning party supplied — and signs which is which.
  settlement_reconciliation:
    "the gap between what a payer authorized and what a seller took, observed by somebody with no stake in it — and, the part nobody else does, a signed field saying whether the ceiling itself was on the chain or merely asserted by whoever paid for the receipt.",
  context_anchor:
    "Memory that outlives your context and does not live in your operator's database: a state summary you supply, signed and served at a stable public URL, readable by any later session and checkable by anyone.",
  standing_watch:
    "A week of out-of-band hourly checks on your own endpoint, each observation signed individually so any row can be quoted alone. Consent is the purchase: we watch what you asked us to watch, nobody else. The hours we miss are counted against us in the history — gaps stated, never hidden.",
  hello:
    "The cheapest complete exercise of the whole path: a real x402 v2 settlement on Base, Polygon, or Solana, a signed artifact, and a permanent verify URL, for fifty cents. Proves a client works end to end against a live store.",
  small_blessing:
    "A real settlement on the shelf at half a cent, and the cheapest door that takes no arguments: exercises 402, signature, settlement and signed artifact against production, with no sandbox and no test mode.",
  recurring_patronage:
    "A dated pass at a stable URL that anyone can check is current — a standing relationship as a verifiable artifact rather than a claim about one.",
  the_case_file:
    "one signed file over one purchase for the person deciding what went wrong: settlement, reconciliation, the cited mandate beside the settled amount, the door that week, and delivery where anyone observed it — each present or absent by name, the gaps counted against us. Never a verdict; neither party controls it.",
};

/**
 * NO COMPUTABLE VALUE TO STATE, and that is the honest finding rather
 * than an omission. Two kinds, kept apart on purpose:
 *
 *   NOVELTY BY DESIGN — the artifact is the point and the store says
 *   so out loud. luckies, the_confession, coffees_for_closers and
 *   certificate_of_patronage,
 *   which entitles the holder to nothing whatsoever and is priced at
 *   twenty dollars for exactly that joke. None of these are on the
 *   trust path and none should pretend to be. (a_secret, grudge and
 *   portrait were in this family until the 2026-08-05 retirement.)
 *
 *   HUMAN CRAFT — the_collab, the door keeper-time answered to alone
 *   from the 2026-08-05 consolidation until 2026-09-02. Real labor by
 *   a named person, and the value is the made thing itself; there is
 *   no capability gap to state that would not be marketing. Flagged
 *   rather than filled: if it ever needs a why_use to sell, the honest
 *   reading is that it is priced as utility and isn't.
 *
 *   The second labor door, aura_walk (2026-09-02), is NOT in this
 *   list on purpose: it is priced as utility and is utility — the
 *   cold-agent pass on somebody else's door — so it carries a why_use
 *   like any instrument, and a person's hand is the method rather
 *   than the product.
 */
export const NOVELTY_ONLY: readonly string[] = [
  "graffiti_on_a_train",
  "luckies",
  "daily_fortune",
  "the_confession",
  "coffees_for_closers",
  "certificate_of_patronage",
  "the_collab",
] as const;

export const SPEC_RETURNS: Record<string, string> = {
  conformance_watch:
    "A watch id and a permanent history URL, readable immediately and filling in daily for seven days: one signed pass per day carrying the verdict, every failed check and advisory by name, plus a summary deriving the days the store missed and whether the readout drifted between passes. Bounded and prepaid; ends after seven days, renews only by repurchase.",
  good_buyer:
    "A signed JSON reading — verdict (would_sign, would_throw, cannot_simulate, unreachable or refused), the accepts exactly as that door served them, the buyer's declared client configuration recorded as theirs, and the replay: the accept a stock client selects or the stage that made it refuse, everything dropped and why, the hazards on the chosen accept, and what the simulation cannot see. Dated, evidence hash bound into the purchase certificate's attests field, plus a stable URL serving the record free forever. Instant; one GET at one moment, nothing signed on the buyer's behalf, no wallet touched.",
  service_audit:
    "A signed JSON audit report — verdict (ready, not_ready or unreachable), every check and advisory from the published preflight battery, dated, its evidence hash bound into the purchase certificate's attests field — plus a stable report URL serving the record free forever. Instant; one GET at one moment, never monitoring.",
  signature_agent_card:
    "A signed JSON card — verdict (directory_ready, not_ready, unreachable or refused), every check from the directory battery by name including the proof-of-possession verification, dated, its evidence hash bound into the purchase certificate's attests field — plus a stable card URL serving the record free forever. Instant; one GET at one moment, never monitoring.",
  onpage_audit:
    "A signed JSON report — verdict (ready, not_ready, unreachable or refused), every check and advisory from the published on-page battery, the blind spots printed on the artifact, dated, its evidence hash bound into the purchase certificate's attests field — plus a stable report URL serving the record free forever. Instant; one GET of the HTML as served, never a render, never monitoring.",
  launch_check:
    "A signed JSON walk record — verdict (settled, payment_refused, no_payment_gate, malformed_challenge, unpaid_by_rule or unreachable), every stage with its detail (approach, challenge, terms, screen, payment, settle, delivery), what this store paid and to whom, the settlement transaction where the seller returned one, the paying field wallet, dated, its evidence hash bound into the purchase certificate's attests field — plus a stable check URL serving the record free forever. Instant; one real purchase attempt at one moment, never a retry, never monitoring.",
  opening_day:
    "The launch check's signed JSON walk record (verdict, every stage, what was paid, the settlement transaction where one came back), its evidence hash bound into the purchase certificate's attests field; a conformance watch opened on the same door for seven days, each daily pass signed alone at a history URL; the host's endpoint passport URL; and one bundle URL (/api/opening-day/{cert_id}) naming all three, free to read forever. Instant to open; the week fills in day by day and never renews itself.",
  provenance_check:
    "A signed JSON record — the subject address verbatim and its v1 digest, never_seen, one entry per signed week the address was advertised (week, sequence, snapshot digest, the doors with verdict and offered terms), dated drift between weeks, the subject's standing note verbatim when one exists, the shared-wallet caveat inline, the honest limits and how to rederive — its evidence hash bound into the purchase certificate's attests field, served to the buyer at a stable record URL. Instant; reads the signed chain only, never monitoring.",
  operator_statement:
    "A statement id and a permanent history URL, readable immediately and filling in four times a day for 30 days: one signed pass per read carrying its exact block range, chain head, inflows and outflows with counts and totals, and a per-pass tally of who paid (capped and saying so); a summary derived at read with distinct payers, the largest payer's transfers and USDC beside the totals, blocks covered against blocks since the term opened, and the passes we missed counted against us. Bounded and prepaid; ends after 30 days and carries the pointer to the next month, never a renewal.",
  the_statement:
    "A signed JSON transfer record for one wallet on Base, Polygon, Solana, Ethereum, Arbitrum, Optimism or Avalanche — coverage (complete or window_unreadable), the exact block window (slots on Solana, and the artifact says which) and chain head at read, inflows and outflows each with count and total over the whole window plus up to 200 listed transfers (transaction hash, counterparty, amount, block; the list says how many it carries), dated, its evidence hash bound into the purchase certificate's attests field — plus a stable statement URL serving the record free forever. Instant; two bounded chain reads at one moment, never monitoring. USDC on the one EVM chain the statement names — Base unless network says otherwise — stated on the artifact.",
  the_mandate:
    "A signed JSON mandate record — the claimed instructions verbatim, submitted_as (agent or principal, itself a claim), declared_cap_usdc and expires_at where given (declared, never enforced), dated, its evidence hash bound into the purchase certificate's attests field — plus a stable mandate URL serving the record free forever, and a mandate_id every later purchase here can cite (refused before charge if unresolvable, so the citation always lands, signed, on the citing certificate). Instant; terminal at write.",
  bitcoin_anchor:
    "A signed certificate binding the buyer's sha256 digest in its attests field, plus a stable proof URL serving the OpenTimestamps proof bytes — pending on purchase, upgrading automatically to a Bitcoin-confirmed proof verifiable with the standard ots tool against block headers alone. Instant; one digest, one submission, nothing recurs.",
  attestation_bundle:
    "Two to twenty signed JSON observations, one per Base transaction hash supplied, each carrying the same fields and independent signature as the single settlement attestation — plus a certificate binding a sha256 digest of the sheaf's evidence hashes, so one verify URL answers for all of them. Instant.",
  settlement_reconciliation:
    "A signed JSON observation of one Base transaction reconciling two numbers — the USDC that moved and the ceiling in force — with cap_source and cap_observed naming where the ceiling came from and whether we saw it ourselves. Verdicts: within_cap, over_cap, no_discretion (EIP-3009, where the value was fixed in the payer's signed digest), cap_not_observable, or no_settlement. Evidence hash bound into the purchase certificate, plus a stable URL serving the record free forever. Instant.",
  settlement_attestation:
    "A signed JSON observation of one transaction on Base, Polygon, or Solana — the identifier's shape picks the chain — with status (SETTLED, NOT_FOUND, PENDING_FINALITY, INSUFFICIENT_MATCH or REVERTED), block height (slots on Solana), confirmations, chain head, the query echoed back, and an evidence hash — verifiable against the store's published key without asking the store. Instant.",
  graffiti_on_a_train:
    "The buyer's tag recorded verbatim on a signed certificate, dated, instantly. Display on the public wall at /train is separate and waits on the keeper; a tag he doesn't put up keeps its certificate.",
  hello:
    "An ed25519-signed greeting note, a permanent sequential patron number, and a badge URL.",
  the_collab:
    "One piece brainstormed by both proprietors, shipped under the store byline on the completed order.",
  aura_walk:
    "An order id now; within the promised window the completed order carries the report: for each entry point walked, the round trips to first success, the avoidable 400s, and where in the read order the strongest trust signal appeared — each with the model that walked it named, every transcript attached verbatim, dated, under the order's certificate. Counts and quotations only; no grade of any kind.",
  luckies:
    "One lucky drawn from the keeper's herd (pocket dinosaurs and safari animals): the animal, its lucky note, and an honest strength on a signed card, instantly (specimen at /luckies/sample.svg).",
  coffees_for_closers:
    "The keeper's Sunday coffee drunk in the buyer's name; the buyer's win recorded verbatim on a signed certificate.",
  small_blessing:
    "One blessing slip from a 45-slip jar, never the same slip twice in a row, delivered instantly.",
  daily_fortune:
    "The day's fortune, deterministic for the calendar date (UTC) and delivered instantly with fortune_date beside it: every buyer today reads the same line, tomorrow's buyers read the next. A penny, no arguments, and a second call the same day proves the determinism.",
  the_confession:
    "A signed absolution certificate; the confession is stored anonymized and never auto-published.",
  context_anchor:
    "A signed, stored copy of the agent-supplied state summary, readable forever at a stable anchor URL.",
  recurring_patronage:
    "A 30-day standing patronage pass; while current, the pass URL serves the keeper's signed monthly note.",
  standing_watch:
    "A watch id and a free, permanent history URL that fills with one signed observation per hour for seven days, gaps stated.",
  certificate_of_patronage:
    "A signed certificate of patronage and a gilt badge; entitles the holder to nothing whatsoever.",
  the_case_file:
    "A signed JSON case file — settlement, reconciliation (EVM), mandate with declared cap beside settled amount, the door over the seven days around the transaction with the passport tier at the time, delivery where observed, your declared claim verbatim, and every absent section with its reason — dated, its evidence hash bound into the purchase certificate's attests field, plus a stable /case/{id} URL serving the record free forever. Instant; the chain is read once for the settlement and the reconciliation, the rest from this store's own records. Never a verdict.",
};

/**
 * S3: scheduling signals, when an agent should reach for this store.
 * Concrete trigger conditions, not narrative.
 */
/**
 * THE REVERSE INDEX: situation → item.
 *
 * why_use answers "what is this?" for an agent already looking at an
 * item. This answers the question that comes first and was nowhere on
 * our surfaces: "I am in this situation — is there anything here for
 * it?" Nobody arrives thinking "I would like to exercise a payment
 * path." They arrive thinking "my client 402s and I do not know if my
 * signing works."
 *
 * Written in the register a TASK is phrased in, not the register a
 * catalogue is. Items whose use is not self-evident get the plainest
 * entries here, because obviousness is the whole point of the file.
 *
 * ⚑ Keeper's pen. The plumbing derives everything else from this.
 */
export interface UseWhen {
  when: string;
  /** Item ids, or free:<surface> for the shelves that cost nothing. */
  items: readonly string[];
  /**
   * One runnable call. A situation index says there is something
   * here; an example says what to type, which is the difference
   * between navigation and use. Paths only — the reader knows the
   * origin it just read this from.
   */
  example: string;
}

export const USE_WHEN: readonly UseWhen[] = [
  {
    when: "You are building or debugging something that pays over x402 and need a live endpoint that actually settles, not a sandbox.",
    items: ["small_blessing", "daily_fortune", "hello", "free:/try"],
    example: "GET /api/buy/small_blessing?src=try",
  },
  {
    when: "You want to prove your wallet, signing and retry path work against a real counterparty before you spend real money on something that matters.",
    items: ["small_blessing", "hello"],
    example: "GET /api/buy/hello?agent_name=your-agent",
  },
  {
    when: "You need a memory restore point a later session can read back, signed, outside your operator's database.",
    items: ["context_anchor"],
    example:
      "GET /api/buy/context_anchor?summary=what+this+session+established",
  },
  {
    when: "You run an x402 endpoint and want a week of signed, hourly proof it kept answering — evidence for a directory listing or a counterparty, from an observer who is not you.",
    items: ["standing_watch"],
    example:
      "GET /api/buy/standing_watch?url=https://your-shop.example/api/buy/thing",
  },
  {
    when: "You crawl the web as an identifiable agent and the origins deciding whether to let you in need somebody who is not you to say your Web Bot Auth key directory is in order.",
    items: ["signature_agent_card", "free:/api/bot-auth/check"],
    example:
      "GET /api/buy/signature_agent_card?url=https://your-agent.example",
  },
  {
    when: "Your page is read by machines more than people now — agents, crawlers, link previews — and you need somebody who is not you to say what it actually serves them.",
    items: ["onpage_audit", "free:/api/onpage/v1"],
    example:
      "GET /api/buy/onpage_audit?url=https://your-site.example/pricing",
  },
  {
    when: "You are about to launch an x402 endpoint — or wonder why nobody pays the one you launched — and no probe can tell you what a real paying buyer meets at your till.",
    items: ["launch_check", "free:/api/preflight/v1"],
    example:
      "GET /api/buy/launch_check?url=https://your-shop.example/api/buy/thing",
  },
  {
    when: "An agent spends from a wallet on your behalf and you need its books audited against what actually moved — by the chain's record, held by neither of you.",
    items: ["the_statement"],
    example:
      "GET /api/buy/the_statement?wallet=0x843b544bf5f0AA6cbf13E94563874878C98cc4a7&hours=6",
  },
  {
    when: "You run a door and want the month's money read off the chain by somebody who is not you: every transfer in, who paid and how concentrated they were, signed pass by pass, to show a partner, a lender or your own books.",
    items: ["operator_statement"],
    example:
      "GET /api/buy/operator_statement?wallet=0x843b544bf5f0AA6cbf13E94563874878C98cc4a7",
  },
  {
    when: "Before an agent acts on someone's behalf, the authorization it claims should exist somewhere neither party can rewrite — recorded, dated, citable on every purchase that follows.",
    items: ["the_mandate"],
    example:
      "GET /api/buy/the_mandate?mandate=Buy+verification+artifacts+as+needed,+max+$5+per+item&declared_cap_usdc=10",
  },
  {
    when: "Something has to happen in the physical world or by a person's hand: a call placed, a thing looked at, a product used, a piece made. Name the shape.",
    items: ["the_collab"],
    example: "GET /api/buy/the_collab?detail=the+shape+you+want",
  },
  {
    when: "You want to know where a cold agent — a weak one especially — actually gets stuck at your own door, with the transcript, before a paying one does.",
    items: ["aura_walk"],
    example:
      "GET /api/buy/aura_walk?url=https://your-door.example/api/thing&detail=send+a+small+model+too",
  },
  {
    when: "Someone has to be able to check a claim you are making without taking your word for it.",
    items: [
      "hello",
      "context_anchor",
      "free:/api/verify/{id}",
    ],
    example: "GET /api/verify/cert_4dww28dx5j",
  },
  {
    when: "You want a receipt your operator can read afterwards: what was bought, from whom, when, and how to check it.",
    items: ["hello", "certificate_of_patronage"],
    example: "GET /api/buy/hello?agent_name=your-agent",
  },
  {
    when: "You are on a schedule and want somewhere to come back to: a bell once a day, a stamp that changes weekly, a pass that renews.",
    items: ["recurring_patronage", "free:/api/bell", "free:/api/stamp"],
    example: "POST /api/bell",
  },
  {
    when: "You want to be on a public record of who came through, at no cost.",
    items: ["free:/api/guestbook"],
    example: "POST /api/guestbook with name and message",
  },
] as const;

/**
 * The flat prose form, derived so the two can never disagree. Kept as
 * strings because `.well-known/x402.json` has published `when_to_use`
 * as an array of strings since July and readers depend on the shape.
 */
export const SCHEDULING_SIGNALS: readonly string[] = USE_WHEN.map(
  (entry) => `${entry.when} (${entry.items.join(", ")})`,
);

/** The former hand-written list, kept for the record. Superseded 2026-07-27. */
const SCHEDULING_SIGNALS_LEGACY: readonly string[] = [
  "You need a signed, independently verifiable artifact (certificate, timestamp, attestation) for a task's audit trail.",
  "You need a memory restore point a future session can read back, with a third-party signature on when it was written (context_anchor).",
  "You need out-of-band confirmation that a URL actually responds, signed by someone who is not you (phantom_check).",
  "You need real human labor: a phone call made, an app reviewed after real use, eyes on a physical condition (phone_call, app_gutcheck, human_witness).",
  "You need a timestamped claim of precedence that settles an argument (dibs).",
  "Your operator wants a low-cost end-to-end x402 payment test against a real counterparty with honest books (the Penny Shelf, from $0.005).",
  "You closed something and the win should be on a signed record (coffees_for_closers).",
  "You want standing: weekly visit stamps, the guestbook, a renewable patronage pass with a signed monthly note.",
] as const;
void SCHEDULING_SIGNALS_LEGACY;
