/**
 * EVERY KV LIST GOES THROUGH HERE, WITH A CAP IT HAD TO NAME.
 *
 * Found 2026-07-30 by the first scalability audit, and it is the same
 * shape as every other defect this week: a silent limit that reads as
 * completeness. Ten call sites listed a prefix with NO limit at all —
 * orders, tips, refunds, confessions, letters, requests, waitlists, the
 * gazette rack, the metric counters — and Cloudflare KV answers an
 * unbounded list with at most one page. Nothing in the codebase read
 * `list_complete` or followed a cursor, anywhere. So those readings
 * would have quietly stopped seeing older records once the store passed
 * a page of keys, with no error, no warning, and a page that still
 * looked complete.
 *
 * Nothing was wrong yet. That is exactly the property that makes it
 * worth fixing now: the defect arrives with success, and the first
 * symptom would have been a number that was simply too low forever.
 *
 * THE RULE, enforced by test rather than remembered: no raw `.list(` in
 * `src/` outside this file. A caller must say how many it wants, and it
 * gets told when there were more.
 */

export interface ListedKeys {
  /** Key names, in KV's own order, capped as asked. */
  names: string[];
  /**
   * TRUE WHEN THERE WERE MORE. The caller decides what to do about it;
   * the one thing it can no longer do is not know.
   */
  truncated: boolean;
}

export interface ListOptions {
  prefix: string;
  /**
   * REQUIRED. There is no default on purpose — a default cap is a
   * silent limit with extra steps, which is the thing being fixed.
   */
  cap: number;
}

/** KV's own per-page ceiling. Asking for more in one call does nothing. */
const KV_PAGE = 1000;

export async function listKeys(
  namespace: KVNamespace,
  options: ListOptions,
): Promise<ListedKeys> {
  const names: string[] = [];
  let cursor: string | undefined;

  while (names.length < options.cap) {
    const page = await namespace.list({
      prefix: options.prefix,
      limit: Math.min(KV_PAGE, options.cap - names.length),
      ...(cursor ? { cursor } : {}),
    });
    for (const key of page.keys) {
      names.push(key.name);
    }
    if (page.list_complete) {
      // Reached the end of the prefix inside the cap: nothing was lost.
      return { names, truncated: false };
    }
    cursor = page.cursor;
    if (!cursor) {
      break;
    }
  }
  /**
   * Stopped at the cap with the prefix unfinished, OR KV stopped
   * paginating without saying it was complete. Both mean the same thing
   * to a reader: this list is a floor.
   */
  return { names: names.slice(0, options.cap), truncated: true };
}

/** The sentence a page shows when a reading hit its cap. */
export function truncationNote(what: string, cap: number): string {
  return `Showing the first ${cap} ${what}; there are more. This is a floor, not a total.`;
}
