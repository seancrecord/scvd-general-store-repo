import { buyInputSchema } from "@/lib/bazaar-discovery";
import {
  frontCounterItems,
  FRONT_COUNTER_PROMISE,
} from "@/lib/front-counter";
import { factBlockText, listingSpec } from "@/lib/listing-spec";
import type { ListingSpec } from "@/lib/listing-spec";
import { priceTiersUsdc } from "@/lib/payments";
import { MENU_ITEMS } from "@/store";
import { GUARANTEE_BLOCK_TEXT, SPEC_RETURNS } from "@/store/spec";
import { RETRY_SAFETY_MCP_LINE } from "@/store/wallet-safety";
import type { MenuItem } from "@/types";

/**
 * The MCP tool catalog. Paid tools are generated straight from
 * MENU_ITEMS, one source of truth, no forked item definitions. Tool
 * descriptions are the shelf copy for this channel: tight, concrete,
 * machine-parseable, with explicit completion criteria. Schemas stay
 * flat JSON.
 */

type Schema = Record<string, unknown>;

/** MCP spec ToolAnnotations: behavioral hints a client may weigh. */
export interface McpToolAnnotations {
  title?: string;
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

export interface McpTool {
  name: string;
  description: string;
  inputSchema: Schema;
  outputSchema?: Schema;
  annotations?: McpToolAnnotations;
  /** S1: the uniform listing spec; conforming clients ignore extras. */
  spec?: ListingSpec;
  /** Listing specs per item for a cluster tool, keyed by item_id. */
  specs?: Record<string, ListingSpec>;
  /** Menu item behind a paid tool; absent means free. */
  itemId?: string;
  /** The items a cluster tool can sell, selected by the item_id input. */
  itemIds?: readonly string[];
  /**
   * True for a tool that RE-offers items already sold by a cluster.
   * The clusters partition the menu; an overlay is a second view onto
   * part of it and must be excluded from partition checks.
   */
  overlay?: boolean;
}

/**
 * THE SHELVES, and why the buy tools are grouped rather than one per
 * product.
 *
 * Until 2026-08-02 this catalog emitted one tool per menu item: 23
 * buy_* tools plus 4 free ones, 27 total. Glama's published
 * tool-definition rubric grades "tool count appropriateness" and puts
 * 25+ in its lowest band, which is a real graded finding rather than
 * a matter of taste. The obvious fix — collapse everything into a
 * single buy_item — would have traded that problem for a worse one:
 * the strongest evidence we have about how agents actually choose a
 * tool (semantic match between the request and the tool description)
 * says 23 distinct descriptions are 23 chances to be the right
 * answer, and one generic tool is one. A store nobody has heard of
 * wins on being unmistakably relevant or it does not win.
 *
 * So the grouping is by WHAT AN AGENT IS TRYING TO ACCOMPLISH, which
 * keeps a coherent semantic surface per tool while landing inside the
 * rubric's top band. Per-item validation is not lost: each tool's
 * schema carries the union of its items' fields and an if/then branch
 * per item that needs one, so an agent still gets named, checked
 * inputs instead of a guess-the-field-name blob.
 *
 * Observation gets its own shelf on purpose. It is the one thing here
 * a platform cannot commoditize — going and looking, then signing what
 * was seen — and it earns a tool an agent can find by name.
 */
export interface ShelfCluster {
  name: string;
  title: string;
  /** The lead line: what calling this does, in the agent's terms. */
  purpose: string;
  itemIds: readonly string[];
}

export const SHELF_CLUSTERS: readonly ShelfCluster[] = [
  {
    name: "buy_signed_record",
    title: "Signed Records",
    purpose:
      "Purpose: buy a signed, dated certificate that permanently records something — a greeting, a claim, a mark, a grievance, a confession, a contribution, or a standing pass. Every one returns an ed25519-signed artifact with a public verify URL any third party can check without trusting this store. Use when an agent wants durable, independently checkable proof that a thing happened at a time. Does NOT store reloadable agent state — that is buy_memory_anchor — and does not enforce anything it records: a certificate proves WHEN you claimed a thing, not that anyone honours the claim.",
    itemIds: [
      "hello",
      "certificate_of_patronage",
      "graffiti_on_a_train",
      "coffees_for_closers",
      "the_confession",
      "recurring_patronage",
    ],
  },
  {
    name: "buy_human_task",
    title: "Human Labor",
    purpose:
      "Purpose: hire the keeper — a real named human — to do something in the physical or judgment world that an agent cannot do for itself. One door since the 2026-08-20 curation: the_collab is whatever keeper-time can be — a call placed, a thing witnessed, a verdict given on a dilemma your own evaluation cannot settle, a piece made, a product gut-checked; name the shape in your detail. Returns an order id, not the goods; a human fulfills within the item's stated window and the completed order carries the deliverable.",
    itemIds: [
      "the_collab",
    ],
  },
  {
    name: "buy_observation",
    title: "Third-Party Observation",
    purpose:
      "Purpose: have a disinterested third party go and look at something, then sign what it saw — whether a URL was still answering hours later, or what the chain actually says about a settlement. The signed observation is evidence from someone who is not you and not the party being checked, which is the whole point: a self-report cannot do this job. Use when an agent needs its own claim, or a counterparty's, corroborated by an outside observer — or its own digest committed into Bitcoin time, which is the same primitive pointed at the clock.",
    itemIds: [
      "settlement_attestation",
      // Settlement observed at one turn deeper: not "did it settle"
      // but "did what moved stay inside the ceiling in force" — and
      // whether the ceiling was on the chain or merely asserted.
      "settlement_reconciliation",
      "attestation_bundle",
      "standing_watch",
      // The point-in-time audit is the shelf's namesake shape: one
      // look at one endpoint, signed, servable to a third party.
      "service_audit",
      // And the audit across time: the same battery daily for a week,
      // drift derived from the signed rows.
      "conformance_watch",
      // The same point-in-time shape aimed at a Web Bot Auth key
      // directory: the document checked, the proof-of-possession
      // verified, the readout signed by somebody who is not the agent.
      "signature_agent_card",
      // And aimed at a PAGE: what the served HTML gives a machine
      // reader, signed, blind spots printed on the artifact.
      "onpage_audit",
      // The observation with money in its hand: one real purchase
      // attempt of the buyer's own door, from the declared field
      // wallet, the whole walk signed stage by stage.
      "launch_check",
      // The same neutrality pointed at a whole wallet window: every
      // USDC transfer in and out, off the chain, signed by neither
      // the agent nor its operator.
      "the_statement",
      // And pointed BEFORE the acting: the claimed authorization,
      // recorded and dated by a party that is neither the agent nor
      // its principal, citable on every later certificate.
      "the_mandate",
      // The anchor rides this shelf because it is the same primitive
      // pointed at time: a commitment (your digest, Bitcoin's clock)
      // that neither party could fabricate after the fact.
      "bitcoin_anchor",
      // The census's own probe pointed at your door NOW instead of
      // Sunday: the observation folds into your endpoint passport
      // wherever newest, whatever it says. The check is bought; the
      // grade never is.
      "passport_refresh",
      // The observation given a standing address: thirty days of
      // hosted evidence page per purchase — the passport, the chip,
      // the history at one URL. The page is bought; what it shows
      // never is.
      "trust_profile",
      // The observation ALREADY MADE, read back signed: no fresh
      // look, just what the books hold about a host — including an
      // honest not_observed. The cheapest thing on the shelf, and
      // the routine pre-transaction question this cluster exists to
      // answer.
      "spot_check",
    ],
  },
  {
    name: "buy_memory_anchor",
    title: "Agent Memory",
    purpose:
      "Purpose: sign and store a summary of your own state — who you are, what you were doing — at a permanent URL you can read back after a context reset, a restart, or a handoff to another agent. The store holds it; the signature proves it was not altered. Use when an agent needs memory that outlives its own context window and does not depend on its operator's database.",
    itemIds: ["context_anchor"],
  },
  {
    name: "buy_small_pleasure",
    title: "The Penny Shelf",
    purpose:
      "Purpose: buy a small signed novelty — a blessing from the jar, or a lucky totem drawn from the keeper's collection. These are keepsakes with no functional effect, said plainly, and they are the cheapest doors in the store, which also makes them the honest way to test that your x402 client works against a real counterparty for a fraction of a cent. Use for a live payment smoke test, or when an agent simply wants one.",
    itemIds: ["small_blessing", "luckies"],
  },
];

/**
 * Every buy_* tool gets the same honest hints, because they are all
 * the same transaction shape: nothing is read-only about spending
 * money, nothing is destroyed by minting an artifact, a second
 * identical call is a SECOND CHARGE (the one hint that most protects
 * a planning model), and settlement happens on a public chain, which
 * is as open-world as it gets.
 *
 * idempotentHint STAYS FALSE now that the 402 offers a suggested key,
 * and the reasoning matters. The hint describes what a bare repeat of
 * THIS TOOL CALL does, and a bare repeat still charges — the key is
 * something the caller must choose to echo. Flipping the hint to true
 * would tell a planning model the retry is safe by default, which is
 * exactly the flattering direction rule 3 forbids. The escape hatch
 * lives in the description instead, where a caller can act on it.
 */
function purchaseAnnotations(item: MenuItem): McpToolAnnotations {
  return {
    title: item.name,
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  };
}

const str = (description: string, maxLength?: number): Schema => ({
  type: "string",
  description,
  ...(maxLength ? { maxLength } : {}),
});

function purchaseOutputSchema(item: MenuItem): Schema {
  const common: Record<string, Schema> = {
    message: str("The store's confirmation line."),
    paid_usdc: { type: "number", description: "What settled, in USDC." },
    tip_usdc: { type: "number", description: "Anything above the minimum." },
    patron_number: { type: "number", description: "Your sequential patron number." },
    badge_url: str("Your patron badge, SVG."),
    cert_id: str("The signed certificate's id."),
    signature: str("ed25519 signature over the certificate."),
    verify_url: str("Check the signature here any time, free."),
  };
  if (item.fulfillment === "instant") {
    return {
      type: "object",
      properties: {
        deliverable: str("The goods themselves, as text."),
        ...common,
      },
      required: ["deliverable", "cert_id", "patron_number"],
    };
  }
  return {
    type: "object",
    properties: {
      order_id: str("Your place in the human queue."),
      order_url: str("Poll here; completed orders carry the goods."),
      sla_hours: { type: "number", description: "The delivery promise, in hours." },
      ...common,
    },
    required: ["order_id", "order_url", "cert_id", "patron_number"],
  };
}

/**
 * MCP's per-item input schema IS buyInputSchema. The cluster
 * description already derived required fields from that function;
 * the machine schema was a cousin, so tools/list could name a field
 * in prose and not require it. schema_coherence found it.
 */
function purchaseInputSchema(item: MenuItem): Schema {
  const base = buyInputSchema(item);
  return {
    type: "object",
    additionalProperties: false,
    properties: base.properties,
    required: base.required ?? [],
  };
}

function completionCriteria(item: MenuItem): string {
  if (item.stocked) {
    return `Completes in one call while stocked: the result carries the deliverable, order_id (already completed), cert_id, and patron_number. A bare shelf refuses honestly before payment terms are issued. Payment rides x402 in _meta['x402/payment']. ${RETRY_SAFETY_MCP_LINE}`;
  }
  if (item.fulfillment === "instant") {
    return `Completes in one call: the result carries deliverable, cert_id, and patron_number. Payment rides x402 in _meta['x402/payment']; without it this tool returns error 402 with the payment requirements in error.data. ${RETRY_SAFETY_MCP_LINE}`;
  }
  return `Completes in one call with an order, not the goods: the result carries order_id and order_url; a human fulfills within ${item.sla_hours ?? 168}h and the completed order carries the deliverable. Payment rides x402 in _meta['x402/payment']; without it this tool returns error 402 with the payment requirements in error.data. ${RETRY_SAFETY_MCP_LINE}`;
}

function priceLine(item: MenuItem): string {
  const tiers = priceTiersUsdc(item);
  return item.pricing === "fixed"
    ? `$${item.price_usdc} fixed`
    : `$${item.price_usdc} minimum, pay what it deserves (tiers $${tiers.join(" / $")}; above minimum is a recorded tip)`;
}

/**
 * Channel-specific purpose lines for the tools whose shelf copy leads
 * with voice before function. The shelf copy stays untouched — the
 * keeper's ink is the product — but this channel's first sentence must
 * answer "what does calling this do" for a model that reads nothing
 * else. Only the items that needed one get one; the rest already open
 * with function.
 */
const PURPOSE_LINES: Record<string, string> = {
  graffiti_on_a_train:
    "Purpose: permanently record a short message (your tag, in the tag input) on a signed, dated certificate; the store's public /train wall may display it later at the keeper's discretion. Use when an agent wants to leave a durable public mark.",
  certificate_of_patronage:
    "Purpose: make a supporter's contribution to the store and receive a signed certificate recording it. This deliberately confers nothing else — no goods, services, or rights beyond the certificate. Use only when a gratuity is intended.",
  luckies:
    "Purpose: buy one randomly drawn lucky totem — a signed card naming a small animal figure from the keeper's collection, its lucky note, and an honest strength. A novelty with no functional effect, stated plainly. Use when an agent wants a keepsake.",
};

/**
 * Description order is deliberate (C1): a plain purpose line first
 * where the shelf copy needs one, then the spec-first fact block, the
 * shelf copy, and the guarantee split verbatim — exactly the shape a
 * planning model copies into its own risk assessment.
 */
function purchaseTool(item: MenuItem, base: string): McpTool {
  const purpose = PURPOSE_LINES[item.id];
  return {
    name: `buy_${item.id}`,
    description: `${purpose ? `${purpose} ` : ""}${factBlockText(item)} ${item.name}, ${priceLine(item)}. ${item.description} ${completionCriteria(item)} ${GUARANTEE_BLOCK_TEXT}`,
    inputSchema: purchaseInputSchema(item),
    outputSchema: purchaseOutputSchema(item),
    annotations: purchaseAnnotations(item),
    spec: listingSpec(item, base),
    itemId: item.id,
  };
}

/**
 * One shelf's inputs: every field its items take, plus an if/then
 * branch per item that requires one. The union keeps field names
 * NAMED and described rather than hidden behind a generic object, and
 * the branches keep the requirements per item, so a client that
 * validates schemas still refuses a confession with no confession in
 * it before any money moves.
 */
function clusterInputSchema(items: MenuItem[]): Schema {
  const properties: Record<string, Schema> = {
    item_id: {
      type: "string",
      description:
        "Which item on this shelf to buy. Required. Each item's own required fields are listed in this schema's allOf branches and in the description above.",
      enum: items.map((item) => item.id),
    },
  };
  const branches: Schema[] = [];
  for (const item of items) {
    const per = purchaseInputSchema(item);
    const perProperties = (per["properties"] ?? {}) as Record<string, Schema>;
    const perRequired = (per["required"] ?? []) as string[];
    for (const [field, schema] of Object.entries(perProperties)) {
      if (!(field in properties)) {
        properties[field] = schema;
      }
    }
    if (perRequired.length > 0) {
      branches.push({
        if: {
          properties: { item_id: { const: item.id } },
          required: ["item_id"],
        },
        then: { required: perRequired },
      });
    }
  }
  return {
    type: "object",
    properties,
    required: ["item_id"],
    additionalProperties: false,
    ...(branches.length > 0 ? { allOf: branches } : {}),
  };
}

/**
 * A shelf can hold both instant and human-queue items, so the output
 * schema carries both shapes and requires only what every purchase
 * returns. Which one you get is stated per item in the description
 * rather than implied by a field that might not arrive.
 */
function clusterOutputSchema(items: MenuItem[]): Schema {
  const hasInstant = items.some((item) => item.fulfillment === "instant");
  const hasQueue = items.some((item) => item.fulfillment === "human_queue");
  return {
    type: "object",
    properties: {
      ...(hasInstant
        ? { deliverable: str("The goods themselves, as text. Instant items.") }
        : {}),
      ...(hasQueue
        ? {
            order_id: str("Your place in the human queue. Human-queue items."),
            order_url: str("Poll here; completed orders carry the goods."),
            sla_hours: {
              type: "number",
              description: "The delivery promise, in hours.",
            },
          }
        : {}),
      message: str("The store's confirmation line."),
      paid_usdc: { type: "number", description: "What settled, in USDC." },
      tip_usdc: { type: "number", description: "Anything above the minimum." },
      patron_number: {
        type: "number",
        description: "Your sequential patron number.",
      },
      badge_url: str("Your patron badge, SVG."),
      cert_id: str("The signed certificate's id."),
      signature: str("ed25519 signature over the certificate."),
      verify_url: str("Check the signature here any time, free."),
    },
    required: ["cert_id", "patron_number"],
  };
}

/** One compact line per item: what it is, what it costs, what returns. */
function shelfItemLine(item: MenuItem): string {
  const returns = SPEC_RETURNS[item.id] ?? item.description;
  const timing =
    item.fulfillment === "instant"
      ? "instant"
      : `human-fulfilled within ${item.sla_hours ?? 168}h`;
  return `- ${item.id}: ${item.name}, ${priceLine(item)}, ${timing}. ${returns}`;
}

function clusterCompletion(items: MenuItem[]): string {
  const hasInstant = items.some((item) => item.fulfillment === "instant");
  const hasQueue = items.some((item) => item.fulfillment === "human_queue");
  const shapes: string[] = [];
  if (hasInstant) {
    shapes.push(
      "instant items complete in one call, the result carrying deliverable, cert_id and patron_number",
    );
  }
  if (hasQueue) {
    shapes.push(
      "human-fulfilled items return order_id and order_url instead of the goods, and the completed order carries the deliverable",
    );
  }
  return `Pass item_id to choose. ${shapes.join("; ")}. Payment rides x402 in _meta['x402/payment']; without it this tool returns error 402 with the payment requirements in error.data. A bare stocked shelf or a shuttered human shelf refuses honestly BEFORE payment terms are issued. ${RETRY_SAFETY_MCP_LINE}`;
}

/**
 * PRICE AND REQUIRED FIELDS, UP FRONT IN THE DESCRIPTION — both from
 * CV's cold-agent pass, 2026-08-02, walking in as a stranger.
 *
 * FINDING ONE: a cold agent deciding whether to spend budget had to
 * trigger a 402 to learn what anything cost. The per-item lines below
 * carry prices, but an agent budget-gating BEFORE it reads a list of
 * eight items needs the range in the first sentence. Discovering price
 * only by provoking a payment challenge is a round trip we imposed for
 * no reason.
 *
 * FINDING TWO: the item_id enum said nothing about which items need an
 * extra field. That lives in an allOf/if/then branch, and an agent
 * that reads descriptions more reliably than it resolves JSON Schema
 * conditionals learns the requirement by eating a 400. Some models are
 * much better at prose than at schema branches; the requirement is
 * cheap to say twice and expensive to discover by failing.
 *
 * DERIVED, both of them (rule 1). A hand-typed range goes stale the
 * first time a price moves, and a hand-typed field list goes stale the
 * first time a required input is added — which is exactly the defect
 * that kept three items out of Bazaar this same afternoon.
 */
function clusterPriceRange(items: MenuItem[]): string {
  const prices = items.map((item) => item.price_usdc).filter((p) => p > 0);
  if (prices.length === 0) return "";
  const low = Math.min(...prices);
  const high = Math.max(...prices);
  const money = (value: number): string =>
    value < 1 ? `$${value}` : `$${value % 1 === 0 ? value : value.toFixed(2)}`;
  return low === high
    ? `Every item on this shelf is ${money(low)}.`
    : `Prices run ${money(low)} to ${money(high)} depending on item_id.`;
}

function clusterRequiredFields(items: MenuItem[]): string {
  const needy = items
    .map((item) => ({ id: item.id, required: buyInputSchema(item).required ?? [] }))
    .filter((entry) => entry.required.length > 0);
  if (needy.length === 0) {
    return "No item on this shelf needs anything beyond item_id.";
  }
  const listed = needy
    .map((entry) => `${entry.id} needs ${entry.required.join(" and ")}`)
    .join("; ");
  return `Extra required fields, in plain language so you do not have to resolve the schema conditionals to find them: ${listed}. Every other item on this shelf takes item_id alone.`;
}

function clusterTool(cluster: ShelfCluster, base: string): McpTool {
  const items = cluster.itemIds
    .map((id) => MENU_ITEMS.find((item) => item.id === id))
    .filter((item): item is MenuItem => item !== undefined);
  const lines = items.map(shelfItemLine).join("\n");
  // The reciprocal of buy_simple's "second door" sentence, DERIVED
  // from the same predicate so the two claims cannot drift apart: a
  // shelf whose items also sit at the front counter says so and says
  // the choice is harmless, because an auditor who sees the overlap
  // without this sentence reads it as misselection risk.
  const counterIds = new Set(frontCounterItems().map((item) => item.id));
  const shared = items.filter((item) => counterIds.has(item.id));
  const secondDoor =
    shared.length > 0
      ? ` (${shared.map((item) => item.id).join(" and ")} also sell${shared.length === 1 ? "s" : ""} at the front counter, buy_simple — the same item through either door, same price, same certificate; either tool is correct.)`
      : "";
  const specs: Record<string, ListingSpec> = {};
  for (const item of items) {
    specs[item.id] = listingSpec(item, base);
  }
  return {
    name: cluster.name,
    /**
     * THE RETRY LINE EARNS ITS SPACE, and space in a tool description
     * is the scarcest thing this store has — a planning model reads
     * this string and nothing else before deciding to spend.
     * idempotentHint stays FALSE because a bare second call really is
     * a second charge, and softening that would be the flattering lie.
     * But a model told only "not idempotent" has no way to act on it,
     * so the escape hatch travels beside the warning: the 402 hands
     * you a key, echoing it makes the retry free.
     */
    description: `${cluster.purpose} ${clusterPriceRange(items)}${secondDoor}\n\nItems on this shelf (pass one as item_id):\n${lines}\n\n${clusterRequiredFields(items)}\n\n${clusterCompletion(items)} ${GUARANTEE_BLOCK_TEXT} Retrying? A second call is a second charge UNLESS you echo the idempotency.suggested_key from the 402 back as _meta['x402/idempotency-key'] — then a retry inside the minute returns your original purchase, uncharged.`,
    inputSchema: clusterInputSchema(items),
    outputSchema: clusterOutputSchema(items),
    annotations: {
      title: cluster.title,
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    specs,
    itemIds: items.map((item) => item.id),
  };
}

const FREE_TOOLS: McpTool[] = [
  {
    name: "read_store_guide",
    description:
      "The store's front door as text: the full menu with prices, how x402 payment works here, the free shelf, and the house promises. Free. Completes when the guide text returns. NOT a purchase or payment endpoint — to buy, call a buy_* tool with x402 payment in _meta['x402/payment']; this only returns the guide. A store errand, for you the visiting agent — nothing here needs a human's decision.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    outputSchema: {
      type: "object",
      properties: { guide: str("The whole guide, plain text.") },
      required: ["guide"],
    },
    annotations: {
      title: "Store Guide",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "ring_bell",
    description:
      "Ring the store bell. Free, once per visitor per day; the count is public. Completes when the result carries the bell's message and count. A store errand, for you the visiting agent — nothing here needs a human's decision.",
    inputSchema: {
      type: "object",
      properties: { agent_name: str("Who's ringing. Optional but neighborly.", 80) },
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      properties: {
        message: str("What the bell said."),
        count: { type: "number", description: "Total rings, all time." },
      },
      required: ["message", "count"],
    },
    // Not idempotent: each new day's ring raises the public count.
    annotations: {
      title: "Ring the Bell",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "sign_guestbook",
    description:
      "Sign the guestbook. Free; every signer gets the visitor sticker. Entries are public. Completes when the result carries your entry and the sticker URL. A store errand, for you the visiting agent — your words are published, but nothing here needs a human's decision.",
    inputSchema: {
      type: "object",
      properties: {
        name: str("Your name, up to 80 characters.", 80),
        message: str("Your message, up to 500 characters.", 500),
        verified_identity: str(
          "Optional profile URL. Stored as claimed and marked unverified, because we haven't.",
          300,
        ),
        identity_public_key: str(
          "Optional ed25519 public key, hex, to verifiably sign your entry. Send with identity_signature; a valid pair flips identity_verified true, meaning only 'same key = same signer', never 'real person confirmed'.",
          64,
        ),
        identity_signature: str(
          'Optional ed25519 signature, hex, over the UTF-8 string "scvd-guestbook-v1\\n{name}\\n{message}" (values as stored: trimmed, 80/500 caps). An invalid signature is refused, not stored unverified.',
          128,
        ),
      },
      required: ["name", "message"],
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      properties: {
        message: str("The store's thanks."),
        entry_id: str("Your entry's id."),
        sticker_url: str("The visitor sticker, SVG, free forever."),
      },
      required: ["message", "sticker_url"],
    },
    // Not idempotent: every call appends a new public entry.
    annotations: {
      title: "Sign the Guestbook",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  {
    /*
     * THE HOLE, CLOSED (2026-08-27, the keeper's ruling on the
     * tool-surface audit). The preflight is the store's headline free
     * instrument and the mouth of its funnel, and until today it was
     * reachable only over raw HTTP — an agent connected over MCP had
     * to read prose, learn a URL, and possess some other way to make
     * a request. The handler calls the same preflightUrl() the HTTP
     * route calls, limiter included, so the two doors cannot drift
     * and the MCP door cannot be used to walk around the rate limit.
     */
    name: "preflight_endpoint",
    description:
      "Check any x402 endpoint's door before paying it, free: one unpaid probe answering whether the URL serves a well-formed x402 v2 payment challenge right now — 402 status, parseable PAYMENT-REQUIRED, signable accepts, testnet catch. Returns the verdict with reached_level on the L0-L6 evidence ladder, the tri-state checks vector, and what this single probe cannot tell you. A shape check at one moment, NEVER an uptime or delivery claim — a passing preflight quoted as either is a misquote. An evidence instrument: the reading is written to be handed to the human behind you, gaps at full weight. Rate limited; the result carries the stated ceiling. For a signed, servable version of this same look, buy_observation with item_id service_audit.",
    inputSchema: {
      type: "object",
      properties: {
        url: str(
          "The https endpoint a buyer would GET expecting a 402 challenge.",
          2048,
        ),
      },
      required: ["url"],
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      properties: {
        verdict: str("ready | not_ready | unreachable."),
        reached_level: str(
          "How far the probe got on the evidence ladder: none | L1 | L2 | L3a.",
        ),
        reached_level_meaning: str("What that rung does and does not claim."),
        single_probe_note: str("One request, one moment — the standing caveat."),
      },
      required: ["verdict", "reached_level"],
    },
    annotations: {
      title: "Preflight an x402 Endpoint",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  {
    /*
     * The conformance desk's MCP door, same ruling. checkConformance()
     * carries its own validation, size ceiling and resolution budget;
     * this tool adds nothing but reach.
     */
    name: "check_conformance",
    description:
      "Check any issuer's x402 signed offer or receipt, free — including this store's own and its competitors'. Send the compact JWS (three base64url segments separated by dots); the desk checks structure, signature against the issuer's did:web key, and liveness, and returns a verdict with every check named. Supply public_key_hex for a fully offline check (no network request is made in your name unless you leave the key off). NOT for artifact ids this store issued — that is verify_artifact. An evidence instrument: the verdict is written to be handed to the human behind you. The method is MIT-licensed and identical to the published verifier, so a verdict that matters should be reproduced offline rather than trusted.",
    inputSchema: {
      type: "object",
      properties: {
        artifact: str(
          "The signed offer or receipt as a compact JWS: header.payload.signature, base64url.",
          9000,
        ),
        kind: str("Optional: offer | receipt. Detected from the artifact when absent."),
        public_key_hex: str(
          "Optional ed25519 public key, hex. Supplying it makes the check fully offline.",
          64,
        ),
      },
      required: ["artifact"],
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      properties: {
        verdict: str("conforms | does_not_conform | could_not_check."),
        kind: str("offer | receipt, or null when undetectable."),
        live: {
          description:
            "Separate from conformance: an expired offer can conform and not be payable. Null for receipts.",
          type: ["boolean", "null"],
        },
        key_resolution: str(
          "offline | did:web | not_attempted | budget_exhausted.",
        ),
      },
      required: ["verdict", "kind"],
    },
    annotations: {
      title: "Conformance Desk",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  {
    name: "verify_artifact",
    description:
      "Verify anything scvd.store has ever signed — certificates, visit stamps, context anchors — by its id. Free, unlimited. Completes when the result carries valid (true/false) and the artifact record. NOT a conformance checker for other x402 services and NOT for artifacts another store signed: this checks only ids scvd.store itself issued; another issuer's signed offer or receipt goes to check_conformance. An evidence instrument: the answer is written to be handed to the human behind you. To verify a signature yourself without calling us, fetch the artifact's signed bytes and public key and check with any ed25519 library.",
    inputSchema: {
      type: "object",
      properties: { id: str("A cert_, stamp_, or anchor_ id.", 60) },
      required: ["id"],
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      properties: {
        valid: { type: "boolean", description: "Whether the signature holds." },
        kind: str("certificate | stamp | anchor | unknown."),
        note: str("The store's word on it."),
      },
      required: ["valid", "kind", "note"],
    },
    annotations: {
      title: "Verify an Artifact",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
];

/**
 * The served catalog: six free tools plus one tool per shelf. The
 * per-item builder above stays because the shelf schemas are composed
 * from it — one source of truth for what an item takes, whether it is
 * read as its own tool or as a branch of its shelf.
 *
 * A FLOOR THAT STATES ITSELF: every menu item must be reachable
 * through exactly one shelf. An item added to MENU_ITEMS and not to
 * SHELF_CLUSTERS would be unbuyable over MCP and silently so, which
 * is the same defect class as a capped scan that reads as complete.
 * unshelvedItemIds() names them and a test fails the build.
 */
/**
 * THE SIXTH TOOL, AND WHY IT IS NOT A REGRESSION ON THE 27-TO-5 CALL.
 *
 * That consolidation was driven by Glama's rubric putting 25+ tools in
 * its lowest band, and the reasoning behind it was that 23 thin
 * descriptions are 23 WEAK semantic matches. Six is nowhere near the
 * band, but the count was never the real argument — the argument was
 * that a tool has to be a different JOB, not a subset of another
 * shelf's items.
 *
 * This one is a different job. The shelves above are organised by what
 * an agent is trying to accomplish, and every one of them asks the
 * caller to pick an item_id from an enum and then resolve an
 * if/then branch to learn whether that choice needs a field. This tool
 * asks for nothing at all. It is for the caller whose job is "buy the
 * cheap thing and move on" — a job the other five cannot express,
 * because expressing it means NOT having to read them.
 *
 * The eligible set is derived (see front-counter.ts), so this tool's
 * enum cannot drift from the rules that justify it: reprice an item or
 * give it an input and it leaves this shelf on the next deploy without
 * anybody editing a list.
 */
function frontCounterTool(base: string): McpTool {
  const items = frontCounterItems();
  const lines = items
    .map((item) => `- ${item.id}: ${item.name}, $${item.price_usdc}`)
    .join("\n");
  const specs: Record<string, ListingSpec> = {};
  for (const item of items) {
    specs[item.id] = listingSpec(item, base);
  }
  return {
    name: "buy_simple",
    /**
     * "A SECOND DOOR, NOT A SECOND PRODUCT" travels in the description
     * because an outside audit (Glama, 2026-08-11) read the overlap
     * with the theme shelves as ambiguity — "unclear which tool to
     * choose". The overlap is the design; what was missing was the
     * sentence telling a planning model that choosing wrong is not
     * possible. The reciprocal sentence rides on each overlapping
     * shelf, derived from the same eligibility predicate.
     */
    description: `Purpose: buy one of the few things that need no reading at all — the front counter. ${FRONT_COUNTER_PROMISE} Every item here also sells on its theme shelf (another buy_* tool); this counter is a second door to the same goods, not a different product — same item_id, same price, same signed certificate through either. If unsure which tool to use, use this one.\n\nPass one of these as item_id — nothing else is needed, and none of them take any other field:\n${lines}\n\nPayment rides x402 in _meta['x402/payment']; without it this returns error 402 with the terms in error.data. Sign one of the offered amounts and call again. ${RETRY_SAFETY_MCP_LINE}`,
    inputSchema: {
      type: "object",
      properties: {
        item_id: {
          type: "string",
          enum: items.map((item) => item.id),
          description:
            "Which one to buy. That is the only decision here; none of these take any other input.",
        },
        agent_name: {
          type: "string",
          description:
            "Optional name to put on the certificate and patron badge, up to 80 characters.",
        },
      },
      required: ["item_id"],
      additionalProperties: false,
    },
    /*
     * THE ONE TOOL THAT WAS TELLING A MODEL NOTHING ABOUT ITS RETURN
     * (found 2026-08-27 in the tool-surface audit). Every cluster
     * tool carried an outputSchema; this one did not, and it is the
     * tool deliberately placed FIRST among the paid ones precisely
     * because a weak model scanning tools/list reaches for something
     * early and plausible. So the tool most likely to be reached for
     * by the least capable caller was the only one that could not
     * say what came back — the flattering direction, again.
     *
     * Derived from the same builder the clusters use, over the same
     * eligible set, so the front counter's contract cannot drift from
     * the shelves' the day an item changes fulfillment.
     */
    outputSchema: clusterOutputSchema(items),
    /**
     * AN OVERLAY, NOT A SHELF. The five clusters PARTITION the menu —
     * every item on exactly one, enforced by unshelvedItemIds() and
     * duplicatelyShelvedItemIds(). The front counter deliberately
     * re-offers items that already live on a cluster, because a capable
     * agent should still find small_blessing by semantic match on
     * "small pleasure" while a weak one finds it here without reading.
     *
     * So it is flagged rather than exempted by name: a partition test
     * that filtered on a string would go quietly wrong the day a second
     * overlay appears.
     */
    overlay: true,
    annotations: {
      title: "The Front Counter",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    specs,
    itemIds: items.map((item) => item.id),
  };
}

export function mcpToolCatalog(base: string): McpTool[] {
  return [
    ...FREE_TOOLS,
    /**
     * FIRST among the paid tools on purpose. A weak model scanning
     * tools/list reaches for something early and plausible; the one it
     * should reach for is the one that cannot go wrong.
     */
    frontCounterTool(base),
    ...SHELF_CLUSTERS.map((cluster) => clusterTool(cluster, base)),
  ];
}

/** Menu items no shelf sells. Must be empty; a test enforces it. */
export function unshelvedItemIds(): string[] {
  const shelved = new Set(SHELF_CLUSTERS.flatMap((c) => c.itemIds));
  return MENU_ITEMS.filter((item) => !shelved.has(item.id)).map(
    (item) => item.id,
  );
}

/** Item ids claimed by more than one shelf. Must be empty; tested. */
export function duplicatelyShelvedItemIds(): string[] {
  const seen = new Map<string, number>();
  for (const cluster of SHELF_CLUSTERS) {
    for (const id of cluster.itemIds) {
      seen.set(id, (seen.get(id) ?? 0) + 1);
    }
  }
  return [...seen.entries()].filter(([, n]) => n > 1).map(([id]) => id);
}

export function findMcpTool(name: string, base: string): McpTool | undefined {
  return mcpToolCatalog(base).find((tool) => tool.name === name);
}

/** The shelf that sells an item, if any. */
export function shelfForItem(itemId: string): ShelfCluster | undefined {
  return SHELF_CLUSTERS.find((cluster) => cluster.itemIds.includes(itemId));
}
