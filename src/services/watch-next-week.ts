import { ladderRung } from "@/services/menu-markdown";

/**
 * THE END OF THE WEEK, SAID ON THE HISTORY (2026-09-01).
 *
 * Both watches are bounded on purpose — rule 23a's carve-out: an end
 * date, renewed only by the buyer's next purchase, never by us. The
 * histories said the first half ("complete: true") and stayed silent
 * on the second. So the one product this store sells that a buyer
 * could sensibly buy AGAIN ended without a word about how, on the
 * page the keeper's porch table says buyers actually come back to
 * (262 organic reads of /api/watch/{id} in a month, 111 of its
 * conformance sibling).
 *
 * This is not a renewal and must never become one. It is a derived
 * pointer: the same item, its price read off the shelf, the same
 * door pre-filled, and the rule that nothing here charges again by
 * itself — stated on the artifact, where the reader is, rather than
 * on a shelf they have already left. A second week starts a new
 * history; it does not extend this one, because a bounded record
 * that grows is an open-ended record wearing a bounded name.
 */
export interface NextWeek {
  /** Whether the purchased term has ended. Mirrors the history's `complete`. */
  ended: boolean;
  /** Rule 23a, on the artifact. */
  the_rule: string;
  /** What to do now, in the state the history is actually in. */
  what_now: string;
  /** The item, read off the shelf: id, name, price, cadence, term. */
  item: Record<string, unknown>;
  /** The purchase door with THIS door already in the query. */
  buy_url: string;
}

export const NEVER_RENEWS_ITSELF =
  "This watch ends on its own and never renews itself: bounded, prepaid, the passes we miss published against us. Another week exists only if its buyer buys it — nothing here charges again by itself.";

export function nextWeek(
  base: string,
  itemId: "standing_watch" | "conformance_watch",
  url: string,
  endsAt: string,
  complete: boolean,
): NextWeek | null {
  const rung = ladderRung(
    base,
    itemId,
    "the same checks on the same door for another week, signed day by day, as a new history",
  );
  if (!rung) return null;
  const buyUrl = `${base}/api/buy/${itemId}?url=${encodeURIComponent(url)}`;
  return {
    ended: complete,
    the_rule: NEVER_RENEWS_ITSELF,
    what_now: complete
      ? `This week is over. The history stays at this URL, free, forever. Another week on the same door is one purchase at ${buyUrl}; it starts a new history rather than extending this one.`
      : `This week ends at ${endsAt}. When it does, another week on the same door is one purchase at ${buyUrl}; until then there is nothing to do and nothing that will be charged.`,
    item: rung,
    buy_url: buyUrl,
  };
}
