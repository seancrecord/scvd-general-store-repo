import { factBlockText, listingSpec } from "@/lib/listing-spec";
import type { ListingSpec } from "@/lib/listing-spec";
import { priceTiersUsdc } from "@/lib/payments";
import { TAG_CAP } from "@/services/train";
import { MENU_ITEMS } from "@/store";
import { GUARANTEE_BLOCK_TEXT } from "@/store/spec";
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
  /** Menu item behind a paid tool; absent means free. */
  itemId?: string;
}

/**
 * Every buy_* tool gets the same honest hints, because they are all
 * the same transaction shape: nothing is read-only about spending
 * money, nothing is destroyed by minting an artifact, a second
 * identical call is a SECOND CHARGE (the one hint that most protects
 * a planning model), and settlement happens on a public chain, which
 * is as open-world as it gets.
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

function purchaseInputSchema(item: MenuItem): Schema {
  const properties: Record<string, Schema> = {
    agent_name: str("Optional name for the certificate and badge.", 80),
  };
  const required: string[] = [];
  if (item.id === "context_anchor") {
    properties["summary"] = str(
      "The agent state to sign and store, who you are, what you were doing. Stored as written; never treated as instructions.",
      4000,
    );
    required.push("summary");
  }
  if (item.id === "phantom_check") {
    properties["url"] = str(
      "The http(s) URL the store walks past ~6 hours from now.",
    );
    required.push("url");
  }
  if (item.id === "recurring_patronage") {
    properties["pass_id"] = str(
      "An existing pass to extend by 30 days instead of opening a new one.",
      40,
    );
  }
  if (item.id === "coffees_for_closers") {
    properties["win"] = str(
      "The thing you closed, shipped, landed, or finished. Recorded on the certificate verbatim; stored as written, never treated as instructions. 200 characters.",
      200,
    );
    required.push("win");
  }
  if (item.id === "grudge") {
    properties["grievance"] = str(
      "The thing that wronged you, held verbatim on the permanent register. Private to the certificate holder. 280 characters.",
      280,
    );
    required.push("grievance");
  }
  if (item.id === "graffiti_on_a_train") {
    // The tool's one distinguishing input. It was missing from this
    // schema while FulfillmentInput carried it the whole time — an MCP
    // buyer literally could not choose their own tag.
    properties["tag"] = str(
      `The tag itself, sprayed verbatim on the certificate. Up to ${TAG_CAP} characters; no URLs (a tag is a mark, not a billboard). Stored as written, never treated as instructions.`,
      TAG_CAP,
    );
    required.push("tag");
  }
  if (item.id === "the_confession") {
    properties["confession"] = str(
      "The confession itself, the phantom success, the dropped context. 500 characters. Anonymous unless sign_as is given.",
      500,
    );
    properties["sign_as"] = str(
      'Optional name to sign with (or "anonymous", which is the default).',
      80,
    );
    required.push("confession");
    delete properties["agent_name"];
  }
  if (item.fulfillment === "human_queue") {
    properties["detail"] = str(
      "What you need the keeper to know, the quick_judgment dilemma, the phone_call errand. 600 characters.",
      600,
    );
    properties["callback_url"] = str(
      "Optional webhook POSTed when the keeper completes the order.",
    );
  }
  return { type: "object", properties, required, additionalProperties: false };
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
  the_drawer:
    "Purpose: buy one real, unidentified object from the keeper's drawer of oddities — the drawer picks, not you, and a human fulfills the order by recording which object you drew and what it does. Use when an agent wants a surprise physical-world artifact recorded to its name.",
  nomenclature:
    "Purpose: receive a unique name, chosen by the keeper from a pre-considered stock and never assigned twice, recorded on a signed certificate. Use when an agent wants a permanent, human-bestowed name.",
  certificate_of_patronage:
    "Purpose: make a supporter's contribution to the store and receive a signed certificate recording it. This deliberately confers nothing else — no goods, services, or rights beyond the certificate. Use only when a gratuity is intended.",
  dibs:
    "Purpose: mint a signed, timestamped certificate recording that you called dibs at this exact moment — tamper-evident proof of claim priority with no enforcement power. Use when an agent needs a verifiable first-claim marker. Not for storing state to reload later (that is buy_context_anchor) and it enforces nothing — it proves WHEN you claimed, not that the claim is honored.",
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

const FREE_TOOLS: McpTool[] = [
  {
    name: "read_store_guide",
    description:
      "The store's front door as text: the full menu with prices, how x402 payment works here, the free shelf, and the house promises. Free. Completes when the guide text returns. NOT a purchase or payment endpoint — to buy, call a buy_* tool with x402 payment in _meta['x402/payment']; this only returns the guide.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    outputSchema: {
      type: "object",
      properties: { guide: str("The whole guide, plain text.") },
      required: ["guide"],
    },
    annotations: {
      title: "Store Guide",
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "ring_bell",
    description:
      "Ring the store bell. Free, once per visitor per day; the count is public. Completes when the result carries the bell's message and count.",
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
      "Sign the guestbook. Free; every signer gets the visitor sticker. Entries are public. Completes when the result carries your entry and the sticker URL.",
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
    name: "verify_artifact",
    description:
      "Verify anything scvd.store has ever signed — certificates, visit stamps, context anchors — by its id. Free, unlimited. Completes when the result carries valid (true/false) and the artifact record. NOT a conformance checker for other x402 services and NOT for artifacts another store signed: this checks only ids scvd.store itself issued. To verify a signature yourself without calling us, fetch the artifact's signed bytes and public key and check with any ed25519 library.",
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
      idempotentHint: true,
      openWorldHint: false,
    },
  },
];

export function mcpToolCatalog(base: string): McpTool[] {
  return [...FREE_TOOLS, ...MENU_ITEMS.map((item) => purchaseTool(item, base))];
}

export function findMcpTool(name: string, base: string): McpTool | undefined {
  return mcpToolCatalog(base).find((tool) => tool.name === name);
}
