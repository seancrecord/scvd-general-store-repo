import { escapeHtml } from "@/lib/sanitize";
import type { RecountResult } from "@/lib/recount";
import { renderAdminShell } from "@/pages/admin/layout";

/**
 * THE RECOUNT, on its own page because the row scan is expensive and
 * nobody should pay for it while reading the desk. Reads the raw rows
 * and says three things the aggregates can't: how far back it got,
 * how much of the organic column is machinery under today's
 * classifier, and whether the rows and the counters agree.
 */

export interface RecountPageData {
  recount: RecountResult;
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

export function renderRecountPage(data: RecountPageData): string {
  const r = data.recount;
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

  const drift = (label: string, rows: number, counter?: number): string => {
    if (counter === undefined) {
      return `<tr><td>${escapeHtml(label)}</td><td>${rows}</td><td>—</td><td>no counter passed</td></tr>`;
    }
    const delta = rows - counter;
    const verdict =
      delta === 0
        ? "rows and counter agree"
        : delta > 0
          ? "rows above counter: lost increments, the expected direction"
          : "counter above rows: a counter wrote without a row, worth finding";
    return `<tr><td>${escapeHtml(label)}</td><td>${rows}</td><td>${counter}</td><td>${escapeHtml(verdict)}</td></tr>`;
  };

  const body = `
  <section>
    <h2>The recount</h2>
    <p>The counters are read-modify-write against KV; they lose increments under
    concurrent traffic and can read stale. The rows don't: one row per event,
    unique key, no contention. This page asks the rows.</p>
    <p><strong>${r.rows_scanned}</strong> rows read${r.capped ? " (scan hit its cap — older rows exist beyond this window)" : " (all rows in the log)"}.
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
    <p>Only comparable when the scan covers the same window as the counters;
    if the scan is capped, treat the row column as a floor.</p>
    <table>
      <tr><th>metric</th><th>rows</th><th>counter</th><th>reading</th></tr>
      ${drift("organic challenges", reclassifiedOrganic, data.counter_challenges_organic)}
      ${drift("organic settles", r.settles.organic, data.counter_settles_organic)}
    </table>
    <p>House settles in this window: ${r.settles.house}. Every settle is money that
    actually moved on chain — that column is the one the books can't fake, because
    it has an outside witness.</p>
  </section>`;

  return renderAdminShell("recount", body);
}
