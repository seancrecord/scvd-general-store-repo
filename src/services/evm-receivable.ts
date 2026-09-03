import { EVM_CHAINS, usdcBlacklisted, type EvmChain } from "@/lib/base-rpc";
import { isCanonicalUsdc } from "@/lib/value-checks";
import type { PreflightAdvisory } from "@/services/preflight";
import type { AcceptEntry } from "@/services/rail-receivable";
import type { Env } from "@/types";

/**
 * CAN THE EVM ADDRESS IN THE OFFER ACTUALLY RECEIVE THE MONEY?
 *
 * The depth pass, 2026-08-28 — the Solana rail got this question
 * answered on 2026-08-23 (rail-receivable.ts, after Cairn found the
 * class by paying); the EVM rails never did, and the sibling failure
 * exists there too: USDC carries a compliance blacklist, and a
 * transfer to a blacklisted payTo reverts in simulation before it
 * can broadcast. The door 402s perfectly and nobody can pay it.
 *
 * ADVISORIES, NOT A VERDICT FOLD, deliberately — and on the PAID
 * single-door audit only. The Solana read is folded into v2 because
 * the census runs it too, so the citation and the fold agree
 * everywhere. This read runs nowhere free: the free preflight's
 * load-bearing promise is ONE outbound request per call (held by a
 * test that counts), and the weekly census walks up to 750 doors
 * against a hard subrequest budget — one eth_call with transport
 * retries per EVM door breaks both. On the $5 audit the five dollars
 * is the meter and the probe runs post-settle, so the deeper reading
 * rides in the signed bytes. The day the keeper rules a wider home
 * (or a v3), the check is one line from folding; until then it is
 * true, worth knowing, and outside every verdict.
 *
 * Three honest outcomes per applicable door, all advisories:
 * confirmed receivable, confirmed blacklisted, or OUR read failed —
 * never silence that reads as a pass, never our RPC trouble booked
 * as the subject's defect.
 */

/** Every EVM chain the reader knows, by CAIP-2 — derived, so a door on Arbitrum gets the same blacklist read a door on Base does. */
const CHAIN_BY_CAIP2: Record<string, EvmChain> = Object.fromEntries(
  EVM_CHAINS.map((chain) => [chain.caip2, chain]),
);

/** The EVM payTos an offer names on canonical-USDC entries, deduped
 * per chain. Empty when no such rail is offered — ordinary, not a
 * fault, and this check then says nothing at all. */
export function evmUsdcPayTos(
  accepts: readonly AcceptEntry[],
): { chain: EvmChain; payTo: string }[] {
  const seen = new Set<string>();
  const found: { chain: EvmChain; payTo: string }[] = [];
  for (const entry of accepts) {
    const network = typeof entry.network === "string" ? entry.network : "";
    const chain = CHAIN_BY_CAIP2[network];
    if (!chain) continue;
    const asset = typeof entry.asset === "string" ? entry.asset : "";
    // Only canonical USDC — the blacklist read is that contract's.
    if (!isCanonicalUsdc(network, asset)) continue;
    const payTo = typeof entry.payTo === "string" ? entry.payTo : "";
    if (!/^0x[0-9a-fA-F]{40}$/.test(payTo)) continue;
    const key = `${network}|${payTo.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    found.push({ chain, payTo });
  }
  return found;
}

export interface EvmReceivabilityResult {
  /** Empty when the rail is not offered in canonical USDC. */
  advisories: PreflightAdvisory[];
}

export async function checkEvmReceivable(
  env: Env,
  accepts: readonly AcceptEntry[],
): Promise<EvmReceivabilityResult> {
  const targets = evmUsdcPayTos(accepts);
  if (targets.length === 0) return { advisories: [] };

  const blacklisted: string[] = [];
  const clear: string[] = [];
  const unread: string[] = [];
  /*
   * ONE READ PER CHAIN, ALL AT ONCE (2026-09-03). A door may advertise
   * every EVM chain the reader knows; six serial reads against six
   * public endpoints was six waits in a row. The reads are
   * independent — a different contract on a different chain — so
   * they run together and the audit waits for the slowest one, not
   * the sum. Results keep the offer's order so the advisory text is
   * stable across runs.
   */
  const reads = await Promise.all(
    targets.map(async ({ chain, payTo }) => {
      const label = `${payTo} (${chain.label})`;
      try {
        return { label, state: (await usdcBlacklisted(env, chain, payTo)) ? "blacklisted" : "clear" } as const;
      } catch {
        return { label, state: "unread" } as const;
      }
    }),
  );
  for (const read of reads) {
    if (read.state === "blacklisted") blacklisted.push(read.label);
    else if (read.state === "clear") clear.push(read.label);
    else unread.push(read.label);
  }

  const advisories: PreflightAdvisory[] = [];
  if (blacklisted.length > 0) {
    advisories.push({
      name: "payto-usdc-blacklisted",
      detail: `${blacklisted.join(", ")} is on USDC's compliance blacklist — the contract's own isBlacklisted() answers true, so a transfer to it reverts before it can broadcast. The 402 is well-formed and the address is real; it cannot be credited in this asset, and only the issuer of USDC can change that. Read once from public chain state, unpaid; anyone can repeat it.`,
    });
  }
  if (clear.length > 0) {
    advisories.push({
      name: "evm-rail-receivable",
      detail: `${clear.join(", ")}: USDC's own isBlacklisted() answers false, so nothing in the token contract blocks crediting this payTo. One read of public chain state at this moment — it says the rail can receive, not that anything downstream will deliver.`,
    });
  }
  if (unread.length > 0) {
    advisories.push({
      name: "evm-rail-unread",
      detail: `we could not read the ${unread.map((entry) => entry.split("(")[1]?.replace(")", "") ?? "EVM").join("/")} ledger for ${unread.join(", ")} at this moment, so receivability there is UNKNOWN rather than passing. Our gap, recorded here rather than quietly counted in anyone's favour.`,
    });
  }
  return { advisories };
}
