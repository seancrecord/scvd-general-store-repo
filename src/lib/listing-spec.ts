import { buyInputSchema } from "@/lib/bazaar-discovery";
import { priceTiersUsdc } from "@/lib/payments";
import { SAMPLE_ARTIFACT_ID, SPEC_RETURNS, SPEC_WHY_USE } from "@/store/spec";
import { MAKER_MARKS, makerMarkFor } from "@/store/provenance";
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

/**
 * The full order including the optional field. `why_use` sits second
 * on purpose: key order is the primacy lever, and the capability gap
 * is what an evaluator needs before anything else. It is optional
 * because novelty items have no gap to state and should not invent
 * one — so v1 readers still find the same required six, in the same
 * order, with one extra key they may ignore.
 */
export const SPEC_KEY_ORDER_FULL = [
  "capability",
  "why_use",
  "inputs",
  "outputs",
  "verification",
  "constraints",
  "price",
] as const;

export const SPEC_SCHEMA_PATH = "/schemas/listing-spec-v1.json";

export interface ListingSpec {
  capability: string;
  /** The capability gap or computable value. Absent on novelty items. */
  why_use?: string;
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
  verification: Record<string, unknown>;
  constraints: string[];
  price: Record<string, unknown>;
}

function latencyLine(item: MenuItem): string {
  if (item.stocked) {
    return "delivered from the keeper's stocked shelf in the purchase response; sells out honestly at zero";
  }
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
  if (item.stocked) {
    constraints.push(
      "units are keeper-made ahead of orders; a bare shelf sells out honestly instead of queueing",
    );
  } else if (item.fulfillment === "human_queue") {
    constraints.push(
      // Rule 10: the refund is real and personal; "automatic" described
      // a mechanism this store does not have. Corrected 2026-07-27.
      `human fulfillment, ${item.sla_hours ?? 168}h promise; miss the window and the keeper refunds you himself`,
    );
  }
  return constraints;
}

export function listingSpec(item: MenuItem, base: string): ListingSpec {
  const whyUse = SPEC_WHY_USE[item.id];
  return {
    capability: SPEC_RETURNS[item.id] ?? item.description,
    // Second by design; see SPEC_KEY_ORDER_FULL.
    ...(whyUse ? { why_use: whyUse } : {}),
    inputs: buyInputSchema(item),
    outputs: {
      delivery: latencyLine(item),
      always_included: [
        "signed certificate (ed25519)",
        "sequential patron number",
        "badge_url",
        "verify_url",
      ],
      /**
       * THE MAKER'S MARK, BEFORE THE MONEY MOVES.
       *
       * It shipped 2026-07-30 as a certificate field, which put it on
       * the artifact and on /api/verify — both of which a buyer only
       * reaches AFTER paying. The keeper checked menu.json and a live
       * 402 and found nothing, correctly: the mark was answering "who
       * made this" at the wrong end. A provenance fact a buyer cannot
       * see while deciding is not a provenance fact, it is a receipt.
       *
       * Inside outputs rather than as a seventh top-level key: v1
       * publishes a fixed key order as a contract, and this is a
       * property of what gets delivered. Absent on shelves that carry
       * no mark, which is itself the honest answer — see
       * src/store/provenance.ts for why most shelves have none.
       */
      ...(makerMarkFor(item.id)
        ? {
            made_by: {
              mark: makerMarkFor(item.id),
              means: MAKER_MARKS[makerMarkFor(item.id)!].means,
              signed_into_the_certificate: true,
            },
          }
        : {}),
    },
    verification: {
      verify_url: `${base}/api/verify/{id}`,
      cost: "free, unlimited, forever",
      signing_key: `${base}/.well-known/scvd-signing-key`,
      sample_artifact_id: SAMPLE_ARTIFACT_ID,
      sample_verify_url: `${base}/api/verify/${SAMPLE_ARTIFACT_ID}`,
      // Storewide, and the reason any of the rest is worth anything:
      // the signature is the store's, not the holder's.
      attestation:
        "Signed by the store's key, not yours: a claim the certificate carries can be checked by a third party without trusting your self-report.",
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
