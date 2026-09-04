import { EVM_CHAINS } from "@/lib/base-rpc";
import { familyOf } from "@/lib/pay-to";
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
  // Every EVM chain the store reads, derived (2026-09-03): the two
  // it settles on and the four it only reads.
  ...Object.fromEntries(EVM_CHAINS.map((chain) => [chain.caip2, chain.usdc])),
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

/**
 * WHAT A DOOR ASKS THE BUYER TO SIGN.
 *
 * `accepts[].extra.assetTransferMethod` names the authorization
 * standard the seller's facilitator will accept — the field that
 * decides whether a buyer's signature is acceptable at all.
 * `eip3009` (TransferWithAuthorization) is what a generic x402
 * client produces; `permit2` and `erc7710` are different signatures
 * over different types.
 *
 * ONE LAW, EVERY DIRECTION. The launch check signs
 * DEFAULT_TRANSFER_METHOD and refuses to knock at a door asking for
 * anything else; the battery reads the same field from the same
 * place before a buyer spends anything; and since 2026-08-30 the v2
 * verdict counts it. Three instruments, one constant, no drift.
 */
export const DEFAULT_TRANSFER_METHOD = "eip3009";

/** The methods a published x402 client knows how to produce. */
export const KNOWN_TRANSFER_METHODS: readonly string[] = [
  "eip3009",
  "permit2",
  "erc7710",
];

/**
 * The method an entry declares, normalized, or undefined where it
 * declares none. Absence is the ordinary case: the field is
 * optional, most doors omit it, and eip3009 is the settled default.
 */
export function declaredTransferMethod(
  entry: Record<string, unknown>,
): string | undefined {
  const extra = entry["extra"];
  if (typeof extra !== "object" || extra === null) {
    return undefined;
  }
  const declared = (extra as Record<string, unknown>)["assetTransferMethod"];
  if (typeof declared !== "string" || declared.trim() === "") {
    return undefined;
  }
  return declared.trim().toLowerCase();
}

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
  readPayToImpl: (payTo: string, network: string) => { payable: boolean | null; detail?: string },
): ValueCheck[] {
  const payToFailures: string[] = [];
  /**
   * Entries on rails this desk cannot read (2026-09-04). They are NOT
   * failures and never enter the verdict; they are printed beside the
   * pass so the reading names what it did not judge, which is the
   * house sentence about gaps applied to our own instrument.
   */
  const payToUnjudged: string[] = [];
  /**
   * AMOUNTS THIS DESK MUST NOT JUDGE (2026-09-04, the same correction
   * as payTo). "x402 amounts are ATOMIC units" is the rule on EVM and
   * Solana, and on Stellar (stroops) and Algorand (microAlgos). It is
   * NOT the rule for an XRPL ISSUED CURRENCY: RLUSD and friends are
   * denominated in decimal strings by the protocol itself, so "0.01"
   * is correct there and this desk was telling 56 hosts in one round
   * that it "underprices by a factor of a million". Drops (XRP) stay
   * judged, because those really are integers.
   */
  const amountUnjudged: string[] = [];
  const decimalAmounts: string[] = [];
  const malformedAmounts: string[] = [];
  const testnetNetworks: string[] = [];
  const unbuildableMethods: string[] = [];
  for (let index = 0; index < accepts.length; index += 1) {
    const entry = accepts[index]!;
    const network = String(entry["network"] ?? "");
    const method = declaredTransferMethod(entry);
    // The known methods are EVM signature standards; a non-EVM rail
    // naming its own is not a door this desk can call unbuildable.
    if (
      method !== undefined &&
      !KNOWN_TRANSFER_METHODS.includes(method) &&
      ["evm", "base"].includes(familyOf(network))
    ) {
      unbuildableMethods.push(
        `accepts[${index}].extra.assetTransferMethod "${method}"`,
      );
    }
    const verdict = readPayToImpl(String(entry["payTo"] ?? ""), network);
    if (verdict.payable === null) {
      payToUnjudged.push(`accepts[${index}].payTo: ${verdict.detail ?? "not judged"}`);
    } else if (!verdict.payable) {
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
    const family = familyOf(network);
    const issuedOnXrpl = family === "xrpl" && String(entry["asset"] ?? "").toUpperCase() !== "XRP";
    if (family === "unknown" || issuedOnXrpl) {
      amountUnjudged.push(
        `accepts[${index}].amount "${amount}" on ${network}${issuedOnXrpl ? " (an issued currency, denominated in decimals by the ledger)" : " (a chain this desk does not read amounts for)"}`,
      );
    } else if (amount.includes(".")) {
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
          detail:
            payToUnjudged.length === 0
              ? "every accepts entry names a payable address for its own network"
              : `every accepts entry this desk can read names a payable address for its own network. Not judged, on rails this desk does not read: ${payToUnjudged.join("; ")}`,
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
            amountUnjudged.length === 0
              ? "every accepts amount is a non-negative integer string of atomic units"
              : `every accepts amount this desk judges is a non-negative integer string of atomic units. Not judged: ${amountUnjudged.join("; ")}`,
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
    /*
     * WHAT THE DOOR ASKS THE BUYER TO SIGN, FOLDED (the keeper's
     * ruling, 2026-08-30). An entry naming a method no published
     * client can build is unsignable in exactly the sense
     * `amount-atomic` is unsignable: the buyer who reads the field
     * has nothing to construct from it, and the buyer who ignores
     * it signs blind. v2 already refuses to call an unpayable 402
     * ready; this is the same refusal one field over.
     *
     * WHAT IS NOT FOLDED, and the line matters: a door asking for
     * `permit2` or `erc7710` PASSES. Those are real standards that
     * real clients build, named in the place the spec provides, and
     * counting them against a door would be scoring an operator for
     * telling the truth about themselves. That reading stays an
     * advisory (`nonstandard-transfer-method`), where a fact a buyer
     * should read before signing belongs.
     *
     * Absence passes too. The field is optional, most doors omit it,
     * and eip3009 is the settled default.
     */
    unbuildableMethods.length === 0
      ? {
          name: "transfer-method-signable",
          ok: true,
          detail:
            "every accepts entry that names an authorization standard names one a published client can build",
        }
      : {
          name: "transfer-method-signable",
          ok: false,
          detail: `${unbuildableMethods.join("; ")} — none of ${KNOWN_TRANSFER_METHODS.join(", ")}. A buyer who reads the field has nothing to construct from it and a buyer who ignores it signs blind; either way the refusal lands before any payment reaches this door.`,
        },
  ];
}
