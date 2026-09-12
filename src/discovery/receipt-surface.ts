import { buyInputSchema } from "@/lib/bazaar-discovery";
import { sha256Hex } from "@/lib/idempotency";
import { jcsCanonicalize } from "@/lib/jcs";
import type { MenuItem } from "@/types";

/**
 * The catalog surface a buyer selected — route, list price, required
 * inputs. No base URL: env bases differ and the hash has to be the
 * same in CI as in production. Landscape §11 receipt_coherence.
 */
export interface SelectedSurface {
  route: string;
  price_usdc: number;
  required: string[];
}

export function buyRouteFor(itemId: string): string {
  return `/api/buy/${itemId}`;
}

export function selectedSurface(item: MenuItem): SelectedSurface {
  return {
    route: buyRouteFor(item.id),
    price_usdc: item.price_usdc,
    required: [...(buyInputSchema(item).required ?? [])],
  };
}

/** SHA-256 of the JCS form. The certificate stores this hex as `saw`. */
export async function hashSelectedSurface(
  surface: SelectedSurface,
): Promise<string> {
  return sha256Hex(jcsCanonicalize(surface));
}

/**
 * THE QUOTE THE BUYER ACCEPTED (2026-09-12). The five terms the
 * store's signed x402 offer commits to and the buyer's own payment
 * signature is bound to: scheme, network, asset, payTo, amount. The
 * certificate stores sha256 of their JCS form as `quote`, so a holder
 * of the 402's JWS offer can decode its payload, drop `version`,
 * `resourceUrl` and `validUntil`, lowercase the two EVM addresses,
 * hash the five that remain, and see the receipt name the offer it
 * was paid against — without trusting this store to say so.
 *
 * Read from the VERIFIED requirements the gate settled, never from
 * the catalog: `saw` already binds what the shelf listed, and this
 * binds what was actually accepted, which on a pay-what-it-deserves
 * item is a tier the buyer chose rather than the list price. Asked
 * for from outside, by name, the week the hundredth settlement
 * landed: "product id, agent id, quote, settlement id, delivery
 * hash, and failed retry state" — the quote was the one link the
 * receipt held only by reference.
 */
export interface QuotedTerms {
  scheme: string;
  network: string;
  asset: string;
  payTo: string;
  amount: string;
}

export function quotedTerms(
  requirements: Partial<Record<keyof QuotedTerms, unknown>>,
): QuotedTerms | null {
  const { scheme, network, asset, payTo, amount } = requirements;
  if (
    typeof scheme !== "string" ||
    typeof network !== "string" ||
    typeof asset !== "string" ||
    typeof payTo !== "string" ||
    typeof amount !== "string"
  ) {
    // A quote with a hole in it is worse than none: the receipt says
    // not_observed rather than signing a partial commitment.
    return null;
  }
  /**
   * EVM ADDRESSES LOWERCASED BEFORE HASHING, and the rule is stated
   * wherever the hash is explained. An EVM address is one identifier
   * however it is cased; EIP-55 checksum casing is presentation, and
   * the x402 SDK serves the asset checksummed while this store's own
   * manifest lowercases it. Found the day this shipped, by the replay
   * kit failing to recover terms from the catalog that had hashed
   * differently from the 402 they were served in. Solana addresses
   * are base58 and case-significant; they are left exactly as served.
   */
  const evm = network.startsWith("eip155:");
  return {
    scheme,
    network,
    asset: evm ? asset.toLowerCase() : asset,
    payTo: evm ? payTo.toLowerCase() : payTo,
    amount,
  };
}

/** SHA-256 of the JCS form. The certificate stores this hex as `quote`. */
export async function hashQuotedTerms(terms: QuotedTerms): Promise<string> {
  return sha256Hex(jcsCanonicalize(terms));
}
