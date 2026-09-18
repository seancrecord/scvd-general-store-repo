import { Hono } from "hono";
import { escapeHtml } from "@/lib/sanitize";
import { jsonLdScript, organizationRef } from "@/lib/jsonld";
import { prefersMarkdown } from "@/lib/accept";
import { jsonDocumentMarkdownResponse } from "@/lib/json-markdown";
import { renderSimplePage, wantsHtml } from "@/pages/simple-page";
import { computeObservatory, type ObservatoryMonth } from "@/services/observatory";
import type { HonoEnv } from "@/types";

/**
 * GET /observatory — the porch's counts, read. JSON at the same URL
 * by Accept. See services/observatory.ts for what it is and is not.
 */
export const observatoryRoutes = new Hono<HonoEnv>();

function monthTable(month: ObservatoryMonth): string {
  if (month.surfaces.length === 0) {
    return `<p class="menu-meta">${escapeHtml(month.month)}: nothing counted${month.truncated ? " (the ledger could not be read)" : ""}.</p>`;
  }
  const rows = month.surfaces
    .map(
      (row) =>
        `<tr><td><code>${escapeHtml(row.surface)}</code></td><td>${row.organic}</td><td>${escapeHtml(
          Object.entries(row.by_channel)
            .map(([channel, count]) => `${channel} ${count}`)
            .join(" · ") || "—",
        )}</td><td>${row.house}</td><td>${row.infrastructure}</td></tr>`,
    )
    .join("\n");
  return `<h2>${escapeHtml(month.month)}</h2>
    <p class="menu-desc">${month.organic_visits} organic visit${month.organic_visits === 1 ? "" : "s"} across ${month.surfaces.length} counted surface${month.surfaces.length === 1 ? "" : "s"}${month.truncated ? " — the ledger hit its key cap this month, so these are floors even more than usual" : ""}.</p>
    <table border="1" cellpadding="6">
      <tr><th>surface</th><th>organic</th><th>by channel</th><th>house</th><th>infrastructure</th></tr>
      ${rows}
    </table>`;
}

/**
 * WHAT GETS READ HERE, AS A DATASET (2026-09-16).
 *
 * This page carried no structured data, so the one surface that says
 * how much of this store is actually read handed an answer engine
 * nothing it could lift. Dataset is the honest type: dated figures,
 * per month, per surface, free and licensed, derived at read from the
 * porch's own counters.
 *
 * WHAT THE NODE DOES NOT CLAIM. `organic_visits` is the house's own
 * count of its own pages, with infrastructure buckets kept out — not
 * an audited figure and not comparable to anybody else's analytics,
 * because the floors and the exclusions are ours. The measurement
 * technique says so rather than leaving a number to be read as more
 * than it is, and the same sentence the page prints in prose is the
 * one the node carries.
 */
function observatoryJsonLd(base: string, observatory: Awaited<ReturnType<typeof computeObservatory>>): string {
  return jsonLdScript({
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: "The observatory — what gets read at this store, counted",
    description: observatory.what_this_is,
    url: `${base}/observatory`,
    license: "https://creativecommons.org/licenses/by/4.0/",
    isAccessibleForFree: true,
    creator: organizationRef(base),
    publisher: organizationRef(base),
    dateModified: observatory.computed_at,
    ...(observatory.months.length > 0
      ? {
          temporalCoverage: `${observatory.months[observatory.months.length - 1]!.month}/${observatory.months[0]!.month}`,
        }
      : {}),
    variableMeasured: [
      "organic visits per month, house and infrastructure buckets excluded",
      "visits per counted surface, per month",
      "whether a month's ledger was truncated by the key cap",
    ],
    measurementTechnique: `${observatory.what_this_is_not} Counted by name only: a surface absent from the counted list is not counted, which is not the same as unvisited. ${observatory.house_flag_policy}`,
    distribution: {
      "@type": "DataDownload",
      encodingFormat: "application/json",
      contentUrl: `${base}/observatory`,
    },
  });
}

observatoryRoutes.get("/observatory", async (c) => {
  const base = c.env.STORE_BASE_URL;
  const observatory = await computeObservatory(c.env);
  if (prefersMarkdown(c.req.header("Accept"), "text/html", c.req.header("User-Agent"))) {
    return jsonDocumentMarkdownResponse({
      base,
      path: "/observatory",
      title: "The observatory",
      description: "What gets read here, counted: every surface the porch counts, per month, organic visits beside the house and infrastructure buckets kept out of them. In name order, never by count.",
      document: observatory as unknown as Record<string, unknown>,
    });
  }
  if (!wantsHtml(c.req.header("Accept"), c.req.header("User-Agent"))) {
    return c.json(observatory);
  }
  return c.html(
    renderSimplePage({
      title: "The observatory",
      description:
        "What gets read here, counted: every surface the porch counts, per month, organic visits beside the house and infrastructure buckets kept out of them. In name order, never by count.",
      path: "/observatory",
      bodyHtml: `${observatoryJsonLd(base, observatory)}<section>
        <p class="menu-desc">${escapeHtml(observatory.what_this_is)}</p>
        <p class="menu-desc"><strong>${escapeHtml(observatory.what_this_is_not)}</strong></p>
      </section>
      <section>
        ${observatory.months.map(monthTable).join("\n")}
      </section>
      <section>
        <p class="menu-meta">${escapeHtml(observatory.floors.note)} Porch writes a minute: ${observatory.floors.porch_writes_per_minute}; ledger key cap: ${observatory.floors.ledger_key_cap}.</p>
        <p class="menu-meta">${escapeHtml(observatory.house_flag_policy)}</p>
        <p class="menu-meta">Counted by name: ${Object.entries(observatory.counted_paths)
          .map(([path, surface]) => `<code>${escapeHtml(path)}</code> → ${escapeHtml(surface)}`)
          .join(" · ")}. A surface absent from this list is not counted, which is not the same as unvisited.</p>
        <p class="menu-meta">Machine-readable at the same URL with <code>Accept: application/json</code>; computed live at ${escapeHtml(observatory.computed_at)} from the counters the admin desk reads. ${escapeHtml(observatory.corrections)} The funnel itself is at <a href="/pulse">${escapeHtml(base)}/pulse</a>.</p>
      </section>`,
    }),
  );
});
