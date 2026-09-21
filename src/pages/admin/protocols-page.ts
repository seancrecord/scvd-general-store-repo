import { escapeHtml } from "@/lib/sanitize";
import { renderAdminShell } from "@/pages/admin/layout";
import { MPP_CENSUS_NOTE } from "@/services/mpp-census";
import { DOOR_SEAM_DATE, type ProtocolReading } from "@/services/protocol-reading";

/**
 * WHAT WE SPEAK, AND WHO USED IT.
 *
 * Four questions in the order a keeper asks them — who arrived, who
 * paid, how they paid, what the market speaks — and a fifth section
 * that is only the blindness, because this page is assembled from four
 * instruments with four different denominators and pretending
 * otherwise would be the whole defect it was built to fix.
 *
 * THE SECTIONS ARE NOT ADDED TOGETHER, and the page says so rather
 * than trusting a reader not to. Arrivals are calls; settles are
 * sales; rails are how a sale paid. One purchase appears on more than
 * one of them, on purpose.
 */

function table(head: string[], rows: string[][], empty: string): string {
  if (rows.length === 0) return `<p class="empty">${escapeHtml(empty)}</p>`;
  return `<table border="1" cellpadding="4">
    <thead><tr>${head.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead>
    <tbody>${rows
      .map((row) => `<tr>${row.map((cell, i) => (i === 0 ? `<th scope="row">${cell}</th>` : `<td>${cell}</td>`)).join("")}</tr>`)
      .join("")}</tbody>
  </table>`;
}

/** Every rate printed as the fraction it came from (the disclosure page's rule). */
function share(n: number, of: number): string {
  if (of === 0) return `${n} of 0`;
  return `${n} of ${of} (${Math.round((n / of) * 100)}%)`;
}

const DOOR_WORDS: Record<string, string> = {
  http: "HTTP — a buy_url paid with a payment header",
  mcp: "MCP — the buy_* tools over JSON-RPC",
  ucp: "UCP — the checkout: create, then complete",
};

export function renderProtocolsPage(data: ProtocolReading): string {
  const arrivals = table(
    ["channel", "organic calls", "share of arrivals"],
    data.arrivals.map((row) => [
      `<code>${escapeHtml(row.channel)}</code>`,
      String(row.organic),
      share(row.organic, data.arrivals_total),
    ]),
    "No organic arrivals recorded this month.",
  );

  const till = table(
    ["door", "organic settles", "by network"],
    data.till.map((row) => [
      `<code>${escapeHtml(row.door)}</code><br><small>${escapeHtml(DOOR_WORDS[row.door] ?? row.door)}</small>`,
      row.settles === 0 ? "<small>none</small>" : String(row.settles),
      Object.entries(row.networks)
        .sort((a, b) => b[1] - a[1])
        .map(([network, n]) => `${escapeHtml(network)} ×${n}`)
        .join(" · ") || "<small>—</small>",
    ]),
    "No settles observed at any door this month.",
  );

  const rails = data.operations
    ? table(
        ["rail", "2xx", "3xx", "4xx", "5xx", "threw"],
        data.operations.rows.map((row) => [
          `<code>${escapeHtml(row.protocol)}</code>${row.observed ? "" : "<br><small>counter never written</small>"}`,
          ...(row.observed
            ? [row.success, row.redirect, row.client_error, row.server_error, row.threw].map(String)
            : ["—", "—", "—", "—", "—"]),
        ]),
        "No payment requests observed this month.",
      )
    : '<p class="empty">The payment gate\'s counters did not load.</p>';

  const census = data.market?.census;
  const market = census
    ? table(
        ["reading", "doors", "of those measured"],
        [
          ["speaks x402 only", String(census.x402_only), share(census.x402_only, census.measured)],
          ["speaks MPP only", String(census.mpp_only), share(census.mpp_only, census.measured)],
          ["speaks both", String(census.both), share(census.both, census.measured)],
          ["speaks neither we could read", String(census.neither), share(census.neither, census.measured)],
          ["<em>not measured</em>", String(census.unmeasured + census.unreachable + census.not_probed), `<small>${census.unmeasured} unmeasured · ${census.unreachable} unreachable · ${census.not_probed} not probed</small>`],
        ],
        "No ward round on the books yet.",
      )
    : '<p class="empty">No ward round on the books yet — the market column starts with the first one.</p>';

  const surfaces = `<dl class="surfaces">${data.surfaces
    .map(({ surface, note }) => `<dt><code>${escapeHtml(surface)}</code></dt><dd>${escapeHtml(note)}</dd>`)
    .join("")}</dl>`;

  const unreadable =
    data.unreadable.length === 0
      ? ""
      : `<p class="shelf-trouble"><strong>Did not load, and is therefore not a zero:</strong> ${data.unreadable
          .map((line) => escapeHtml(line))
          .join(", ")}.</p>`;

  const body = `
  ${unreadable}

  <section>
    <h2>Who arrived, by channel</h2>
    <p><small>Organic porch calls this month, summed across every surface, by the channel the porch inferred.
    Channel is not door: <code>ucp</code>, <code>a2a</code>, <code>mcp</code> and <code>webmcp</code> name one,
    while <code>direct</code>, <code>bazaar</code> and <code>skill</code> say where a plain HTTP caller came from.
    Calls, not callers: no cookie, no account, no unique heads.${data.arrivals_truncated ? " The row scan hit its cap, so these are floors." : ""}</small></p>
    ${arrivals}
  </section>

  <section>
    <h2>Who paid, by door</h2>
    <p><small>Organic settles the till observed, house skipped. A door showing none is a door that took no money this month —
    not a door that is missing from the instrument. Settles recorded before ${escapeHtml(DOOR_SEAM_DATE)} were written with
    the door already collapsed to <code>http</code>, so earlier UCP sales sit inside the HTTP count and cannot be taken back out.</small></p>
    ${till}
    <p><small>Total across doors: ${data.till_total}.</small></p>
  </section>

  <section>
    <h2>How they paid, by rail</h2>
    <p><small>Credential-bearing requests at the HTTP payment gate, house traffic and retries included. A 2xx is not a new sale.
    <em>mixed</em> means both rails were declared on one request. Free quotes, MCP and WebMCP calls are outside this instrument.
    A dash is a counter that was never written, which is not the same fact as a zero.</small></p>
    ${rails}
  </section>

  <section>
    <h2>What the market speaks</h2>
    <p><small>Off the last ward round${data.market ? ` (<code>${escapeHtml(data.market.week)}</code>)` : ""}, one unpaid GET per host.
    Alphabetical counts and denominators, never a ranking, and never published per host.</small></p>
    ${market}
    <p><small>${escapeHtml(MPP_CENSUS_NOTE)}</small></p>
  </section>

  <section>
    <h2>The six surfaces, as a buyer is asked about them</h2>
    <p><small>The closed list the field study asks a paid buyer to declare, kept here so this page and that study
    count the same six things. Four of them are indistinguishable once a request arrives, which is why the
    table above has three doors and this list has six.</small></p>
    ${surfaces}
  </section>

  <section>
    <h2>What this cannot see</h2>
    <ul>${data.notes.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>
    <p><strong>Do not add these sections together.</strong> They are counts along different
    dimensions of the same traffic: an arrival is a call, a settle is a sale, a rail is how one
    sale paid. One purchase is a row in more than one of them, on purpose. The same discipline
    the public <a href="/rails">/rails</a> page prints.</p>
  </section>`;

  return renderAdminShell("protocols", body, data.unreadable, {
    at: data.read_at,
    window: data.month,
  });
}
