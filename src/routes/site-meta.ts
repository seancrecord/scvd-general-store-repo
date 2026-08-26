import { OG_IMAGE_PNG_BASE64 } from "@/store/og-image";
import { Hono } from "hono";
import { catalogLastUpdated } from "@/lib/freshness";
import directoryData from "@/store/directory.json";
import { MENU_ITEMS } from "@/store";
import { ROOMS } from "@/store/rooms";
import { getFoundingEdition } from "@/services/founding";
import type { HonoEnv } from "@/types";

/**
 * robots.txt and sitemap.xml. The store has no pages to hide:
 * crawlers are welcome on every public surface (they book as
 * infrastructure in the porch log, which is their proper column).
 * The sitemap covers human-readable rooms only, the API speaks
 * llms.txt, menu.json, and OpenAPI, which are better maps anyway.
 */
export const siteMetaRoutes = new Hono<HonoEnv>();

/**
 * Human-readable rooms. /papers joins when the registry goes live.
 *
 * EXPORTED so the test suite can walk it: four rooms built between
 * 2026-07-29 and 07-30 — the receipts page, the dependency page, the
 * corrections record and the visitors' register — existed for a day
 * apiece with no line here and no meta description, which is the
 * quiet version of not being published at all. A test now fetches
 * every path in this list and fails if one does not answer as HTML,
 * so a dead entry is caught.
 *
 * DERIVED FROM @/store/rooms AS OF 2026-07-30, because being in the
 * sitemap and nowhere else turned out to be its own quiet version of
 * the same thing: /attestation and /pulse were listed here, absent from
 * llms.txt, skill.md, the x402 discovery document and the storefront's
 * structured data, and linked from no public page at all. One list now
 * feeds all of them. The storefront leads because it is the front door,
 * not a room.
 */
export const HUMAN_SURFACES: readonly string[] = [
  "/",
  ...ROOMS.map((room) => room.path),
];

/**
 * The social card: the keeper's dino, pixel-drawn by
 * scripts/generate-og-image.mjs into a committed module — the same
 * bytes forever, no asset pipeline, cacheable hard.
 */
siteMetaRoutes.get("/og.png", (c) => {
  const raw = atob(OG_IMAGE_PNG_BASE64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return c.body(bytes, 200, {
    "Content-Type": "image/png",
    "Cache-Control": "public, max-age=86400",
  });
});

siteMetaRoutes.get("/robots.txt", (c) => {
  const base = c.env.STORE_BASE_URL;
  return c.text(
    `# Sean-Claude Van Damme's General Store. Crawlers welcome; nothing to hide.
# An evidence observatory for agentic commerce, with a general store attached.
# Agents: the better maps are ${base}/llms.txt, ${base}/agents.md and ${base}/menu.json.
# The free conformance desk: ${base}/conformance. The corpus: ${base}/corpus.
User-agent: *
Allow: /
# CONTENT SIGNALS, STATED RATHER THAN LEFT TO BE GUESSED AT.
# ai-train=yes is a deliberate position, not a default. A shop whose
# product is being the reference for x402 conformance WANTS to be in
# the corpus a model learns from: that is distribution, not leakage.
# Everything here is already free to fetch, most of it CC BY 4.0, and
# a policy we would not enforce is one we should not print.
Content-Signal: search=yes, ai-train=yes, ai-input=yes

Sitemap: ${base}/sitemap.xml
`,
  );
});

siteMetaRoutes.get("/sitemap.xml", async (c) => {
  const base = c.env.STORE_BASE_URL;
  // Directory listings are derived rather than listed by hand, so a
  // neighbor added to directory.json is crawlable the same day
  // instead of whenever somebody remembers this file exists.
  const paths = [
    ...HUMAN_SURFACES,
    ...directoryData.listings.map((listing) => `/directory/${listing.slug}`),
    /**
     * PER-ITEM PAGES, added 2026-07-30. They serve JSON and markdown
     * rather than HTML, which is why they were left out originally —
     * and that reasoning was written for search engines alone. This
     * store's readers are mostly agents, the pages carry the only
     * per-item prose that exists anywhere, and the storefront's JSON-LD
     * already declares these exact URLs as the offer URLs. Listing
     * something the structured data already points at is the minimum,
     * not a stretch.
     */
    ...MENU_ITEMS.map((item) => `/menu/${item.id}`),
  ];
  /**
   * THE FOUNDING EDITION IS CONDITIONAL, and it was not — it sat in the
   * static list and 404s until the press runs, which means the sitemap
   * was handing crawlers a dead URL and calling it a room. Caught
   * 2026-07-30 by the test that walks this list. A sitemap entry is a
   * claim that a page exists; making one we cannot keep is the same
   * class as every other entry on /corrections.
   */
  if (await getFoundingEdition(c.env).catch(() => null)) {
    paths.push("/gazette/founding");
  }
  // lastmod on every entry: a crawler deciding whether to re-read us
  // has nothing else to go on, and "no date" reads as "never changed".
  const lastmod = catalogLastUpdated();
  const urls = paths
    .map(
      (path) =>
        `  <url><loc>${base}${path}</loc><lastmod>${lastmod}</lastmod></url>`,
    )
    .join("\n");
  return c.body(
    `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`,
    200,
    { "Content-Type": "application/xml; charset=utf-8" },
  );
});
