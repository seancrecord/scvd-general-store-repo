import { Hono } from "hono";
import tillSource from "../../till/till.js";
import type { HonoEnv } from "@/types";

/**
 * GET /till.js — the browser till, served as itself.
 *
 * ONE FILE, NOT A BUNDLE. till/till.js is plain ES module JavaScript
 * with no dependencies and no build step, exactly like cli/scvd.mjs
 * and verifier/x402-verify.js, and it is served here byte-for-byte as
 * it sits in the repository. What a buyer's browser executes is what
 * a reader of this repository reads — no transpiler between the two,
 * nothing minified, no source map to go and find. For a file whose
 * job is to ask somebody's wallet for a signature, that property is
 * worth more than any byte it costs.
 *
 * The bytes reach this Worker as a Text module (see the rule in
 * wrangler.jsonc), which means the file is in the bundle and the
 * route cannot serve a stale or missing copy of it.
 *
 * WHY A ROUTE RATHER THAN AN INLINE <script>. Inlining would put the
 * whole till into every page that carries it, and the pages it
 * carries on are the ones a search engine and an answer engine read.
 * A separate URL keeps the documents the size they were, caches once
 * across the site, and — the part that matters — leaves the served
 * HTML of a no-JavaScript page unchanged apart from one tag.
 */
export const tillRoutes = new Hono<HonoEnv>();

tillRoutes.get("/till.js", (c) =>
  c.body(tillSource, 200, {
    "Content-Type": "application/javascript; charset=utf-8",
    /*
     * An hour, and revalidated after. The till is money code: a fix
     * to it should reach buyers in an hour rather than a week, and
     * nothing on the page depends on a long cache.
     */
    "Cache-Control": "public, max-age=3600, must-revalidate",
    /*
     * No sniffing, because a script served as anything else is a
     * script somebody else's browser guessed the type of.
     */
    "X-Content-Type-Options": "nosniff",
  }),
);
