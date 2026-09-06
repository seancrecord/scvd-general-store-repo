import { bulkGetJson } from "@/lib/kv-bulk";
import { KV_KEYS } from "@/lib/kv-keys";
import { listKeys } from "@/lib/kv-list";
import type { MetricEvent } from "@/lib/metrics";
import { getAlmanacEntry } from "@/store/almanac";
import { getMenuItem } from "@/store";
import type { Env } from "@/types";

/**
 * THE SHOP WINDOW — the last few things that sold, in the words a
 * person uses for them.
 *
 * The keeper's ask, 2026-09-06: "a running or live index of the most
 * recent sells on the home page... to show what people are buying."
 * The store had plenty of surfaces that COUNT sales — /stats has the
 * organic total, /pulse has the whole funnel, the first-dollar frame
 * has exactly one of them, forever — and not one that showed the
 * ordinary fact a shopper looks for through the glass: somebody just
 * bought one of these.
 *
 * THREE RULES DECIDE EVERY LINE OF THIS FILE.
 *
 * 1. FAMILY DOESN'T MAKE THE PAPER. House traffic is flagged at the
 *    till and excluded from every organic figure the store publishes
 *    (HOUSE_FLAG_POLICY, services/stats.ts). A window that filled with
 *    the keeper's own test purchases would be the store's most visible
 *    number and its least honest one, so `house` rows are dropped here
 *    exactly as they are dropped there.
 *
 * 2. NOBODY'S NAME IS IN THE GLASS. A settle knows the wallet that
 *    paid it, the user-agent it arrived with, the channel it came
 *    through, and none of that is a shopper's business. The window
 *    carries WHAT sold and WHEN — the same discipline the fulfillment
 *    log states in its own header, which publishes conduct and never
 *    buyers.
 *
 * 3. NO PRICE IN THE WINDOW, and this is a choice rather than an
 *    oversight. A settle event carries no amount, so a price here
 *    would mean either widening what the till writes down or printing
 *    the SHELF's price beside somebody's purchase — and the second is
 *    a claim about what they paid, which on a shelf carrying
 *    pay-what-you-want items would sometimes be false. The window says
 *    what sold; the price is one click away on the item's own page,
 *    where it is the live one, and what was actually taken is counted
 *    at /stats.
 *
 * WHAT IT DELIBERATELY IS NOT: a count. Nothing here adds up, nothing
 * here is a total, and a row that scrolled off is not a row that was
 * lost — /stats is the ledger and says so. Rule 52 has nothing to bite
 * on because the window makes no claim about how many.
 */

/** One thing that sold, ready to hang in the glass. */
export interface WindowSale {
  /** What it is called on the shelf, not what the till calls it. */
  name: string;
  /** Where a reader goes to buy the same thing. */
  href: string;
  /** When the money settled, ISO. The machine-readable half. */
  at: string;
  /** The same instant in English ("about an hour ago"). */
  when: string;
}

export interface ShopWindow {
  sales: WindowSale[];
  /** When this reading was taken, so a page can say how fresh it is. */
  read_at: string;
  /**
   * The oldest sale the scan reached, or null when it reached none.
   * A window showing fewer rows than it has room for is either a young
   * shop or a short scan, and this is how a reader tells them apart.
   */
  reached_back_to: string | null;
}

/** How many rows the glass holds. The keeper asked for three to five. */
export const WINDOW_SIZE = 5;

/**
 * The ceiling on the scan, named once and handed to the helper that
 * enforces it. It is a backstop rather than a budget: the prefix holds
 * only sales, on a 90-day TTL, so the list returns what exists and the
 * cap is what keeps a busy future from turning the front page into a
 * walk. Reaching it would mean 200 sales in 90 days, which is a problem
 * worth having and a number worth revisiting on the day it arrives.
 */
const SCAN_CAP = 200;

/**
 * ONE SETTLE, NAMED THE WAY A PERSON WOULD NAME IT.
 *
 * The till keys an item by its id (`small_blessing`) or, for a page
 * that takes money and mints nothing, by its path with the slashes
 * turned to colons (`almanac:<slug>`). Neither is a thing to print on
 * the front of the building. Both resolve to something already
 * written down elsewhere — the shelf's own name, the entry's own
 * title — so the window cannot invent a name for anything, and a
 * renamed item is renamed here on the same deploy.
 *
 * THE LAST RESORT IS A READABLE KEY, NOT A DROPPED ROW. If a door
 * starts taking money before it is on the menu, the honest answer is
 * that something sold and the window can say so plainly; dropping the
 * row would make the glass quietly disagree with the books. The
 * underscores go, the first letter comes up, and nothing is guessed.
 */
export function nameForItemKey(item: string): { name: string; href: string } {
  const shelf = getMenuItem(item);
  if (shelf) {
    return { name: shelf.name, href: `/menu/${shelf.id}` };
  }
  if (item.startsWith("almanac:")) {
    const slug = item.slice("almanac:".length);
    const entry = getAlmanacEntry(slug);
    return {
      name: entry ? entry.title : "A page from the almanac",
      href: `/almanac/${slug}`,
    };
  }
  const words = item.replace(/[:_]+/g, " ").trim();
  return {
    name: words.charAt(0).toUpperCase() + words.slice(1),
    href: "/menu",
  };
}

/**
 * THE INSTANT, IN ENGLISH, AND VAGUE ON PURPOSE PAST THE FIRST HOUR.
 *
 * "4 minutes ago" is what a live window is for. "2 days ago" is the
 * same fact at the resolution anybody actually reads it. Precision
 * beyond that buys nothing and starts to describe a buyer's schedule,
 * which is not ours to publish — the ISO instant rides along for a
 * machine that wants it, and the words are for the glass.
 */
export function relativeWhen(at: string, now: number = Date.now()): string {
  const then = new Date(at).getTime();
  if (!Number.isFinite(then)) {
    return "recently";
  }
  // A clock skew between the till and the reader is not a time travel
  // story; the newest sale reads as "just now" and nobody is misled.
  const seconds = Math.max(0, Math.round((now - then) / 1000));
  if (seconds < 90) {
    return "just now";
  }
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `${minutes} minutes ago`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return hours === 1 ? "about an hour ago" : `${hours} hours ago`;
  }
  const days = Math.round(hours / 24);
  if (days < 30) {
    return days === 1 ? "yesterday" : `${days} days ago`;
  }
  const months = Math.round(days / 30);
  return months === 1 ? "last month" : `${months} months ago`;
}

/** True when this row is a sale a stranger made. */
function isOutsideSale(event: MetricEvent | null | undefined): event is MetricEvent {
  return Boolean(event && event.kind === "settle" && !event.house);
}

/**
 * The newest few outside sales, newest first.
 *
 * THE SALE INDEX ONLY, and the raw `evt:` stream deliberately not.
 *
 * The decline desk (lib/declines.ts) reads its index AND the raw
 * stream behind it, because a decline is rare and the desk is a page
 * the keeper opens on purpose. This is the front door, and the same
 * shape priced differently: the tail was a 200-key scan plus a bulk
 * read of the BUSIEST prefix in the store, on every render of the page
 * a crawler hits for free — the cost services/stats.ts moved the rail
 * split off this render to avoid, arriving by another door.
 *
 * And it bought nothing. `evt:` carries every price check and every
 * corpus read, so 200 rows back is minutes of traffic, not days of
 * sales — a settle from before the index shipped is essentially never
 * inside that window. The store would have paid that cost on every
 * render for a scan whose hit rate is, in production, zero. So the
 * window reads the prefix where every key is a sale, at a cost bounded
 * by how many sales exist rather than by how busy the store is, and
 * the pre-index settles simply are not in it. They are in the books at
 * /stats, which is where a count belongs.
 *
 * A CORRECTION ABOUT WHY THIS WAS CUT, kept because the reasoning is
 * the part worth trusting. The tail was removed on 2026-09-06 on the
 * strength of a CI reading — the Tests step running about twice its
 * usual length — and that reading did not belong to this code. Eleven
 * workflow runs across five branches were in flight on the account at
 * the time, and every one of them was slow. The per-render cost above
 * is real and measurable on its own terms; the CI number was not
 * evidence of it, and is not claimed here as if it were.
 *
 * WHAT THIS MEANS ON THE DAY IT SHIPS: an empty window until the next
 * sale, and the copy already says that plainly. A shop window shows
 * what is moving, not an archive.
 *
 * Fail-soft is the CALLER's job here, not this function's: it throws
 * what KV throws, and the storefront catches, because a bare window is
 * a decoration failing open (AT_SCALE rule 7) while a swallowed error
 * on the endpoint is a bug nobody ever sees.
 */
export async function readShopWindow(
  env: Env,
  limit: number = WINDOW_SIZE,
  now: number = Date.now(),
): Promise<ShopWindow> {
  const rows: MetricEvent[] = [];
  let oldest: string | null = null;

  /**
   * ONE CAPPED LIST, THEN ONE BULK READ, THROUGH THE HOUSE HELPER —
   * and the first draft of this hand-rolled the paging instead, which
   * hung CI for two hours on 2026-09-06.
   *
   * The loop it replaced advanced `cursor = page.cursor` and counted
   * only the rows a page actually returned. KV may answer a page with
   * `list_complete: false` AND no cursor, and on an EMPTY page that
   * combination is a spin: nothing to count, so the row cap never
   * moves, and no cursor, so the next request is the same request.
   * Forever, silently, inside a GET on the front page.
   *
   * lib/kv-list.ts has had the missing line since it was written
   * (`cursor = page.cursor; if (!cursor) break;`) and its own header
   * says why every list in this store goes through it. This one now
   * does. Termination is the helper's property rather than this
   * function's, and the cap is stated once instead of reassembled out
   * of a page size and a row counter.
   */
  const walk = async (prefix: string): Promise<void> => {
    /*
     * BOUNDED-READ-SAFE: truncation cannot change this answer, and the
     * key format is the reason rather than the cap being large.
     *
     * Sale keys are `sellevt:<invertedTimestamp>:<rand>`, and the
     * inverted stamp is zero-padded to a fixed 13 digits — so KV's
     * lexicographic order IS reverse chronological order, exactly.
     * The window wants the newest five; the cap reads two hundred.
     * Anything past the cap is therefore OLDER than every row already
     * in hand and cannot displace one of them. A truncated read and a
     * complete read return the same five sales.
     *
     * The one figure truncation touches is `reached_back_to`, and its
     * name and its doc already say what it is: the oldest sale the
     * scan REACHED, never a claim about the oldest that exists.
     *
     * If the key format ever loses that padding, this stops being true
     * silently — which is why the reason names the padding rather than
     * saying the cap is big enough.
     */
    const listed = await listKeys(env.COUNTERS, { prefix, cap: SCAN_CAP });
    const values = await bulkGetJson<MetricEvent>(env.COUNTERS, listed.names);
    for (const name of listed.names) {
      if (rows.length >= limit) {
        return;
      }
      const event = values.get(name);
      if (!event) {
        continue;
      }
      // Every row the scan READ sets the floor, sale or not: it is
      // how far back the window can honestly claim to have looked.
      if (!oldest || event.at < oldest) {
        oldest = event.at;
      }
      if (isOutsideSale(event)) {
        rows.push(event);
      }
    }
  };

  await walk(KV_KEYS.saleEventPrefix);

  // Newest first. The index is newest-first by key design already; the
  // sort is what makes that a property of the answer rather than of the
  // key format, and it costs nothing on five rows.
  rows.sort((a, b) => b.at.localeCompare(a.at));

  return {
    sales: rows.slice(0, limit).map((event) => {
      const { name, href } = nameForItemKey(event.item);
      return { name, href, at: event.at, when: relativeWhen(event.at, now) };
    }),
    read_at: new Date(now).toISOString(),
    reached_back_to: oldest,
  };
}
