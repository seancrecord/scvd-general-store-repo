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
