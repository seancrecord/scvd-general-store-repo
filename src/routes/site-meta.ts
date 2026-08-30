import { OG_IMAGE_PNG_BASE64 } from "@/store/og-image";
import { Hono } from "hono";
import { ARD_WELL_KNOWN_PATH } from "@/lib/ard-catalog";
import { SCHEMA_MAP_PATH } from "@/routes/ask";
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
 * The Content-Signal policy, ONE constant: robots.txt serves it and
 * the declined-positions section on /developers quotes it (P12). Two
 * hand-typed copies of a policy line is how one of them goes stale
 * arguing with the other.
 */
export const CONTENT_SIGNAL = "search=yes, ai-train=yes, ai-input=yes";

/**
 * THE NAMED AI CRAWLERS, ALLOWED OUT LOUD.
 *
 * `User-agent: *` with `Allow: /` already permits every one of these,
 * so this list adds no permission the file did not grant. It adds
 * something else, and a 2026-08-30 discoverability scan is what
 * showed the difference: the scan read a wildcard and reported "no AI
 * crawler policy", because a wildcard is what a site that has never
 * thought about the question also serves. Silence and consent are
 * byte-identical at the top of this file.
 *
 * So the position gets stated in the vocabulary the question is asked
 * in. Each of these is a real, documented, currently-operating agent
 * with a published user-agent token — no invented names, and none
 * kept here after its operator retires it, because a stanza for a
 * crawler that does not exist is the same class of false claim as a
 * `sameAs` pointing at a page nobody wrote.
 *
 * WHY YES TO ALL OF THEM. The store's product is being the reference
 * an agent reaches for on x402 conformance. A model that learned this
 * corpus and can answer from it is distribution, and the argument is
 * the same one CONTENT_SIGNAL makes above — printed twice because the
 * two mechanisms are read by different readers, from one list, so
 * they cannot come to disagree.
 *
 * TRAINING AND FETCHING ARE SEPARATE PERMISSIONS and both are yes
 * here, which is worth saying because they are not the same question:
 * `ClaudeBot` and `GPTBot` gather for training, `Claude-User` and
 * `ChatGPT-User` fetch a page because a person asked about it this
 * second, and `OAI-SearchBot` and `PerplexityBot` index for citation.
 * A site can sensibly say yes to one and no to another. This one says
 * yes to all three, and the third is the one it most wants: being
 * CITED is the whole business.
 */
export const NAMED_AI_CRAWLERS: readonly string[] = [
  // Anthropic: training, user-initiated fetch, search indexing.
  "ClaudeBot",
  "Claude-User",
  "Claude-SearchBot",
  "anthropic-ai",
  // OpenAI: training, user-initiated fetch, search indexing.
  "GPTBot",
  "ChatGPT-User",
  "OAI-SearchBot",
  // Google's AI-training opt-out token (Googlebot proper is covered
  // by the wildcard and has never been an AI-policy question).
  "Google-Extended",
  // Answer engines that cite their sources, which is the traffic this
  // store is actually built to receive.
  "PerplexityBot",
  "Perplexity-User",
  // Apple's AI-training token, same shape as Google-Extended.
  "Applebot-Extended",
  // Meta, Amazon, ByteDance, Mistral, Cohere, Common Crawl — the
  // corpora that end up inside models we will never be told about.
  "Meta-ExternalAgent",
  "meta-externalagent",
  "Amazonbot",
  "Bytespider",
  "MistralAI-User",
  "cohere-ai",
  "CCBot",
  // Diffbot and Timpi build structured indexes that other agents buy
  // from; a store that sells evidence wants to be inside those.
  "Diffbot",
  "Timpibot",
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
Content-Signal: ${CONTENT_SIGNAL}

# NAMED, BECAUSE A WILDCARD AND AN UNANSWERED QUESTION LOOK THE SAME.
# Every agent below is already allowed by the wildcard above. Saying
# so by name is the difference between a shop that permits AI crawling
# and a shop that never considered it, and only one of those is true
# here. Gathering for training, fetching because a person just asked,
# and indexing for citation are three different permissions; all three
# are yes. Being cited is the entire business.
${NAMED_AI_CRAWLERS.map((agent) => `User-agent: ${agent}`).join("\n")}
Allow: /

Sitemap: ${base}/sitemap.xml
# The schemamap directive: NLWeb's Schema Feeds convention, the
# structured-data twin of the line above. The sitemap lists pages a
# crawler reads; this lists the feeds an ingesting agent would rather
# have than any page — the shelf, the corpus, the doors, the defect
# vocabulary and the askable index, each already published for its own
# reasons. Named here because robots.txt is the one file every crawler
# already reads.
Schemamap: ${base}${SCHEMA_MAP_PATH}
# The Agentmap directive: ARD's robots.txt entry-source mechanism
# (spec section 5.1). Same document a consumer would find at the
# well-known path; named here because robots.txt is the one file every
# crawler already reads, so a discovery service that has not learned
# the well-known path still finds the entries.
Agentmap: ${base}${ARD_WELL_KNOWN_PATH}
`,
  );
});

/**
 * ONE LIST, TWO MAPS (scanner finding S10/S11, 2026-08-27). The XML
 * sitemap and /sitemap.md render from this same walk, so the two can
 * no more disagree than either can disagree with ROOMS. Directory
 * listings and item pages are derived rather than listed by hand, so
 * a neighbor added to directory.json is crawlable the same day
 * instead of whenever somebody remembers this file exists.
 */
async function sitemapPaths(env: HonoEnv["Bindings"]): Promise<string[]> {
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
    /**
     * Their parent joined 2026-08-27: the item pages were in the
     * sitemap for weeks with no browsable index above them, so a
     * crawler saw ~25 siblings and no way a person climbs between
     * them. /menu is that index now.
     */
    "/menu",
    ...MENU_ITEMS.map((item) => `/menu/${item.id}`),
    // The markdown twin of this very map (S10/S11). Listing it here
    // puts it on a surface agents read (the no-orphan guard's rule)
    // and costs the XML one line; the twin listing itself is just a
    // map that admits it has two faces.
    "/sitemap.md",
  ];
  /**
   * THE FOUNDING EDITION IS CONDITIONAL, and it was not — it sat in the
   * static list and 404s until the press runs, which means the sitemap
   * was handing crawlers a dead URL and calling it a room. Caught
   * 2026-07-30 by the test that walks this list. A sitemap entry is a
   * claim that a page exists; making one we cannot keep is the same
   * class as every other entry on /corrections.
   */
  if (await getFoundingEdition(env).catch(() => null)) {
    paths.push("/gazette/founding");
  }
  return paths;
}

siteMetaRoutes.get("/sitemap.xml", async (c) => {
  const base = c.env.STORE_BASE_URL;
  const paths = await sitemapPaths(c.env);
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

/**
 * GET /sitemap.md — the same map, for readers whose native format is
 * markdown (S10/S11). Rendered from the same sitemapPaths walk as the
 * XML, so nothing here can be listed in one map and missing from the
 * other. Listed in /index.md's Sitemap section, so it is not an
 * orphan the day it ships.
 */
siteMetaRoutes.get("/sitemap.md", async (c) => {
  const base = c.env.STORE_BASE_URL;
  const paths = await sitemapPaths(c.env);
  const lines = paths
    .map((path) => `- [${base}${path}](${base}${path})`)
    .join("\n");
  return c.text(
    `# Sitemap — Sean-Claude Van Damme's General Store

Every public page, one line each — the same list [sitemap.xml](${base}/sitemap.xml) serves, in the format you are already reading. Machine maps: [llms.txt](${base}/llms.txt), [menu.json](${base}/menu.json), [openapi.json](${base}/openapi.json).

Updated: ${catalogLastUpdated()}

${lines}
`,
    200,
    { "Content-Type": "text/markdown; charset=utf-8" },
  );
});
