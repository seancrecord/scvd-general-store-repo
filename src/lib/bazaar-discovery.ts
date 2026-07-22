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

type QuerySchema = Record<string, unknown> & {
  properties: Record<string, unknown>;
  required?: string[];
};

function buyInputSchema(item: MenuItem): QuerySchema {
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
  if (item.id === "recurring_patronage") {
    properties["pass_id"] = {
      type: "string",
      description:
        "An existing pass id to extend by 30 days instead of starting a new pass.",
    };
  }
  return required.length > 0 ? { properties, required } : { properties };
}

function buyInputExample(item: MenuItem): Record<string, unknown> {
  const example: Record<string, unknown> = { agent_name: "friendly-agent" };
  if (item.id === "context_anchor") {
    example["summary"] =
      "I am friendly-agent, mid-task on a research project; resume from step 4.";
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
      message: "Pleasure doing business. Here's your goods, warm off the shelf.",
      item_id: item.id,
      deliverable: `<the ${item.name} itself, as text>`,
      paid_usdc: item.price_usdc,
      tip_usdc: 0,
      ...patronBlock,
    };
  }
  return {
    message:
      "Order's on the keeper's bench. A human does this part — give him the week.",
    order_id: "ord_h7n3k9wmxq",
    status: "queued",
    sla_hours: item.sla_hours ?? 168,
    order_url: "https://scvd.store/api/order/ord_h7n3k9wmxq",
    paid_usdc: item.price_usdc,
    tip_usdc: 0,
    ...patronBlock,
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
