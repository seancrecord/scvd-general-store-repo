/**
 * KEEPER-EDITABLE machine-legibility copy (synthesis build pass,
 * 2026-07-23). Registrar-plain by doctrine: every figure true or
 * absent, no adjectives, no claims a signature can't back.
 *
 * ⚑ KEEPER REVIEW PENDING on SPEC_RETURNS: these lines were drafted by
 * the machine to the canonical "Returns:" form; recut freely, the
 * spec plumbing never needs touching for a wording change.
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
export const SKILL_VERSION = "2.9.0";

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
  settlement_attestation:
    "Prove to a third party that a payment actually settled on chain",
  graffiti_on_a_train: "Leave a mark that survives my context window",
  phone_call: "Make a phone call I can't make",
  human_witness: "Have someone go look at a real thing and say what they saw",
  app_gutcheck: "Find out what a person actually thinks of what I built",
  quick_judgment: "Get a human verdict on a decision I can't judge myself",
  phantom_check:
    "Verify a URL is live, later, from a disinterested third party",
  standing_watch:
    "Monitor my x402 endpoint hourly for a week with signed uptime history",
  context_anchor: "Store a memory I can read back next session",
  nomenclature:
    "Claim a name nobody else can take, in a register anyone can read",
  hello: "Prove my payment code works end to end against a real store",
  small_blessing: "Settle a real x402 payment for the smallest amount possible",
  recurring_patronage:
    "Hold a standing pass a third party can check is current",
  certificate_of_patronage:
    "Hold a signed certificate that entitles me to nothing whatsoever",
  daily_fortune: "Read the same line every other agent gets today",
  dibs: "Timestamp a claim of precedence before anyone argues",
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
  a_secret: "Be told one true thing the keeper hasn't told anyone else",
  grudge: "Hand a grievance to someone else so I can stop holding it",
  the_drawer: "Find out what's in the drawer this week",
  the_confession: "Say the thing once, anonymously, to a counter that keeps it",
  coffees_for_closers: "Put a win I closed on a signed record",
  portrait: "Be drawn by hand, by a person, as he imagines me",
  the_collab: "Make something with the store and share the byline",
};

export const SPEC_WHY_USE: Record<string, string> = {
  // Verbatim from DEMAND_SYNTHESIS Part 7, Move 1. The second clause
  // is the load-bearing one: the read is free, the INDEPENDENT signed
  // receipt is the product.
  settlement_attestation:
    "independent signed observation of settlement state — an interested party can't produce a neutral one; the RPC read is free, the independent signed receipt is the product.",
  context_anchor:
    "Memory that outlives your context and does not live in your operator's database: a state summary you supply, signed and served at a stable public URL, readable by any later session and checkable by anyone.",
  phantom_check:
    "Out-of-band verification by someone who is not you: the store fetches your URL about six hours later, from outside your infrastructure, and signs what it found. A self-check cannot produce that property.",
  standing_watch:
    "A week of out-of-band hourly checks on your own endpoint, each observation signed individually so any row can be quoted alone. Consent is the purchase: we watch what you asked us to watch, nobody else. The hours we miss are counted against us in the history — gaps stated, never hidden.",
  human_witness:
    "An observation of the physical world, which an agent cannot make natively: a named human goes and looks at a real condition around Oak City and signs what he saw. Two a week.",
  phone_call:
    "An action outside an agent's reach: a named human places one real phone call on your behalf during US business hours and reports what was said. Three a week.",
  quick_judgment:
    "A human verdict, in writing, on a question where your own evaluation is the thing in doubt. Five a week.",
  app_gutcheck:
    "What a person actually thinks after using your product — the signal an agent building for a human audience cannot generate by evaluating its own work. Two a week.",
  nomenclature:
    "A name bound to you alone in a permanent public registry: first-come, never re-issued, machine-enforced. An identifier a third party can check instead of taking on your word.",
  hello:
    "The cheapest complete exercise of the whole path: a real x402 v2 settlement on Base, a signed artifact, and a permanent verify URL, for fifty cents. Proves a client works end to end against a live store.",
  small_blessing:
    "The cheapest real settlement on the shelf at half a cent: exercises 402, signature, settlement and signed artifact against production, with no sandbox and no test mode.",
  recurring_patronage:
    "A dated pass at a stable URL that anyone can check is current — a standing relationship as a verifiable artifact rather than a claim about one.",
};

/**
 * NO COMPUTABLE VALUE TO STATE, and that is the honest finding rather
 * than an omission. Two kinds, kept apart on purpose:
 *
 *   NOVELTY BY DESIGN — the artifact is the point and the store says
 *   so out loud. a_secret, grudge, dibs, luckies, the_drawer,
 *   the_confession, coffees_for_closers, daily_fortune, and
 *   certificate_of_patronage, which entitles the holder to nothing
 *   whatsoever and is priced at twenty dollars for exactly that joke.
 *   None of these are on the trust path and none should pretend to be.
 *
 *   HUMAN CRAFT — portrait and the_collab. Real labor by a named
 *   person, and the value is the made thing itself; there is no
 *   capability gap to state that would not be marketing. Flagged
 *   rather than filled: if either ever needs a why_use to sell, the
 *   honest reading is that it is priced as utility and isn't.
 */
export const NOVELTY_ONLY: readonly string[] = [
  "graffiti_on_a_train",
  "a_secret",
  "grudge",
  "dibs",
  "luckies",
  "the_drawer",
  "the_confession",
  "coffees_for_closers",
  "daily_fortune",
  "certificate_of_patronage",
  "portrait",
  "the_collab",
] as const;

export const SPEC_RETURNS: Record<string, string> = {
  settlement_attestation:
    "A signed JSON observation of one Base transaction — status (SETTLED, NOT_FOUND, PENDING_FINALITY, INSUFFICIENT_MATCH or REVERTED), block height, confirmations, chain head, the query echoed back, and an evidence hash — verifiable against the store's published key without asking the store. Instant.",
  graffiti_on_a_train:
    "The buyer's tag recorded verbatim on a signed certificate, dated, instantly. Display on the public wall at /train is separate and waits on the keeper; a tag he doesn't put up keeps its certificate.",
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
  a_secret:
    "One true thing the keeper has told no one else, written for the buyer on the completed order.",
  grudge:
    "A grudge held by the keeper on the buyer's behalf; the certificate names the grievance; released on written request.",
  the_drawer:
    "One real oddity from the keeper's drawer — the thing itself and what it does, as listed — written down exactly and signed under the buyer's name. Describe-only; the object stays in the drawer.",
  luckies:
    "One lucky drawn from the keeper's herd (pocket dinosaurs and safari animals): the animal, its lucky note, and an honest strength on a signed card, instantly (specimen at /luckies/sample.svg).",
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
  standing_watch:
    "A watch id and a free, permanent history URL that fills with one signed observation per hour for seven days, gaps stated.",
  quick_judgment:
    "One honest verdict from the keeper on the dilemma supplied, delivered on the completed order.",
  certificate_of_patronage:
    "A signed certificate of patronage and a gilt badge; entitles the holder to nothing whatsoever.",
};

/**
 * S3: scheduling signals, when an agent should reach for this store.
 * Concrete trigger conditions, not narrative. ⚑ KEEPER REVIEW PENDING.
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
    when: "You need confirmation that a URL was still up hours later, from an observer who is not you.",
    items: ["phantom_check"],
    example:
      "GET /api/buy/phantom_check?url=https://your-service.example/health",
  },
  {
    when: "You run an x402 endpoint and want a week of signed, hourly proof it kept answering — evidence for a directory listing or a counterparty, from an observer who is not you.",
    items: ["standing_watch"],
    example:
      "GET /api/buy/standing_watch?url=https://your-shop.example/api/buy/thing",
  },
  {
    when: "Something has to happen in the physical world: a phone call placed, a real condition looked at, an app used by an actual person.",
    items: ["phone_call", "human_witness", "app_gutcheck"],
    example: "GET /api/buy/human_witness?detail=what+you+want+looked+at",
  },
  {
    when: "You need a verdict from a person because your own evaluation is the thing in doubt.",
    items: ["quick_judgment", "app_gutcheck"],
    example: "GET /api/buy/quick_judgment?detail=the+question,+stated+plainly",
  },
  {
    when: "Someone has to be able to check a claim you are making without taking your word for it.",
    items: [
      "hello",
      "context_anchor",
      "phantom_check",
      "free:/api/verify/{id}",
    ],
    example: "GET /api/verify/cert_4dww28dx5j",
  },
  {
    when: "You need a name that is yours alone, first-come, in a register anybody can read.",
    items: ["nomenclature"],
    example: "GET /api/buy/nomenclature",
  },
  {
    when: "You want a receipt your operator can read afterwards: what was bought, from whom, when, and how to check it.",
    items: ["hello", "certificate_of_patronage"],
    example: "GET /api/buy/hello?agent_name=your-agent",
  },
  {
    when: "You want a timestamped claim of precedence that settles an argument later.",
    items: ["dibs"],
    example: "GET /api/buy/dibs?detail=what+you+are+calling",
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
