import type { MonthLedger, PorchLedger } from "@/lib/metrics";
import { PENNY_PAGE_USDC } from "@/lib/payments";
import { ALMANAC_ENTRIES } from "@/store/almanac";
import { MENU_ITEMS } from "@/store";

/**
 * WINDOW SHOPPING, PER ITEM — the shelf somebody picked up and put down.
 *
 * The store already counted attention (porch visits) and money (settles)
 * and the 402s between them. What it could not see was WHICH item a
 * reader was looking at when they left, because /menu/:item_id logged
 * under no surface at all and /menu.json logged as one.
 *
 * That middle column is the closest measurable thing to want. A 402
 * needs a client that already decided to try and has a wallet loaded; a
 * read of one item's page needs only curiosity, which is the earlier and
 * more common state, and the only one a store with no sales yet has any
 * hope of observing.
 *
 * WHAT THIS IS NOT. It is not demand, it is not unique people, and a
 * high looks-with-no-402 count is not proof of a wanted item — a crawler
 * walking the menu produces exactly that shape, which is why the
 * infrastructure column is kept beside the organic one instead of being
 * folded in. Read a row as a question worth asking, never as an answer.
 */

export interface ItemInterest {
  item: string;
  price_usdc: number;
  /**
   * Organic reads of this item's own page this month, or NULL when the
   * shelf has no free page to read.
   *
   * Almanac pages are the case that forced this: the page IS the
   * product, so the first touch is the 402 itself and there is nothing
   * to look at for free. Rendering that as 0 would say "nobody looked"
   * when the truth is "looking is not possible" — a different fact
   * wearing the same digit, which is the shape of defect this office
   * has already been bitten by twice this week.
   */
  looks: number | null;
  /** Reads bucketed as crawler/scanner traffic. Kept visible, never mixed. */
  looksInfra: number;
  looksHouse: number;
  /** Organic 402s for this item this month. */
  challenges: number;
  /** Organic settles for this item this month. */
  settled: number;
}

export interface WindowShoppingLedger {
  rows: ItemInterest[];
  /** Items read but never once offered a payment. The interesting list. */
  lookedNeverTried: string[];
  /** Items whose page nobody has opened at all. Also interesting. */
  neverLookedAt: string[];
  honestLimit: string;
}

const HONEST_LIMIT =
  "Looks are reads of an item's own page, organic bucket only. A dash means the shelf has no free page to read — an almanac page IS the product, so the first touch is the 402 and there is nothing to look at without paying; that is not the same as nobody looking, and it is not rendered as a zero. Crawler traffic is kept in its own column rather than folded in. No cookies and no IP retention, so these are reads and not readers: one client refreshing four times is four looks. Porch writes are rate-capped under storm conditions, so every look count is a floor. A row with looks and no 402 is a question, not a verdict — a crawler walking the menu makes that exact shape — and a row with no looks at all may only mean nobody found the page. The one reading this genuinely supports: comparing items against each other in the same month, since they share every bias.";

/** The organic count for a surface, as the porch ledger buckets them. */
function bucket(porch: PorchLedger, surface: string, name: string): number {
  return porch.surfaces[surface]?.[name] ?? 0;
}

/**
 * Built entirely from the two ledgers the office already reads, so the
 * instrument costs no extra KV reads — it only asks a question of
 * numbers that were already on the page separately.
 */
export function readWindowShopping(
  ledger: MonthLedger,
  porch: PorchLedger,
  /**
   * Almanac slugs to include. Defaults to the pages compiled in; the
   * office passes the merged list so a page written from the back room
   * gets a row like any other. Optional so nothing that only wants the
   * menu has to know the almanac exists.
   */
  almanacSlugs: readonly string[] = ALMANAC_ENTRIES.map((e) => e.slug),
): WindowShoppingLedger {
  const rows: ItemInterest[] = MENU_ITEMS.map((item) => {
    const surface = `item:${item.id}`;
    const itemRow = ledger.items[item.id];
    return {
      item: item.id,
      price_usdc: item.price_usdc,
      looks: bucket(porch, surface, "organic"),
      looksInfra: bucket(porch, surface, "infrastructure"),
      looksHouse: bucket(porch, surface, "house"),
      challenges: itemRow?.challenges ?? 0,
      settled: itemRow?.settled ?? 0,
    };
  });

  /**
   * THE ALMANAC, ADDED 2026-07-30 BECAUSE IT OUTSOLD THE ENTIRE MENU.
   *
   * The store's first sale to a stranger was a penny page from the
   * keeper's journal — an item that is not in MENU_ITEMS, not in
   * menu.json, not in the MCP tool list, and was therefore invisible to
   * the one instrument built to answer "which shelf got picked up." The
   * table measuring want had a hole exactly where the only want anybody
   * has ever shown up with went.
   *
   * Their looks are NULL rather than zero: the page is the product, so
   * there is no free page to read and the first touch is the 402.
   */
  for (const slug of almanacSlugs) {
    const key = `almanac:${slug}`;
    const itemRow = ledger.items[key];
    rows.push({
      item: key,
      price_usdc: PENNY_PAGE_USDC,
      looks: null,
      looksInfra: 0,
      looksHouse: 0,
      challenges: itemRow?.challenges ?? 0,
      settled: itemRow?.settled ?? 0,
    });
  }

  return {
    rows,
    lookedNeverTried: rows
      .filter((row) => (row.looks ?? 0) > 0 && row.challenges === 0)
      .sort((a, b) => (b.looks ?? 0) - (a.looks ?? 0))
      .map((row) => row.item),
    // A shelf with no free page cannot be "never looked at" — it can
    // only be never bought, which is a different row on this table.
    neverLookedAt: rows
      .filter((row) => row.looks === 0 && row.looksInfra === 0)
      .map((row) => row.item),
    honestLimit: HONEST_LIMIT,
  };
}
