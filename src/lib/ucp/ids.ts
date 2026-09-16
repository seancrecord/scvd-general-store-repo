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
