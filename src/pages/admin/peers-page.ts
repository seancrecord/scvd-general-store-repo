import { escapeHtml } from "@/lib/sanitize";
import { renderAdminShell } from "@/pages/admin/layout";
import { OUR_X402_LIST_SLUG, type PeerRow, type PeerShelf } from "@/services/peer-shelf";

/**
 * THE PEERS PAGE (2026-09-11). Weeks as columns, newest first; every
 * service in the category as a row, alphabetical, ours marked. A cell
 * is the directory's measured thirty-day floor for that service that
 * week: volume, settlements, buyers. Nothing here is ranked and the
 * attribution the licence asks for is printed at the foot.
 */

function money(value: number): string {
  return value >= 100 ? value.toFixed(0) : value >= 10 ? value.toFixed(1) : value.toFixed(2);
}

function cell(row: PeerRow | undefined): string {
  if (!row) return "<small>not listed</small>";
  if (!row.traction) return `<small>${escapeHtml(row.traction_status ?? "unmeasured")}</small>`;
  const t = row.traction;
  const trend = t.trend_7d_vs_30d === null ? "" : ` <small>· 7d/30d ${t.trend_7d_vs_30d.toFixed(2)}</small>`;
  const top = t.top_buyer_share_30d === null ? "" : ` <small>· top buyer ${(t.top_buyer_share_30d * 100).toFixed(0)}%</small>`;
  return `$${money(t.volume_usd_30d)} <small>· ${t.tx_count_30d} settled · ${t.unique_buyers_30d} buyers</small>${trend}${top}`;
}

function weekHead(shelves: PeerShelf[]): string {
  return `<tr><th>service</th>${shelves.map((s) => `<th>${escapeHtml(s.week)}${s.truncated ? "<br><small>(capped: floors)</small>" : ""}</th>`).join("")}</tr>`;
}

function rowsHtml(shelves: PeerShelf[]): string {
  const names = new Map<string, string>();
  for (const shelf of shelves) for (const row of shelf.rows) if (!names.has(row.slug)) names.set(row.slug, row.name);
  const slugs = [...names.entries()].sort((a, b) => a[1].localeCompare(b[1]) || a[0].localeCompare(b[0])).map(([slug]) => slug);
  return slugs
    .map((slug) => {
      const ours = slug === OUR_X402_LIST_SLUG;
      const label = ours ? `<strong>${escapeHtml(names.get(slug)!)}</strong> <small>(us)</small>` : escapeHtml(names.get(slug)!);
      const host = shelves.map((s) => s.rows.find((r) => r.slug === slug)?.host).find((h) => h);
      return `<tr><td>${label}${host ? `<br><small><code>${escapeHtml(host)}</code></small>` : ""}</td>${shelves
        .map((s) => `<td>${cell(s.rows.find((r) => r.slug === slug))}</td>`)
        .join("")}</tr>`;
    })
    .join("");
}

function totalsHtml(shelves: PeerShelf[]): string {
  const row = (label: string, pick: (s: PeerShelf) => string) => `<tr><td>${label}</td>${shelves.map((s) => `<td>${pick(s)}</td>`).join("")}</tr>`;
  return `<table border="1" cellpadding="4">
    ${weekHead(shelves)}
    ${row("services in the category", (s) => String(s.totals.services))}
    ${row("<small>&nbsp;&nbsp;with a measured floor</small>", (s) => `<small>${s.totals.measured}</small>`)}
    ${row("category volume, 30d (measured floor)", (s) => `$${money(s.totals.volume_usd_30d)}`)}
    ${row("category settlements, 30d", (s) => String(s.totals.tx_count_30d))}
    ${row("category buyers, 30d, summed across services", (s) => String(s.totals.buyers_30d_summed))}
    ${row("<strong>ours</strong>, 30d", (s) => cell(s.ours ?? undefined))}
    ${row("ours per hundred of the category's volume", (s) => (s.ours_per_hundred?.volume === null || s.ours_per_hundred === null ? "—" : String(s.ours_per_hundred.volume)))}
    ${row("ours per hundred of the category's settlements", (s) => (s.ours_per_hundred?.settlements === null || s.ours_per_hundred === null ? "—" : String(s.ours_per_hundred.settlements)))}
    ${row("arrived this week", (s) => (s.arrived === null ? "<small>first week read</small>" : s.arrived.length === 0 ? "none" : `<small>${s.arrived.map(escapeHtml).join(", ")}</small>`))}
    ${row("departed this week", (s) => (s.departed === null ? "<small>first week read</small>" : s.departed.length === 0 ? "none" : `<small>${s.departed.map(escapeHtml).join(", ")}</small>`))}
  </table>`;
}

export function renderPeersPage(shelves: PeerShelf[]): string {
  const newest = shelves[0];
  const body = newest
    ? `<section>
    <h2>The peers: the ${escapeHtml(newest.category)} shelf on x402-list, by week</h2>
    <p class="menu-desc">Every service the directory shelves beside us, read the same way once a week: its measured thirty-day settlement floor — volume, settlements, distinct buyers — with ours among them. The one instrument here that can see anyone else's share.</p>
    <p><small>${escapeHtml(newest.what_this_is_not)}</small></p>
    <p><small><strong>Their caveat, verbatim:</strong> ${escapeHtml(newest.caveat)}</small></p>
    ${totalsHtml(shelves)}
    <p><small>"Per hundred" is our measured floor over the category's measured floor, both from the same read. Buyers are summed across services and are not distinct across them. "7d/30d" is the directory's own trend figure: above 1 is a quickening week.</small></p>
  </section>
  <section>
    <h3>Every service, alphabetical</h3>
    <table border="1" cellpadding="4">
      ${weekHead(shelves)}
      ${rowsHtml(shelves)}
    </table>
    <p><small>${escapeHtml(newest.source.attribution)} · <a href="${escapeHtml(newest.source.url)}">${escapeHtml(newest.source.url)}</a> · read ${escapeHtml(newest.read_at)} · the same as JSON: <a href="/admin/peers.json">/admin/peers.json</a>.</small></p>
  </section>`
    : `<section>
    <h2>The peers</h2>
    <p class="menu-desc">No week has been read yet. The hourly press takes the first reading on its next firing and one each ISO week after. If this line is still here an hour after deploy, the directory read is failing and the press has been alerting.</p>
  </section>`;
  return renderAdminShell("peers", body);
}
