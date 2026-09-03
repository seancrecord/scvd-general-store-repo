import { Hono } from "hono";
import { escapeHtml } from "@/lib/sanitize";
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

observatoryRoutes.get("/observatory", async (c) => {
  const observatory = await computeObservatory(c.env);
  if (!wantsHtml(c.req.header("Accept"))) {
    return c.json(observatory);
  }
  const base = c.env.STORE_BASE_URL;
  return c.html(
    renderSimplePage({
      title: "The observatory",
      description:
        "What gets read here, counted: every surface the porch counts, per month, organic visits beside the house and infrastructure buckets kept out of them. In name order, never by count.",
      path: "/observatory",
      bodyHtml: `<section>
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
