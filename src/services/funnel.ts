import { bulkGetJson } from "@/lib/kv-bulk";
import { readReason } from "@/lib/declines";
import type { MetricEvent } from "@/lib/metrics";
import type { Env } from "@/types";
import { kvList } from "@/lib/kv-retry";
import { isWalkedAsk, WALK_MIN_ITEMS, WALK_RULE, walkersAmong } from "@/lib/walkers";

/**
 * THE FUNNEL — the instrument for the sharpest number the ledger has
 * ever produced, and the cheapest route to Assumption 0.
 *
 * On 2026-08-18 the keeper's per-item ledger read:
 * settlement_attestation, 703 organic price-asks, ONE settle — and
 * that one was refunded. standing_watch: 611 asks, zero ever. The
 * novelty doors convert at ~1%, so 703 asks "should" have been ~7
 * sales, any one of which would have closed Assumption 0 (nobody has
 * ever paid for a signed observation and kept it).
 *
 * The question that decides what to fix is WHERE the 702 leave, and
 * asks-minus-settles cannot answer it. The decline rows can, because
 * a decline means a WALLET WAS OPENED — a signed payment was actually
 * presented and refused. That splits the silence into two opposite
 * diagnoses with two opposite fixes:
 *
 *   DECLINES > 0  — real intent hit a wall. Buyers signed and were
 *   refused; the flow is the problem, and the reasons name the brick.
 *
 *   DECLINES = 0  — nobody was blocked, because nobody tried. Every
 *   ask was a price-check that walked. The wall is UPSTREAM of the
 *   payment: the pitch, the price framing, or a required input
 *   reading as work. Fixing the flow would fix nothing.
 *
 * Same discipline as everything here: the verdict states what the
 * data can carry and no more. An ask is a 402 issued, not a human
 * with intent — crawlers that survive the infrastructure filter are
 * still in the organic column, and the verdict lines say so.
 */

/**
 * The shelf this instrument exists for. Every item reports, but these
 * are the ones whose conversion IS the strategic question.
 */
export const VERIFICATION_TIER: readonly string[] = [
  "settlement_attestation",
  "settlement_reconciliation",
  "attestation_bundle",
  "service_audit",
  "conformance_watch",
  "bitcoin_anchor",
  "standing_watch",
  "onpage_audit",
  "phantom_check",
  "launch_check",
  "opening_day",
  "provenance_check",
  "the_case_file",
  "the_statement",
  "the_mandate",
];

/** Same bound as the declines desk; the audit says when it hit it. */
export const FUNNEL_SCAN_CAP = 4000;
const LIST_PAGE = 1000;

export interface ItemFunnel {
  item: string;
  verification_tier: boolean;
  /** 402s issued to non-house, non-infrastructure traffic. */
  asks_organic: number;
  /**
   * Of those, the asks that COULD NOT have bought: the request lacked
   * a required input (settlement_attestation with no tx_hash). A
   * scanner at a locked door, not a price-check with intent — and on
   * a door with a prerequisite, most of the silence. Rows booked
   * before 2026-09-04 carry no such mark and count as unlocked.
   */
  asks_locked: number;
  /** Which required input was absent, and how often. */
  locked_inputs: Record<string, number>;
  /**
   * Asks from clients that WALKED THE CATALOG inside this window —
   * WALK_MIN_ITEMS distinct doors in WALK_WINDOW_MS, whatever the
   * user-agent said (lib/walkers.ts, the census's own rule). Counted
   * here and EXCLUDED from asks_organic, because a machine indexing
   * the shelf is not a shopper who walked; the payments a walker
   * presents still count, since a crawler that pays is a customer.
   */
  asks_walked: number;
  /**
   * Signed payments PRESENTED by outside buyers: settles + declines.
   * The line between window-shopping and blocked intent.
   */
  wallets_opened: number;
  settles_organic: number;
  declines_organic: number;
  /** Raw reason -> count, outside only, with the desk's reading. */
  decline_reasons: Record<string, number>;
  /** The reading, stated so the fix is legible from the row alone. */
  verdict: string;
}

export interface FunnelReport {
  rows_scanned: number;
  capped: boolean;
  window_note: string;
  items: ItemFunnel[];
  what_this_cannot_see: string[];
  /** The behaviour rule the walked column was drawn by. */
  walk_rule: typeof WALK_RULE;
}

/**
 * THE LOCKED DOOR (2026-09-04). settlement_attestation: 77 asks, 5
 * wallets, 0 sales, and the verdict called the 72 who never signed
 * "window-shopping — the pitch, the price, or a required input
 * reading as work". At $0.004 it was never the price. That door needs
 * ?tx_hash=, a transaction the buyer already owns; a scanner arriving
 * without one is not a shopper who walked, it is a visitor who could
 * not buy. The ask rows now say which, and this says it back.
 */
function lockedClause(row: Omit<ItemFunnel, "verdict">): string {
  if (row.asks_locked === 0) {
    return "";
  }
  const inputs = Object.entries(row.locked_inputs)
    .sort((a, b) => b[1] - a[1])
    .map(([name, n]) => `${name} ×${n}`)
    .join(", ");
  return ` LOCKED DOOR: ${row.asks_locked} of the ${row.asks_organic} ask${row.asks_organic === 1 ? "" : "s"} arrived without a required input (${inputs}) and could not have bought at any price — a scanner meeting a prerequisite, not a shopper who walked. Read the rest of the silence against the ${row.asks_organic - row.asks_locked} who could have.`;
}

function walkedClause(row: Omit<ItemFunnel, "verdict">): string {
  if (row.asks_walked === 0) {
    return "";
  }
  return ` WALKED: ${row.asks_walked} more ask${row.asks_walked === 1 ? "" : "s"} came from clients that touched ${WALK_MIN_ITEMS}+ doors inside a minute — catalog walks, not shoppers — and are left out of every organic figure above.`;
}

function verdictFor(row: Omit<ItemFunnel, "verdict">): string {
  if (row.settles_organic > 0 && row.declines_organic === 0) {
    return `Converting: ${row.settles_organic} organic settle${row.settles_organic === 1 ? "" : "s"} and no refused attempts on record.`;
  }
  if (row.declines_organic > 0) {
    const ranked = Object.entries(row.decline_reasons).sort(
      (a, b) => b[1] - a[1],
    );
    const top = ranked[0];
    const reading = top ? readReason(top[0].replace(/^settle:/, "")) : null;
    const topCount = top?.[1] ?? 0;

    /**
     * ONE WALL OR A SCATTER (2026-09-04). The verdict used to name the
     * top reason and say "the flow is the problem, not the pitch" —
     * the same sentence for every shape of decline. Two live rows on
     * the same page showed why that will not do: small_blessing had 8
     * refusals and 7 of them one code, which is a brick and has one
     * fix; settlement_attestation had 5 refusals across 4 distinct
     * codes with the largest ×2, which is not a brick and has four.
     * Reporting only the top row made the second look like the first,
     * and it named a transport failure as the wall while three
     * buyer-side shape errors went unmentioned.
     *
     * Half is the line, and the arithmetic is stated rather than
     * implied: a reader who disagrees with the threshold can see the
     * counts it was drawn from.
     */
    const concentrated = topCount * 2 >= row.declines_organic;
    const shape = concentrated
      ? `ONE WALL: "${top?.[0] ?? "unspecified"}" ×${topCount} of ${row.declines_organic}. The flow is the problem, not the pitch, and one fix clears most of it.`
      : `NO SINGLE WALL: ${row.declines_organic} refusals across ${ranked.length} distinct reasons, the largest only ×${topCount}. A scatter is not a brick — there is no one fix here, and the top row is the wrong thing to read alone. All of them: ${ranked.map(([reason, n]) => `"${reason}" ×${n}`).join(", ")}.`;

    /**
     * WHOSE PROBLEM, ACROSS ALL OF THEM — not just the top one. The
     * fault classes are readReason's, the same ones the phone alert
     * uses, so the funnel and the page can never disagree.
     */
    const faults = new Map<string, number>();
    for (const [reason, n] of ranked) {
      const { fault } = readReason(reason.replace(/^settle:/, ""));
      faults.set(fault, (faults.get(fault) ?? 0) + n);
    }
    const mix = [...faults.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([fault, n]) => `${n} ${fault}`)
      .join(", ");

    /**
     * THE OTHER HALF OF THE SILENCE. This branch answered "where did
     * the buyers who signed get stuck" and dropped the ones who never
     * signed, which on a row like 77 asks / 5 wallets is 94% of the
     * item. Both diagnoses in this file's header can be true at once;
     * reporting only the one that fired reads as though the payment
     * flow were the whole story.
     */
    const walked = row.asks_organic - row.wallets_opened;
    const upstream =
      walked > 0
        ? ` Upstream of all of it: ${walked} of ${row.asks_organic} organic ask${row.asks_organic === 1 ? "" : "s"} never presented a signature at all, so the refusals are the smaller half of this item's silence.`
        : "";

    return `REAL INTENT HIT A WALL: ${row.declines_organic} signed payment${row.declines_organic === 1 ? " was" : "s were"} presented and refused${row.settles_organic > 0 ? ` (${row.settles_organic} got through)` : ""}. ${shape} Fault mix: ${mix}.${upstream}${lockedClause(row)}${walkedClause(row)} Top reason: "${top?.[0] ?? "unspecified"}" ×${topCount}${reading ? ` — fault: ${reading.fault}. ${reading.reading}` : ""}`;
  }
  if (row.asks_organic === 0 && row.asks_walked > 0) {
    return `WALKED ONLY: every ask on this door in the window (${row.asks_walked}) came from a client that touched ${WALK_MIN_ITEMS}+ doors inside a minute — the shelf was indexed, not shopped. Nothing here is a lost sale.`;
  }
  if (row.asks_organic > 0) {
    return `WINDOW-SHOPPING: ${row.asks_organic} price-ask${row.asks_organic === 1 ? "" : "s"} and not one presented signature. Nobody was blocked — nobody tried. The wall is upstream of the payment (the pitch, the price framing, or a required input reading as work); fixing the payment flow would fix nothing.${lockedClause(row)}${walkedClause(row)} Caveat the number honestly: an ask is a 402 issued, and crawlers the infrastructure filter does not know yet sit in this count.`;
  }
  return "Quiet: no organic asks in the scanned window.";
}

/**
 * One pass over the event rows, newest first, same storage the
 * declines desk and the census read — no new writes, no new state.
 */
export async function auditFunnel(
  env: Env,
  options: { scanCap?: number; pageSize?: number } = {},
): Promise<FunnelReport> {
  const scanCap = options.scanCap ?? FUNNEL_SCAN_CAP;
  const pageSize = options.pageSize ?? LIST_PAGE;
  const tallies = new Map<
    string,
    Omit<ItemFunnel, "verdict" | "item" | "verification_tier">
  >();
  let scanned = 0;
  let capped = false;
  let sawEnd = false;
  let oldest: string | undefined;
  let cursor: string | undefined;
  const kept: MetricEvent[] = [];

  while (scanned < scanCap) {
    const listed = await kvList(env.COUNTERS, {
      prefix: "evt:",
      limit: pageSize,
      ...(cursor ? { cursor } : {}),
    });
    const values = await bulkGetJson<MetricEvent>(
      env.COUNTERS,
      listed.keys.map((key) => key.name),
    );
    for (const name of listed.keys.map((key) => key.name)) {
      if (scanned >= scanCap) {
        capped = true;
        break;
      }
      const event = values.get(name);
      if (!event) continue;
      scanned += 1;
      if (!oldest || event.at < oldest) oldest = event.at;
      // House traffic is the keeper testing; infrastructure is the
      // known crawler floor. Neither is a lost sale.
      if (event.house || event.channel === "infrastructure") continue;
      kept.push(event);
    }
    if (listed.list_complete || !listed.keys.length) {
      sawEnd = true;
      break;
    }
    cursor = listed.cursor;
  }

  /**
   * THE SECOND PASS (2026-09-04). A walker is a client, not a row, and
   * a client is only visible across rows — so the window is read once
   * for who walked and once for what happened. Same rule as the
   * census and the reclassification walk, imported.
   */
  const walkers = walkersAmong(kept);
  for (const event of kept) {
    {
      const tally = tallies.get(event.item) ?? {
        asks_organic: 0,
        asks_locked: 0,
        locked_inputs: {},
        asks_walked: 0,
        wallets_opened: 0,
        settles_organic: 0,
        declines_organic: 0,
        decline_reasons: {},
      };
      if (isWalkedAsk(event, walkers)) {
        tally.asks_walked += 1;
        tallies.set(event.item, tally);
        continue;
      }
      if (event.kind === "challenge") {
        tally.asks_organic += 1;
        if (event.missing_required && event.missing_required.length > 0) {
          tally.asks_locked += 1;
          for (const name of event.missing_required) {
            tally.locked_inputs[name] = (tally.locked_inputs[name] ?? 0) + 1;
          }
        }
      }
      if (event.kind === "settle") {
        tally.settles_organic += 1;
        tally.wallets_opened += 1;
      }
      if (event.kind === "decline") {
        tally.declines_organic += 1;
        tally.wallets_opened += 1;
        const reason = event.note ?? "unspecified";
        tally.decline_reasons[reason] =
          (tally.decline_reasons[reason] ?? 0) + 1;
      }
      tallies.set(event.item, tally);
    }
  }
  /*
   * THE EXACT-BOUNDARY LIE, caught by the keeper's first real load:
   * the cap landed precisely on a page edge, the while condition
   * exited before any row was ever refused, `capped` stayed false —
   * and the page said "Every event row on record (4000)" over a
   * 25-hour window. A coverage claim decided by which branch exited
   * the loop is a coverage claim decided by luck; what actually
   * happened is the only honest source: we are complete only if we
   * SAW the end of the listing.
   */
  if (!sawEnd) capped = true;

  const items: ItemFunnel[] = [...tallies.entries()]
    .map(([item, tally]) => ({
      item,
      verification_tier: VERIFICATION_TIER.includes(item),
      ...tally,
      verdict: verdictFor({
        item,
        verification_tier: VERIFICATION_TIER.includes(item),
        ...tally,
      }),
    }))
    // The strategic shelf first, then by how much traffic is at stake.
    .sort(
      (a, b) =>
        Number(b.verification_tier) - Number(a.verification_tier) ||
        b.asks_organic - a.asks_organic,
    );

  return {
    rows_scanned: scanned,
    capped,
    window_note: capped
      ? `Newest ${scanned} event rows only (cap ${scanCap}); oldest row read ${oldest ?? "unknown"}. All-time totals live on the item-events desk — this instrument answers WHERE the recent asks leave, not how many there have ever been.`
      : `Every event row on record (${scanned}), oldest ${oldest ?? "none"}.`,
    items,
    walk_rule: WALK_RULE,
    what_this_cannot_see: [
      "Intent. An ask is a 402 issued; a crawler the infrastructure filter does not recognize yet counts as organic, so treat small ask-counts as noise and large ones as signal.",
      "Walkers in the organic column. If MOST items show similar ask-counts with zero wallets — the flat profile this page showed on its first real load — that is the fingerprint of catalog walkers not yet in the infrastructure list, not of demand. The census page names them (undeclared_walkers); promote them to channel.ts and this page's denominators deflate to the truth.",
      "A buyer who never asked: this reads the store's own door, not demand that went elsewhere.",
      "WHY a window-shopper walked. Zero declines proves nobody presented a payment; it cannot say which upstream wall — pitch, price, or required inputs — turned them.",
      "Verify-side refusals that never wrote a decline row (a cross-isolate retry can lose the reason; the declines desk counts those as unspecified).",
    ],
  };
}
