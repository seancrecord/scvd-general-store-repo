import { withKvRetry } from "@/lib/kv-retry";
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
  /**
   * WHERE THE NEXT PAGE STARTS, when there is one (2026-08-27).
   *
   * Present exactly when `truncated` is true and KV handed back a
   * cursor. Until today every reading here started at the beginning of
   * the prefix and stopped at its cap, which is correct for a bounded
   * read and useless for a collection that grows — the guestbook could
   * be listed, capped and told it was capped, and there was no way to
   * ask for the rest.
   *
   * Opaque, and passed back verbatim. Nothing outside KV should parse
   * one, and a caller that builds a cursor rather than echoing one it
   * was given is asking KV a question about a keyspace it invented.
   */
  cursor?: string;
}

export interface ListOptions {
  prefix: string;
  /**
   * REQUIRED. There is no default on purpose — a default cap is a
   * silent limit with extra steps, which is the thing being fixed.
   */
  cap: number;
  /**
   * Resume from a cursor a previous call returned. Absent means start
   * at the beginning of the prefix, which is what every caller did
   * before pagination existed and what most still do.
   */
  cursor?: string;
}

/** KV's own per-page ceiling. Asking for more in one call does nothing. */
const KV_PAGE = 1000;

export async function listKeys(
  namespace: KVNamespace,
  options: ListOptions,
): Promise<ListedKeys> {
  const names: string[] = [];
  let cursor: string | undefined = options.cursor;

  while (names.length < options.cap) {
    // Under the same retry policy as every other read (2026-09-02):
    // a list page that dies on page three restarted the walk from
    // nothing, and this helper was the one reader outside it.
    const page = await withKvRetry(() =>
      namespace.list({
        prefix: options.prefix,
        limit: Math.min(KV_PAGE, options.cap - names.length),
        ...(cursor ? { cursor } : {}),
      }),
    );
    for (const key of page.keys) {
      names.push(key.name);
    }
    if (page.list_complete) {
      // Reached the end of the prefix inside the cap: nothing was lost,
      // and there is no next page to hand anybody.
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
  return {
    names: names.slice(0, options.cap),
    truncated: true,
    ...(cursor ? { cursor } : {}),
  };
}

/** The sentence a page shows when a reading hit its cap. */
export function truncationNote(what: string, cap: number): string {
  return `Showing the first ${cap} ${what}; there are more. This is a floor, not a total.`;
}
