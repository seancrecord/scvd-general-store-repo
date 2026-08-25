import { Hono } from "hono";
import { MARKDOWN_MEDIA_TYPE, VARY_ACCEPT } from "@/lib/accept";
import { buildOkfBundle, isBundleHost, OKF_VERSION } from "@/services/okf";
import type { HonoEnv } from "@/types";

/**
 * GET /okf/* — the evidence layer as an Open Knowledge Format bundle.
 *
 * OKF is markdown on purpose, so this route serves text/markdown and
 * nothing else: there is no HTML twin to negotiate against, and a
 * consumer following the spec asks for files by path. Vary: Accept
 * rides along anyway, because the CDN in front of this store caches by
 * URL and the rest of the site does negotiate.
 *
 * The 404 carries the bundle's own index path rather than a bare
 * error, for the same reason the site's 404 carries a markdown body:
 * an agent that guessed a concept name should be one fetch from the
 * list of real ones.
 */
export const okfRoutes = new Hono<HonoEnv>();

const HEADERS = {
  "Content-Type": MARKDOWN_MEDIA_TYPE,
  Vary: VARY_ACCEPT,
  "Cache-Control": "public, max-age=300",
  "X-OKF-Version": OKF_VERSION,
};

function notFound(base: string, wanted: string): Response {
  const body = [
    `# Not in this bundle`,
    "",
    `\`${wanted}\` is not a concept in the scvd.store OKF bundle.`,
    "",
    `* [Bundle index](${base}/okf/index.md) - every concept, listed.`,
    `* [Census history](${base}/okf/log.md) - what changed, by date.`,
    `* [The store](${base}/okf/store.md) - what this shop is for.`,
    "",
    "Host concepts live at `/okf/host/<hostname>.md` and exist only for",
    "doors that answered a conformant challenge in the latest round.",
    "",
  ].join("\n");
  return new Response(body, { status: 404, headers: HEADERS });
}

okfRoutes.get("/okf", (c) =>
  c.redirect(`${c.env.STORE_BASE_URL}/okf/index.md`, 302),
);

okfRoutes.get("/okf/", (c) =>
  c.redirect(`${c.env.STORE_BASE_URL}/okf/index.md`, 302),
);

okfRoutes.get("/okf/host/:file", async (c) => {
  const base = c.env.STORE_BASE_URL;
  const file = c.req.param("file");
  const host = file.endsWith(".md") ? file.slice(0, -3) : "";
  /*
   * The host is checked BEFORE the bundle is built, not after: a path
   * that could never name a concept must not cost a census read, and
   * `..` must never reach a map lookup keyed by path.
   */
  if (!host || !isBundleHost(host)) {
    return notFound(base, `/okf/host/${file}`);
  }
  const bundle = await buildOkfBundle(c.env);
  const content = bundle.files.get(`/host/${host}.md`);
  if (!content) return notFound(base, `/okf/host/${file}`);
  return new Response(content, { headers: HEADERS });
});

okfRoutes.get("/okf/:file", async (c) => {
  const base = c.env.STORE_BASE_URL;
  const file = c.req.param("file");
  const bundle = await buildOkfBundle(c.env);
  const content = bundle.files.get(`/${file}`);
  if (!content) return notFound(base, `/okf/${file}`);
  return new Response(content, { headers: HEADERS });
});
