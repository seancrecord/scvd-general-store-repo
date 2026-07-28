import type { DeclineReport, DeclineRow } from "@/lib/declines";
import type { MetricEvent } from "@/lib/metrics";
import { escapeHtml } from "@/lib/sanitize";
import { renderAdminShell } from "@/pages/admin/layout";

/**
 * THE DECLINE DESK, on its own page.
 *
 * Every other number in this office measures attention. This one
 * measures intent: somebody opened a wallet at our door and did not
 * get through. Until 2026-07-28 the reasons were recorded and never
 * rendered, so the single most actionable fact the store can produce
 * was sitting in KV where nobody could read it.
 *
 * The page leads with the raw facilitator string, always. The reading
 * beside it is our interpretation and is labelled as one, because a
 * wrong guess about somebody else's error code must never be able to
 * hide the code itself.
 */

export interface DeclinesPageData {
  report: DeclineReport;
  /** Full event trail for the client with the most outside declines. */
  trace?: { user_agent: string; events: MetricEvent[] };
}

const FAULT_LABEL: Record<string, string> = {
  buyer: "theirs",
  ours: "OURS",
  unknown: "unknown",
};

function declineRowHtml(row: DeclineRow): string {
  const colour = row.fault === "ours" ? ' style="color:#8c2f1b"' : "";
  return `<tr>
    <td>${escapeHtml(row.at.slice(0, 19).replace("T", " "))}</td>
    <td>${escapeHtml(row.item)}</td>
    <td><code>${escapeHtml(row.reason)}</code></td>
    <td>${escapeHtml(row.stage)}</td>
    <td${colour}><strong>${escapeHtml(FAULT_LABEL[row.fault] ?? row.fault)}</strong></td>
    <td>${escapeHtml(row.user_agent ?? "(no user-agent)")}${row.house ? " <em>(house)</em>" : ""}</td>
  </tr>`;
}

function traceHtml(trace: DeclinesPageData["trace"]): string {
  if (!trace || trace.events.length === 0) {
    return "";
  }
  const rows = trace.events
    .map(
      (event) => `<tr>
      <td>${escapeHtml(event.at.slice(0, 19).replace("T", " "))}</td>
      <td>${escapeHtml(event.kind)}</td>
      <td>${escapeHtml(event.item)}</td>
      <td>${escapeHtml(event.note ?? "")}</td>
    </tr>`,
    )
    .join("\n");
  return `
  <section>
    <h2>What this one client actually did</h2>
    <p><code>${escapeHtml(trace.user_agent)}</code>, in order, oldest first. The
    sequence is the evidence: which items they tried, how many prices they read
    first, and whether the reason changed between attempts. A client that read
    one price and signed once is a different story from one that walked the
    shelf and then picked.</p>
    <table>
      <tr><th>when</th><th>what</th><th>item</th><th>note</th></tr>
      ${rows}
    </table>
  </section>`;
}

export function renderDeclinesPage(data: DeclinesPageData): string {
  const r = data.report;
  const outside = r.declines.filter((row) => !row.house);
  const ours = outside.filter((row) => row.fault === "ours");

  const verdict =
    outside.length === 0
      ? `<p><strong>No outside declines in this window.</strong> Nobody has opened a
        wallet at our door and been turned away — which, while the census reads
        zero signatures, means the same thing it always has: nobody has tried.</p>`
      : ours.length > 0
        ? `<p style="color:#8c2f1b"><strong>${ours.length} of ${outside.length} outside
          declines look like ours.</strong> That is money the store turned away for a
          reason of its own making. Read the raw reason, not the summary, and fix the
          published requirements before anything else on the list.</p>`
        : `<p><strong>${outside.length} outside decline${outside.length === 1 ? "" : "s"},
          none of them obviously ours.</strong> Somebody wanted to buy and could not,
          which is worth more than any traffic number on the desk — but the reading
          below is a guess about someone else's error code. If one client repeats the
          same reason, treat it as ours until proven otherwise.</p>`;

  const reasonRows = Object.entries(r.by_reason)
    .sort((a, b) => b[1] - a[1])
    .map(
      ([reason, count]) =>
        `<tr><td><code>${escapeHtml(reason)}</code></td><td>${count}</td></tr>`,
    )
    .join("\n");

  const readings = [
    ...new Map(outside.map((row) => [row.reason, row])).values(),
  ]
    .map(
      (row) =>
        `<li><code>${escapeHtml(row.reason)}</code> — ${escapeHtml(row.reading)}</li>`,
    )
    .join("\n");

  const body = `
  <section>
    <h2>The decline desk</h2>
    <p><strong>${r.rows_scanned}</strong> rows read${r.capped ? " (scan hit its cap — older rows exist beyond this window)" : " (all rows in the log)"}.
    <strong>${outside.length}</strong> outside decline${outside.length === 1 ? "" : "s"} from
    <strong>${r.outside_clients.length}</strong> client${r.outside_clients.length === 1 ? "" : "s"}.</p>
    ${verdict}
    ${
      r.unspecified > 0
        ? `<p style="color:#8c2f1b"><strong>${r.unspecified} decline${r.unspecified === 1 ? "" : "s"} recorded with no reason.</strong>
      Verify-side reasons are held in memory keyed by nonce, so a retry that lands on a
      different isolate loses the reason. That is an instrument gap, not a buyer signal —
      if this number is most of the column, fix the instrument before drawing any conclusion
      from the rest of this page.</p>`
        : ""
    }
  </section>

  <section>
    <h2>Every decline, newest first</h2>
    <p>The <code>reason</code> column is the facilitator's verdict verbatim. The
    <code>fault</code> column is OUR READING of it and nothing more — the raw string is
    the fact, and it is printed next to the guess on purpose.</p>
    ${
      r.declines.length === 0
        ? "<p>Nothing in the window.</p>"
        : `<table>
      <tr><th>when</th><th>item</th><th>reason (verbatim)</th><th>stage</th><th>fault</th><th>client</th></tr>
      ${r.declines.map(declineRowHtml).join("\n")}
    </table>`
    }
  </section>

  ${
    outside.length === 0
      ? ""
      : `<section>
    <h2>What the reasons mean</h2>
    <table>
      <tr><th>reason</th><th>times</th></tr>
      ${reasonRows}
    </table>
    <ul>${readings}</ul>
    <p><small>Verify-stage means the signature never cleared. Settle-stage means it
    cleared and the money still did not move — a worse failure, because the buyer
    believes they paid.</small></p>
  </section>`
  }

  ${traceHtml(data.trace)}`;

  return renderAdminShell("office", body);
}
