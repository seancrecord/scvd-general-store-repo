import { BASE_USDC, POLYGON_USDC } from "@/lib/base-rpc";
import { SOLANA_USDC_MINT } from "@/lib/solana-rpc";

/**
 * ROADMAP 2.2 — ONE SHARED VALUE-CHECKS MODULE (ledger B13/F1/I1).
 *
 * The battery, the desk, the verdict fold and the launch check each
 * carried their own fragments of "is this offer's VALUE sane", and
 * the fragments disagreed by omission: the launch check divided ANY
 * asset's atomic amount by 1e6 and signed the result into an
 * artifact labeled "USDC". A hostile 402 naming an arbitrary ERC-20
 * was priced, labeled and walked as if it were USDC. The canonical
 * contracts lived in base-rpc/solana-rpc all along; this module is
 * where every instrument now asks the question, so no two of them
 * can answer it differently.
 *
 * x402 permits any asset — a non-USDC offer is not a defect in
 * someone else's door. The law here is narrower and about US: a
 * signed artifact of ours says "USDC" only about the canonical
 * contract for that network, and our own field wallet pays nothing
 * else.
 */
export const CANONICAL_USDC: Record<string, string> = {
  "eip155:8453": BASE_USDC,
  "eip155:137": POLYGON_USDC,
  "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp": SOLANA_USDC_MINT,
};

/**
 * EVM addresses compare case-insensitively (checksum casing is
 * display, not identity); Solana mints are base58 and case IS
 * identity. An unknown network can never claim canonical USDC —
 * rule 52 pointed the other way: a lookup that cannot see everything
 * must not answer "yes" either.
 */
export function isCanonicalUsdc(network: string, asset: string): boolean {
  const canonical = CANONICAL_USDC[network];
  if (!canonical) return false;
  if (network.startsWith("eip155:")) {
    return canonical.toLowerCase() === asset.toLowerCase();
  }
  return canonical === asset;
}
