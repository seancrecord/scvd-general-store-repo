import { escapeHtml } from "@/lib/sanitize";
import { renderAdminShell } from "@/pages/admin/layout";
import type { InstrumentMonth, InstrumentRow, InstrumentUsage, UnknownSplit } from "@/services/instruments";

function signed(n: number | null): string {
  if (n === null) return "—";
  return n > 0 ? `+${n}` : String(n);
}

function channels(byChannel: Record<string, number>): string {
  return Object.entries(byChannel)
    .map(([k, v]) => `${escapeHtml(k)} ${v}`)
    .join(", ");
}

function rowsHtml(rows: InstrumentRow[]): string {
  return rows
    .map(
      (r) => `<tr>
      <td><code>${escapeHtml(r.surface)}</code></td>
      <td>${r.kind === "argument" ? "<strong>argument</strong>" : "read"}</td>
      <td><small>${escapeHtml(r.logged_since)} · ${r.days_counted}d</small></td>
      <td>${r.organic}</td>
      <td>${r.per_day === null ? "—" : r.per_day}</td>
      <td>${signed(r.delta)}</td>
      <td>${r.infrastructure}</td>
      <td><small>${channels(r.by_channel)}</small></td>
    </tr>`,
    )
    .join("");
}

const HEAD = `<tr><th>instrument</th><th>kind</th><th>logged since · days</th><th>organic</th><th>per day</th><th>Δ since reading</th><th>infra</th><th>by channel</th></tr>`;

function unknownHtml(u: UnknownSplit): string {
  const hosts = u.referrer_hosts.map((h) => `<code>${escapeHtml(h.host)}</code> ${h.visits}`).join(", ") || "none";
  const surfaces = u.no_user_agent_by_surface.map((s) => `<code>${escapeHtml(s.surface)}</code> ${s.visits}`).join(", ") || "none";
  return `<p><strong>What "unknown" is this month</strong>, off the event rows (${u.rows_scanned} newest rows scanned${u.complete ? ", the whole month" : ", cap hit: a floor"}):
    no user-agent at all <strong>${u.no_user_agent}</strong> (a scraper's signature) · a referrer the inferrer does not name <strong>${u.referred}</strong> (somebody linking here).</p>
    <p><small>Referring hosts: ${hosts}.<br>No-user-agent visits by surface: ${surfaces}.</small></p>`;
}

function monthHtml(m: InstrumentMonth): string {
  const settled = m.settled === null ? "" : ` · settled sales: <strong>${m.settled}</strong>`;
  const since = m.since
    ? `<p><small>Δ is against the reading of ${escapeHtml(m.since)}. Since then: free ${signed(m.free.reduce((s, r) => s + (r.delta ?? 0), 0))}, argument-carrying ${signed(
        m.free.filter((r) => r.kind === "argument").reduce((s, r) => s + (r.delta ?? 0), 0),
      )}, paid calls ${signed(m.paid_tools.reduce((s, r) => s + (r.delta ?? 0), 0))}.</small></p>`
    : `<p><small>No stored reading for this month yet; the Δ column starts on the next visit.</small></p>`;
  return `<section>
    <h3>${escapeHtml(m.month)}${m.truncated ? " <small>(ledger scan capped — floors)</small>" : ""}</h3>
    <p><strong>Free instruments: ${m.free_total} organic uses</strong> — argument-carrying <strong>${m.argument_uses}</strong>, reads ${m.read_uses}
    · paid tool calls: ${m.paid_tool_calls}${settled}
    <small>(${channels(m.free_by_channel) || "no channel split"})</small></p>
    <p><small>The line that matters is argument-carrying uses beside settled sales: a buy_* tool is called at least twice per sale (once for the terms, once with the payment), so paid calls overstate attempts.</small></p>
    ${since}
    <table border="1" cellpadding="4">
      ${HEAD}
      ${rowsHtml(m.free) || "<tr><td colspan=8>none used</td></tr>"}
    </table>
    ${m.unknown ? unknownHtml(m.unknown) : ""}
    ${
      m.paid_tools.length > 0
        ? `<p><small>Paid tools the same month:</small></p><table border="1" cellpadding="4">${HEAD}${rowsHtml(m.paid_tools)}</table>`
        : ""
    }
  </section>`;
}

export function renderInstrumentsPage(usage: InstrumentUsage): string {
  const body = `<section>
    <h2>Free instruments</h2>
    <p><small>What agents use this store for without paying: the preflight, the look, the conformance desk, the verify
    endpoint, the corpus reads, and the free MCP tools — off <a href="/observatory">the observatory</a>'s own counts,
    sorted into free and paid so the ratio is a line. Counts are porch floors with the porch's caveats; tools called
    with arguments are the part of the traffic crawlers cannot fake. Computed ${escapeHtml(usage.computed_at)}.</small></p>
    <p><small><strong>Read the gaps as gaps.</strong> The porch began counting surfaces on ${escapeHtml(usage.porch_counting_since)};
    the interactive doors (preflight, look, before-you-pay, verify-receipt, bot-auth check, the desk page) got their lines
    on ${escapeHtml(usage.doors_logged_since)}. A zero before a row's logged-since date is the counter's absence, not the
    agents'. "Per day" divides by the days the line existed this month, so a partial month reads beside a whole one.</small></p>
  </section>
  ${usage.months.map(monthHtml).join("")}
  <section><p><small>Roster, by prefix: ${usage.roster
    .map((r) => `<code>${escapeHtml(r.prefix)}</code> <em>${r.kind}</em>`)
    .join(" · ")}.</small></p></section>`;
  return renderAdminShell("instruments", body);
}
