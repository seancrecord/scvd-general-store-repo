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
 * FIVE DIRECTIVES JOINED THE FENCE ON 2026-09-15, after a readiness
 * scan graded the page policy 3/4 on directive coverage and the walk
 * that followed found the gaps were real even where the grade's
 * reasoning was not. Every one of these was previously UNSET, which
 * in CSP means the browser default, which for each of them is
 * "anywhere". So all five are tightenings, and none of them is a new
 * permission:
 *
 *   form-action — where a form on these pages may post. No public
 *   page has a form at all; every <form> in this store is under
 *   /admin, which this middleware skips by path. 'self' rather than
 *   'none' because the true statement today and the safe statement
 *   tomorrow differ here by one broken page, and a form added to a
 *   public room should not fail silently on a policy written before
 *   it existed. This is also the directive that fences a redirect
 *   out of the origin, which is why a scanner looks for it.
 *
 *   img-src — every image these pages load is this origin's own:
 *   /favicon.svg, /p/*.svg, the card faces rasterised in-Worker. No
 *   external host, no data: URI anywhere in src/pages or src/routes
 *   outside /admin, checked before this line was written.
 *
 *   style-src — one inline <style> block per page, first-party, no
 *   style attributes outside /admin. 'unsafe-inline' is therefore
 *   load-bearing and named rather than worked around: the stylesheet
 *   is built into the page for the round trip it saves, and with
 *   script-src 'self' above it there is no path by which an attacker
 *   puts CSS in this document that they could not more usefully put
 *   script in. Saying 'self' beside it still removes every OTHER
 *   origin, which is the part that was missing.
 *
 *   font-src — the store loads no webfont. The one TTF it ships is
 *   read by the Worker to rasterise a card, server-side, and never
 *   fetched by a page. 'self' is the honest ceiling.
 *
 *   frame-src — these pages embed nothing. frame-ancestors above says
 *   who may frame US; this says whom we may frame, and the answer has
 *   always been nobody.
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
    "form-action 'self'",
    "img-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    "frame-src 'none'",
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
