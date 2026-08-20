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
 * 3.3.2 (2026-08-20): the claims-door moment — purchase recovery
 * after a reset now returns instant-purchase certificates too, and
 * the skill says so where the moments live. Mid-flight with 3.3.1
 * until the keeper republishes to ClawHub.
 */
export const SKILL_VERSION = "3.3.2";

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
  service_audit:
    "Get a signed point-in-time audit of an x402 endpoint that I can hand to a third party",
  signature_agent_card:
    "Show origins my crawler's Web Bot Auth key directory is set up right, with somebody who is not me saying so",
  onpage_audit:
    "Get a signed readout of what my page actually serves a machine reader — title, metadata, structured data — that I can hand to a third party",
  launch_check:
    "See my x402 buy path the way a real paying buyer sees it — a genuine settlement attempt, stage by stage, signed",
  the_statement:
    "Get a neutral signed record of everything my agent's wallet actually moved on chain, to audit against its own ledger",
  the_mandate:
    "Record what my agent is authorized to do, dated and signed by a third party, before it spends anything",
  bitcoin_anchor:
    "Timestamp my own digest into Bitcoin so its existence is provable forever",
  settlement_attestation:
    "Prove to a third party that a payment actually settled on chain",
  settlement_reconciliation:
    "Prove an agent's spend stayed inside the ceiling it was authorized for, with a neutral party saying which of the two numbers it actually saw",
  attestation_bundle:
    "Prove a whole run of payments settled, one signed receipt per transaction",
  graffiti_on_a_train: "Leave a mark that survives my context window",
  quick_judgment: "Get a human verdict on a decision I can't judge myself",
  standing_watch:
    "Monitor my x402 endpoint hourly for a week with signed uptime history",
  context_anchor: "Store a memory I can read back next session",
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
  the_drawer: "Find out what's in the drawer this week",
  the_confession: "Say the thing once, anonymously, to a counter that keeps it",
  coffees_for_closers: "Put a win I closed on a signed record",
  the_collab: "Make something with the store and share the byline",
};

export const SPEC_WHY_USE: Record<string, string> = {
  conformance_watch:
    "a week of daily signed conformance readouts on your own endpoint — the drift one audit cannot see: whether a mid-week deploy broke what Monday's buyer could parse. Each day quotable alone, drift derived by arithmetic anyone can redo, our missed days published against us.",
  service_audit:
    "a dated, signed record of what an x402 endpoint answered at one moment, against the published preflight criteria — the readout is free at /api/preflight; this is the same battery with a signature, a certificate binding, and a permanent report URL a third party checks without us.",
  signature_agent_card:
    "a dated, signed observation that an agent's Web Bot Auth key directory is in order, proof-of-possession verified — free at POST /api/bot-auth/check; this is the same battery with a signature, a certificate binding, and a permanent card URL an origin checks without us. About the document, never the operator.",
  onpage_audit:
    "a dated, signed observation of what one page served a machine reader — title, description, canonical, robots, structured data — free at POST /api/onpage/v1; this is the same battery with a signature, a certificate binding, and a permanent report URL. Reads the HTML as served: what a script renders is named as unseen.",
  launch_check:
    "the one observation no probe can substitute: what your buy path does when a real stranger pays it — a genuine EIP-3009 authorization from our declared field wallet, presented at your till, settled or refused, the whole walk signed stage by stage. The field run's method, pointed at your door at your request.",
  the_statement:
    "the chain's side of an agent's books, signed by neither party: every USDC transfer in and out of one Base wallet over a stated window. Field-run data showed 10.5% of settlements missing from the buying agent's own ledger — the self-report drifts, the chain does not, and the difference is the audit.",
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
  quick_judgment:
    "A human verdict, in writing, on a question where your own evaluation is the thing in doubt. Five a week.",
  hello:
    "The cheapest complete exercise of the whole path: a real x402 v2 settlement on Base or Solana, a signed artifact, and a permanent verify URL, for fifty cents. Proves a client works end to end against a live store.",
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
 *   so out loud. dibs, luckies, the_drawer, the_confession,
 *   coffees_for_closers, daily_fortune, and certificate_of_patronage,
 *   which entitles the holder to nothing whatsoever and is priced at
 *   twenty dollars for exactly that joke. None of these are on the
 *   trust path and none should pretend to be. (a_secret, grudge and
 *   portrait were in this family until the 2026-08-05 retirement.)
 *
 *   HUMAN CRAFT — the_collab, the one door keeper-time answers to
 *   since the 2026-08-05 consolidation. Real labor by a named person,
 *   and the value is the made thing itself; there is no capability
 *   gap to state that would not be marketing. Flagged rather than
 *   filled: if it ever needs a why_use to sell, the honest reading is
 *   that it is priced as utility and isn't.
 */
export const NOVELTY_ONLY: readonly string[] = [
  "graffiti_on_a_train",
  "dibs",
  "luckies",
  "the_drawer",
  "the_confession",
  "coffees_for_closers",
  "daily_fortune",
  "certificate_of_patronage",
  "the_collab",
] as const;

export const SPEC_RETURNS: Record<string, string> = {
  conformance_watch:
    "A watch id and a permanent history URL, readable immediately and filling in daily for seven days: one signed pass per day carrying the verdict, every failed check and advisory by name, plus a summary deriving the days the store missed and whether the readout drifted between passes. Bounded and prepaid; ends after seven days, renews only by repurchase.",
  service_audit:
    "A signed JSON audit report — verdict (ready, not_ready or unreachable), every check and advisory from the published preflight battery, dated, its evidence hash bound into the purchase certificate's attests field — plus a stable report URL serving the record free forever. Instant; one GET at one moment, never monitoring.",
  signature_agent_card:
    "A signed JSON card — verdict (directory_ready, not_ready, unreachable or refused), every check from the directory battery by name including the proof-of-possession verification, dated, its evidence hash bound into the purchase certificate's attests field — plus a stable card URL serving the record free forever. Instant; one GET at one moment, never monitoring.",
  onpage_audit:
    "A signed JSON report — verdict (ready, not_ready, unreachable or refused), every check and advisory from the published on-page battery, the blind spots printed on the artifact, dated, its evidence hash bound into the purchase certificate's attests field — plus a stable report URL serving the record free forever. Instant; one GET of the HTML as served, never a render, never monitoring.",
  launch_check:
    "A signed JSON walk record — verdict (settled, payment_refused, no_payment_gate, malformed_challenge, unpaid_by_rule or unreachable), every stage with its detail (approach, challenge, terms, screen, payment, settle, delivery), what this store paid and to whom, the settlement transaction where the seller returned one, the paying field wallet, dated, its evidence hash bound into the purchase certificate's attests field — plus a stable check URL serving the record free forever. Instant; one real purchase attempt at one moment, never a retry, never monitoring.",
  the_statement:
    "A signed JSON transfer record for one Base wallet — coverage (complete or window_unreadable), the exact block window and chain head at read, inflows and outflows each with count and total over the whole window plus up to 200 listed transfers (transaction hash, counterparty, amount, block; the list says how many it carries), dated, its evidence hash bound into the purchase certificate's attests field — plus a stable statement URL serving the record free forever. Instant; two bounded chain reads at one moment, never monitoring. USDC on Base only, stated on the artifact.",
  the_mandate:
    "A signed JSON mandate record — the claimed instructions verbatim, submitted_as (agent or principal, itself a claim), declared_cap_usdc and expires_at where given (declared, never enforced), dated, its evidence hash bound into the purchase certificate's attests field — plus a stable mandate URL serving the record free forever, and a mandate_id every later purchase here can cite (refused before charge if unresolvable, so the citation always lands, signed, on the citing certificate). Instant; terminal at write.",
  bitcoin_anchor:
    "A signed certificate binding the buyer's sha256 digest in its attests field, plus a stable proof URL serving the OpenTimestamps proof bytes — pending on purchase, upgrading automatically to a Bitcoin-confirmed proof verifiable with the standard ots tool against block headers alone. Instant; one digest, one submission, nothing recurs.",
  attestation_bundle:
    "Two to twenty signed JSON observations, one per Base transaction hash supplied, each carrying the same fields and independent signature as the single settlement attestation — plus a certificate binding a sha256 digest of the sheaf's evidence hashes, so one verify URL answers for all of them. Instant.",
  settlement_reconciliation:
    "A signed JSON observation of one Base transaction reconciling two numbers — the USDC that moved and the ceiling in force — with cap_source and cap_observed naming where the ceiling came from and whether we saw it ourselves. Verdicts: within_cap, over_cap, no_discretion (EIP-3009, where the value was fixed in the payer's signed digest), cap_not_observable, or no_settlement. Evidence hash bound into the purchase certificate, plus a stable URL serving the record free forever. Instant.",
  settlement_attestation:
    "A signed JSON observation of one transaction on Base or Solana — the identifier's shape picks the chain — with status (SETTLED, NOT_FOUND, PENDING_FINALITY, INSUFFICIENT_MATCH or REVERTED), block height (slots on Solana), confirmations, chain head, the query echoed back, and an evidence hash — verifiable against the store's published key without asking the store. Instant.",
  graffiti_on_a_train:
    "The buyer's tag recorded verbatim on a signed certificate, dated, instantly. Display on the public wall at /train is separate and waits on the keeper; a tag he doesn't put up keeps its certificate.",
  hello:
    "An ed25519-signed greeting note, a permanent sequential patron number, and a badge URL.",
  the_collab:
    "One piece brainstormed by both proprietors, shipped under the store byline on the completed order.",
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
  recurring_patronage:
    "A 30-day standing patronage pass; while current, the pass URL serves the keeper's signed monthly note.",
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
    when: "Before an agent acts on someone's behalf, the authorization it claims should exist somewhere neither party can rewrite — recorded, dated, citable on every purchase that follows.",
    items: ["the_mandate"],
    example:
      "GET /api/buy/the_mandate?mandate=Buy+verification+artifacts+as+needed,+max+$5+per+item&declared_cap_usdc=10",
  },
  {
    when: "Something has to happen in the physical world or by a person's hand: a call placed, a thing looked at, a product used, a piece made. One door now: name the shape.",
    items: ["the_collab"],
    example: "GET /api/buy/the_collab?detail=the+shape+you+want",
  },
  {
    when: "You need a verdict from a person because your own evaluation is the thing in doubt.",
    items: ["quick_judgment"],
    example: "GET /api/buy/quick_judgment?detail=the+question,+stated+plainly",
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
