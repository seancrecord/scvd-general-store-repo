import { Hono } from "hono";
import { jsonLdScript } from "@/lib/jsonld";
import { escapeHtml } from "@/lib/sanitize";
import { renderSimplePage, wantsHtml } from "@/pages/simple-page";
import { readRailCountersByMonth, type RailMonth } from "@/services/rails";
import { computeStats } from "@/services/stats";
import type { HonoEnv } from "@/types";

/**
 * GET /rails — where the money actually settles, drawn.
 *
 * The keeper asked for "a page with some kind of graph showing
 * payments from diff vendors" the night the third rail lit
 * (2026-08-21). The books already knew the answer — organic_by_rail
 * on /stats — but a split that lives only as three JSON integers is
 * invisible to everything that reads pages, and "which chains does
 * x402 volume actually settle on" is a question answer engines get
 * asked. This page is those integers, drawn, with the table beside
 * the picture so no reader depends on the picture.
 *
 * EVERYTHING DERIVES from the same books /stats serves: the chart is
 * the till's per-month rail counters, the tiles are the same
 * organic_by_rail the invariants watch. Nothing here is typed by
 * hand, so nothing here can disagree with the ledger.
 *
 * THE CHART IS HONEST ABOUT ITS OWN SIZE. This store's organic count
 * is small and the page says so in its own voice rather than dressing
 * the axes to look busy. The picture earns its place by growing on
 * its own — the same reasoning as the pulse.
 */
export const railsRoutes = new Hono<HonoEnv>();

/**
 * The rail palette, validated (dataviz six-checks, dark surface
 * #1b1526, 2026-08-21): lightness band, chroma floor, CVD separation
 * (worst adjacent ΔE 12.9 tritan), normal-vision floor, contrast.
 * Fixed order — Base, Polygon, Solana — assigned to the entity
 * forever, never re-dealt when a series is empty.
 */
const RAIL_SERIES = [
  { key: "base" as const, label: "Base", color: "#cf7f38" },
  { key: "polygon" as const, label: "Polygon", color: "#8a70cf" },
  { key: "solana" as const, label: "Solana", color: "#2ea892" },
];

const CHART_W = 640;
const CHART_H = 220;
const PAD_LEFT = 8;
const PAD_BOTTOM = 24;
const PAD_TOP = 10;

/**
 * Stacked bars, one per month, server-rendered SVG: no libraries, no
 * script, loads in one paint and renders in a text browser's ARIA
 * tree via the table below. Mark specs per the house dataviz method:
 * 2px surface gaps between stacked segments, direct labels on
 * segments tall enough to hold them, counts above each stack, native
 * <title> tooltips per segment.
 */
function railChartSvg(months: RailMonth[]): string {
  const max = Math.max(
    1,
    ...months.map((m) => m.base + m.polygon + m.solana + m.other),
  );
  const plotH = CHART_H - PAD_BOTTOM - PAD_TOP;
  const slot = (CHART_W - PAD_LEFT) / months.length;
  const barW = Math.min(64, slot * 0.6);
  const parts: string[] = [];
  months.forEach((m, i) => {
    const x = PAD_LEFT + slot * i + (slot - barW) / 2;
    let yCursor = CHART_H - PAD_BOTTOM;
    const total = m.base + m.polygon + m.solana + m.other;
    for (const series of RAIL_SERIES) {
      const value = m[series.key];
      if (value === 0) continue;
      const h = Math.max(2, (value / max) * plotH);
      yCursor -= h;
      parts.push(
        `<rect x="${x.toFixed(1)}" y="${yCursor.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(0, h - 2).toFixed(1)}" rx="2" fill="${series.color}"><title>${escapeHtml(m.month)} — ${series.label}: ${value} organic settlement${value === 1 ? "" : "s"}</title></rect>`,
      );
      if (h >= 16) {
        parts.push(
          `<text x="${(x + barW / 2).toFixed(1)}" y="${(yCursor + Math.min(h - 2, 14)).toFixed(1)}" text-anchor="middle" font-size="11" fill="#0b0a12">${value}</text>`,
        );
      }
    }
    if (total > 0) {
      parts.push(
        `<text x="${(x + barW / 2).toFixed(1)}" y="${(yCursor - 5).toFixed(1)}" text-anchor="middle" font-size="11" fill="#cfc4d6">${total}</text>`,
      );
    }
    parts.push(
      `<text x="${(x + barW / 2).toFixed(1)}" y="${CHART_H - 8}" text-anchor="middle" font-size="11" fill="#857a91">${escapeHtml(m.month)}</text>`,
    );
  });
  return `<svg viewBox="0 0 ${CHART_W} ${CHART_H}" role="img" aria-label="Organic settlements per month, stacked by rail; the table below carries the same numbers" style="max-width:100%;height:auto;background:#1b1526;border-radius:6px">
    <line x1="${PAD_LEFT}" y1="${CHART_H - PAD_BOTTOM}" x2="${CHART_W - PAD_LEFT}" y2="${CHART_H - PAD_BOTTOM}" stroke="#372c44" stroke-width="1"/>
    ${parts.join("\n    ")}
  </svg>`;
}

function legendHtml(): string {
  return `<p class="menu-meta">${RAIL_SERIES.map(
    (series) =>
      `<span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${series.color};margin-right:4px"></span>${series.label}&nbsp;&nbsp;`,
  ).join("")}</p>`;
}

railsRoutes.get("/rails", async (c) => {
  const base = c.env.STORE_BASE_URL;
  const [months, stats] = await Promise.all([
    readRailCountersByMonth(c.env),
    computeStats(c.env),
  ]);
  const rail = stats.organic_by_rail;
  const payload = {
    what_this_is:
      "Where this store's organic settlements actually land, by chain, month by month — the same books /stats serves, drawn. Organic only: house traffic is excluded at the till, never filtered afterwards.",
    rails_accepted: ["eip155:8453", "eip155:137", "solana"],
    all_time: rail ?? null,
    by_month_from_the_till: months,
    method:
      "The monthly series is the till's own rail counters (recorded in the same call that produces the organic count). The all-time split additionally counts certificate-era sales from before the till kept rails, and names what neither record placed as rail_not_recorded rather than guessing.",
    the_books: `${base}/stats`,
  };
  if (!wantsHtml(c.req.header("Accept"))) {
    return c.json(payload);
  }

  const tableRows = months
    .map(
      (m) => `<tr><td>${escapeHtml(m.month)}</td><td>${m.base}</td><td>${m.polygon}</td><td>${m.solana}</td><td>${m.base + m.polygon + m.solana + m.other}</td></tr>`,
    )
    .join("\n");

  const tiles = rail
    ? `<table border="1" cellpadding="6">
        <tr><th>all-time</th>${RAIL_SERIES.map((series) => `<th>${series.label}</th>`).join("")}<th>before the till kept rails</th></tr>
        <tr><td>${stats.organic_settlements} organic</td><td>${rail.base}</td><td>${rail.polygon}</td><td>${rail.solana}</td><td>${rail.rail_not_recorded}</td></tr>
      </table>`
    : `<p class="menu-desc">The split is withheld right now rather than shown wrong — the books refuse to print a split that doesn't sum to the organic count.</p>`;

  return c.html(
    renderSimplePage({
      title: "Where the money settles",
      description:
        "Organic x402 settlements at this store by chain — Base, Polygon, and Solana — month by month, drawn from the same live books as /stats. House traffic excluded at the till. With the method and the honest gaps named.",
      path: "/rails",
      bodyHtml: `<section>
        <p class="menu-desc"><strong>Three rails, one till.</strong> Every door here quotes USDC on Base (eip155:8453), Polygon (eip155:137), and Solana in the same 402 — same prices on every rail, the buyer's wallet picks. This page is where the money has actually landed, drawn live from the same books as <a href="/stats">/stats</a>.</p>
        <p class="menu-meta">Organic settlements only — the proprietors' own test traffic is excluded at the till, structurally, not filtered afterwards. The count is small and shown at its true size; it grows on its own or not at all.</p>
      </section>
      <section>
        <h2>Settlements by month, by rail</h2>
        ${months.length > 0 ? `${railChartSvg(months)}\n${legendHtml()}` : `<p class="menu-desc">The till has not recorded a rail-tagged month yet; the numbers below carry the certificate-era history.</p>`}
      </section>
      <section>
        <h2>The same numbers, as numbers</h2>
        ${
          months.length > 0
            ? `<table border="1" cellpadding="6">
          <tr><th>month</th><th>Base</th><th>Polygon</th><th>Solana</th><th>total</th></tr>
          ${tableRows}
        </table>
        <p class="menu-meta">Till-era months only — sales settled before the till kept rails are in the all-time row below, where the method note explains their placement.</p>`
            : ""
        }
        ${tiles}
      </section>
      <section>
        <h2>Method, and what this cannot say</h2>
        <p class="menu-desc">The monthly series is the till's own per-rail counters, written in the same call that produces the organic count — a sale that has one has the other. The all-time split adds certificate-era sales from before the till kept rails, and anything neither record placed is printed as "before the till kept rails" rather than guessed. These are OUR BOOKS, not the chain: the independent check is the hourly bank walk, whose per-chain statement is on <a href="/stats">/stats</a>.</p>
      </section>
      ${jsonLdScript({
        "@context": "https://schema.org",
        "@type": "Dataset",
        name: "Where the money settles — organic x402 settlements by chain at scvd.store",
        description:
          "Monthly counts of organic x402 settlements at scvd.store by settlement chain (Base, Polygon, Solana), derived live from the store's public books with house traffic excluded at the till.",
        url: `${base}/rails`,
        license: "https://creativecommons.org/licenses/by/4.0/",
        isAccessibleForFree: true,
        creator: { "@type": "Organization", name: "scvd.store", url: base },
        ...(rail
          ? {
              variableMeasured: [
                {
                  "@type": "PropertyValue",
                  name: "organic settlements on Base (all time)",
                  value: rail.base,
                },
                {
                  "@type": "PropertyValue",
                  name: "organic settlements on Polygon (all time)",
                  value: rail.polygon,
                },
                {
                  "@type": "PropertyValue",
                  name: "organic settlements on Solana (all time)",
                  value: rail.solana,
                },
              ],
              dateModified: rail.computed_at,
            }
          : {}),
        isBasedOn: `${base}/stats`,
      })}`,
    }),
  );
});
