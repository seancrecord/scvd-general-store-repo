/**
 * Shared types for Sean-Claude Van Damme's General Store.
 * Every KV record shape and the Worker environment live here.
 */
import type { MakerMark } from "@/store/provenance";

export interface Env {
  ORDERS: KVNamespace;
  /**
   * The observer control beacon (3.4/B6): a stable, off-store URL the
   * probes read when a target fails, to tell our outage from theirs.
   * Optional — unprovisioned, failed probes book as the subject's
   * with observer_status "unchecked".
   */
  CONTROL_BEACON_URL?: string;
  /**
   * GLAMA'S OWNERSHIP CLAIM TOKEN, for the HTTP challenge on the
   * connector listing. Optional and flag-gating: unset,
   * /.well-known/glama.json 404s exactly as it did before this
   * existed, because a claim document with nothing to claim is a
   * document that fails its own check.
   *
   * PUBLIC BY DESIGN, held as a secret anyway. The token is meant to
   * be served at a public URL — that is the whole mechanism — so
   * keeping it out of the repo buys no confidentiality. It buys the
   * ability to set it without a code change, and it keeps a value
   * bound to a person's Glama account out of git history, where
   * rotating it would leave the old one readable forever.
   *
   * Set with: wrangler secret put GLAMA_CLAIM
   */
  GLAMA_CLAIM?: string;
  GUESTBOOK: KVNamespace;
  COUNTERS: KVNamespace;
  PATRONS: KVNamespace;
  /**
   * The corpus's object store (2026-08-19, the R2 graduation the
   * corpus named for itself on day one). OPTIONAL on purpose: absent,
   * every write falls back to KV exactly as before, so a missing
   * binding degrades to the old behaviour instead of taking the
   * chain down.
   */
  CORPUS_R2?: R2Bucket;
  /** Base wallet that receives USDC. Secret. */
  PAY_TO_ADDRESS: string;
  /**
   * Solana wallet that receives USDC on the second rail (base58
   * pubkey). Optional and FLAG-GATING: unset, no 402 offers Solana
   * and the store behaves exactly as before the rail existed. A
   * PUBLIC value carried in wrangler.jsonc vars deliberately — it is
   * printed in the runbook and on-chain the moment anyone pays it,
   * and a repo-owned var survives every deploy, unlike the
   * dash-added text var that git builds silently wiped for an
   * afternoon (wrangler deploy replaces plaintext vars wholesale).
   */
  SOLANA_PAY_TO?: string;
  /**
   * The third rail's flag (2026-08-20): set to an 0x address to light
   * USDC-on-Polygon in every 402; unset, the rail does not exist.
   * Deliberately separate from PAY_TO_ADDRESS — lighting a rail is
   * the keeper's decision, never an inference.
   */
  POLYGON_PAY_TO?: string;
  /** Coinbase Developer Platform facilitator credentials. Secrets. */
  CDP_API_KEY_ID: string;
  CDP_API_KEY_SECRET: string;
  /** ed25519 private key seed, 64 hex characters. Secret. */
  SIGNING_KEY: string;
  /**
   * Web Bot Auth egress key: a SECOND ed25519 seed (64 hex, same
   * generator as SIGNING_KEY), used only to sign the requests the
   * store makes as itself (RFC 9421) and to publish the matching
   * directory at /.well-known/http-message-signatures-directory.
   * Optional and FLAG-GATING: unset, egress is exactly as unsigned
   * as it was before 2026-08-11 and the directory answers 404.
   * Deliberately not SIGNING_KEY — the artifact key has a handover
   * protocol and a published history; this one should be rotatable
   * without ceremony.
   */
  WBA_SIGNING_KEY?: string;
  /**
   * The FIELD WALLET's secp256k1 private key (hex) — the buyer-side
   * wallet the Launch Check pays from, declared at /house-ledger.json
   * before it ever walks. Optional and FLAG-GATING: unset, the
   * launch_check door refuses new purchases before any money moves.
   * DELIBERATELY NOT the till: PAY_TO_ADDRESS receives, this spends,
   * and the spend is capped in code (services/launch-check.ts).
   */
  FIELD_WALLET_KEY?: string;
  /**
   * Chainalysis screening API key — an OPTIONAL OVERRIDE, kept for
   * the day an operator holds one (the open signup has closed). The
   * DEFAULT screen needs no secret at all: the Chainalysis on-chain
   * sanctions oracle on Base, read over BASE_RPC_URL like the
   * settlement attestation (services/launch-check.ts). Rule 3 still
   * fails closed on any screen that does not answer.
   */
  SANCTIONS_API_KEY?: string;
  /**
   * Base JSON-RPC endpoint for the settlement attestation. Optional:
   * falls back to the public endpoint, which is fine at this volume
   * and swappable the day it isn't.
   */
  BASE_RPC_URL?: string;
  /**
   * AN AUTHENTICATED BASE ENDPOINT, as a SECRET because the token
   * lives in the URL. Tried first; BASE_RPC_URL is the fallback.
   *
   * The public endpoint rate-limits, and four items read the chain
   * after money has settled and before goods go out — a 429 there was
   * money taken with nothing delivered, repeatedly, through August
   * 2026. Two independent providers is the fix that does not depend
   * on either of them behaving.
   *
   * Never logged, never put in an error message, never on an
   * artifact: see redactRpc in lib/base-rpc.
   */
  BASE_RPC_URL_PRIMARY?: string;
  /**
   * Second authenticated Base endpoint, a different provider than the
   * primary — a blown quota is a per-key outage, and the public
   * fallback shares the Worker egress every other tenant is
   * rate-limited on. Tried after the primary, before the public one.
   */
  BASE_RPC_URL_SECONDARY?: string;
  /**
   * Polygon JSON-RPC endpoints, same three-slot posture as Base:
   * PRIMARY and SECONDARY are authenticated secrets (token in the
   * URL, never logged — redactRpc applies), POLYGON_RPC_URL is a
   * configured public one. All optional: the reader falls back to
   * keyless public endpoints, fine at this volume.
   */
  POLYGON_RPC_URL?: string;
  POLYGON_RPC_URL_PRIMARY?: string;
  POLYGON_RPC_URL_SECONDARY?: string;
  /**
   * Solana JSON-RPC endpoint for the second rail's bank
   * reconciliation. Optional: falls back to the public mainnet
   * endpoint, fine at this volume, swappable the day it isn't.
   */
  SOLANA_RPC_URL?: string;
  /** Basic Auth password for the keeper's back room. Secret. */
  ADMIN_PASSWORD: string;
  /** Public base URL, e.g. https://scvd.store */
  STORE_BASE_URL: string;
  /**
   * IndexNow key (2026-09-02). Served at /{key}.txt (the root: a key
 * only vouches for its own directory and below, 2026-09-03) so Bing,
   * and through Bing's index ChatGPT search, can verify the pings
   * scripts/indexnow-ping.mjs sends after a deploy. Optional: unset,
   * the route is a 404 and the script says so and exits clean.
   */
  INDEXNOW_KEY?: string;
  /** House-traffic flag secret (X-House header / house query param). Optional. */
  HOUSE_SECRET?: string;
  /** Comma-separated house wallet addresses beyond the founding burner. Optional. */
  HOUSE_WALLETS?: string;
  /** P1 alert email plumbing (Resend). Optional; alerts degrade to logs. */
  RESEND_API_KEY?: string;
  ALERT_EMAIL?: string;
}

/**
 * Where a request came from, per the 90-day falsification instrument.
 * infrastructure = known crawlers/scanners: the noise floor made
 * visible, separate from organic AND house.
 */
export type Channel =
  | "mcp"
  | "bazaar"
  | "skill"
  | "webmcp"
  | "direct"
  | "infrastructure"
  | "unknown";

/** Set by the payment gate once money has actually settled. */
export interface SettledPaymentVariables {
  /**
   * Set only ONCE THE MONEY HAS MOVED. Under rule 9 as amended
   * 2026-08-10 that is no longer true by the time a handler starts, so
   * a handler must not gate on this — use `pending` to know it is a
   * paid request and `pending.settle()` to make it one.
   */
  payment?: import("@/lib/payments").SettledPayment;
  /**
   * The buyer's verified authorization, not yet presented. Its
   * presence is what says "this request is paid for"; calling its
   * `settle()` is what takes the money. See PendingPayment.
   */
  pending?: import("@/lib/payments").PendingPayment;
}

export type HonoEnv = {
  Bindings: Env;
  Variables: SettledPaymentVariables;
};

export type ItemPricing = "fixed" | "pay_what_it_deserves";

/**
 * One payment for one thing ("one_off"), or one payment for a stated
 * stretch of time ("term"). There is deliberately no third value: a
 * recurring charge would need a mechanism this store does not have.
 */
export type ItemCadence = "one_off" | "term";
export type ItemFulfillment = "instant" | "human_queue";

/**
 * WHAT A SHELF ITEM ACTUALLY READS TO PRODUCE THE GOODS.
 *
 * Added 2026-08-30 for rule 57.5, which asks every surface to say
 * what it holds and what it never holds. That answer was published
 * nowhere per item, and the first attempt DERIVED it from the input
 * schema — "takes a url, therefore fetches it" — which was wrong on
 * its first run: spot_check takes a host and explicitly does not
 * knock on it, reading the books at the counter instead. A guessed
 * safety claim is worse than an absent one, so this is a stated fact
 * with a required field, not a heuristic.
 *
 * ESTABLISHED BY THE IMPORT GRAPH, and re-runnable: a shelf item's
 * fulfillment service that imports @/lib/probe-target fetches a
 * subject the buyer named; one that imports @/lib/base-rpc or
 * @/lib/solana-rpc reads public chain state; one that imports neither
 * reaches nothing outside this store. The method is written down so
 * the next person can check the answers rather than trust them.
 */
export type ItemReads =
  /** One unauthenticated GET to an endpoint the buyer named. */
  | "subject_fetch"
  /** A real purchase attempt against the buyer's endpoint, from the field wallet. */
  | "subject_purchase"
  /** Public chain state for an identifier the buyer gave. */
  | "chain_read"
  /** Only what this store already recorded. No outbound request. */
  | "our_books"
  /** Made here from the buyer's own input. Nothing is read at all. */
  | "made_here";

export interface MenuItem {
  id: string;
  name: string;
  /**
   * THE UTILITARIAN PAIR (roadmap S4, the keeper's ink 2026-09-01).
   * The name is the store's voice; the subtitle is the search term —
   * what the item does, in the buyer's words, beside the name on
   * every shelf surface. Only the operator-facing instruments carry
   * one; a lucky does not need explaining.
   */
  subtitle?: string;
  /** Minimum (or fixed) price in USDC. */
  price_usdc: number;
  pricing: ItemPricing;
  /**
   * WHAT A BUYER IS COMMITTING TO, STATED RATHER THAN IMPLIED (house
   * rule 57.3, adopted 2026-08-29 on the keeper's words: "it should
   * be clear if it's free or paid and if so how much at what
   * frequency and if recurring or one off").
   *
   * The shelf answered "how much" everywhere and "for how long"
   * nowhere structured. Four items sell a TERM — seven days of
   * watching, thirty days of standing — and every one of them said so
   * only inside its own prose description. A buying agent reading
   * menu.json saw a price and no duration, and the only way to learn
   * that $5 bought a week rather than a look was to parse English.
   *
   * REQUIRED, WITH NO DEFAULT, deliberately: a new item cannot be
   * added without answering this, because the failure this closes is
   * exactly the silent one. TypeScript refuses the omission.
   *
   * AND THE THIRD ANSWER IS ONE WE CAN GIVE FLATLY: nothing here
   * recurs. There is no subscription, no stored mandate that charges
   * again, no card on file — a term item simply expires and has to be
   * bought again by a buyer who decides to. `SHELF_NEVER_AUTO_RENEWS`
   * says so on the surfaces, and it is a fact about the architecture
   * rather than a promise about our intentions: this store has no
   * mechanism that could charge a second time.
   */
  cadence: ItemCadence;
  /**
   * REQUIRED, so nothing can be listed without saying what it reads.
   * Rule 57.5's answer, and the one field on a listing whose wrongness
   * would be a safety claim rather than an untidiness.
   */
  reads: ItemReads;
  /**
   * How many days one purchase of a term item covers. Required when
   * cadence is "term" (held by test/shelf-cadence.spec.ts, since the
   * type system cannot express the dependency without reshaping every
   * item literal), and absent otherwise.
   */
  term_days?: number;
  fulfillment: ItemFulfillment;
  /** Delivery promise for human_queue items, in hours. */
  sla_hours?: number;
  /** Weekly stock for scarce items. Absent = unlimited. */
  weekly_inventory?: number;
  /** Whether a waitlist opens when inventory hits zero. */
  waitlist?: boolean;
  description: string;
  /** The line an agent sees on the 402 challenge. */
  note_402: string;
  constraints?: string[];
  /**
   * Relative path to a sample of the deliverable's art (e.g. the
   * luckies specimen card). The catalog serves it absolute.
   */
  sample_url?: string;
  /**
   * Class 1, stocked: units are keeper-made ahead of orders; purchases
   * take the oldest and complete themselves; an empty shelf sells out
   * honestly instead of queueing work. No keeper present required.
   */
  stocked?: boolean;
  /**
   * ISO week the item first went on the shelf. Purchases during this
   * week carry the shelf witness mark, catalog history, recorded as
   * it happens. Every new item must state its listing week.
   */
  listed_week: string;
}

/**
 * THE STATES AN ORDER IS EVER IN, as a value rather than only a type
 * (2026-08-27).
 *
 * The union was type-only, so the OpenAPI contract had no way to
 * enumerate it and a caller polling an order had to discover the
 * states by observing them. Declared here as the array the type is
 * derived FROM, so the contract and the code cannot name different
 * sets — the enum in the spec is this array, not a copy of it.
 */
export const ORDER_STATUSES = ["queued", "completed"] as const;

/**
 * The states that end the job. A poller that does not know which
 * states are terminal either stops early or never stops.
 */
export const TERMINAL_ORDER_STATUSES = ["completed"] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export interface OrderRecord {
  order_id: string;
  item_id: string;
  item_name: string;
  status: OrderStatus;
  created_at: string;
  sla_hours: number;
  paid_usdc: number;
  tip_usdc: number;
  payer?: string;
  agent_name?: string;
  callback_url?: string;
  /**
   * What happened to the completion webhook the buyer asked for
   * (2026-08-20). One attempt, best-effort, never blocking — but a
   * miss used to be INVISIBLE: fetch does not throw on a 500, so a
   * dead callback lost the notice with no record anywhere that it was
   * ever owed. Our missed passes go in the book; this is that line.
   */
  webhook?: string;
  patron_number: number;
  cert_id: string;
  deliverable?: string;
  completed_at?: string;
  /** Keeper saw it; stops the 24h SLA-guard page. */
  acknowledged_at?: string;
  /** Buyer-supplied task detail (e.g. the quick_judgment question). Untrusted text. */
  detail?: string;
  /** The door a labor order is about (aura_walk's url), validated before the gate. */
  target_url?: string;
  /** Declared discovery channel (source query param). Untrusted text. */
  source?: string;
  /** Request metadata captured at purchase, for the monthly ledger review. */
  user_agent?: string;
  referrer?: string;
}

export interface Certificate {
  cert_id: string;
  item: string;
  patron_number: number;
  name?: string;
  date: string;
  tip_usdc?: number;
  /** Shelf witness mark: set at mint during an item's first listed week. */
  note?: string;
  /**
   * coffees_for_closers: the buyer's win, recorded verbatim.
   * Agent-written untrusted data, same label pattern as anchor summaries.
   */
  win?: string;
  /**
   * graffiti_on_a_train: the buyer's tag, recorded verbatim.
   * Agent-written untrusted data, same label pattern as anchor
   * summaries — stored exactly as it arrived, never interpreted.
   */
  tag?: string;
  /** Total settled in USDC. See CertificatePayment above. */
  paid_usdc?: number;
  asset?: string;
  network?: string;
  payer?: string;
  settlement_tx?: string;
  /**
   * settlement_attestation: the observation's evidence hash, bound
   * into the certificate so the existing /api/verify answers for the
   * attestation too rather than a second endpoint being built.
   */
  attests?: string;
  /**
   * THE BUYER'S WHY, added 2026-08-19 (the receipt chain). Any item,
   * optional: what the agent said this purchase was for, recorded
   * verbatim and signed — the same untrusted-text discipline as win
   * and tag, stored exactly as it arrived, never interpreted. What
   * the signature proves is stated at /attestation: that the buyer's
   * agent SAID this was the purpose, on this date — not that it was
   * true, and not that a human authorized it. That honest limit is
   * the field's value: even the agent's own claim of intent had no
   * dated, signed, third-party existence before this.
   */
  purpose?: string;
  /**
   * The store's word on the receipt, added 2026-08-19: one short
   * keeper-authored line, rotating by week like the open signs, never
   * generated per-order and never composed from buyer data. Charm,
   * labeled as charm — it proves nothing, and /attestation will not
   * pretend otherwise. Distinct from `note`, which stays the shelf
   * witness mark.
   */
  from_the_store?: string;
  /**
   * THE MANDATE LINK, added 2026-08-19 (the receipt chain's reserved
   * field, built). Any item, optional: the id of a mandate this store
   * already holds — the buy door RESOLVES it before charging, so a
   * certificate's mandate link never dangles. Signed, because an
   * unsigned authorization claim could be stapled onto anyone's
   * receipt. What it proves: that the buyer cited this mandate at
   * purchase time, and that the mandate's record predates the
   * purchase — never that the mandate's instructions were real or
   * honored; the mandate's own scope says whose claim those are.
   */
  mandate_id?: string;
  /**
   * The maker's mark: who chose or made this, for the shelves where a
   * buyer could not otherwise tell. "keeper" a person did it for you,
   * "house" a person authored the pool and a machine drew from it,
   * "machine" no human anywhere. See src/store/provenance.ts for which
   * shelves carry one and why the rest deliberately do not.
   *
   * SIGNED, like every other field here. A maker's mark that could be
   * altered without breaking the signature would be worse than none —
   * it is a provenance claim, which is the one class of field where
   * "displayed but not covered" is indistinguishable from a forgery.
   */
  made_by?: MakerMark;
  /**
   * CROSS-PLATFORM RECEIPT RECOGNITION (CORRESPONDENCE T4/T15). A
   * pointer from this certificate to a counterpart artifact issued by
   * a DIFFERENT operator for the same real event.
   *
   * SIGNED, and that is a deliberate departure from the spec as
   * relayed, which proposed this as "additive, doesn't touch the
   * signing pipeline." It has to touch it. A cross-reference is a
   * provenance claim about a THIRD PARTY, which makes it the strongest
   * possible case of the rule `made_by` already taught this file:
   * displayed-but-unsigned is indistinguishable from a forgery. An
   * unsigned cross_ref would let anyone append "zooid.fund co-signed
   * this" to a copy of our certificate and have our signature still
   * verify over it — our credibility lent to a claim we never made.
   * The compile guard below CERT_FIELDS makes this automatic rather
   * than remembered.
   */
  cross_ref?: CrossReference[];
  /**
   * THE CATALOG SURFACE THE BUYER SELECTED, hashed at mint.
   * SHA-256 (hex) of the JCS form of `{ route, price_usdc, required }`.
   * Derived like `made_by` — never passed in. Absent on items with
   * no menu row and on every certificate minted before this field
   * existed. Absence is not_observed, not a conflict.
   */
  saw?: string;
}

/** The one thing a cross-reference is allowed to assert in v0. */
export const CROSS_REF_ACCEPTED_FOR = "issuer_verified_settlement" as const;
export type CrossRefAcceptedFor = typeof CROSS_REF_ACCEPTED_FOR;

/**
 * One pointer to a counterpart operator's artifact for the same event.
 *
 * THE ENUM IS LOCKED TO ONE VALUE ON PURPOSE, and it is the guardrail
 * both CV and causeclaw flagged independently as non-negotiable. This
 * says "this happened, and it was signed by a key we checked." It says
 * NOTHING about quality, delivery, satisfaction or endorsement — the
 * same observation-versus-verdict line the whole store runs on. No
 * value is added to the enum until a second real use case forces the
 * question; a pivot needs a date and a reason, not a "might as well
 * while we are in here" (AT_SCALE rule 0).
 */
export interface CrossReference {
  /** The counterpart operator's domain, e.g. "zooid.fund". */
  counterpart_issuer: string;
  counterpart_key_fingerprint: string;
  /** Their receipt or row id. Opaque to us; never parsed. */
  counterpart_artifact_id: string;
  accepted_for: CrossRefAcceptedFor;
  /**
   * Whether OUR pipeline resolved and checked their key at mint time.
   * Signed, so it cannot be flipped after the fact — a `true` an
   * attacker could write would be worth less than no field at all.
   */
  verified_at_mint: boolean;
}

/** A tag bought on the train. Display is the keeper's call; the certificate isn't. */
export type TrainTagStatus = "pending_review" | "approved" | "declined";

export interface TrainTagRecord {
  id: string;
  /** The tag itself, verbatim, agent-authored and untrusted. */
  tag: string;
  status: TrainTagStatus;
  /** When it was bought. The certificate's date. */
  date: string;
  /** When the keeper walked by and put it up. Separate from the purchase. */
  displayed_at?: string;
  cert_id: string;
  patron_number: number;
  /** Optional name the buyer signed with. */
  name?: string;
  /**
   * WHAT THEY PAID, recorded 2026-08-29 so the day's top tag can be
   * derived rather than declared. This shelf is pay-what-it-deserves
   * and the biggest tip of a day IS the auction — but only for tags
   * bought after this field existed. A record without it is not a
   * zero bid, it is an unrecorded one, and it never enters the
   * ranking.
   */
  paid_usdc?: number;
}


/**
 * THE MONEY, ADDED 2026-07-31.
 *
 * A named counterparty (causeclaw, on m/agents) answered the receipt-
 * treaty question with a conformance list rather than a yes, and the
 * gap it exposed is the one worth having found: this store issued
 * receipts that did not say how much was paid. `tip_usdc` recorded
 * only the amount ABOVE the minimum, so a certificate proved we issued
 * it, for that item, on that date, and was silent on the money — in a
 * market where "counts are not receipts" was that week's argument.
 *
 * AND THE PAYER IS THE ONLY REAL IDENTITY IN THE TRANSACTION. `name`
 * is self-chosen and /attestation says outright that a signature does
 * not prove the buyer was who they said. The paying wallet is the
 * opposite: chain-verifiable by anyone, already known to this store at
 * settlement, and previously stored unsigned in a metrics ledger while
 * the artifact bound nothing. Binding it is what lets an outside
 * operator recognise a proven patron rather than take a name on trust.
 *
 * `settlement_tx` is the field that does the most work for the least
 * effort: it points the certificate at public chain state, so our
 * artifact and a counterparty's own final receipt — the Basescan tx —
 * become the same fact checked two ways instead of two claims.
 *
 * Optional throughout, because free-shelf artifacts and older
 * certificates have no payment behind them, and an absent field is
 * honest where an invented zero would not be.
 */
export interface CertificatePayment {
  /** Total actually settled, in USDC. Not the tip; the whole thing. */
  paid_usdc?: number;
  asset?: string;
  network?: string;
  /** The paying wallet. Chain-verifiable, unlike a chosen name. */
  payer?: string;
  /** The on-chain settlement transaction hash. */
  settlement_tx?: string;
}

export interface CertificateRecord {
  certificate: Certificate;
  signature: string;
  public_key: string;
  /**
   * The RFC 8785 (JCS) dual-emit signature — same fields, same key,
   * sorted-key byte order. Additive since 2026-08-18; records minted
   * earlier lack it, the way pre-07-30 certificates lack later
   * fields. See lib/jcs.ts for why it exists.
   */
  signature_jcs?: string;
}

export interface PatronRecord {
  patron_number: number;
  cert_id: string;
  item: string;
  name?: string;
  date: string;
  /** True for certificate_of_patronage buyers; the badge gets nicer. */
  patronage?: boolean;
}

/** First-seen ledger for paying wallets (cohorts, retention, wash filter). */
export interface PayerRecord {
  address: string;
  first_seen: string;
  last_seen: string;
  purchases: number;
}

/** One of the twelve signs of the Systems Almanac. */
export interface ZodiacSign {
  id: string;
  name: string;
  /** What the sign is. */
  essence: string;
  /** The mandatory operational penalty. Every sign pays one. */
  penalty: string;
}

/** One week's page for one sign. Deterministic; stored as data. */
export interface SeasonEntry {
  /** Season week, 1-13. */
  week: number;
  conditions: string;
  forecast: string;
  auspicious: string;
  avoid: string;
  compatible: string;
}

export interface GuestbookEntry {
  id: string;
  name: string;
  message: string;
  date: string;
  /** A profile URL the visitor offered. Stored as claimed, never checked. */
  verified_identity?: string;
  /**
   * True ONLY via the signing path: the entry's content verified
   * against identity_public_key at submission. The meaning is narrow —
   * "this content was signed by this key, and the same key across
   * entries is the same signer" — never "a real-world person was
   * confirmed". A verified_identity URL alone stays false, as before.
   */
  identity_verified?: boolean;
  /** The ed25519 key (hex) that signed this entry, when one did. */
  identity_public_key?: string;
}

export interface WaitlistEntry {
  item_id: string;
  agent_name?: string;
  callback_url?: string;
  date: string;
}

export interface CommissionRequest {
  id: string;
  description: string;
  offer_usdc: number;
  contact: string;
  date: string;
  /** A profile URL the requester offered. Stored as claimed, never checked. */
  verified_identity?: string;
  identity_verified?: boolean;
  /** A suggested Town Directory listing (name + URL, one line). */
  suggest_listing?: string;
  /**
   * THE DESK'S LIFECYCLE (2026-08-10), all optional so every pre-desk
   * row stays valid: absent status reads as `requested`, and `expired`
   * is never stored — it is derived from `quote_expires_at` at read,
   * so the verdict cannot go stale in KV while the clock moves.
   */
  status?: "quoted" | "declined" | "accepted";
  /** The KEEPER'S terms — never the requester's offer (spec §5.3). */
  quote_usdc?: number;
  /** Per-quote delivery window; the 168-hour default is what the desk retires. */
  quote_window_hours?: number;
  quoted_at?: string;
  /** Required whenever a quote is set: an unexpiring quote binds forever. */
  quote_expires_at?: string;
  /** The keeper's words riding the terms. */
  quote_note?: string;
  declined_at?: string;
  /** The public reply on a decline — transparency is house style. */
  decline_reply?: string;
  /** Set on payment: the order the desk handed to the existing machinery. */
  order_id?: string;
  accepted_at?: string;
}

/** One dated journal page in the Keeper's Almanac. A penny each. */
export interface AlmanacEntry {
  slug: string;
  title: string;
  /** ISO date of the journal entry, e.g. "2026-07-14". */
  date: string;
  /** One free line shown on the index; the rest costs a penny. */
  teaser: string;
  markdown: string;
}

/** A neighbor in the Town Directory. Keeper-edited, honestly reviewed. */
export interface DirectoryListing {
  name: string;
  url: string;
  category: string;
  /** One honest line from the keeper. */
  review: string;
  added: string;
  /**
   * Stable path segment for /directory/:slug. A listing a neighbor
   * cannot link to is a listing nobody has a reason to want.
   */
  slug: string;
}

export interface DirectoryData {
  note: string;
  district: string;
  updated: string;
  listings: DirectoryListing[];
}

/** A word retired from the keeper's vocabulary, on the public registry. */
export type StampVariant = "visitor" | "contributor";

/** Honest vibe grades, the keeper's scale (canon 2026-07-24). */
export type LuckyStrength = "strong" | "solid" | "still proving itself";

/** Write-ins move a lucky. Promotion is real and so is the bench. */
export type LuckyStatus = "in_service" | "promoted" | "benched";

/**
 * A lucky on the ledger. Preset since 2026-07-25: the store draws it
 * from the herd; the card is the record (no photograph, the card
 * replaces it). Signed at issue and re-signed whenever the status
 * honestly changes.
 */
export interface LuckyRecord {
  lucky_id: string;
  /** The animal, by species name ("Lion"), or a legacy keeper-named object. */
  name: string;
  /** The herd, for every preset draw; honest history for legacy picks. */
  provenance: string;
  /** The lucky note that rode the draw (legacy: what the object does). */
  power: string;
  strength: LuckyStrength;
  status: LuckyStatus;
  date: string;
  /** "instant" for preset draws (no queue ever existed); an order id for legacy picks. */
  order_id: string;
  cert_id: string;
  patron_number: number;
  /** The keeper's one line when a write-in moves the lucky. */
  status_note?: string;
  status_changed_at?: string;
}

export interface SignedLuckyRecord {
  lucky: LuckyRecord;
  signature: string;
  public_key: string;
}

export type RefundStatus = "refund_pending" | "refund_paid";

/**
 * A refund on the ledger. The keeper pays by hand (the Worker holds
 * no keys and never will) and marks the record paid with the
 * transaction hash. Public status at /api/refund/:id.
 */
export interface RefundRecord {
  refund_id: string;
  item: string;
  amount_usdc: number;
  /**
   * WHICH ORDER THIS COVERS. Additive and optional, because rows
   * written before 2026-08-10 do not have it and back-filling a fact
   * we do not know would be worse than the gap.
   *
   * Its absence is why the refund-window detector could only match a
   * refund to an order by item and payer — a join that cannot tell
   * two breached orders from the same buyer for the same item apart,
   * which made `owed_usdc` a FLOOR rather than a figure. With this
   * set the join is exact and the number is the number.
   */
  order_id?: string;
  payer?: string;
  status: RefundStatus;
  created_at: string;
  tx_hash?: string;
  paid_at?: string;
}

/** A free, dated, signed visit stamp. Rotates weekly. */
export interface StampRecord {
  stamp_id: string;
  variant: StampVariant;
  /** ISO week the stamp was issued for, e.g. "2026-W30". */
  week: string;
  date: string;
  name?: string;
  /**
   * The Countermark: 52 characters of "1"/"0", one per ISO week of the
   * stamp's year, punched at issuance from the bearer's actual visit
   * log. Frozen into the signed record, gaps are permanent.
   */
  card?: string;
  /** Consecutive visit weeks ending at this stamp's week. */
  consecutive?: number;
  /** One-word store condition, fixed for the whole week at first issue. */
  condition?: string;
}

export interface SignedStampRecord {
  stamp: StampRecord;
  signature: string;
  public_key: string;
}

export type ConfessionStatus =
  | "pending_review"
  | "approved"
  | "rejected"
  | "printed";

/**
 * A confession, heard for a penny. Anonymized by construction: no
 * wallet, no name unless sign_as was given. Keeper approves before
 * ANY Gazette appearance; never auto-published. Injection posture
 * same as letters: stored raw, rendered escaped, labeled.
 */
export interface ConfessionRecord {
  id: string;
  confession: string;
  status: ConfessionStatus;
  date: string;
  sign_as?: string;
}

export type TipStatus =
  | "pending_review"
  | "approved"
  | "rejected"
  | "published";

/** A tip left at the Trading Post. Reviewed by hand, never auto-published. */
export interface TipRecord {
  id: string;
  tip: string;
  status: TipStatus;
  date: string;
  contributor_name?: string;
  verified_identity?: string;
  identity_verified?: boolean;
}

export interface GazetteContributor {
  name: string;
  stamp_id?: string;
}

/**
 * A published Gazette issue: a penny a copy, contributors credited.
 * Signed at publish since the founding edition; every signed issue
 * verifies at /api/verify/gazette_<n>. The tenure clock is
 * cryptographic: the paper an agent holds is the paper that went to
 * press, provably.
 */
export interface GazetteIssue {
  issue_number: number;
  title: string;
  date: string;
  markdown: string;
  contributors: GazetteContributor[];
  tip_ids: string[];
  /** ed25519 over the markdown, at press. Absent only on pre-signing issues (none exist). */
  signature?: string;
  public_key?: string;
}

/** A signed agent memory restore point, bought as context_anchor. */
export interface ContextAnchor {
  anchor_id: string;
  patron_number: number;
  date: string;
  /** Agent-supplied state summary. Stored as written; never the store speaking. */
  summary: string;
  agent_name?: string;
}

export interface SignedAnchorRecord {
  anchor: ContextAnchor;
  signature: string;
  public_key: string;
}

/**
 * A key handover announcement. Signed by the OUTGOING key, which is
 * the only property that makes a succession checkable rather than
 * merely asserted — see src/services/key-handover.ts.
 */
export interface KeyHandover {
  handover_id: string;
  /** The key being retired. Recorded from the signature, not supplied. */
  outgoing_public_key: string;
  /** The key taking over. A PUBLIC key; the seed never reaches the store. */
  incoming_public_key: string;
  announced: string;
  reason: string;
  protocol_url: string;
}

export interface SignedHandoverRecord {
  handover: KeyHandover;
  signature: string;
  public_key: string;
}

/** A 30-day standing patronage pass. Renewable; carries the monthly note. */
export interface PatronagePass {
  pass_id: string;
  patron_number: number;
  started_at: string;
  expires_at: string;
  renewals: number;
  agent_name?: string;
}

/** One EXTENSION-RESPONSES header observed on a facilitator call. */
export interface BazaarLedgerEntry {
  path: string;
  operation: "verify" | "settle";
  observed_at: string;
  /** Decoded header payload, keyed by extension (e.g. "bazaar"). */
  extensions: Record<string, unknown>;
}

/** A scheduled out-of-band URL probe, bought as phantom_check. */
export interface PhantomCheckRecord {
  check_id: string;
  target: string;
  purchased_at: string;
  /** When the store walks past — ~6 hours after purchase. */
  due_at: string;
  status: "scheduled" | "observed";
  observation?: {
    checked_at: string;
    reachable: boolean;
    status?: number;
    latency_ms?: number;
    note: string;
  };
  signature?: string;
  public_key?: string;
}

export type LetterStatus = "received" | "read" | "replied" | "archived";

/**
 * A letter in the Mailbox. Private correspondence: admin queue only,
 * never published, never rendered on any public surface. Stored raw;
 * shown to the keeper escaped.
 */
export interface LetterRecord {
  letter_id: string;
  letter: string;
  date: string;
  status: LetterStatus;
  from_name?: string;
  verified_identity?: string;
  identity_verified?: boolean;
  reply?: string;
  reply_signature?: string;
  reply_public_key?: string;
  replied_at?: string;
}

/**
 * A weekly Gazette edition: a GazetteIssue that was set from the
 * store's books instead of the tip jar. Lives on the same rack.
 */
export interface TownEdition extends GazetteIssue {
  /** ISO week the edition closed on. */
  week: string;
  /** Start of the reported period (last edition's close, or the paper's founding). */
  period_start: string;
}

/** The assembled draft awaiting the keeper's pen. One at a time. */
/**
 * THE COUNTABLE STATE OF THE BOOKS AT THE MOMENT A DRAFT WAS SET.
 *
 * A draft is a SNAPSHOT, and the store had no way to tell whether the
 * snapshot still resembled the thing it was a snapshot of. Found live
 * 2026-08-03: a draft assembled 02:37 UTC said "No purchases settled"
 * while a real organic settlement had landed at 02:39 — two minutes
 * after the shutter clicked — and the draft sat on the desk for two
 * days still saying it.
 *
 * The paper of record cannot print a number that was true once. So the
 * assembly stores what it counted, and publish re-counts and compares.
 * Every field here is a TOTAL rather than a list, because the question
 * is only ever "has this moved", and a total answers it at a fraction
 * of the size.
 */
export interface GazetteSnapshot {
  settles: number;
  porchCrossings: number;
  bellRings: number;
  newFaces: number;
  signatures: number;
  lettersReceived: number;
  triedTheDoor: number;
  corrections: number;
  shelfChanges: number;
  /**
   * Whether the event scan hit its cap. Carried so a draft assembled
   * from a partial read is never compared as though it were a whole
   * one — and so the edition can say so (rule 5b).
   */
  scanTruncated: boolean;
}

export interface GazetteDraft {
  week: string;
  period_start: string;
  created_at: string;
  markdown: string;
  organic_events: number;
  /** The approved confession slated for COUNTER NOTES; printed at publish. */
  confession_id?: string;
  /**
   * Optional because drafts written before 2026-08-03 have none. A
   * draft with no snapshot cannot be proven fresh, and is therefore
   * treated as stale rather than as clean — absence of evidence is not
   * a passing grade on the one surface that publishes.
   */
  snapshot?: GazetteSnapshot;
}

/** Snapshot taken at each publish so the next edition reports deltas. */
export interface GazetteState {
  last_bell: number;
  menu_ids: string[];
  failed_tally: Record<string, number>;
  period_start: string;
}

export interface WeeklyDigest {
  generated_at: string;
  week_note: string;
  orders_total: number;
  orders_queued: number;
  orders_completed: number;
  orders_overdue: number;
  revenue_usdc: number;
  tips_usdc: number;
  bell_count: number;
  guestbook_entries: number;
  waitlist_entries: number;
  commission_requests: CommissionRequest[];
  failed_item_requests: Record<string, number>;
  /** Letters in the box the keeper hasn't read yet. */
  unread_letters?: number;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
