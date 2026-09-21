import { bulkGetJson } from "@/lib/kv-bulk";
import { declineStage, readReason } from "@/lib/declines";
import type { MetricEvent } from "@/lib/metrics";
import type { Env } from "@/types";
import { kvList } from "@/lib/kv-retry";
import { isWalkedAsk, WALK_MIN_ITEMS, WALK_RULE, walkersAmong } from "@/lib/walkers";
import { buyInputSchema } from "@/lib/bazaar-discovery";
import { getMenuItem } from "@/store";

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
  /**
   * THE ONE COMPARISON THAT SETTLES THE INPUT QUESTION (2026-09-21).
   *
   * Every locked row on this page invites the same conclusion — that
   * required inputs are where the shelf loses people — and it is the
   * conclusion the page used to push, by printing LOCKED DOOR over
   * what was really an agent asking a price. The items that require NO
   * input are the control group, and they were sitting on the same
   * page the whole time converting at the same rate. Derived here so a
   * reader is handed the comparison rather than having to scroll for
   * it and do the arithmetic.
   */
  input_gate_reading: string;
  what_this_cannot_see: string[];
  /** The behaviour rule the walked column was drawn by. */
  walk_rule: typeof WALK_RULE;
}

function inputClause(row: Omit<ItemFunnel, "verdict">): string {
  const inputs = Object.entries(row.locked_inputs)
    .sort((a, b) => b[1] - a[1])
    .map(([name, n]) => `${name} ×${n}`)
    .join(", ");
  /*
   * THIS SAID "LOCKED DOOR" UNTIL 2026-09-21, and it was naming the
   * store's own intended behaviour as a defect.
   *
   * An ask that carries no required input is what ASKING THE PRICE
   * looks like. The published probe rule (spec 3.16.7) answers a bare
   * GET with 402 and required_params for exactly that reason: an agent
   * pricing settlement_attestation has no tx_hash yet, because it is
   * shopping. Nobody was turned away.
   *
   * The label mattered because it pointed the reader at a fix that had
   * already shipped — the 2026-09-15 correction put required_params
   * into the PAYMENT-REQUIRED description, ahead of the pitch — for a
   * problem the rest of this page says is not discoverability at all.
   * The items requiring NO input convert at the same rate as these,
   * which is the comparison inputGateReading now prints on the report.
   *
   * What a locked door actually looks like is an input REFUSAL: a
   * client that supplied something and was turned away before the
   * gate. That count is on the row and is named here beside the
   * probes, so the two can never again be read as one thing.
   */
  const probes = row.asks_locked > 0
    ? ` ASKED THE PRICE WITHOUT INPUTS: ${row.asks_locked} of the ${row.asks_organic} asks arrived without a required input (${inputs}). The published probe rule answers a bare GET with 402 and required_params, so this is what pricing a door looks like before you hold the input — it is not evidence anybody was refused. What would be is an input refusal, counted apart: ${row.input_refusals_organic} on this item.`
    : "";
  return `${probes} Input presence on asks: ${row.asks_inputs_present} present, ${row.asks_locked} missing, ${row.asks_inputs_unknown} unknown. Presence does not establish validity.`;
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

  /*
   * Gated = the door publishes a required input; open = it does not.
   * An item the menu no longer carries is left out of both rather than
   * guessed at, and said so below when it happens.
   */
  let gatedAsks = 0, gatedSettles = 0, gatedItems = 0;
  let openAsks = 0, openSettles = 0, openItems = 0;
  let unknownItems = 0;
  for (const row of items) {
    const menuItem = getMenuItem(row.item);
    if (!menuItem) { unknownItems += 1; continue; }
    const gated = (buyInputSchema(menuItem).required ?? []).length > 0;
    if (gated) { gatedItems += 1; gatedAsks += row.asks_organic; gatedSettles += row.settles_organic; }
    else { openItems += 1; openAsks += row.asks_organic; openSettles += row.settles_organic; }
  }
  const rate = (settles: number, asks: number): string =>
    asks === 0 ? "no asks to judge by" : `${settles} of ${asks}`;
  const input_gate_reading =
    gatedAsks === 0 && openAsks === 0
      ? "No organic asks on either side in this window; the comparison has nothing to stand on."
      : `Doors that REQUIRE an input: ${rate(gatedSettles, gatedAsks)} organic asks settled, across ${gatedItems} items. Doors that require NONE: ${rate(openSettles, openAsks)}, across ${openItems} items.${unknownItems > 0 ? ` ${unknownItems} item${unknownItems === 1 ? "" : "s"} no longer on the menu, left out of both.` : ""} ` +
        (openAsks > 0 && openSettles === 0 && gatedSettles === 0
          ? "Both sides are at zero, so whatever is stopping these clients is not the input: a door with nothing to supply lost them at the same rate. Reading the locked rows as an input problem would be reading past the control group on this very page."
          : "Read the two rates against each other before treating a missing input as the cause; the open doors are the control group for that claim.");

  return {
    input_gate_reading,
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
