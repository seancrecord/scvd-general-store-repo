import { escapeHtml } from "@/lib/sanitize";
import { deeperScanNote } from "@/lib/scan-cap";
import type { RecountResult } from "@/lib/recount";
import { renderAdminShell } from "@/pages/admin/layout";
import { cannotSeeHtml } from "@/pages/admin/reading-limits";

/**
 * THE RECOUNT, on its own page because the row scan is expensive and
 * nobody should pay for it while reading the desk. Reads the raw rows
 * and says three things the aggregates can't: how far back it got,
 * how much of the organic column is machinery under today's
 * classifier, and whether the rows and the counters agree.
 */

export interface RecountPageData {
  recount: RecountResult;
  /** Live deployment capability; omitted when it was not read. */
  countersSerialized?: boolean;
  /** Month counters to compare against, when the caller has them. */
  counter_challenges_organic?: number;
  counter_settles_organic?: number;
}

function pct(part: number, whole: number): string {
  if (whole <= 0) {
    return "—";
  }
  return `${((part / whole) * 100).toFixed(1)}%`;
}

const CANNOT_SEE = [
  "Only comparable when the scan covers the same window as the counters. A partial scan against whole-month counters is not a disagreement, it is two different questions.",
  "Historical KV read-add-write counters could lose increments under concurrent traffic. A count difference alone does not establish that cause.",
  "This audits the counters against the rows the store kept. It cannot audit the rows against what actually happened.",
];

export function renderRecountPage(data: RecountPageData): string {
  const r = data.recount;
  const writer = data.countersSerialized === true
    ? "Current writer: serialized counter ledger. Concurrent increments do not overwrite each other; its KV reporting mirrors may lag."
    : data.countersSerialized === false
      ? "Current writer: KV read-add-write fallback. Concurrent traffic can lose increments; the counter ledger binding is absent."
      : "Current writer: unknown in this reading.";
  const recordedOrganic = r.as_recorded.organic;
  const reclassifiedOrganic = r.as_reclassified.organic;

  const moversHtml =
    r.movers.length === 0
      ? "<p>Nothing moved. Every row the books called organic, today's table still calls organic.</p>"
      : `<table>
      <tr><th>user agent</th><th>rows moved</th></tr>
      ${r.movers
        .map(
          (mover) => `<tr>
        <td>${escapeHtml(mover.user_agent)}</td>
        <td>${mover.rows}</td>
      </tr>`,
        )
        .join("\n")}
    </table>`;

  /**
   * THE VERDICT HAS TO KNOW THE SCAN WAS CAPPED, and it did not.
   *
   * Reported 2026-07-30: organic-challenge counter 7762 against 1004
   * rows, with this table calling it "a counter wrote without a row,
   * worth finding." IT IS NOT A BUG. The counter is the whole month;
   * the rows are the newest 3000 events of every kind, which on this
   * store is a few days and contained 1004 challenges. Two different
   * windows, compared as though they were one.
   *
   * THE CAUTION WAS ALREADY ON THE PAGE, one line above this table, in
   * prose — "if the scan is capped, treat the row column as a floor" —
   * and the table then printed a confident verdict contradicting it.
   * A reader believes the cell, not the paragraph. That is the same
   * shape as the Sources-versus-event-row report on the first organic
   * settle: two correct numbers arranged so they read as a
   * contradiction, which costs the same as a wrong number and is
   * harder to stop believing, because the reader has no way to
   * discover that the things being compared are not the same thing.
   *
   * So the verdict now consults the cap and refuses to draw a
   * conclusion it cannot support.
   */
  const drift = (
    label: string,
    rows: number,
    counter?: number,
  ): string => {
    if (counter === undefined) {
      return `<tr><td>${escapeHtml(label)}</td><td>${rows}</td><td>—</td><td>no counter passed</td></tr>`;
    }
    const delta = rows - counter;
    let verdict: string;
    if (r.capped) {
      verdict =
        "not comparable: the scan stopped at its cap. These retained-row counts are partial; the difference does not establish a cause.";
    } else if (delta === 0) {
      verdict = "counts agree in this reading; matching coverage and transactions are not established";
    } else if (delta > 0) {
      verdict = "retained rows above counter; cause not established — check timing, coverage and classification";
    } else {
      verdict =
        "counter above retained rows; cause not established — check retention, timing and classification";
    }
    return `<tr><td>${escapeHtml(label)}</td><td>${rows}</td><td>${counter}</td><td>${escapeHtml(verdict)}</td></tr>`;
  };

  const body = `
  <section>
    <h2>The recount</h2>
    <p><strong>${writer}</strong></p>
    <p>This page compares retained event rows with counters. Older KV counters
    could lose increments; rows can also expire or fail to be retained. Neither
    count alone identifies the cause of a difference.</p>
    <p><strong>${r.rows_scanned}</strong> rows read${r.capped ? " (scan hit its cap — older rows exist beyond this window)" : " (all readable retained rows in the scan)"}.${deeperScanNote(r.capped)}
    Window: ${escapeHtml(r.oldest_row ?? "—")} → ${escapeHtml(r.newest_row ?? "—")}.</p>
    <p>By kind: ${Object.entries(r.by_kind)
      .map(([kind, count]) => `${escapeHtml(kind)} ${count}`)
      .join(" · ")}</p>
  </section>

  <section>
    <h2>How dirty is the organic column</h2>
    <p>Channel is inferred once, at write time, and never revisited — but every
    row keeps the user-agent it arrived with, so today's crawler table can be
    applied to yesterday's rows. This is that comparison, on 402 challenges.</p>
    <p><small>From 2026-07-28, a challenge already classified as infrastructure at
    write time keeps its counter but writes no row — it had nothing to reclassify
    into. Rows labelled ORGANIC are all still written, which is exactly the set this
    page re-reads.</small></p>
    <table>
      <tr><th></th><th>organic</th><th>house</th><th>infrastructure</th></tr>
      <tr><td>as the books recorded it</td><td>${r.as_recorded.organic}</td><td>${r.as_recorded.house}</td><td>${r.as_recorded.infrastructure}</td></tr>
      <tr><td>as today's table reads it</td><td>${r.as_reclassified.organic}</td><td>${r.as_reclassified.house}</td><td>${r.as_reclassified.infrastructure}</td></tr>
    </table>
    <p><strong>${r.reclassified_organic_to_infrastructure}</strong> rows the books
    counted as organic are machinery under today's table — ${pct(r.reclassified_organic_to_infrastructure, recordedOrganic)}
    of the recorded organic column in this window. Corrected organic challenges
    in this window: <strong>${reclassifiedOrganic}</strong>.</p>
    ${moversHtml}
  </section>

  <section>
    <h2>Rows against counters</h2>
    <p>Only comparable when the scan covers the same window as the counters.
    The counters are the whole month; the rows are the newest ${r.rows_scanned}
    events of every kind. ${
      r.capped
        ? "<strong>The scan is capped, so these are two different windows and the row column is a floor.</strong> The reading column says so rather than leaving it to be worked out."
        : "The scan reached the end of the retained log. That does not establish complete coverage of the counter month: older rows may have expired."
    }</p>
    <table>
      <tr><th>metric</th><th>rows</th><th>counter</th><th>reading</th></tr>
      ${drift("organic challenges", reclassifiedOrganic, data.counter_challenges_organic)}
      ${drift("organic settles", r.settles.organic, data.counter_settles_organic)}
    </table>
    <p>House settlement events in this window: ${r.settles.house}. These are
    stored observations; this page performs no fresh chain verification and does
    not establish payment or delivery for an individual purchase.</p>
  </section>`;

  return renderAdminShell("recount", body + cannotSeeHtml(CANNOT_SEE));
}
