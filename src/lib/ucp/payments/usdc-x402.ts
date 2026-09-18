import { ARBITRUM_USDC, BASE_USDC, POLYGON_USDC, WORLD_USDC } from "@/lib/base-rpc";
import {
  arbitrumPayTo,
  basePayTo,
  checkoutNetworks,
  polygonPayTo,
  solanaPayTo,
  worldPayTo,
  type PaymentNetworkConfig,
} from "@/lib/payment-networks";
import { USDC_DECIMALS } from "@/lib/payments";
import { SOLANA_USDC_MINT } from "@/lib/solana-rpc";
import { SCVD_EXTENSION_VERSION, SCVD_NAMESPACE } from "@/lib/ucp/version";

/**
 * ONE PAYMENT HANDLER, FIVE INSTANCES, AND NOT ONE LINE OF NEW
 * SETTLEMENT CODE.
 *
 * The most security-sensitive thing this store does is decide that a
 * payment happened. That decision lives in the x402 v2 exact scheme,
 * behind a facilitator, and it has been settling real money on five
 * rails for months. A UCP implementation that built its own transfer
 * verification beside it would be a second answer to the one question
 * where two answers is the whole failure — so this handler is a
 * description of the existing till, not a replacement for it.
 *
 * WHAT IS DECLARED HERE IS DERIVED, NOT TYPED. The rails come from
 * `checkoutNetworks(env)`, which is the same gate the 402 uses, so a
 * rail whose receiving wallet is unset cannot be advertised in the
 * profile while the checkout refuses it — the exact drift an outside
 * directory reads as a merchant lying about what it accepts.
 *
 * THE CHAIN IS NOT THE PRODUCT. There are no Base variants and no
 * Solana SKUs. Which rail a buyer settles on is a property of the
 * payment, the same way a card network is; every variant in the
 * catalog is payable through every instance below.
 */

export const USDC_HANDLER_TYPE = `${SCVD_NAMESPACE}.payment.usdc`;

export interface UsdcHandlerConfig {
  /** Present only on a checkout response, where the terms are exact. */
  amount_atomic?: string;
  checkout_id?: string;
  checkout_version?: number;
  expires_at?: string;
  terms_digest?: string;
  protocol: "x402";
  protocol_version: 2;
  scheme: "exact";
  network: string;
  asset: string;
  decimals: number;
  pay_to: string;
  explorer: string;
  /** What "settled" means on this rail, in the rail's own vocabulary. */
  finality: { model: string; accepted_at: string };
}

export interface UsdcHandlerInstance {
  id: string;
  version: string;
  spec: string;
  schema: string;
  config: UsdcHandlerConfig;
}

/**
 * THE TOKEN ADDRESSES ARE IMPORTED, NOT RETYPED, and the spelling is
 * the imported one.
 *
 * 2026-09-12: the same wallet written lowercase on one surface and
 * checksummed on another was filed by x402-list as a payTo ROTATION,
 * and its signability check has read unknown since. The lesson is not
 * "use EIP-55" — it is "emit one string". These constants are the
 * exact bytes the x402 accepts already carry, so a directory diffing
 * UCP against a 402 from this store sees the same asset twice rather
 * than a second asset. The pay-to helpers do their own canonicalising
 * for the same reason; both sides call the shared code and neither
 * side formats an address of its own.
 */
const RAIL_ASSETS: Record<string, string> = {
  base: BASE_USDC,
  polygon: POLYGON_USDC,
  arbitrum: ARBITRUM_USDC,
  world: WORLD_USDC,
  solana: SOLANA_USDC_MINT,
};

/**
 * FIVE CHAINS DO NOT SHARE ONE CONFIRMATION COUNT, so this store does
 * not publish one.
 *
 * "N confirmations" is a number borrowed from a chain that does not
 * have the same consensus as the next one. Base and World are OP-stack
 * rollups; Polygon PoS has its own finalised-state rule; Arbitrum's
 * sequencer acceptance is a soft confirmation that is not parent-chain
 * finality; Solana has explicit commitment levels. The store's own
 * readers already speak each rail's vocabulary — `eth_getBlockByNumber
 * ["finalized"]` on the EVM rails, `commitment: "confirmed"` on Solana
 * — so what is published here is what the code actually waits for,
 * per rail, rather than a number that would be a fiction on four of
 * the five.
 */
export const FINALITY_NOTE =
  "There is no storewide confirmation count. Each instance publishes what settled means on its own rail: the EVM rails reconcile against that chain's own `finalized` block tag, and Solana is read at the `confirmed` commitment with the transaction's error state checked. Five chains do not share one number.";

const RAIL_FINALITY: Record<string, { model: string; accepted_at: string }> = {
  base: {
    model: "OP-stack rollup with Ethereum-backed finality",
    accepted_at:
      "The transfer is read back on Base and reconciled against the chain's own `finalized` block tag; a settle observed but not yet finalized is reported as pending rather than as paid.",
  },
  polygon: {
    model: "Polygon PoS finalised state",
    accepted_at:
      "The transfer is read back on Polygon and reconciled against the chain's own `finalized` block tag, not against a borrowed block count.",
  },
  arbitrum: {
    model: "Arbitrum One rollup; sequencer acceptance is not parent-chain finality",
    accepted_at:
      "The transfer is read back on Arbitrum and reconciled against the chain's own `finalized` block tag. A sequencer-accepted transaction that is not yet finalized is a soft confirmation and is reported as such.",
  },
  world: {
    model: "World Chain, OP-stack with Ethereum-backed finality",
    accepted_at:
      "Its own rail, not an alias for Base: the transfer is read back on World Chain and reconciled against that chain's `finalized` block tag.",
  },
  solana: {
    model: "Solana commitment levels",
    accepted_at:
      "The transaction is read back at the `confirmed` commitment with its error state checked, against the USDC mint and the recipient account. Slots, not blocks; commitment, not confirmations.",
  },
};

function railPayTo(env: PaymentNetworkConfig, key: string): string | null {
  if (key === "base") return basePayTo(env);
  if (key === "polygon") return polygonPayTo(env);
  if (key === "arbitrum") return arbitrumPayTo(env);
  if (key === "world") return worldPayTo(env);
  if (key === "solana") return solanaPayTo(env);
  return null;
}

export function handlerSpecUrl(base: string): string {
  return `${base}/ucp/specs/payment/usdc-x402`;
}

export function handlerSchemaUrl(base: string): string {
  return `${base}/ucp/schemas/payment/usdc-x402.json`;
}

/**
 * The receiving wallets are not committed to this repository and are
 * not hard-coded here: they come from the environment, through the
 * same helpers the 402 uses. The token contracts are constants because
 * they are facts about the chains rather than about this store.
 */
export function usdcPaymentHandlers(
  env: PaymentNetworkConfig,
  base: string,
): UsdcHandlerInstance[] {
  const instances: UsdcHandlerInstance[] = [];
  for (const rail of checkoutNetworks(env)) {
    const payTo = railPayTo(env, rail.key);
    const asset = RAIL_ASSETS[rail.key];
    const finality = RAIL_FINALITY[rail.key];
    if (!payTo || !asset || !finality) continue;
    instances.push({
      id: `scvd-usdc-${rail.key}`,
      version: SCVD_EXTENSION_VERSION,
      spec: handlerSpecUrl(base),
      schema: handlerSchemaUrl(base),
      config: {
        protocol: "x402",
        protocol_version: 2,
        scheme: "exact",
        network: rail.network,
        asset,
        decimals: USDC_DECIMALS,
        pay_to: payTo,
        explorer: rail.explorer,
        finality,
      },
    });
  }
  return instances;
}

/**
 * THE JSON SCHEMA FOR THE HANDLER, SERVED FROM THE NAMESPACE THAT
 * OWNS IT.
 *
 * `store.scvd.payment.usdc` resolves to a schema on scvd.store. That
 * is not decoration: an extension whose name claims one authority and
 * whose schema lives at another is exactly what a validator is
 * supposed to reject, and naming somebody else's namespace for a
 * handler only this store implements would be the flattering
 * placeholder problem with a payment instrument attached.
 */
export function usdcHandlerSchema(base: string): Record<string, unknown> {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: handlerSchemaUrl(base),
    title: "SCVD exact-USDC payment handler (x402 v2)",
    description:
      "Configuration for one settlement rail of Sean-Claude Van Damme's General Store. One handler type, one instance per enabled chain. The chain is a property of the payment, never of the product: every catalog variant is payable through every instance.",
    type: "object",
    required: [
      "protocol",
      "protocol_version",
      "scheme",
      "network",
      "asset",
      "decimals",
      "pay_to",
    ],
    additionalProperties: false,
    properties: {
      protocol: { const: "x402" },
      protocol_version: { const: 2 },
      scheme: {
        const: "exact",
        description:
          "x402's exact scheme settles a stated amount. This is why pay-what-it-deserves items are published as discrete tier variants rather than as a price range.",
      },
      network: {
        type: "string",
        description:
          "CAIP-2 chain identifier. Advertised only while the store has a valid receiving wallet configured for it.",
      },
      asset: {
        type: "string",
        description:
          "The chain's native USDC contract, or its SPL mint on Solana. Byte-identical to the asset the store's own x402 quote carries.",
      },
      decimals: { const: 6 },
      pay_to: {
        type: "string",
        description:
          "The receiving address. EVM addresses are EIP-55 checksummed, one spelling storewide.",
      },
      explorer: { type: "string", format: "uri" },
      finality: {
        type: "object",
        description: FINALITY_NOTE,
        required: ["model", "accepted_at"],
        properties: {
          model: { type: "string" },
          accepted_at: { type: "string" },
        },
      },
    },
  };
}

/**
 * THE HANDLER AT TRANSACTION TIME, narrowed from "here is a rail" to
 * "here is the exact transfer that settles THIS checkout".
 *
 * The profile's handler says which chains and tokens this store takes.
 * A checkout response's handler must say more, and the specification
 * puts it in the same place: ucp.payment_handlers is REQUIRED on a
 * checkout response, and its config may carry full runtime state. So
 * the amount, the recipient, the checkout it belongs to, its version
 * and the digest over those terms ride here — where a platform about
 * to pay is already looking — rather than only in this store's own
 * metadata block, where a conforming client has no reason to look.
 *
 * Narrowed to ONE instance once a rail is chosen. Offering five when
 * the quote commits to one would invite a buyer to pay on a rail this
 * checkout will refuse.
 */
export function quotedUsdcHandler(
  env: PaymentNetworkConfig,
  base: string,
  quote: {
    network: string;
    amount_atomic: string;
    checkout_id: string;
    checkout_version: number;
    expires_at: string;
    terms_digest: string;
    /**
     * THE EXACT x402 REQUIREMENTS TO SIGN AGAINST (2026-09-18), as the
     * checkout froze them at Create: scheme, network, asset, amount,
     * payTo, maxTimeoutSeconds and the EIP-712 domain in `extra`. A
     * buyer holding any x402 client signs this object as it would a
     * 402's accepts[] entry, and Complete verifies against the same
     * frozen copy — never against what the shelf says later.
     */
    x402_requirements?: Record<string, unknown>;
  },
): Record<string, UsdcHandlerInstance[]> {
  const rail = usdcPaymentHandlers(env, base).find(
    (instance) => instance.config.network === quote.network,
  );
  if (!rail) return { [USDC_HANDLER_TYPE]: [] };
  return {
    [USDC_HANDLER_TYPE]: [
      {
        ...rail,
        config: {
          ...rail.config,
          amount_atomic: quote.amount_atomic,
          checkout_id: quote.checkout_id,
          checkout_version: quote.checkout_version,
          expires_at: quote.expires_at,
          terms_digest: quote.terms_digest,
          ...(quote.x402_requirements ? { x402_requirements: quote.x402_requirements } : {}),
        },
      },
    ],
  };
}
