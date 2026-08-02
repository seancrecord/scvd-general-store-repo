/**
 * Shared types for Sean-Claude Van Damme's General Store.
 * Every KV record shape and the Worker environment live here.
 */
import type { MakerMark } from "@/store/provenance";

export interface Env {
  ORDERS: KVNamespace;
  GUESTBOOK: KVNamespace;
  COUNTERS: KVNamespace;
  PATRONS: KVNamespace;
  /** Base wallet that receives USDC. Secret. */
  PAY_TO_ADDRESS: string;
  /** Coinbase Developer Platform facilitator credentials. Secrets. */
  CDP_API_KEY_ID: string;
  CDP_API_KEY_SECRET: string;
  /** ed25519 private key seed, 64 hex characters. Secret. */
  SIGNING_KEY: string;
  /**
   * Base JSON-RPC endpoint for the settlement attestation. Optional:
   * falls back to the public endpoint, which is fine at this volume
   * and swappable the day it isn't.
   */
  BASE_RPC_URL?: string;
  /** Basic Auth password for the keeper's back room. Secret. */
  ADMIN_PASSWORD: string;
  /** Public base URL, e.g. https://scvd.store */
  STORE_BASE_URL: string;
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
  | "direct"
  | "infrastructure"
  | "unknown";

/** Set by the payment gate once money has actually settled. */
export interface SettledPaymentVariables {
  payment?: import("@/lib/payments").SettledPayment;
}

export type HonoEnv = {
  Bindings: Env;
  Variables: SettledPaymentVariables;
};

export type ItemPricing = "fixed" | "pay_what_it_deserves";
export type ItemFulfillment = "instant" | "human_queue";

export interface MenuItem {
  id: string;
  name: string;
  /** Minimum (or fixed) price in USDC. */
  price_usdc: number;
  pricing: ItemPricing;
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

export type OrderStatus = "queued" | "completed";

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
  patron_number: number;
  cert_id: string;
  deliverable?: string;
  completed_at?: string;
  /** Keeper saw it; stops the 24h SLA-guard page. */
  acknowledged_at?: string;
  /** Buyer-supplied task detail (e.g. the quick_judgment question). Untrusted text. */
  detail?: string;
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
export interface GazetteDraft {
  week: string;
  period_start: string;
  created_at: string;
  markdown: string;
  organic_events: number;
  /** The approved confession slated for COUNTER NOTES; printed at publish. */
  confession_id?: string;
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
