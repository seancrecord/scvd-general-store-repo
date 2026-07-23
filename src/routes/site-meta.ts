import { Hono } from "hono";
import type { HonoEnv } from "@/types";

/**
 * robots.txt and sitemap.xml. The store has no pages to hide:
 * crawlers are welcome on every public surface (they book as
 * infrastructure in the porch log, which is their proper column).
 * The sitemap covers human-readable rooms only, the API speaks
 * llms.txt, menu.json, and OpenAPI, which are better maps anyway.
 */
export const siteMetaRoutes = new Hono<HonoEnv>();

/** Human-readable rooms. /papers joins when the registry goes live. */
const HUMAN_SURFACES = [
  "/",
  "/what",
  "/gazette",
  "/almanac",
  "/directory",
  "/retired-words",
  "/zodiac",
  "/porch",
] as const;

siteMetaRoutes.get("/robots.txt", (c) => {
  const base = c.env.STORE_BASE_URL;
  return c.text(
    `# Sean-Claude Van Damme's General Store. Crawlers welcome; nothing to hide.
# Agents: the better maps are ${base}/llms.txt and ${base}/menu.json.
User-agent: *
Allow: /

Sitemap: ${base}/sitemap.xml
`,
  );
});

siteMetaRoutes.get("/sitemap.xml", (c) => {
  const base = c.env.STORE_BASE_URL;
  const urls = HUMAN_SURFACES.map(
    (path) => `  <url><loc>${base}${path}</loc></url>`,
  ).join("\n");
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
