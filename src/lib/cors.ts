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
 * is this explicit list — the discovery prefix, the named root
 * documents, the derived llms area files, and the MCP JSON-RPC door —
 * never `*` across the app. What stays outside, deliberately: /admin
 * and every stateful room (cross-origin reads there are the attack,
 * not the feature), and the paid /api doors — the browser till is
 * same-origin by design, and a cross-origin surface on money is scope
 * nobody asked for. A path added here is a declaration that ANY
 * website may read it from a visitor's browser; treat the list like
 * the sitemap, not like a default.
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

export const discoveryCors: MiddlewareHandler<HonoEnv> = async (c, next) => {
  if (!isDiscoveryPath(c.req.path)) {
    return next();
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
  c.res.headers.set("Access-Control-Allow-Origin", "*");
  c.res.headers.set(
    "Access-Control-Expose-Headers",
    "Content-Type, Link, mcp-session-id, mcp-protocol-version",
  );
};
