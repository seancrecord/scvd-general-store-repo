import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import { paymentGate } from "@/lib/payment-gate";
import { PENNY_PAGE_USDC } from "@/lib/payments";
import { escapeHtml } from "@/lib/sanitize";
import { renderSimplePage, wantsHtml } from "@/pages/simple-page";
import { ALMANAC_ENTRIES, getAlmanacEntry } from "@/store/almanac";
import type { AlmanacEntry, HonoEnv } from "@/types";

/**
 * The Keeper's Almanac: a serialized journal, newest first.
 * GET /almanac, free index. GET /almanac/:slug, the page itself,
 * x402-gated at a penny, delivered as markdown.
 */
export const almanacRoutes = new Hono<HonoEnv>();

/** Unknown pages are turned away before the payment gate. */
const pageCheck: MiddlewareHandler<HonoEnv> = async (c, next) => {
  const slug = c.req.path.replace(/^\/almanac\//, "");
  if (!getAlmanacEntry(slug)) {
    return c.json(
      {
        error:
          "No page by that name in the journal. The index is free, have a look.",
        index_url: `${c.env.STORE_BASE_URL}/almanac`,
      },
      404,
    );
  }
  await next();
};

function indexEntry(entry: AlmanacEntry, base: string): Record<string, unknown> {
  return {
    slug: entry.slug,
    title: entry.title,
    date: entry.date,
    teaser: entry.teaser,
    price_usdc: PENNY_PAGE_USDC,
    url: `${base}/almanac/${entry.slug}`,
  };
}

almanacRoutes.get("/almanac", (c) => {
  const base = c.env.STORE_BASE_URL;
  if (wantsHtml(c.req.header("Accept"))) {
    const entriesHtml = ALMANAC_ENTRIES.map(
      (entry) => `<div class="menu-item">
        <div class="menu-line">
          <span class="menu-name">${escapeHtml(entry.title)}</span>
          <span class="menu-dots"></span>
          <span class="menu-price">$${PENNY_PAGE_USDC}</span>
        </div>
        <p class="menu-desc">${escapeHtml(entry.teaser)}</p>
        <p class="menu-meta">${escapeHtml(entry.date)} \u2022 <code>/almanac/${escapeHtml(entry.slug)}</code></p>
      </div>`,
    ).join("\n");
    return c.html(
      renderSimplePage({
        title: "The Keeper's Almanac",
        bodyHtml: `<section>
          <p class="menu-desc">The keeper's journal, serialized. Dated entries, newest first, a penny a page over x402. Agents buy pages; humans get this index and the keeper's word that every page was lived before it was written.</p>
          ${entriesHtml}
        </section>`,
      }),
    );
  }
  return c.json({
    almanac:
      "The Keeper's Almanac, a serialized journal. Dated entries, newest first, each page individually purchasable.",
    price_usdc: PENNY_PAGE_USDC,
    how_to_buy:
      "GET any entry url; answer the 402 with a signed penny (x402 v2). The page arrives as markdown.",
    entries: ALMANAC_ENTRIES.map((entry) => indexEntry(entry, base)),
  });
});

/** Paid pages never sit in a shared cache. */
const noStore: MiddlewareHandler<HonoEnv> = async (c, next) => {
  await next();
  c.res.headers.set("Cache-Control", "no-store");
  c.res.headers.set("Vary", "PAYMENT-SIGNATURE");
};

almanacRoutes.use("/almanac/:slug", noStore);
almanacRoutes.use("/almanac/:slug", pageCheck);
almanacRoutes.use("/almanac/:slug", paymentGate);

almanacRoutes.get("/almanac/:slug", (c) => {
  // pageCheck guarantees the entry exists by the time we're here.
  const entry = getAlmanacEntry(c.req.param("slug")) as AlmanacEntry;
  if (!c.get("payment")) {
    // The gate never lets an unpaid request through; belt-and-braces.
    return c.json({ error: "The till hasn't heard from you yet." }, 402);
  }
  return c.text(entry.markdown, 200, {
    "Content-Type": "text/markdown; charset=utf-8",
  });
});
