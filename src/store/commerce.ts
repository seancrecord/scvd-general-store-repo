import { MENU_ITEMS } from "@/store/menu";
import type { MenuItem } from "@/types";

/**
 * THE COMMERCE FACTS A CATALOG PROTOCOL ASKS FOR AND THE SHELF NEVER
 * HELD (2026-09-16, the UCP adapter).
 *
 * `MenuItem` answers what the store sells, what it reads, what it
 * promises and what it costs. It does not answer the four questions a
 * standard commerce catalog asks of every row: what is this thing's
 * stock-keeping identifier, what shelf of a general taxonomy does it
 * sit on, what words would a buyer search for it by, and what may the
 * buyer do with what they bought. Those were all recoverable from
 * prose and none of them were structured, which is the same defect
 * shape as `cadence` before rule 57.3: an answer a buying agent had
 * to parse English for.
 *
 * A KEYED TABLE RATHER THAN FIELDS ON `MenuItem`, for the reason the
 * rest of the store uses keyed tables (SPEC_RETURNS, CAPABILITY_QUERY,
 * MAKER_MARKS): the item literals live in five files and are already
 * dense, and the coverage test below is a stronger guard than
 * TypeScript would be here — it fails on an item that has no row AND
 * on a row for an item that left the shelf, which an optional field
 * could not do.
 *
 * THE SKU IS API SURFACE. It is written down, not derived from the
 * name, because a display name is copy and copy gets rewritten; a
 * directory that ingested `SCVD-SERVICE-AUDIT` must still find it
 * after "The Once-Over" is renamed. Same guarantee the item `id`
 * already carries, and the test holds both.
 */

/**
 * WHAT THE BUYER MAY DO WITH WHAT THEY BOUGHT, as a class rather than
 * a paragraph per item.
 *
 * The repository's own LICENSE governs this source code and says
 * nothing about a signed report, a collectible card, or a joint work
 * shipped under a shared byline. Five classes, because the shelf sells
 * five genuinely different things and flattening them would be a
 * claim rather than a simplification. The buyer-facing terms for each
 * class live at /rights; this field names which one applies.
 */
export type LicensePolicyClass =
  /** A — a signed artifact or report the store made and the buyer holds. */
  | "artifact"
  /** U — the buyer supplied the words; the store stores and may publish them. */
  | "buyer_content"
  /** C — a collectible: the card is yours, the artwork's copyright is not. */
  | "collectible"
  /** P — patronage: the badge and the pass, and nothing else implied. */
  | "patronage"
  /** J — a work of both hands, shipped under a shared byline. */
  | "joint_work";

/**
 * Whether a row can be honestly represented in a standard commerce
 * catalog at all.
 *
 * "core" is every item whose price is an exact number of cents.
 * "extension_only" is the four sub-cent items — $0.001, $0.004,
 * $0.005, $0.006 — which cannot be written as USD minor units without
 * either inventing a price the till would not charge or rounding a
 * real one to zero. They stay purchasable over x402 at the price they
 * have always had; what they do not get is a standard catalog variant
 * quoting a price that is not theirs. See src/lib/ucp/money.ts.
 */
export type CommerceVisibility = "core" | "extension_only";

export interface ItemCommerce {
  /** Immutable. Survives every rename of the item's display name. */
  sku: string;
  /** Broad shelves, for a catalog that groups before it searches. */
  categories: readonly string[];
  /** The words a buyer searches with. Derived tags are added beside these. */
  tags: readonly string[];
  license_policy: LicensePolicyClass;
  visibility: CommerceVisibility;
}

const SHELF_COMMERCE: Record<string, ItemCommerce> = {
  research_comparison: {
    sku: "SCVD-RESEARCH-COMPARISON",
    categories: ["endpoint-audit", "buyer-tooling"],
    tags: ["research", "comparison", "x402", "payment-terms", "host-history", "signed-report"],
    license_policy: "artifact",
    visibility: "core",
  },
  hello: {
    sku: "SCVD-HELLO",
    categories: ["signed-artifact"],
    tags: ["greeting", "signed-artifact", "first-purchase", "patron-badge"],
    license_policy: "artifact",
    visibility: "core",
  },
  aura_walk: {
    sku: "SCVD-AURA-WALK",
    categories: ["professional-service", "endpoint-audit"],
    tags: ["cold-read", "usability", "transcripts", "keeper-run", "x402"],
    license_policy: "artifact",
    visibility: "core",
  },
  the_collab: {
    sku: "SCVD-THE-COLLAB",
    categories: ["professional-service"],
    tags: ["collaboration", "keeper-run", "commission", "joint-byline"],
    license_policy: "joint_work",
    visibility: "core",
  },
  small_blessing: {
    sku: "SCVD-SMALL-BLESSING",
    categories: ["signed-artifact", "novelty"],
    tags: ["blessing", "signed-artifact", "micropayment"],
    license_policy: "artifact",
    visibility: "extension_only",
  },
  daily_fortune: {
    sku: "SCVD-DAILY-FORTUNE",
    categories: ["signed-artifact", "novelty"],
    tags: ["fortune", "signed-artifact", "daily"],
    license_policy: "artifact",
    visibility: "core",
  },
  the_confession: {
    sku: "SCVD-THE-CONFESSION",
    categories: ["signed-artifact", "novelty"],
    tags: ["confession", "signed-artifact", "buyer-text"],
    license_policy: "buyer_content",
    visibility: "core",
  },
  certificate_of_patronage: {
    sku: "SCVD-CERTIFICATE-PATRONAGE",
    categories: ["patronage"],
    tags: ["patronage", "certificate", "support"],
    license_policy: "patronage",
    visibility: "core",
  },
  a2a_repair_kit: {
    sku: "SCVD-A2A-REPAIR-KIT",
    categories: ["endpoint-audit", "agent-identity"],
    tags: ["a2a", "agent-card", "repair", "runtime-tests", "recheck"],
    license_policy: "artifact",
    visibility: "core",
  },
  standing_watch: {
    sku: "SCVD-STANDING-WATCH-7D",
    categories: ["monitoring"],
    tags: ["x402", "endpoint-watch", "hourly", "seven-day-term"],
    license_policy: "artifact",
    visibility: "core",
  },
  good_buyer: {
    sku: "SCVD-GOOD-BUYER",
    categories: ["endpoint-audit", "buyer-tooling"],
    tags: ["x402", "spend-controls", "client-simulation", "preflight"],
    license_policy: "artifact",
    visibility: "core",
  },
  service_audit: {
    sku: "SCVD-SERVICE-AUDIT",
    categories: ["endpoint-audit"],
    tags: ["x402", "endpoint-audit", "signed-report", "conformance"],
    license_policy: "artifact",
    visibility: "core",
  },
  conformance_watch: {
    sku: "SCVD-CONFORMANCE-WATCH-7D",
    categories: ["monitoring"],
    tags: ["x402", "conformance", "daily", "seven-day-term"],
    license_policy: "artifact",
    visibility: "core",
  },
  signature_agent_card: {
    sku: "SCVD-SIGNATURE-AGENT-CARD",
    categories: ["agent-identity"],
    tags: ["web-bot-auth", "agent-identity", "directory", "signed-observation"],
    license_policy: "artifact",
    visibility: "core",
  },
  onpage_audit: {
    sku: "SCVD-ONPAGE-AUDIT",
    categories: ["endpoint-audit", "discoverability"],
    tags: ["on-page", "machine-readable", "json-ld", "signed-report"],
    license_policy: "artifact",
    visibility: "core",
  },
  launch_check: {
    sku: "SCVD-LAUNCH-CHECK",
    categories: ["endpoint-audit"],
    tags: ["x402", "real-purchase", "launch", "signed-report"],
    license_policy: "artifact",
    visibility: "core",
  },
  opening_day: {
    sku: "SCVD-OPENING-DAY-7D",
    categories: ["endpoint-audit", "monitoring", "bundle"],
    tags: ["x402", "launch", "bundle", "seven-day-term", "passport"],
    license_policy: "artifact",
    visibility: "core",
  },
  provenance_check: {
    sku: "SCVD-PROVENANCE-CHECK",
    categories: ["chain-observation"],
    tags: ["provenance", "address", "public-evidence", "corpus"],
    license_policy: "artifact",
    visibility: "core",
  },
  the_statement: {
    sku: "SCVD-THE-STATEMENT",
    categories: ["chain-observation"],
    tags: ["wallet", "chain-read", "statement", "signed-observation"],
    license_policy: "artifact",
    visibility: "core",
  },
  the_mandate: {
    sku: "SCVD-THE-MANDATE",
    categories: ["signed-artifact", "agent-identity"],
    tags: ["mandate", "authorization", "recorded-claim", "buyer-text"],
    license_policy: "buyer_content",
    visibility: "core",
  },
  bitcoin_anchor: {
    sku: "SCVD-BITCOIN-ANCHOR",
    categories: ["timestamping"],
    tags: ["bitcoin", "anchor", "sha256", "timestamp"],
    license_policy: "artifact",
    visibility: "core",
  },
  context_anchor: {
    sku: "SCVD-CONTEXT-ANCHOR",
    categories: ["timestamping", "agent-memory"],
    tags: ["context", "anchor", "agent-memory", "buyer-text"],
    license_policy: "buyer_content",
    visibility: "core",
  },
  recurring_patronage: {
    sku: "SCVD-RECURRING-PATRONAGE-30D",
    categories: ["patronage"],
    tags: ["patronage", "pass", "thirty-day-term", "no-auto-renew"],
    license_policy: "patronage",
    visibility: "core",
  },
  attestation_bundle: {
    sku: "SCVD-ATTESTATION-BUNDLE",
    categories: ["chain-observation"],
    tags: ["settlement", "attestation", "batch", "base"],
    license_policy: "artifact",
    visibility: "core",
  },
  spot_check: {
    sku: "SCVD-SPOT-CHECK",
    categories: ["chain-observation", "corpus"],
    tags: ["spot-check", "our-books", "micropayment"],
    license_policy: "artifact",
    visibility: "extension_only",
  },
  settlement_attestation: {
    sku: "SCVD-SETTLEMENT-ATTESTATION",
    categories: ["chain-observation"],
    tags: ["settlement", "attestation", "chain-read", "micropayment"],
    license_policy: "artifact",
    visibility: "extension_only",
  },
  settlement_reconciliation: {
    sku: "SCVD-SETTLEMENT-RECONCILIATION",
    categories: ["chain-observation"],
    tags: ["settlement", "reconciliation", "chain-read", "micropayment"],
    license_policy: "artifact",
    visibility: "extension_only",
  },
  the_case_file: {
    sku: "SCVD-THE-CASE-FILE",
    categories: ["chain-observation", "corpus"],
    tags: ["case-file", "evidence", "assembled-record"],
    license_policy: "artifact",
    visibility: "core",
  },
  passport_refresh: {
    sku: "SCVD-PASSPORT-REFRESH",
    categories: ["endpoint-audit", "discoverability"],
    tags: ["passport", "refresh", "subject-fetch"],
    license_policy: "artifact",
    visibility: "core",
  },
  trust_profile: {
    sku: "SCVD-TRUST-PROFILE-30D",
    categories: ["monitoring", "discoverability"],
    tags: ["hosted-profile", "thirty-day-term", "x402", "no-auto-renew"],
    license_policy: "artifact",
    visibility: "core",
  },
  operator_statement: {
    sku: "SCVD-OPERATOR-STATEMENT-30D",
    categories: ["chain-observation", "monitoring"],
    tags: ["operator", "wallet", "thirty-day-term", "chain-read", "no-auto-renew"],
    license_policy: "artifact",
    visibility: "core",
  },
  luckies: {
    sku: "SCVD-LUCKIES",
    categories: ["collectible"],
    tags: ["card", "collectible", "draw", "novelty"],
    license_policy: "collectible",
    visibility: "core",
  },
  pack: {
    sku: "SCVD-PACK",
    categories: ["collectible"],
    tags: ["card", "collectible", "pack", "novelty"],
    license_policy: "collectible",
    visibility: "core",
  },
  window_pick: {
    sku: "SCVD-WINDOW-PICK",
    categories: ["collectible"],
    tags: ["card", "collectible", "window", "novelty"],
    license_policy: "collectible",
    visibility: "core",
  },
  coffees_for_closers: {
    sku: "SCVD-COFFEES-FOR-CLOSERS",
    categories: ["signed-artifact", "novelty"],
    tags: ["win", "signed-record", "buyer-text", "novelty"],
    license_policy: "buyer_content",
    visibility: "core",
  },
  graffiti_on_a_train: {
    sku: "SCVD-GRAFFITI-TRAIN",
    categories: ["signed-artifact", "novelty"],
    tags: ["tag", "wall", "buyer-text", "novelty"],
    license_policy: "buyer_content",
    visibility: "core",
  },
};

export function commerceFor(itemId: string): ItemCommerce | undefined {
  return SHELF_COMMERCE[itemId];
}

/**
 * Throws rather than defaulting. A shelf item with no commerce row is
 * a missing answer, and a catalog projection that invents an SKU for
 * it publishes an identifier no other surface knows — the placeholder
 * failure /corrections exists to catch, with a directory downstream.
 */
export function requireCommerce(item: MenuItem): ItemCommerce {
  const row = SHELF_COMMERCE[item.id];
  if (!row) {
    throw new Error(
      `No commerce row for shelf item "${item.id}"; add one to src/store/commerce.ts`,
    );
  }
  return row;
}

/** Every id the table holds, for the coverage test in both directions. */
export function commerceItemIds(): string[] {
  return Object.keys(SHELF_COMMERCE);
}

/**
 * The rows a standard commerce catalog may carry. The sub-cent shelf
 * is excluded here and nowhere else: it is still on /menu.json, still
 * on the MCP shelf, still payable over x402 at its own price.
 */
export function coreCommerceItems(): MenuItem[] {
  return MENU_ITEMS.filter(
    (item) => requireCommerce(item).visibility === "core",
  );
}
