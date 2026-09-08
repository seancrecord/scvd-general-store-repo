import { escapeHtml } from "@/lib/sanitize";
import { renderAdminShell } from "@/pages/admin/layout";
import type { Handoff, InstrumentMonth, InstrumentRow, InstrumentUsage, UnknownSplit } from "@/services/instruments";

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
    no user-agent at all <strong>${u.no_user_agent}</strong> (caller type unknown) · referred from our own pages <strong>${u.self_referred}</strong> (a reader following the store's links) · a referrer the inferrer does not name <strong>${u.referred}</strong> (somebody linking here).</p>
    <p><small>Referring hosts: ${hosts}.<br>No-user-agent visits by surface: ${surfaces}.</small></p>`;
}

/** Client keys, each a link to its own trail. The count stops being a thing to believe. */
function clientLinks(keys: string[]): string {
  if (keys.length === 0) return "none";
  return keys
    .map((key) => `<a href="/admin/trace?ua=${encodeURIComponent(key)}"><code>${escapeHtml(key)}</code></a>`)
    .join(", ");
}

function handoffHtml(h: Handoff): string {
  const items = h.items_after_check.map((i) => `<code>${escapeHtml(i.item)}</code> ${i.clients}`).join(", ") || "none";
  /**
   * The excluded count is printed beside the included one, never
   * netted out of sight. When infrastructure outnumbers the organic
   * checkers, THAT is the finding, and a page that only showed the
   * survivors would have hidden it.
   */
  const infra = h.infrastructure_checkers > 0
    ? ` Kept out of every number here: <strong>${h.infrastructure_checkers}</strong> infrastructure client(s) that also made an argument-carrying call — the store's own noise floor, excluded because a monitor reading a door is not a customer hesitating at it.`
    : "";
  return `<p><strong>The handoff</strong>, off the same rows, by user-agent (a floor on clients: one SDK string is many agents, and two agents on one string inside the window read as one):
    clients that made an argument-carrying free call <strong>${h.checkers}</strong> · of those, asked a price within ${h.window_minutes} min <strong>${h.then_priced}</strong> · of those, settled within ${h.window_minutes} min <strong>${h.then_settled}</strong>.${infra}</p>
    <p><small>Priced after a check: ${items}.</small></p>
    <p><small>Who they were — each links to its whole trail, so the counts above can be traced instead of believed.
    Checked: ${clientLinks(h.checker_clients)}. Of those, priced: ${clientLinks(h.priced_clients)}.</small></p>
    <p><small><strong>What this exclusion still cannot catch:</strong> channel inference short-circuits on the MCP
    flag before it consults the crawler table, so an infrastructure client arriving through the MCP door is stamped
    <code>mcp</code> and is counted above as organic. Filtering on channel cannot fix that — the classification never
    ran. On the MCP side these are OVER-counts, and stay so until that ordering changes.</small></p>`;
}

function afterSaleHtml(m: InstrumentMonth): string {
  const artifactReads = m.free.filter((r) => r.surface === "artifact:read").reduce((s, r) => s + r.organic, 0);
  const settled = m.settled === null ? "unknown" : String(m.settled);
  const rechecks = m.rechecks === null ? "unknown" : String(m.rechecks);
  return `<p><small><strong>After the sale:</strong> re-checks of issued artifacts at /api/verify ${rechecks} · receipts and artifacts verified through the roster's doors ${m.receipts_verified} · purchased artifacts read back ${artifactReads} · beside settled sales ${settled}. The re-check line is the one that says whether what was bought gets used.</small></p>`;
}

function tillHtml(m: InstrumentMonth): string {
  if (m.declines === null && m.settled === null) return "";
  const declines = m.declines === null ? "unknown" : String(m.declines);
  const settled = m.settled === null ? "unknown" : String(m.settled);
  return `<p><small><strong>At the till:</strong> signed payments refused ${declines} beside settled ${settled}. When refusals outnumber settles, the reasons are the lever: <a href="/admin/declines">the declines desk</a> groups them by client and fault, and <a href="/admin/funnel">the funnel</a> reads whether one wall or a scatter.
    THE TWO READ DIFFERENT THINGS, and on a busy month they disagree: this figure is a monthly COUNTER, while the desk SCANS the newest event rows and stops at its cap. A desk reporting no declines while this line names some has not contradicted it — the refused rows are older than the desk's window, and the desk says so in its own first sentence. The rows keep for ninety days; the way to reach them is a narrower scan, not a longer wait.</small></p>`;
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
    <p><small>The line that matters is argument-carrying uses beside settled sales: a buy_* tool is called at least twice per sale (once for the terms, once with the payment), and most sales arrive over plain HTTP rather than MCP, so paid tool calls are neither a floor nor a ceiling on sales. MCP sessions opened this month: ${m.mcp_handshakes}, against ${m.free_by_channel["mcp"] ?? 0} free tool calls and ${m.paid_tool_calls} paid.</small></p>
    ${tillHtml(m)}
    ${afterSaleHtml(m)}
    ${since}
    <table border="1" cellpadding="4">
      ${HEAD}
      ${rowsHtml(m.free) || "<tr><td colspan=8>none used</td></tr>"}
    </table>
    ${m.unknown ? unknownHtml(m.unknown) : ""}
    ${m.handoff ? handoffHtml(m.handoff) : ""}
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
    sorted into free and paid so the ratio is a line. Counts are porch floors with the porch's caveats; calls
    with arguments can also be automated. An invocation does not establish buyer intent or conversion. Computed ${escapeHtml(usage.computed_at)}.</small></p>
    <p><small><strong>Read the gaps as gaps.</strong> The porch began counting surfaces on ${escapeHtml(usage.porch_counting_since)};
    the interactive doors (preflight, look, before-you-pay, verify-receipt, bot-auth check, the desk page) got their lines
    on ${escapeHtml(usage.doors_logged_since)}; the verifier door's tools on ${escapeHtml(usage.verifier_logged_since)}, the documentation door's on ${escapeHtml(usage.docs_logged_since)}.
    A zero before a row's logged-since date is the counter's absence, not the agents'. "Per day" divides by the days the line existed this month, so a partial month reads beside a whole one.</small></p>
  </section>
  ${usage.months.map(monthHtml).join("")}
  <section><p><small>Roster, by prefix: ${usage.roster
    .map((r) => `<code>${escapeHtml(r.prefix)}</code> <em>${r.kind}</em>`)
    .join(" · ")}.</small></p></section>`;
  return renderAdminShell("instruments", body);
}
