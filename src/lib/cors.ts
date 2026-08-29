import type { MiddlewareHandler } from "hono";
import type { HonoEnv } from "@/types";

/**
 * CORS FOR THE DISCOVERY SURFACE, AND NOTHING PAST IT (scanner
 * finding C1, 2026-08-27).
 *
 * The server card at /.well-known/mcp.json went out with no
 * Access-Control-Allow-Origin header, so a browser-based MCP client
 * could not read it: the fetch dies in the browser no matter what the
 * server answered. Rule 53's shape, one door earlier — the buyer who
 * arrives in a browser is ours to serve, and every surface named here
 * is public, read-only, and byte-identical for every caller. On such
 * a surface an absent ACAO header protects nothing; it only breaks
 * the browser caller.
 *
 * THE BOUNDARY, WRITTEN DOWN BECAUSE IT IS THE POINT. The allowance
 * is never `*` across the app. What stays outside, deliberately:
 * /admin, every HTML room (cross-origin reads there are the attack,
 * not the feature), the browser till's JavaScript, which is
 * same-origin by design under house rule 53, and anything that is not
 * answering 200 — a 402 challenge is not a published document.
 *
 * WHAT CHANGED 2026-08-29, AND WHY IT HAD TO. The list above used to
 * be the whole allowance, and a list is a thing a person widens. It
 * was written on 2026-08-27 and by the 29th it had fallen behind its
 * own store: /corpus.json — the signed record this store's entire
 * argument rests on — was unreadable from a browser. So were
 * /doors.json, /defects.json, /coverage.json, /trust-list.json,
 * /house-ledger.json, /pulse.json, /stats, every /corpus/*.json, the
 * published schemas and specs, and /atlas.json, which exists for no
 * other purpose than telling an arriving agent where things are. 34
 * public doors carried the header and 97 did not, and the split was
 * not a judgement anybody had made — it was the order the doors
 * happened to be built in.
 *
 * The named list stays for the MCP door and its preflight, which need
 * more than a header. Everything else is now DERIVED from what the
 * response actually is: a GET answered 200 with a machine-readable
 * document body — JSON, markdown, plain text, XML — outside /admin,
 * setting no cookie. That is the doctrine's own sentence ("public,
 * read-only, and byte-identical for every caller") turned into a
 * check instead of a memory. A document published tomorrow is
 * readable from a browser the day it ships, without anyone
 * remembering this file exists.
 *
 * The cookie clause is belt-and-braces: this store sets no cookie
 * anywhere, and if that ever stops being true the response that
 * breaks it drops out of the allowance rather than leaking.
 *
 * The MCP door needs more than the header: a browser client
 * preflights POST, so OPTIONS is answered here (allow POST, echo the
 * requested headers — Content-Type and the mcp-* family), and the
 * MCP-relevant response headers are exposed so the client can read
 * them off the reply. test/cors-discovery.spec.ts pins the
 * representative set and both sides of the boundary.
 */

const DISCOVERY_EXACT = new Set([
  "/openapi.json",
  "/llms.txt",
  "/llms-full.txt",
  "/menu.json",
  "/index.md",
  "/sitemap.xml",
  "/agents.md",
  "/skill.md",
  // The MCP JSON-RPC door itself; its /.well-known aliases ride the
  // prefix below. The card being readable while the endpoint is
  // unreachable is the same failure one hop later.
  "/mcp",
]);

function isDiscoveryPath(path: string): boolean {
  return (
    path.startsWith("/.well-known/") ||
    DISCOVERY_EXACT.has(path) ||
    // The per-area llms files (/menu/llms.txt, /try/llms.txt, …) are
    // the same derived read-only class as /llms.txt itself.
    path.endsWith("/llms.txt")
  );
}

/**
 * Document bodies a stranger may read from any origin, decided by
 * what came back rather than by which path was asked for.
 *
 * HTML is deliberately absent. The rooms are where a cross-origin
 * read would be the attack rather than the feature, and no agent
 * needs to scrape our prose from a browser — every room's machine
 * copy is one of the bodies below.
 */
const READABLE_DOCUMENT =
  /^(application\/(json|xml|[\w.+-]+\+json)|text\/(markdown|plain|xml))\b/;

function servesPublishedDocument(c: {
  req: { method: string; path: string };
  res: Response;
}): boolean {
  if (c.req.method !== "GET" && c.req.method !== "HEAD") return false;
  if (c.req.path.startsWith("/admin")) return false;
  // 304 as well as 200: the conditional-GET layer answers the
  // revalidation of a document that WAS in this class, and a browser
  // that can read the body but not the "you already have it" is a
  // cache that only works when it does not help.
  if (c.res.status !== 200 && c.res.status !== 304) return false;
  if (c.res.headers.has("Set-Cookie")) return false;
  return READABLE_DOCUMENT.test(c.res.headers.get("Content-Type") ?? "");
}

export const discoveryCors: MiddlewareHandler<HonoEnv> = async (c, next) => {
  if (!isDiscoveryPath(c.req.path)) {
    await next();
    if (servesPublishedDocument(c)) {
      c.res.headers.set("Access-Control-Allow-Origin", "*");
      c.res.headers.set(
        "Access-Control-Expose-Headers",
        "Content-Type, ETag, Link, mcp-session-id, mcp-protocol-version",
      );
    }
    return;
  }
  if (c.req.method === "OPTIONS") {
    // The preflight is answered at the boundary; no route ever sees
    // it. Requested headers are echoed rather than enumerated — the
    // request is public and unauthenticated either way, and an echo
    // cannot go stale when a client grows a new mcp-* header.
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers":
          c.req.header("Access-Control-Request-Headers") ?? "Content-Type",
        "Access-Control-Max-Age": "86400",
      },
    });
  }
  await next();
  if (isDiscoveryPath(c.req.path) || servesPublishedDocument(c)) {
    c.res.headers.set("Access-Control-Allow-Origin", "*");
    c.res.headers.set(
      "Access-Control-Expose-Headers",
      "Content-Type, ETag, Link, mcp-session-id, mcp-protocol-version",
    );
  }
};
