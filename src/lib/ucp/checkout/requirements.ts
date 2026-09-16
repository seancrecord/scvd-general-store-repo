import type { PaymentRequirements } from "@x402/core/types";
import { atomicToUsdc, manifestAccepts } from "@/lib/payments";
import type { Env } from "@/types";

/**
 * THE PAYMENT REQUIREMENTS A CHECKOUT COMMITS TO, BUILT ONCE AND
 * FROZEN — never rebuilt at Complete.
 *
 * This is the whole reason a checkout object exists. If Complete
 * regenerated the challenge from today's shelf, then a price edited
 * between Create and Complete would silently change what the buyer
 * owes after they had already been quoted: the exact time-of-check to
 * time-of-use gap the commercial snapshot is supposed to close. So the
 * requirements are computed when the quote is issued, stored with the
 * checkout, and read back verbatim afterwards. Nothing downstream
 * consults MENU_ITEMS again.
 *
 * DERIVED FROM `manifestAccepts`, NOT ASSEMBLED HERE. That function
 * already produces this store's accept rows for a price — asset,
 * atomic amount, pay-to, signing window, and the EIP-712 domain the
 * EVM rails need (`USD Coin` everywhere except World, which is
 * `USDC`). Writing a second projection would be a second opinion about
 * what this store charges, and the two would eventually disagree. The
 * consequence is that a UCP quote and a 402 quote for the same item on
 * the same rail are the same bytes, which is what makes them
 * comparable at all.
 */
export class NoSuchRail extends Error {
  constructor(readonly network: string) {
    super(`This store does not settle on ${network}.`);
    this.name = "NoSuchRail";
  }
}

export function frozenRequirements(
  env: Env,
  network: string,
  amountAtomic: string,
): PaymentRequirements {
  if (!/^[0-9]+$/.test(amountAtomic) || BigInt(amountAtomic) <= 0n) {
    throw new Error(`Not a payable amount: ${amountAtomic}`);
  }
  const accept = manifestAccepts(env, [atomicToUsdc(amountAtomic)]).find(
    (row) => row.network === network,
  );
  if (!accept) throw new NoSuchRail(network);
  /**
   * The amount is re-asserted from the checkout's own atomic figure
   * rather than trusted from the dollar round trip through
   * manifestAccepts. They agree today; a disagreement would be a bug
   * worth failing on rather than a rounding to absorb.
   */
  if (accept.amount !== amountAtomic) {
    throw new Error(
      `Rail arithmetic disagrees with the checkout: ${accept.amount} vs ${amountAtomic}`,
    );
  }
  return {
    scheme: "exact",
    network: accept.network,
    asset: accept.asset,
    amount: accept.amount,
    payTo: accept.payTo,
    maxTimeoutSeconds: accept.maxTimeoutSeconds,
    extra: accept.extra ?? {},
  } as PaymentRequirements;
}

/**
 * EVERY FIELD A SETTLEMENT DECISION RESTS ON, COMPARED.
 *
 * Used to prove that what Complete is about to verify against is
 * byte-identical to what Create committed to. A checkout that verified
 * against requirements it had rebuilt would be a checkout with no
 * snapshot at all.
 */
export function sameRequirements(
  a: PaymentRequirements,
  b: PaymentRequirements,
): boolean {
  return (
    a.scheme === b.scheme &&
    a.network === b.network &&
    a.asset === b.asset &&
    a.amount === b.amount &&
    a.payTo === b.payTo &&
    a.maxTimeoutSeconds === b.maxTimeoutSeconds &&
    JSON.stringify(a.extra ?? {}) === JSON.stringify(b.extra ?? {})
  );
}
