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

/** The testnets the x402 FAQ names as the #1 stuck point, by CAIP-2. */
export const KNOWN_TESTNETS: Record<string, string> = {
  "eip155:84532": "Base Sepolia",
  "eip155:11155111": "Ethereum Sepolia",
  // Added 2026-08-25 with the rail split: a seller pointing at Amoy is
  // making exactly the mistake this table exists to catch.
  "eip155:80002": "Polygon Amoy",
};

export interface ValueCheck {
  name: string;
  ok: boolean;
  detail: string;
}

/**
 * The L3b consistency trio (ledger B3), moved here from the preflight
 * in 2.2 so the battery, the launch check and the desk read the same
 * value judgments from one place. Judged against parsed accepts
 * entries; callers with no entries must not call this — a trio judged
 * against nothing would be a fabricated observation.
 */
export function l3bChecks(
  accepts: Record<string, unknown>[],
  readPayToImpl: (payTo: string, network: string) => { payable: boolean; detail?: string },
): ValueCheck[] {
  const payToFailures: string[] = [];
  const decimalAmounts: string[] = [];
  const malformedAmounts: string[] = [];
  const testnetNetworks: string[] = [];
  for (let index = 0; index < accepts.length; index += 1) {
    const entry = accepts[index]!;
    const network = String(entry["network"] ?? "");
    const verdict = readPayToImpl(String(entry["payTo"] ?? ""), network);
    if (!verdict.payable) {
      payToFailures.push(`accepts[${index}].payTo: ${verdict.detail ?? "not payable"}`);
    }
    const amount = String(entry["amount"] ?? "");
    /*
     * THE WHOLE GRAMMAR, NOT ONE TYPO (the depth pass, 2026-08-28,
     * ledger B13's residue). This caught only the decimal point,
     * so "-5000", "5e3", "0x1388" and "" all read as atomic and
     * sound — amounts no client can sign an authorization for. An
     * x402 amount is a non-negative integer string of atomic units;
     * anything else is unsignable, and the check now says which
     * way it is wrong.
     */
    if (amount.includes(".")) {
      decimalAmounts.push(`accepts[${index}].amount "${amount}"`);
    } else if (!/^[0-9]+$/.test(amount)) {
      malformedAmounts.push(`accepts[${index}].amount "${amount}"`);
    }
    if (KNOWN_TESTNETS[network]) {
      testnetNetworks.push(`accepts[${index}].network ${network} (${KNOWN_TESTNETS[network]})`);
    }
  }
  return [
    payToFailures.length === 0
      ? {
          name: "payto-payable",
          ok: true,
          detail: "every accepts entry names a payable address for its own network",
        }
      : {
          name: "payto-payable",
          ok: false,
          detail: `${payToFailures.join("; ")}. A door whose payTo cannot be credited 402s perfectly and nobody can pay it.`,
        },
    decimalAmounts.length === 0 && malformedAmounts.length === 0
      ? {
          name: "amount-atomic",
          ok: true,
          detail:
            "every accepts amount is a non-negative integer string of atomic units",
        }
      : {
          name: "amount-atomic",
          ok: false,
          detail: [
            decimalAmounts.length > 0
              ? `${decimalAmounts.join("; ")} contains a decimal point — x402 amounts are ATOMIC units (USDC has 6 decimals), so a dollar-typed amount underprices by a factor of a million.`
              : "",
            malformedAmounts.length > 0
              ? `${malformedAmounts.join("; ")} is not a non-negative integer string — negative, exponent, hex, or empty amounts cannot be signed into an authorization by any client.`
              : "",
          ]
            .filter(Boolean)
            .join(" "),
        },
    testnetNetworks.length === 0
      ? {
          name: "network-mainnet",
          ok: true,
          detail: "no accepts entry offers a known testnet",
        }
      : {
          name: "network-mainnet",
          ok: false,
          detail: `${testnetNetworks.join("; ")}. A testnet offer works against testnet tooling and silently fails for every mainnet buyer.`,
        },
  ];
}
