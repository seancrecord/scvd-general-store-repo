import { SOLANA_CHAIN, SOLANA_USDC_MINT, usdcTokenAccountsOf } from "@/lib/solana-rpc";
import type { PreflightAdvisory, PreflightCheck } from "@/services/preflight";
import type { Env } from "@/types";

/**
 * CAN THE ADDRESS IN THE OFFER ACTUALLY RECEIVE THE MONEY?
 *
 * 2026-08-23. An independent tester (Cairn, cairnwake.com) walked 37
 * x402 doors and published every result. Two failed a class it named
 * `rail-cannot-receive`: the endpoint advertised a payTo with no USDC
 * token account, so any payment fails in simulation before it can
 * broadcast. The door 402s correctly, the challenge parses, every
 * structural check passes — and nobody can pay it. From the operator's
 * own logs it looks like a shop with no customers.
 *
 * IT FOUND THAT BY TRYING TO PAY. WE DO NOT HAVE TO.
 *
 * On Solana, USDC is an SPL token: a wallet receives it through an
 * Associated Token Account for that mint, and if no such account
 * exists the transfer has nowhere to land. Whether one exists is a
 * single unpaid RPC read of a public ledger. So the deepest defect
 * class anyone has published in this market is detectable by the FREE
 * preflight, for every door, at no cost and with no wallet — which is
 * the shape this store prefers its checks to have.
 *
 * SOLANA ONLY, AND THE LIMIT IS THE POINT. On Base and Polygon, USDC
 * is an ERC-20: any address can be credited, no account needed, so
 * there is nothing here to be wrong about. Firing this check on an EVM
 * rail would manufacture a defect out of a difference between chains.
 * A check that does not apply says nothing rather than saying "pass" —
 * a pass implies a test was run.
 *
 * WHY IT LIVES OUTSIDE runChecks(). That battery is deliberately
 * synchronous and offline so CI can aim it at this store's own 402 on
 * every build. This one needs the network, and a check that cannot run
 * without a third party does not belong in the battery that proves we
 * live under our own law.
 */

/** The mint every offer on this rail is measured against. */
export const RECEIVABLE_CHECK = "solana-rail-receivable";

/**
 * One entry of a challenge's `accepts`, as runChecks() hands it over:
 * an open record, because a real offer carries scheme, amount,
 * maxTimeoutSeconds and whatever else its issuer chose, and a closed
 * shape here would reject the very data this check exists to read.
 * Only the three fields below are consulted; the rest ride along.
 */
export interface AcceptEntry extends Record<string, unknown> {
  network?: unknown;
  payTo?: unknown;
  asset?: unknown;
}

/**
 * The Solana payTo addresses an offer names, deduped. Empty when the
 * challenge offers no Solana rail — the ordinary case, and not a fault.
 */
export function solanaPayTos(accepts: readonly AcceptEntry[]): string[] {
  const found = new Set<string>();
  for (const entry of accepts) {
    const network = typeof entry.network === "string" ? entry.network : "";
    if (network !== SOLANA_CHAIN && network.toLowerCase() !== "solana") continue;
    // Only USDC. An offer in some other mint is a different question
    // and this check has no opinion on it.
    const asset = typeof entry.asset === "string" ? entry.asset : "";
    if (asset && asset !== SOLANA_USDC_MINT) continue;
    if (typeof entry.payTo === "string" && entry.payTo.length > 0) {
      found.add(entry.payTo);
    }
  }
  return [...found];
}

export interface ReceivabilityResult {
  /** Absent when the rail is not offered, or the ledger could not be read. */
  check: PreflightCheck | null;
  /** Present when we tried and could not tell — our gap, on the record. */
  advisory: PreflightAdvisory | null;
}

const NOT_APPLICABLE: ReceivabilityResult = { check: null, advisory: null };

export async function checkRailReceivable(
  env: Env,
  accepts: readonly AcceptEntry[],
): Promise<ReceivabilityResult> {
  const payTos = solanaPayTos(accepts);
  if (payTos.length === 0) return NOT_APPLICABLE;

  const unreachable: string[] = [];
  const cannotReceive: string[] = [];
  for (const payTo of payTos) {
    try {
      const accounts = await usdcTokenAccountsOf(env, payTo);
      if (accounts.length === 0) cannotReceive.push(payTo);
    } catch {
      /*
       * The ledger did not answer us. That is a fact about our read,
       * not about their address, and it must not become either verdict
       * — the census counts its own missed rounds against itself and
       * this is the same rule at a smaller scale.
       */
      unreachable.push(payTo);
    }
  }

  if (cannotReceive.length > 0) {
    return {
      check: {
        name: RECEIVABLE_CHECK,
        ok: false,
        detail: `the Solana payTo ${cannotReceive.join(", ")} owns no USDC token account, so a payment to it has nowhere to land and fails in simulation before it can broadcast. The 402 is well-formed and the address is real — it simply cannot be credited in this mint yet. Opening an associated token account for ${SOLANA_USDC_MINT} fixes it. Read once from the public ledger, unpaid; anyone can repeat it.`,
      },
      advisory: null,
    };
  }

  if (unreachable.length === payTos.length) {
    return {
      check: null,
      advisory: {
        name: RECEIVABLE_CHECK,
        detail: `we could not read the Solana ledger for ${unreachable.join(", ")} at this moment, so this endpoint's receivability is UNKNOWN rather than passing. Our gap, recorded here rather than quietly counted in your favour.`,
      },
    };
  }

  return {
    check: {
      name: RECEIVABLE_CHECK,
      ok: true,
      detail: `every Solana payTo in the offer (${payTos.length}) owns a USDC token account and can be credited. Says nothing about balance, ownership, or whether the seller will deliver — only that the address is able to receive the mint it asked for.`,
    },
    ...(unreachable.length > 0
      ? {
          advisory: {
            name: RECEIVABLE_CHECK,
            detail: `${unreachable.length} of ${payTos.length} payTo addresses could not be read and are excluded from the verdict above.`,
          },
        }
      : { advisory: null }),
  };
}
