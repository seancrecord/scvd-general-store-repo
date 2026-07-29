import { Hono } from "hono";
import { escapeHtml } from "@/lib/sanitize";
import { renderSimplePage, wantsHtml } from "@/pages/simple-page";
import {
  CORRECTIONS,
  CORRECTIONS_INVITATION,
  CORRECTIONS_MECHANISM,
  CORRECTIONS_SCOPE,
  CORRECTIONS_STANDFIRST,
} from "@/store/corrections";
import type { HonoEnv } from "@/types";

/**
 * GET /corrections — the public corrections record.
 *
 * Mechanism above the list, per CV: five entries inside one week read
 * as instability unless the thing that goes first is how they get
 * caught. Words live in src/store/corrections.ts.
 */
export const correctionsRoutes = new Hono<HonoEnv>();

correctionsRoutes.get("/corrections", (c) => {
  const base = c.env.STORE_BASE_URL;
  const newestFirst = [...CORRECTIONS].sort((a, b) =>
    b.date.localeCompare(a.date),
  );

  if (wantsHtml(c.req.header("Accept"))) {
    const rows = newestFirst
      .map(
        (entry) => `<div class="menu-item">
        <div class="menu-line">
          <span class="menu-name">${escapeHtml(entry.date)}</span>
        </div>
        <p class="menu-desc"><strong>What was wrong:</strong> ${escapeHtml(entry.what_was_wrong)}</p>
        <p class="menu-desc"><strong>How long:</strong> ${escapeHtml(entry.how_long)}</p>
        <p class="menu-desc"><strong>Found by:</strong> ${escapeHtml(entry.found_by)}</p>
        <p class="menu-desc"><strong>What changed:</strong> ${escapeHtml(entry.what_changed)}</p>
      </div>`,
      )
      .join("\n");

    return c.html(
      renderSimplePage({
        title: "Corrections",
        bodyHtml: `<section>
          <p class="menu-desc">${escapeHtml(CORRECTIONS_STANDFIRST)}</p>
          <p class="menu-desc"><strong>${escapeHtml(CORRECTIONS_MECHANISM)}</strong></p>
        </section>
        <section>${rows}</section>
        <section>
          <p class="menu-desc">${escapeHtml(CORRECTIONS_SCOPE)}</p>
          <p class="menu-meta">${escapeHtml(CORRECTIONS_INVITATION)}</p>
        </section>`,
      }),
    );
  }

  return c.json({
    title: "Corrections",
    summary: CORRECTIONS_STANDFIRST,
    how_things_get_caught: CORRECTIONS_MECHANISM,
    scope: CORRECTIONS_SCOPE,
    corrections: newestFirst.map((entry) => ({ ...entry })),
    count: newestFirst.length,
    corrections_url: `${base}/corrections`,
    mailbox: `${base}/api/letter`,
    invitation: CORRECTIONS_INVITATION,
  });
});
