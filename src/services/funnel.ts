import { bulkGetJson } from "@/lib/kv-bulk";
import { declineStage, readReason } from "@/lib/declines";
import type { MetricEvent } from "@/lib/metrics";
import type { Env } from "@/types";
import { kvList } from "@/lib/kv-retry";
import { isWalkedAsk, WALK_MIN_ITEMS, WALK_RULE, walkersAmong } from "@/lib/walkers";

/**
 * Retained event counts describe what was recorded, not unique buyers
 * or a joined purchase journey. A local refusal can precede payment
 * verification, and missing telemetry cannot establish intent.
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
  "a2a_repair_kit",
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
  /** Asks with an explicit annotation naming absent required inputs. */
  asks_locked: number;
  /** Required fields were present; this does not establish validity. */
  asks_inputs_present: number;
  /** No input-presence annotation was recorded, including older rows. */
  asks_inputs_unknown: number;
  /** Which required input was absent, and how often. */
  locked_inputs: Record<string, number>;
  /**
   * Asks from clients that WALKED THE CATALOG inside this window —
   * WALK_MIN_ITEMS distinct doors in WALK_WINDOW_MS, whatever the
   * user-agent said (lib/walkers.ts, the census's own rule). Counted
   * here and EXCLUDED from asks_organic by the published behavior
   * rule. Their payment events still count. This is a classification
   * of request patterns, not evidence of intent.
   */
  asks_walked: number;
  /** Legacy field: settles + declines, an event count, not unique wallets or valid signatures. */
  wallets_opened: number;
  settles_organic: number;
  declines_organic: number;
  input_refusals_organic: number;
  /** Payment parsing/verification bucket; does not prove a facilitator call. */
  payment_declines_organic: number;
  settlement_declines_organic: number;
  /** Raw reason -> count, outside only, with the desk's reading. */
  decline_reasons: Record<string, number>;
  /** The reading, stated so the fix is legible from the row alone. */
  verdict: string;
}

export interface FunnelReport {
  rows_scanned: number;
  capped: boolean;
  window_note: string;
  /** Timestamp bounds of rows actually read, not capture-completeness claims. */
  observed_from: string | null;
  observed_through: string | null;
  items: ItemFunnel[];
  what_this_cannot_see: string[];
  /** The behaviour rule the walked column was drawn by. */
  walk_rule: typeof WALK_RULE;
}

function inputClause(row: Omit<ItemFunnel, "verdict">): string {
  const inputs = Object.entries(row.locked_inputs)
    .sort((a, b) => b[1] - a[1])
    .map(([name, n]) => `${name} ×${n}`)
    .join(", ");
  const missing = row.asks_locked > 0
    ? ` LOCKED DOOR: ${row.asks_locked} of the ${row.asks_organic} asks arrived without a required input (${inputs}).`
    : "";
  return `${missing} Input presence on asks: ${row.asks_inputs_present} present, ${row.asks_locked} missing, ${row.asks_inputs_unknown} unknown. Presence does not establish validity.`;
}

function walkedClause(row: Omit<ItemFunnel, "verdict">): string {
  if (row.asks_walked === 0) return "";
  return ` WALKED: ${row.asks_walked} more asks matched the published catalog-walk rule and are excluded from organic asks. The rule describes request patterns, not intent.`;
}

function verdictFor(row: Omit<ItemFunnel, "verdict">): string {
  const context = `${inputClause(row)}${walkedClause(row)}`;
  if (row.declines_organic > 0) {
    const ranked = Object.entries(row.decline_reasons).sort((a, b) => b[1] - a[1]);
    const top = ranked[0];
    const reading = top ? readReason(top[0].replace(/^settle:/, "")) : null;
    const topCount = top?.[1] ?? 0;
    const shape = topCount * 2 >= row.declines_organic
      ? `CONCENTRATED REASONS: "${top?.[0] ?? "unspecified"}" ×${topCount} of ${row.declines_organic}. Repeated codes do not establish a single cause.`
      : `MIXED REASONS: ${row.declines_organic} refusals across ${ranked.length} distinct reasons, the largest ×${topCount}. All of them: ${ranked.map(([reason, n]) => `"${reason}" ×${n}`).join(", ")}.`;
    const faults = new Map<string, number>();
    for (const [reason, n] of ranked) {
      const { fault } = readReason(reason.replace(/^settle:/, ""));
      faults.set(fault, (faults.get(fault) ?? 0) + n);
    }
    const mix = [...faults.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([fault, n]) => `${n} ${fault}`)
      .join(", ");
    return `REFUSALS RECORDED: ${row.declines_organic} refusal events (${row.input_refusals_organic} input, ${row.payment_declines_organic} payment parsing/verification, ${row.settlement_declines_organic} settlement); ${row.settles_organic} settlements recorded. ${shape} Fault mix: ${mix}. Counts are not joined buyer journeys.${context} Top reason: "${top?.[0] ?? "unspecified"}" ×${topCount}${reading ? ` — fault: ${reading.fault}. ${reading.reading}` : ""}`;
  }
  if (row.settles_organic > 0) {
    return `SETTLEMENTS RECORDED: ${row.settles_organic} organic settlements and no refusals in the retained records.${context}`;
  }
  if (row.asks_organic === 0 && row.asks_walked > 0) {
    return `WALKED ONLY: all ${row.asks_walked} asks matched the published catalog-walk rule. Purchase intent is unknown.`;
  }
  if (row.asks_organic > 0) {
    return `PRICE-ASKS ONLY: ${row.asks_organic} asks and no payment outcomes in the retained records. Missing outcomes do not establish why a client stopped or whether payment was attempted elsewhere. Unrecognized crawlers can remain in this count.${context}`;
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
  let newest: string | undefined;
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
      if (!newest || event.at > newest) newest = event.at;
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
        asks_inputs_present: 0,
        asks_inputs_unknown: 0,
        locked_inputs: {},
        asks_walked: 0,
        wallets_opened: 0,
        settles_organic: 0,
        declines_organic: 0,
        input_refusals_organic: 0,
        payment_declines_organic: 0,
        settlement_declines_organic: 0,
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
        } else if (Array.isArray(event.missing_required)) {
          tally.asks_inputs_present += 1;
        } else {
          tally.asks_inputs_unknown += 1;
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
        const stage = declineStage(reason);
        if (stage === "input") tally.input_refusals_organic += 1;
        else if (stage === "settle") tally.settlement_declines_organic += 1;
        else tally.payment_declines_organic += 1;
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
    observed_from: oldest ?? null,
    observed_through: newest ?? null,
    window_note: capped
      ? `Newest ${scanned} event rows only (cap ${scanCap}); oldest row read ${oldest ?? "unknown"}. This is a subset of retained rows, not a complete capture of buyer journeys.`
      : `Every retained event row read (${scanned}), oldest ${oldest ?? "none"}. Retention and missing writes limit coverage.`,
    items,
    walk_rule: WALK_RULE,
    what_this_cannot_see: [
      "Intent. An ask is a 402 issued; unrecognized crawlers can remain in the organic count. The catalog-walk rule describes behavior, not willingness to buy.",
      "A buyer who never asked: this reads the store's own door, not demand that went elsewhere.",
      "Individual conversion or abandonment: asks, refusals, and settlements are not joined into buyer journeys. Retries can produce multiple events; wallets_opened is a legacy event total, not a count of unique wallets or valid signatures.",
      "Complete capture. Event retention, failed writes, and the scan cap can hide outcomes. Timestamp bounds describe the rows read, not uninterrupted instrumentation coverage. Missing decline records do not establish whether payment was attempted.",
      "Input validity from a presence check. An explicit empty missing_required list means required fields were present; an absent annotation is unknown, including historical rows. Refusal stages classify recorded reasons; the payment parsing/verification bucket does not prove a facilitator call.",
    ],
  };
}
