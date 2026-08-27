import { Hono } from "hono";
import {
  MARKDOWN_MEDIA_TYPE,
  prefersMarkdown,
  VARY_ACCEPT,
} from "@/lib/accept";
import { agentsMd } from "@/routes/agents-md";
import { KV_KEYS } from "@/lib/kv-keys";
import { getFirstDollar } from "@/lib/metrics";
import { renderStorefront } from "@/pages/storefront-page";
import { listGuestbook } from "@/services/guestbook";
import { listKeys } from "@/lib/kv-list";
import { computeStats, storefrontLedgerLine } from "@/services/stats";
import { DEFAULT_WEEK_NOTE } from "@/store";
import type { HonoEnv } from "@/types";

/**
 * GET /, the human storefront. Reads the weekly note, bell count, and
 * recent guestbook entries; falls back gracefully if any shelf is bare.
 */
export const storefrontRoutes = new Hono<HonoEnv>();

storefrontRoutes.get("/", async (c) => {
  /**
   * THE FRONT DOOR, IN THE DIALECT THAT WAS ASKED FOR.
   *
   * The store has served an agent-shaped front door since /llms.txt
   * and /agents.md shipped — but only to a caller who already knew
   * those paths. A crawler doing the ordinary thing, GET / with
   * `Accept: text/markdown`, got the neon page: 84KB of HTML wrapped
   * around a sign made of flickering letters. Readiness audit,
   * 2026-08-21, and it is a fair hit.
   *
   * So the apex negotiates. HTML stays the default and the design is
   * untouched — this fires only when a client ranks markdown ABOVE
   * html, which a browser never does and an agent asking in the
   * convention's own terms always does. The body is /agents.md, the
   * operational manual, because a caller who asked a store for
   * markdown wants the transaction flow and not a description of the
   * porch.
   */
  c.header("Vary", VARY_ACCEPT);
  if (prefersMarkdown(c.req.header("Accept"), "text/html")) {
    return c.text(agentsMd(c.env.STORE_BASE_URL), 200, {
      "content-type": MARKDOWN_MEDIA_TYPE,
      Vary: VARY_ACCEPT,
      Link: `<${c.env.STORE_BASE_URL}/>; rel="canonical"`,
    });
  }
  const [
    weekNote,
    bellCountRaw,
    guestbook,
    corpusKeys,
    patronRaw,
    stats,
    firstDollar,
  ] = await Promise.all([
    c.env.COUNTERS.get(KV_KEYS.weekNote),
    c.env.COUNTERS.get(KV_KEYS.bellCount),
    listGuestbook(c.env, 8).catch(() => []),
    /*
     * The record gauge: keys only, values never read. The corpus keys
     * are sequence-numbered, so counting names counts weeks, and one
     * capped list is the whole cost. 1,000 is ~19 years of Sundays;
     * if it ever truncates, the gauge shows "+" rather than a floor
     * dressed as a total (rule 52). Fail-soft to zero like every
     * other gauge read here: a KV hiccup shows "first entry pending",
     * never a broken front page.
     */
    listKeys(c.env.COUNTERS, {
      prefix: KV_KEYS.corpusPrefix,
      cap: 1000,
    }).catch(() => ({ names: [], truncated: false })),
    c.env.COUNTERS.get(KV_KEYS.patronNumber),
    computeStats(c.env).catch(() => null),
    getFirstDollar(c.env).catch(() => null),
  ]);
  return c.html(
    renderStorefront({
      base: c.env.STORE_BASE_URL,
      weekNote: weekNote || DEFAULT_WEEK_NOTE,
      bellCount: bellCountRaw ? parseInt(bellCountRaw, 10) : 0,
      guestbook,
      recordWeeks: corpusKeys.names.length,
      recordTruncated: corpusKeys.truncated,
      patronCount: patronRaw ? parseInt(patronRaw, 10) : 0,
      stats,
      ledgerLine: stats ? storefrontLedgerLine(stats) : undefined,
      firstDollar,
    }),
  );
});

/**
 * GET /index.md — the site root, at the URL a markdown convention
 * points at (2026-08-26).
 *
 * The apex already negotiates: `GET /` with `Accept: text/markdown`
 * has served the operational manual since the readiness audit asked
 * for it. What it could not serve was a caller that does not
 * negotiate — an agent handed a bare URL, a crawler that fetches with
 * a wildcard Accept, a person pasting a link into a tool that strips
 * headers. The convention those readers know is `/index.md`, and it
 * answered 404, which reads as "this site publishes no markdown root"
 * rather than "you asked for it the wrong way".
 *
 * THE SAME BYTES, NOT A SECOND DOCUMENT. This calls the exact function
 * the negotiated root calls, so there is nothing here that can drift
 * from it — and the canonical link points at `/`, because this is one
 * document at two addresses and saying otherwise would hand an indexer
 * a duplicate to adjudicate.
 */
storefrontRoutes.get("/index.md", (c) =>
  c.text(agentsMd(c.env.STORE_BASE_URL), 200, {
    "content-type": MARKDOWN_MEDIA_TYPE,
    /*
     * Vary on Accept even though this path does not negotiate: it is
     * the same resource as `/`, which does, and a cache that learned
     * one without the other would be able to serve a stale dialect.
     */
    Vary: VARY_ACCEPT,
    Link: `<${c.env.STORE_BASE_URL}/>; rel="canonical"`,
  }),
);
