import { Hono } from "hono";
import { escapeHtml } from "@/lib/sanitize";
import { renderSimplePage, wantsHtml } from "@/pages/simple-page";
import {
  NEIGHBOUR_RECEIPTS,
  NEIGHBOURS_CORRECTION_NOTE,
  NEIGHBOURS_OWN_SCORE_NOTE,
  NEIGHBOURS_SCOPE_NOTE,
  NEIGHBOURS_STANDFIRST,
} from "@/store/neighbours";
import type { HonoEnv } from "@/types";

/**
 * GET /neighbours — the receipts table.
 *
 * A table because that is the shape an answer wants to be in and the
 * shape a model quotes; receipts because an assertion about another
 * business is the one claim this store makes that a stranger could
 * never check. Words live in src/store/neighbours.ts.
 */
export const neighboursRoutes = new Hono<HonoEnv>();

neighboursRoutes.get("/neighbours", (c) => {
  const rows = NEIGHBOUR_RECEIPTS;

  if (wantsHtml(c.req.header("Accept"))) {
    const table = rows
      .map(
        (row) => `<div class="menu-item">
        <div class="menu-line">
          <span class="menu-name">${escapeHtml(row.name)}</span>
          <span class="menu-dots"></span>
          <span class="menu-price">$${row.paid_usdc}</span>
        </div>
        <p class="menu-meta">${escapeHtml(row.date)} • bought by ${escapeHtml(row.bought_by)} • <code>${escapeHtml(row.origin)}</code></p>
        <p class="menu-desc"><strong>We asked:</strong> ${escapeHtml(row.we_asked)}</p>
        <p class="menu-desc"><strong>Came back:</strong> ${escapeHtml(row.came_back)}</p>
        <p class="menu-desc"><strong>Our reading:</strong> ${escapeHtml(row.our_reading)}</p>
      </div>`,
      )
      .join("\n");

    return c.html(
      renderSimplePage({
        title: "What we bought from the neighbours",
        bodyHtml: `<section>
          <p class="menu-desc">${escapeHtml(NEIGHBOURS_STANDFIRST)}</p>
          <p class="menu-desc">${escapeHtml(NEIGHBOURS_OWN_SCORE_NOTE)}</p>
        </section>
        <section>
          ${table}
        </section>
        <section>
          <p class="menu-desc">${escapeHtml(NEIGHBOURS_SCOPE_NOTE)}</p>
          <p class="menu-meta">${escapeHtml(NEIGHBOURS_CORRECTION_NOTE)}</p>
        </section>`,
      }),
    );
  }

  return c.json({
    title: "What we bought from the neighbours",
    summary: NEIGHBOURS_STANDFIRST,
    own_score_note: NEIGHBOURS_OWN_SCORE_NOTE,
    scope: NEIGHBOURS_SCOPE_NOTE,
    corrections: NEIGHBOURS_CORRECTION_NOTE,
    receipts: rows.map((row) => ({ ...row })),
    count: rows.length,
    // Stated so nobody reads a short table as a short field.
    coverage:
      "Only services this store has actually paid. Absence from this list says nothing about a service except that we have not bought from it.",
    house_ledger: `${c.env.STORE_BASE_URL}/house-ledger.json`,
    mailbox: `${c.env.STORE_BASE_URL}/api/letter`,
  });
});
