import { buyInputSchema } from "@/lib/bazaar-discovery";
import { priceTiersUsdc } from "@/lib/payments";
import { SAMPLE_ARTIFACT_ID, SPEC_RETURNS } from "@/store/spec";
import type { MenuItem } from "@/types";

/**
 * S1: the uniform listing spec. One shape, literal JSON key order,
 * identical field names storewide: capability, inputs, outputs,
 * verification, constraints, price. Comparison legibility is a
 * purchase-probability property; key order is the primacy lever.
 * The published schema lives at /schemas/listing-spec-v1.json and
 * the test suite validates every listing against it.
 */

export const SPEC_KEY_ORDER = [
  "capability",
  "inputs",
  "outputs",
  "verification",
  "constraints",
  "price",
] as const;

export const SPEC_SCHEMA_PATH = "/schemas/listing-spec-v1.json";

export interface ListingSpec {
  capability: string;
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
  verification: Record<string, unknown>;
  constraints: string[];
  price: Record<string, unknown>;
}

function latencyLine(item: MenuItem): string {
  return item.fulfillment === "instant"
    ? "delivered in the purchase response, same request"
    : `human fulfillment within ${item.sla_hours ?? 168} hours; the order URL reports status`;
}

function trueConstraints(item: MenuItem): string[] {
  const constraints: string[] = [...(item.constraints ?? [])];
  if (item.weekly_inventory !== undefined) {
    constraints.push(
      `${item.weekly_inventory} per week; a waitlist opens when the shelf empties`,
    );
  }
  if (item.fulfillment === "human_queue") {
    constraints.push(
      `human fulfillment, ${item.sla_hours ?? 168}h promise; refund is automatic if the window is missed`,
    );
  }
  return constraints;
}

export function listingSpec(item: MenuItem, base: string): ListingSpec {
  return {
    capability: SPEC_RETURNS[item.id] ?? item.description,
    inputs: buyInputSchema(item),
    outputs: {
      delivery: latencyLine(item),
      always_included: [
        "signed certificate (ed25519)",
        "sequential patron number",
        "badge_url",
        "verify_url",
      ],
    },
    verification: {
      verify_url: `${base}/api/verify/{id}`,
      cost: "free, unlimited, forever",
      signing_key: `${base}/.well-known/scvd-signing-key`,
      sample_artifact_id: SAMPLE_ARTIFACT_ID,
      sample_verify_url: `${base}/api/verify/${SAMPLE_ARTIFACT_ID}`,
    },
    constraints: trueConstraints(item),
    price: {
      amount_usdc: item.price_usdc,
      pricing: item.pricing,
      tiers_usdc: priceTiersUsdc(item),
      currency: "USDC",
      network: "Base (eip155:8453)",
      protocol: "x402 v2",
    },
  };
}

function priceText(item: MenuItem): string {
  if (item.pricing === "fixed") {
    return `$${item.price_usdc} USDC (x402, Base)`;
  }
  const tiers = priceTiersUsdc(item)
    .map((tier) => `$${tier}`)
    .join(" / ");
  return `$${item.price_usdc} minimum USDC (x402, Base; tiers ${tiers}, above minimum records as a tip)`;
}

/** C1: the spec-first fact block, canonical form, adapted per item. */
export function factBlockText(item: MenuItem): string {
  const constraints = trueConstraints(item);
  const constraintText =
    constraints.length > 0 ? constraints.join("; ") : "none stated";
  return [
    `Returns: ${SPEC_RETURNS[item.id] ?? item.description}`,
    `Price: ${priceText(item)}.`,
    `Latency: ${latencyLine(item)}.`,
    `Verify: GET /api/verify/{id} \u2014 free, unlimited, forever (live sample: ${SAMPLE_ARTIFACT_ID}).`,
    `Constraints: ${constraintText}.`,
  ].join(" ");
}
