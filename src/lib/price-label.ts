import type { MenuItem } from "@/types";

/**
 * THE PRICE, WRITTEN THE WAY THE KEEPER WRITES IT, DERIVED FROM THE
 * NUMBER RATHER THAN TYPED BESIDE IT.
 *
 * The storefront's six shelves carried hand-typed price strings for a
 * week — "$0.50", "½¢", "$5+" — sitting next to a menu that owns the
 * real numbers. All six were still correct when this was written, which
 * is luck and not a property: nothing would have failed if a price had
 * moved, and the front of the building would simply have started lying.
 * Same class as the skill bundle's item count and llms.txt's count of
 * corrections, both deleted the same week for the same reason.
 *
 * The keeper's typography is preserved exactly, because that half was
 * never the problem: a half-cent reads as ½¢ and not as $0.005, and a
 * pay-what-it-deserves item takes the "+" that says the number is a
 * floor. Those are rules now instead of instances.
 */
export function priceLabel(item: MenuItem): string {
  const suffix = item.pricing === "fixed" ? "" : "+";
  if (item.price_usdc < 0.01) {
    const cents = item.price_usdc * 100;
    // Half a cent is the cheapest thing in the store and gets the
    // fraction it earned; anything else in this range reads in cents.
    const written = cents === 0.5 ? "½" : String(cents);
    return `${written}¢${suffix}`;
  }
  const written = Number.isInteger(item.price_usdc)
    ? String(item.price_usdc)
    : item.price_usdc.toFixed(2);
  return `$${written}${suffix}`;
}
