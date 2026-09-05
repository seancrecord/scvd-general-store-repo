/**
 * THE SCRIPT FENCE, ONE STRING (P7's own condition, extended by P8).
 *
 * The P7 ruling that let the store serve its first first-party script
 * attached a condition: shipping any script means shipping a CSP —
 * net risk down, not up. The storefront honoured it for /webmcp.js;
 * the till pages had been serving /till.js since rule 53 with no
 * fence at all, which was the same obligation unpaid. One derivation
 * now, three doors (storefront, /try, the item pages), so the fence
 * cannot loosen on one page while a test watches another.
 *
 * 'self' only: the store's own scripts, nothing injected, nothing
 * embedded. JSON islands and JSON-LD blocks are data, not execution,
 * and pass untouched.
 *
 * TWO DIRECTIVES JOINED THE FENCE ON 2026-09-05, at the keeper's ask
 * after a header check found the policy silent on both:
 *
 *   connect-src — where a script on these pages may open a
 *   connection. The answer is the store's own origin and nothing
 *   else: /webmcp.js calls the free instruments on this origin,
 *   /till.js fetches the buy URL on this origin and hands the
 *   signing to the wallet extension (which is not a network request
 *   the page makes). The MCP door at /mcp is this same origin, so
 *   'self' IS the MCP origin; it is also spelled out in full because
 *   the readers that check for it match the string, not the keyword.
 *   Before this line the policy inherited the browser default, which
 *   is "anywhere" — so this is a tightening, not an allowance.
 *
 *   frame-ancestors — who may put these pages in a frame. Before
 *   this line: anyone. Now: this origin, and the two chat hosts that
 *   embed a connected server's pages beside its tools. Nothing else.
 *   This is the HTTP header on the store's PAGES; the MCP App cards
 *   travel over resources/read with a <meta> policy of their own, and
 *   frame-ancestors is absent there because CSP3 ignores it in a
 *   meta element (lib/mcp-apps.ts says why).
 *
 * Derived from the base URL rather than typed, so the origin in the
 * header is the one the store is actually served from.
 */

import type { MiddlewareHandler } from "hono";
import type { HonoEnv } from "@/types";

/** The chat hosts that may frame a connected server's pages. */
export const FRAME_ANCESTOR_HOSTS: readonly string[] = [
  "https://chatgpt.com",
  "https://claude.ai",
];

export function firstPartyScriptCsp(base: string): string {
  const origin = new URL(base).origin;
  return [
    "script-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    `connect-src 'self' ${origin}`,
    `frame-ancestors 'self' ${FRAME_ANCESTOR_HOSTS.join(" ")}`,
  ].join("; ");
}

/**
 * THE FENCE ON EVERY PAGE (2026-09-05). Until now each route that
 * shipped a script set the header itself, and the four that did were
 * the four that carried /webmcp.js. With the script on every room the
 * condition follows it: any HTML answer outside /admin carries the
 * fence, set here once, after the handler, only where a route has not
 * already set one. No public page carries an inline executable script
 * (the JSON-LD and JSON-island blocks are data), so 'self' breaks
 * nothing and fences everything.
 */
export const scriptFence: MiddlewareHandler<HonoEnv> = async (c, next) => {
  await next();
  if (c.req.path.startsWith("/admin")) return;
  if (c.res.headers.has("Content-Security-Policy")) return;
  const type = c.res.headers.get("Content-Type") ?? "";
  if (!type.toLowerCase().startsWith("text/html")) return;
  c.res.headers.set("Content-Security-Policy", firstPartyScriptCsp(c.env.STORE_BASE_URL));
};
