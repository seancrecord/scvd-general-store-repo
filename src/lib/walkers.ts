import type { MetricEvent } from "@/lib/metrics";

/**
 * THE WALK DETECTOR, AS ONE RULE THREE SURFACES SHARE (2026-09-04).
 *
 * The crawler table in channel.ts only catches machines that admit
 * what they are — it reads the user-agent and believes it. A catalog
 * walk is a BEHAVIOUR, and behaviour cannot lie: one client touching
 * many distinct doors inside a minute is indexing us, whatever it
 * calls itself. The census has said so since July and computed
 * `undeclared_walkers` — walkers today's table still calls organic —
 * as a report on /admin/census. A report. The reclassification walk
 * that feeds /pulse and /stats used the table alone, and so did the
 * funnel, so the two public surfaces subtracted only the machines
 * that named themselves.
 *
 * What that cost, in numbers off the public surfaces the day this
 * shipped: September's correction removed 2 rows of 7,017. August's
 * per-door visits sat between 70 and 101 for every door on the shelf,
 * a $0.005 blessing and a $25 collaboration alike — the flat
 * fingerprint of something walking the list, not somebody choosing
 * from it. And 48,566 all-time asks against 97 wallets ever opened,
 * a ratio that held at a quarter of a percent across months whose
 * volumes differed sevenfold. If asks were intent, that ratio would
 * move. It did not, because most of the asks were never intent.
 *
 * So the rule lives here, once, and the census, the reclassification
 * walk and the funnel all import it: they cannot disagree about who
 * a walker is. The thresholds are the census's own, unchanged.
 *
 * WHAT IT NEVER TOUCHES. A settle is a wallet opened at the door and
 * money moved, and a crawler that pays is a customer — the rule the
 * counters have always used. Only CHALLENGE rows are ever reclassified
 * by behaviour on the public surfaces, and only for outside clients;
 * house is house.
 *
 * AMENDED 2026-09-30, the keeper's ruling, off the decline desk. This
 * block used to say "a settle or a decline is a wallet opened at the
 * door", and the desk read it literally: a client that was REFUSED at
 * every input-taking door on the shelf inside a minute, one required
 * input missing per door, counted as the one buyer the shared-reason
 * escalation needs to print OURS, and it printed OURS for six days on
 * the strength of that one client. Two independent implementations
 * missing the same input is evidence about the challenge; one
 * implementation carrying a signature down the whole shelf is a walk,
 * and the signature does not change what the walk is. So a DECLINE
 * walk is now the same rule, read off decline rows: a client refused
 * at WALK_MIN_ITEMS distinct doors inside WALK_WINDOW_MS is machinery
 * on the decline desk, by behaviour, whatever it calls itself. The
 * keeper asked the harder question too — what if walkers are being
 * handed wallets? — and the rule as amended answers it in three
 * parts. A walker that pays and settles is a customer, unchanged. A
 * walker whose wallet is refused at four doors inside a minute is a
 * walker with a wallet, and its refusals are discoverability
 * evidence, not lost sales. A walker with a wallet refused at ONE
 * door is indistinguishable from a buyer and is read as one, which is
 * the right default: the cost of that mistake is a fault column that
 * says OURS once, and the cost of the opposite mistake is a buyer the
 * store learned to ignore.
 *
 * THE HONEST LIMIT, inherited from the census: a "client" is a
 * distinct user-agent string. Two agents behind the same default SDK
 * string count once; one that rotates its string counts many times.
 * A walker that rotates per request is invisible here exactly as it
 * is everywhere else.
 */
export const WALK_WINDOW_MS = 60_000;
export const WALK_MIN_ITEMS = 4;
export const NO_UA = "(no user-agent)";

export const WALK_RULE = {
  window_ms: WALK_WINDOW_MS,
  min_items: WALK_MIN_ITEMS,
  says: `A client that touches ${WALK_MIN_ITEMS} or more distinct priced doors inside ${WALK_WINDOW_MS / 1000} seconds is walking the catalog, whatever its user-agent says. Its price-asks are machinery; a payment it presents that settles is a customer's. A client REFUSED at that many distinct doors inside the same window is walking with a signature, not buying (amended 2026-09-30): the decline desk reads its refusals as machinery, and they count toward whether a required input is discoverable, never toward money the store turned away.`,
} as const;

export interface Touch {
  at: number;
  item: string;
}

/**
 * The widest set of distinct items one client touched inside one
 * window. Two pointers over the sorted touches; the map holds the
 * items currently inside the window, so its size is the walk width.
 */
export function widestWalk(touches: Touch[]): number {
  const sorted = [...touches].sort((a, b) => a.at - b.at);
  const inWindow = new Map<string, number>();
  let widest = 0;
  let left = 0;
  for (let right = 0; right < sorted.length; right += 1) {
    const entry = sorted[right];
    if (!entry) continue;
    inWindow.set(entry.item, (inWindow.get(entry.item) ?? 0) + 1);
    while (left < right) {
      const oldest = sorted[left];
      if (!oldest || entry.at - oldest.at <= WALK_WINDOW_MS) break;
      const remaining = (inWindow.get(oldest.item) ?? 1) - 1;
      if (remaining <= 0) inWindow.delete(oldest.item);
      else inWindow.set(oldest.item, remaining);
      left += 1;
    }
    widest = Math.max(widest, inWindow.size);
  }
  return widest;
}

/** The user-agent a row is keyed under, blank and absent alike. */
export function walkerKey(event: Pick<MetricEvent, "user_agent">): string {
  return event.user_agent && event.user_agent.length > 0 ? event.user_agent : NO_UA;
}

/**
 * The user-agents whose behaviour is a catalog walk, over any set of
 * rows. Reads outside CHALLENGE rows only; everything else is ignored
 * here and never reclassified by the caller either.
 */
export function walkersAmong(
  rows: Iterable<Pick<MetricEvent, "kind" | "house" | "user_agent" | "item" | "at">>,
): Set<string> {
  const touches = new Map<string, Touch[]>();
  for (const row of rows) {
    if (row.kind !== "challenge" || row.house) continue;
    const key = walkerKey(row);
    const list = touches.get(key) ?? [];
    list.push({ at: Date.parse(row.at), item: row.item });
    touches.set(key, list);
  }
  const walkers = new Set<string>();
  for (const [key, list] of touches) {
    if (widestWalk(list) >= WALK_MIN_ITEMS) walkers.add(key);
  }
  return walkers;
}

/**
 * THE SAME RULE, READ OFF DECLINE ROWS (2026-09-30, see the amendment
 * above). The user-agents refused at WALK_MIN_ITEMS or more distinct
 * doors inside one WALK_WINDOW_MS window, with the widest such walk
 * beside each so the desk can print the number rather than the
 * verdict. Outside rows only; house is house here as everywhere.
 *
 * Deliberately a second function rather than a `kind` argument on
 * walkersAmong: the challenge walk feeds three public surfaces and
 * must not be able to widen by accident, and the two are different
 * claims — one is "it asked every price", the other is "it signed at
 * every door and was refused at each".
 */
export function declineWalkersAmong(
  rows: Iterable<Pick<MetricEvent, "kind" | "house" | "user_agent" | "item" | "at">>,
): Map<string, number> {
  const touches = new Map<string, Touch[]>();
  for (const row of rows) {
    if (row.kind !== "decline" || row.house) continue;
    const key = walkerKey(row);
    const list = touches.get(key) ?? [];
    list.push({ at: Date.parse(row.at), item: row.item });
    touches.set(key, list);
  }
  const walkers = new Map<string, number>();
  for (const [key, list] of touches) {
    const widest = widestWalk(list);
    if (widest >= WALK_MIN_ITEMS) walkers.set(key, widest);
  }
  return walkers;
}

/** Whether this CHALLENGE row belongs to a client the rule calls a walker. */
export function isWalkedAsk(
  event: Pick<MetricEvent, "kind" | "house" | "user_agent">,
  walkers: ReadonlySet<string>,
): boolean {
  return event.kind === "challenge" && !event.house && walkers.has(walkerKey(event));
}
