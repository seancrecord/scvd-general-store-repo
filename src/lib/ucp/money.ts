import { usdcToAtomic, USDC_DECIMALS } from "@/lib/payments";

/**
 * THE CURRENCY A PRICE IS QUOTED IN AND THE ASSET IT SETTLES IN ARE
 * NOT THE SAME FIELD.
 *
 * UCP's catalog price is an ISO-4217 currency code and an integer
 * number of that currency's minor units. USDC is not an ISO-4217
 * currency; it is the instrument this store settles in, and it has
 * six decimals rather than two. Writing `"currency": "USDC"` into a
 * standard catalog would put a token symbol in a field specified to
 * hold a currency code, which is the kind of near-miss a strict
 * reader rejects and a lenient one silently misreads.
 *
 * So: the commercial presentment is USD cents, and the exact atomic
 * USDC amount rides on the payment handler beside it, where the chain,
 * the token contract and the recipient already are. Two
 * representations because there are two facts.
 */
export interface UcpMoney {
  /** Integer minor units of `currency`. Cents, for USD. */
  amount: number;
  currency: "USD";
}

/** Minor units per major unit for USD. */
const USD_MINOR_UNITS = 100;

/** Atomic USDC per cent: 10^6 / 10^2. */
const ATOMIC_PER_CENT = 10 ** USDC_DECIMALS / USD_MINOR_UNITS;

export class UcpPriceNotRepresentable extends Error {
  constructor(readonly usdc: number) {
    super(
      `$${usdc} cannot be represented exactly in UCP's USD minor units; ` +
        `the smallest standard USD price is $${1 / USD_MINOR_UNITS}`,
    );
    this.name = "UcpPriceNotRepresentable";
  }
}

/**
 * ARITHMETIC THROUGH THE ATOMIC AMOUNT, NOT THROUGH `usdc * 100`.
 *
 * `0.99 * 100` is 99.00000000000001 in IEEE-754 and `0.005 * 100` is
 * 0.5 — one of those is a real price the naive check would reject and
 * the other is a real price the naive check would round to a cent the
 * till never charges. The store already treats the six-decimal atomic
 * amount as the exact representation of a price (that is what the
 * till signs), so the question "is this a whole number of cents" is
 * asked there: exactly when the atomic amount divides by 10,000.
 */
export function isCentExact(usdc: number): boolean {
  if (!Number.isFinite(usdc) || usdc < 0) return false;
  return Number(usdcToAtomic(usdc)) % ATOMIC_PER_CENT === 0;
}

/**
 * THROWS RATHER THAN ROUNDS, and that is the whole point of the
 * function existing.
 *
 * Four items on this shelf cost less than a cent. Every plausible
 * accident here — Math.round, toFixed(2), a `| 0` — turns $0.004 into
 * either $0.00 or $0.01, and both are a published price the buyer
 * would not be charged. A throw is loud, lands in CI, and cannot be
 * mistaken for a price.
 */
export function toUcpUsdPrice(usdc: number): UcpMoney {
  if (!isCentExact(usdc)) throw new UcpPriceNotRepresentable(usdc);
  return {
    amount: Number(usdcToAtomic(usdc)) / ATOMIC_PER_CENT,
    currency: "USD",
  };
}

/**
 * The settlement side of the same price: exact atomic USDC, as a
 * decimal string, the way the x402 accepts already carry it.
 */
export function toAtomicUsdc(usdc: number): string {
  return usdcToAtomic(usdc);
}
