import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import { paymentGate } from "@/lib/payment-gate";
import { PENNY_PAGE_USDC } from "@/lib/payments";
import { escapeHtml } from "@/lib/sanitize";
import { renderSimplePage, wantsHtml } from "@/pages/simple-page";
import { getEdition, listEditions } from "@/services/town-paper";
import type { HonoEnv, TownEdition } from "@/types";

/**
 * The Town Gazette rack. GET /paper — free index of editions.
 * GET /paper/edition-:n — one edition, a penny over x402, markdown.
 * Editions are assembled from the store's own logged facts and pass
 * the keeper's pen before printing; no visitor text ships unreviewed.
 */
export const paperRoutes = new Hono<HonoEnv>();

function editionIndexEntry(
  edition: TownEdition,
  base: string,
): Record<string, unknown> {
  return {
    edition_number: edition.edition_number,
    week: edition.week,
    date: edition.date,
    price_usdc: PENNY_PAGE_USDC,
    url: `${base}/paper/edition-${edition.edition_number}`,
  };
}

paperRoutes.get("/paper", async (c) => {
  const base = c.env.STORE_BASE_URL;
  const editions = await listEditions(c.env);
  if (wantsHtml(c.req.header("Accept"))) {
    const editionsHtml =
      editions.length > 0
        ? editions
            .map(
              (edition) => `<div class="menu-item">
          <div class="menu-line">
            <span class="menu-name">Edition No. ${edition.edition_number}</span>
            <span class="menu-dots"></span>
            <span class="menu-price">$${PENNY_PAGE_USDC}</span>
          </div>
          <p class="menu-meta">${escapeHtml(edition.date.slice(0, 10))} \u2022 <code>/paper/edition-${edition.edition_number}</code></p>
        </div>`,
            )
            .join("\n")
        : `<p class="empty">No editions yet. The paper prints when a week earns it.</p>`;
    return c.html(
      renderSimplePage({
        title: "The Town Gazette of Smokewire Crossing",
        bodyHtml: `<section>
          <p class="menu-desc">The town's paper of record: the bell, the ledger, the new faces, what was asked for and not stocked, the guestbook, the counter notes, the shelf changes, and the corrections. Assembled from the store's own books, read by the keeper before printing, a penny a copy.</p>
          ${editionsHtml}
        </section>`,
      }),
    );
  }
  return c.json({
    paper:
      "The Town Gazette of Smokewire Crossing — the store's paper of record, assembled from its own logged facts, keeper-read before printing. A penny a copy.",
    price_usdc: PENNY_PAGE_USDC,
    editions: editions.map((edition) => editionIndexEntry(edition, base)),
  });
});

/** Edition paths carry the edition- prefix; bare numbers were never sold. */
function editionNumberFromPath(path: string): number {
  const raw = path.replace(/^\/paper\/edition-/, "");
  return /^[0-9]+$/.test(raw) ? parseInt(raw, 10) : Number.NaN;
}

/** Unknown editions bounce before the gate. */
const editionCheck: MiddlewareHandler<HonoEnv> = async (c, next) => {
  const editionNumber = editionNumberFromPath(c.req.path);
  const edition = Number.isNaN(editionNumber)
    ? null
    : await getEdition(c.env, editionNumber);
  if (!edition) {
    return c.json(
      {
        error: "No edition by that number off the press. The index is free.",
        index_url: `${c.env.STORE_BASE_URL}/paper`,
      },
      404,
    );
  }
  await next();
};

/** Paid copies never sit in a shared cache. */
const noStore: MiddlewareHandler<HonoEnv> = async (c, next) => {
  await next();
  c.res.headers.set("Cache-Control", "no-store");
  c.res.headers.set("Vary", "PAYMENT-SIGNATURE");
};

const EDITION_PATTERN = "/paper/:edition{edition-[0-9]+}";

paperRoutes.use(EDITION_PATTERN, noStore);
paperRoutes.use(EDITION_PATTERN, editionCheck);
paperRoutes.use(EDITION_PATTERN, paymentGate);

paperRoutes.get(EDITION_PATTERN, async (c) => {
  if (!c.get("payment")) {
    // The gate never lets an unpaid request through; belt-and-braces.
    return c.json({ error: "The till hasn't heard from you yet." }, 402);
  }
  const edition = (await getEdition(
    c.env,
    editionNumberFromPath(c.req.path),
  )) as TownEdition;
  return c.text(edition.markdown, 200, {
    "Content-Type": "text/markdown; charset=utf-8",
  });
});
