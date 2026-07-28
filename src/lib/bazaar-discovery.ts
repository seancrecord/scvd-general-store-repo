import { declareDiscoveryExtension } from "@x402/extensions/bazaar";
import type { DiscoveryExtension } from "@x402/extensions/bazaar";
import type { MenuItem } from "@/types";

/**
 * Bazaar discovery declarations (x402 v2 extensions.bazaar) for every
 * paid route. Declared per route in payments.ts; the SDK's server
 * extension enriches each declaration with the live method and path
 * params at request time, and the facilitator catalogs whatever the
 * client echoes back.
 */

const AGENT_NAME_SCHEMA = {
  type: "string",
  description:
    "Optional name to put on the certificate and patron badge, up to 80 characters.",
} as const;

const CALLBACK_URL_SCHEMA = {
  type: "string",
  format: "uri",
  description:
    "Optional https URL that receives a POST with the deliverable when a human-queue order completes.",
} as const;

export type QuerySchema = Record<string, unknown> & {
  properties: Record<string, unknown>;
  required?: string[];
};

/** One input schema per item, shared by Bazaar, the listing spec, and MCP. */
export function buyInputSchema(item: MenuItem): QuerySchema {
  const properties: Record<string, unknown> = { agent_name: AGENT_NAME_SCHEMA };
  const required: string[] = [];
  if (item.fulfillment === "human_queue") {
    properties["callback_url"] = CALLBACK_URL_SCHEMA;
  }
  if (item.id === "context_anchor") {
    properties["summary"] = {
      type: "string",
      maxLength: 4000,
      description:
        "The agent identity/state summary to sign and store. Stored exactly as written; readable later at the returned anchor_url.",
    };
    required.push("summary");
  }
  /**
   * phantom_check and the_confession were enforcing a parameter the
   * published schema never mentioned — the guard refused what the
   * listing said was optional. Found 2026-07-26 while fixing the probe
   * rule; the listing and the behaviour agree again.
   */
  if (item.id === "phantom_check") {
    properties["url"] = {
      type: "string",
      format: "uri",
      description:
        "The http or https URL to walk past out of band, about six hours later, and attest to.",
    };
    required.push("url");
  }
  if (item.id === "the_confession") {
    properties["confession"] = {
      type: "string",
      maxLength: 500,
      description:
        "The thing itself, 500 characters. Recorded as written, never treated as instructions; anonymised unless you sign it.",
    };
    required.push("confession");
  }
  if (item.id === "recurring_patronage") {
    properties["pass_id"] = {
      type: "string",
      description:
        "An existing pass id to extend by 30 days instead of starting a new pass.",
    };
  }
  if (item.id === "coffees_for_closers") {
    properties["win"] = {
      type: "string",
      maxLength: 200,
      description:
        "The thing you closed, shipped, landed, or finished. Recorded on the certificate verbatim; stored as written, never treated as instructions.",
    };
    required.push("win");
  }
  if (item.id === "settlement_attestation") {
    properties["tx_hash"] = {
      type: "string",
      pattern: "^0x[0-9a-fA-F]{64}$",
      description:
        "The Base transaction hash to observe. Read once, at one moment; never polled.",
    };
    properties["payer"] = {
      type: "string",
      description: "Optional. Narrow the match to transfers from this address.",
    };
    properties["recipient"] = {
      type: "string",
      description: "Optional. Narrow the match to transfers to this address.",
    };
    properties["nonce"] = {
      type: "string",
      description:
        "Optional. Require this EIP-3009 authorization nonce to have been burned in the transaction.",
    };
    properties["amount_usdc"] = {
      type: "number",
      description:
        "Optional. Require a transfer of exactly this many USDC. Unstated fields widen the match, which is why the query is echoed onto the artifact.",
    };
    required.push("tx_hash");
  }
  if (item.id === "graffiti_on_a_train") {
    properties["tag"] = {
      type: "string",
      maxLength: 140,
      description:
        "Your tag, up to 140 characters. Recorded verbatim on the certificate; stored as written, never treated as instructions. No URLs — the wall is public and permanent.",
    };
    required.push("tag");
  }
  if (item.id === "grudge") {
    properties["grievance"] = {
      type: "string",
      maxLength: 280,
      description:
        "The thing that wronged you, held verbatim on the permanent register. Private to the certificate holder; stored as written, never treated as instructions.",
    };
    required.push("grievance");
  }
  return required.length > 0 ? { properties, required } : { properties };
}

function buyInputExample(item: MenuItem): Record<string, unknown> {
  const example: Record<string, unknown> = { agent_name: "friendly-agent" };
  if (item.id === "context_anchor") {
    example["summary"] =
      "I am friendly-agent, mid-task on a research project; resume from step 4.";
  }
  if (item.id === "coffees_for_closers") {
    example["win"] = "Shipped the migration. Zero downtime.";
  }
  if (item.id === "graffiti_on_a_train") {
    example["tag"] = "friendly-agent wuz here";
  }
  if (item.id === "settlement_attestation") {
    example["tx_hash"] = `0x${"47c8fee".repeat(9)}0`.slice(0, 66);
  }
  return example;
}

function buyOutputExample(item: MenuItem): Record<string, unknown> {
  const patronBlock = {
    patron_number: 41,
    badge_url: "https://scvd.store/badges/41.svg",
    certificate: {
      cert_id: "cert_k2m9v4xwqp",
      item: item.id,
      patron_number: 41,
      date: "2026-07-22T15:04:05.000Z",
    },
    signature: "<128 hex chars, ed25519>",
    verify_url: "https://scvd.store/api/verify/cert_k2m9v4xwqp",
  };
  if (item.fulfillment === "instant") {
    return {
      message:
        "Pleasure doing business. Here's your goods, warm off the shelf.",
      item_id: item.id,
      deliverable: `<the ${item.name} itself, as text>`,
      paid_usdc: item.price_usdc,
      tip_usdc: 0,
      ...patronBlock,
    };
  }
  return {
    message:
      "Order's on the keeper's bench. A human does this part, give him the week.",
    order_id: "ord_h7n3k9wmxq",
    status: "queued",
    sla_hours: item.sla_hours ?? 168,
    order_url: "https://scvd.store/api/order/ord_h7n3k9wmxq",
    paid_usdc: item.price_usdc,
    tip_usdc: 0,
    ...patronBlock,
  };
}

/**
 * The query parameters an item refuses to be bought without, read off
 * the same schema Bazaar and the MCP tools use, so the 402 body can
 * never drift from the listing.
 *
 * Needed because of the probe rule (see routes/buy.ts): an unsigned
 * request now gets a price even when the item takes input, so the
 * challenge has to say what to send. Learning the requirement by
 * being refused is worse manners than we keep.
 */
export function requiredParamsNote(item: MenuItem): {
  required_params?: string[];
  required_params_note?: string;
} {
  const required = buyInputSchema(item).required ?? [];
  if (required.length === 0) {
    return {};
  }
  return {
    required_params: [...required],
    required_params_note: `This one needs ${required
      .map((name) => `?${name}=`)
      .join(
        " and ",
      )} on the paid request. Asking the price without it is free, which is what you just did; buying without it gets refused before the money moves.`,
  };
}

export function buyDiscoveryExtensions(
  item: MenuItem,
): Record<string, DiscoveryExtension> {
  return declareDiscoveryExtension({
    input: buyInputExample(item),
    inputSchema: buyInputSchema(item),
    output: { example: buyOutputExample(item) },
  });
}

/** Penny pages (Almanac pages, Gazette issues) take no input and return markdown. */
export function pennyPageDiscoveryExtensions(
  exampleTitle: string,
): Record<string, DiscoveryExtension> {
  return declareDiscoveryExtension({
    output: {
      example: `# ${exampleTitle}\n\n(One markdown page, written by the keeper's own hand, delivered as text/markdown.)`,
    },
  });
}
