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
/**
 * THE STORED SHAPE, spelled out rather than borrowed from the SDK.
 *
 * A Durable Object RPC argument has to be structured-cloneable, and
 * the SDK's PaymentRequirements carries `Record<string, unknown>` for
 * `extra`, which TypeScript will not accept across that boundary.
 * Writing the concrete shape here is not duplication for its own
 * sake: it is the declaration that what a checkout stores is data,
 * with no class, no branded type and no behaviour riding along.
 * `asFrozen` and `asRequirements` are the only two places that cross.
 */
export interface FrozenRequirements {
  scheme: string;
  network: string;
  asset: string;
  amount: string;
  payTo: string;
  maxTimeoutSeconds: number;
  extra: Record<string, string | number | boolean>;
}

export function asFrozen(terms: PaymentRequirements): FrozenRequirements {
  const extra: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(terms.extra ?? {})) {
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      extra[key] = value;
    }
  }
  return {
    scheme: terms.scheme,
    network: terms.network,
    asset: terms.asset,
    amount: terms.amount,
    payTo: terms.payTo,
    maxTimeoutSeconds: terms.maxTimeoutSeconds,
    extra,
  };
}

export function asRequirements(frozen: FrozenRequirements): PaymentRequirements {
  return { ...frozen, extra: { ...frozen.extra } } as unknown as PaymentRequirements;
}

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
