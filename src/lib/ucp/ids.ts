/**
 * ONE IDENTITY, GENERATED ONCE, REUSED EVERYWHERE.
 *
 * UCP's contract is that the variant id a catalog returns is the same
 * string a checkout accepts as its line item. Two functions that each
 * build that string their own way is two chances to disagree, so both
 * ends call these.
 *
 * Globally scoped rather than bare: `service_audit` is unambiguous
 * inside this store and meaningless in a directory holding thousands
 * of merchants. The item id is still in there, unchanged, so a reader
 * holding /menu.json can join the two without a lookup table.
 */
const GID_PREFIX = "gid://scvd.store";

export function productGid(itemId: string): string {
  return `${GID_PREFIX}/Product/${itemId}`;
}

/**
 * A tier index is part of the variant identity for pay-what-it-deserves
 * items and absent for everything else, so a fixed-price item's
 * variant id stays the simple one a reader would guess.
 */
export function variantGid(itemId: string, tierIndex?: number): string {
  return tierIndex === undefined
    ? `${GID_PREFIX}/Variant/${itemId}`
    : `${GID_PREFIX}/Variant/${itemId}/tier-${tierIndex + 1}`;
}

/** The catalog handle: the item id, in the spelling a URL would use. */
/**
 * THE ORDER'S ID IS THE CHECKOUT'S, WEARING THE ORDER PREFIX.
 *
 * Derived, never generated: an order id minted after settlement is a
 * value that can be lost between minting and persisting, and every
 * retry then has to ask whether another one already exists. Deriving
 * it from the immutable checkout identity makes that question
 * meaningless — same checkout, same order id, forever; different
 * checkout, different id — and makes the reverse lookup a string
 * operation rather than an index. The `ord_` prefix is the one the
 * store's operational work-orders already use; the two never share a
 * store, and a UCP order is found through its checkout, never by
 * scanning the ledger.
 */
const CHECKOUT_PREFIX = "chk_";
const ORDER_PREFIX = "ord_";

export function orderIdOf(checkoutId: string): string {
  if (!checkoutId.startsWith(CHECKOUT_PREFIX)) throw new Error("Not a checkout id");
  return ORDER_PREFIX + checkoutId.slice(CHECKOUT_PREFIX.length);
}

/** The checkout an order id names, or null when the id is not one of ours. */
export function checkoutIdOfOrder(orderId: string): string | null {
  if (!/^ord_[A-Za-z0-9_-]{6,64}$/.test(orderId)) return null;
  return CHECKOUT_PREFIX + orderId.slice(ORDER_PREFIX.length);
}

export function productHandle(itemId: string): string {
  return itemId.replace(/_/g, "-");
}

/**
 * THE VARIANT ID READ BACK, because a checkout must never learn which
 * tier was bought from the amount that was paid.
 *
 * A pay-what-it-deserves item offers three exact amounts. If the tier
 * were inferred at settlement — $600 arrived, therefore the generous
 * tier — then paying a different tier's legitimate price would
 * silently buy a different thing, and an overpayment would upgrade an
 * order nobody upgraded. So the tier is chosen in the checkout by ID,
 * frozen there, and the price is re-derived from it server-side. This
 * is the function that reads it back; nothing else parses these.
 */
export function parseVariantGid(
  gid: string,
): { itemId: string; tierIndex?: number } | null {
  const match = gid.match(
    /^gid:\/\/scvd\.store\/Variant\/([a-z0-9_]+)(?:\/tier-([1-9][0-9]*))?$/,
  );
  if (!match?.[1]) return null;
  const tier = match[2];
  return tier === undefined
    ? { itemId: match[1] }
    : { itemId: match[1], tierIndex: Number(tier) - 1 };
}
