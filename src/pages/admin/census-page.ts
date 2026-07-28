import type { CensusClient, CensusResult } from "@/lib/census";
import { CENSUS_WALK_RULE } from "@/lib/census";
import { escapeHtml } from "@/lib/sanitize";
import { renderAdminShell } from "@/pages/admin/layout";

/**
 * THE CENSUS, on its own page for the same reason the recount is: the
 * row scan is expensive and the desk shouldn't pay for it.
 *
 * Two readings. The census line is the one number that will move first
 * when anything real changes — clients that ever opened a wallet at our
 * door, against clients that only ever read the price. The walk
 * detector is the correction to it: a client that touched most of the
 * catalog inside a minute was indexing, not shopping, and belongs out
 * of the organic column whatever its user-agent claims.
 */

export interface CensusPageData {
  census: CensusResult;
  /** Catalog size, so a walk's width can be read as a fraction. */
  catalog_size: number;
}

function clientRow(client: CensusClient, catalogSize: number): string {
  const width =
    client.widest_walk > 0
      ? `${client.widest_walk}${catalogSize > 0 ? ` of ${catalogSize}` : ""}`
      : "—";
  return `<tr>
    <td>${escapeHtml(client.user_agent)}</td>
    <td>${client.challenges}</td>
    <td>${client.distinct_items}</td>
    <td>${width}</td>
    <td>${escapeHtml(client.channel)}</td>
    <td>${escapeHtml(client.first_seen.slice(0, 16))} → ${escapeHtml(client.last_seen.slice(0, 16))}</td>
  </tr>`;
}

function clientTable(
  clients: CensusClient[],
  catalogSize: number,
  empty: string,
): string {
  if (clients.length === 0) {
    return `<p>${empty}</p>`;
  }
  return `<table>
    <tr><th>user agent</th><th>402s</th><th>items</th><th>widest walk</th><th>today's channel</th><th>window</th></tr>
    ${clients.map((client) => clientRow(client, catalogSize)).join("\n")}
  </table>`;
}

export function renderCensusPage(data: CensusPageData): string {
  const c = data.census;
  const presented = c.presented_signature;

  const censusVerdict =
    presented.length === 0
      ? `<p><strong>Zero.</strong> In this window, not one client outside the house
      has ever presented a payment signature — no settles and no declines, which
      means no wallet was opened and turned away either. Every single one read the
      price and left. That is not a conversion problem yet; it is the shape of a
      street with no traffic on it, and this is the number that moves first when
      that changes.</p>`
      : `<p><strong>${presented.length}</strong> client${presented.length === 1 ? "" : "s"}
      outside the house have presented a payment signature at our door.
      ${presented.filter((client) => client.settles > 0).length} of them settled;
      the rest were turned away. <a href="/admin/declines">The decline desk</a> has the
      reasons, verbatim, and a reading of whose problem each one is.</p>`;

  const presentedTable =
    presented.length === 0
      ? ""
      : `<table>
      <tr><th>user agent</th><th>settles</th><th>declines</th><th>402s</th><th>first seen</th></tr>
      ${presented
        .map(
          (client) => `<tr>
        <td>${escapeHtml(client.user_agent)}</td>
        <td>${client.settles}</td>
        <td>${client.declines}</td>
        <td>${client.challenges}</td>
        <td>${escapeHtml(client.first_seen.slice(0, 16))}</td>
      </tr>`,
        )
        .join("\n")}
    </table>`;

  const body = `
  <section>
    <h2>The census</h2>
    <p><strong>${c.rows_scanned}</strong> rows read${c.capped ? " (scan hit its cap — older rows exist beyond this window)" : " (all rows in the log)"}.
    Window: ${escapeHtml(c.oldest_row ?? "—")} → ${escapeHtml(c.newest_row ?? "—")}.</p>
    <p>We keep no cookies and no IPs, so a <em>client</em> here is a distinct
    user-agent string. Two agents behind one default SDK string count once; one
    agent that rotates its string counts many times. Read this as a shape, not a
    headcount. The settle column is the only exact one, because it has an outside
    witness on chain.</p>
    <table>
      <tr><th>distinct clients at a priced door</th><td>${c.clients_total}</td></tr>
      <tr><th>…outside the house</th><td>${c.clients_outside}</td></tr>
      <tr><th>ever presented a payment signature</th><td>${presented.length}</td></tr>
      <tr><th>only ever saw the 402 and left</th><td>${c.looked_and_left}</td></tr>
      <tr><th>…and today's table doesn't call them machinery</th><td>${c.looked_and_left_organic}</td></tr>
    </table>
    ${censusVerdict}
    ${presentedTable}
  </section>

  <section>
    <h2>The walk detector</h2>
    <p>The crawler table reads a user-agent and believes it, so it only catches
    machines that admit what they are. This catches the rest by behaviour: any
    client touching <strong>${CENSUS_WALK_RULE.min_items} or more distinct items
    inside ${Math.round(CENSUS_WALK_RULE.window_ms / 1000)} seconds</strong> was
    walking the catalog, not shopping it. Nobody deciding whether to spend half a
    cent reads eight price tags in a minute.</p>
    <p><small><strong>Since 2026-07-28 this list no longer sees admitted crawlers.</strong>
    A client the table already calls machinery writes a counter but not a row, to keep
    the store under a KV write ceiling where writes fail silently. The list below —
    walkers still counted as organic — is untouched, because those rows are
    organic-labelled by definition, and it is the only one of the two that asks for
    work.</small></p>
    ${clientTable(c.walkers, data.catalog_size, "Nothing walked the catalog in this window.")}
  </section>

  <section>
    <h2>Walkers still counted as organic</h2>
    <p>This is the list worth acting on: clients whose behaviour is a catalog walk
    that today's table still counts in the organic column. Each one is either a new
    line for the crawler table in <code>channel.ts</code> or a genuine buyer with
    unusual reading habits — and the difference is decidable by looking, which is
    the point of naming them.</p>
    ${clientTable(
      c.undeclared_walkers,
      data.catalog_size,
      "None. Everything that walked, today's table already calls machinery.",
    )}
  </section>`;

  return renderAdminShell("census", body);
}
