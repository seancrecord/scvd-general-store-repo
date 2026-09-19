import { COMMISSION_RUNGS } from "@/store/commission-desk";

/**
 * THE PAID DOORS THAT ARE NOT SHELF ITEMS, BY PATH (2026-09-19). An
 * almanac page, a gazette issue, an archived zodiac week, an Open for
 * Business issue and a commission rung sell over x402 with no menu row
 * behind them, and the native lane needs the same answer as a family
 * or a rung so the ledger can split a sale under one spelling per
 * family the way it splits shelf sales per item. The patterns are the
 * doors' own route shapes (routes/almanac.ts, trading-post.ts,
 * zodiac.ts, open-for-business.ts, commission.ts); an index page is
 * not a door.
 *
 * A LEAF ON PURPOSE. lib/payments.ts prices these doors and the
 * publication checkout block describes them; the native capability
 * module recognises them. When the capability module read the
 * patterns out of payments.ts, the checkout block could not ask the
 * capability module whether the lane is offered without a cycle, so
 * the indexes kept describing the x402 shape alone. The patterns
 * import nothing that prices anything; payments.ts re-exports them
 * so every existing reader keeps its import.
 */
export type PublicationFamily = "almanac" | "gazette" | "zodiac_archive" | "open_for_business";
export const PUBLICATION_FAMILIES: readonly PublicationFamily[] = ["almanac", "gazette", "zodiac_archive", "open_for_business"];
export function publicationFamilyForPath(path: string): PublicationFamily | undefined {
  if (/^\/almanac\/[a-z0-9_-]+$/.test(path)) return "almanac";
  if (/^\/gazette\/issue-[0-9]+$/.test(path)) return "gazette";
  if (/^\/zodiac\/archive\/[a-z_]+\/week-[0-9]+$/.test(path)) return "zodiac_archive";
  if (/^\/open-for-business\/[A-Za-z0-9-]+$/.test(path)) return "open_for_business";
  return undefined;
}

/** The desk's pay path, parsed: the rung it names, or null off-ladder. */
export function commissionRungFromPath(path: string): number | null {
  const match = /^\/api\/commission\/pay\/(\d+)$/.exec(path);
  if (!match) return null;
  const rung = Number(match[1]);
  return COMMISSION_RUNGS.some((published) => published === rung) ? rung : null;
}
