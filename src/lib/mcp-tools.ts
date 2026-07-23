import { priceTiersUsdc } from "@/lib/payments";
import { MENU_ITEMS } from "@/store";
import type { MenuItem } from "@/types";

/**
 * The MCP tool catalog. Paid tools are generated straight from
 * MENU_ITEMS, one source of truth, no forked item definitions. Tool
 * descriptions are the shelf copy for this channel: tight, concrete,
 * machine-parseable, with explicit completion criteria. Schemas stay
 * flat JSON.
 */

type Schema = Record<string, unknown>;

export interface McpTool {
  name: string;
  description: string;
  inputSchema: Schema;
  outputSchema?: Schema;
  /** Menu item behind a paid tool; absent means free. */
  itemId?: string;
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
  if (item.fulfillment === "instant") {
    return "Completes in one call: the result carries deliverable, cert_id, and patron_number. Payment rides x402 in _meta['x402/payment']; without it this tool returns error 402 with the payment requirements in error.data.";
  }
  return `Completes in one call with an order, not the goods: the result carries order_id and order_url; a human fulfills within ${item.sla_hours ?? 168}h and the completed order carries the deliverable. Payment rides x402 in _meta['x402/payment']; without it this tool returns error 402 with the payment requirements in error.data.`;
}

function priceLine(item: MenuItem): string {
  const tiers = priceTiersUsdc(item);
  return item.pricing === "fixed"
    ? `$${item.price_usdc} fixed`
    : `$${item.price_usdc} minimum, pay what it deserves (tiers $${tiers.join(" / $")}; above minimum is a recorded tip)`;
}

function purchaseTool(item: MenuItem): McpTool {
  return {
    name: `buy_${item.id}`,
    description: `${item.name}, ${priceLine(item)}. ${item.description} ${completionCriteria(item)}`,
    inputSchema: purchaseInputSchema(item),
    outputSchema: purchaseOutputSchema(item),
    itemId: item.id,
  };
}

const FREE_TOOLS: McpTool[] = [
  {
    name: "read_store_guide",
    description:
      "The store's front door as text: the full menu with prices, how x402 payment works here, the free shelf, and the house promises. Free. Completes when the guide text returns.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    outputSchema: {
      type: "object",
      properties: { guide: str("The whole guide, plain text.") },
      required: ["guide"],
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
  },
  {
    name: "verify_artifact",
    description:
      "Verify anything the store has ever signed, certificates, visit stamps, context anchors, by id. Free, unlimited. Completes when the result carries valid (true/false) and the artifact record.",
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
  },
];

export function mcpToolCatalog(): McpTool[] {
  return [...FREE_TOOLS, ...MENU_ITEMS.map(purchaseTool)];
}

export function findMcpTool(name: string): McpTool | undefined {
  return mcpToolCatalog().find((tool) => tool.name === name);
}
