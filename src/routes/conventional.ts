import { Hono } from "hono";
import type { HonoEnv } from "@/types";

/**
 * THE URLS A CHECKLIST GUESSES, ROUTED SOMEWHERE REAL.
 *
 * /about, /contact, /terms, /privacy, /legal, /faq, /support and
 * /security all answered 404 until 2026-07-31. An outside model asked
 * to evaluate this store reported it could find no company identity,
 * no contact route and no terms — accurately, because every one of
 * those questions IS answered here, at a URL nobody would guess.
 *
 * THIS ADDS NO PAGE AND NO ROOM. Nothing new is written, nothing joins
 * the nav, the sitemap or the storefront, and no human is shown a
 * conventional trust page — the keeper's call and the right one. These
 * are redirects: a guessed URL lands on the room that already answers
 * it, in the store's own voice, instead of on nothing.
 *
 * A 404 IS AN ANSWER AND IT WAS THE WRONG ONE. To a crawler running a
 * legitimacy checklist, "no terms page" and "terms are at a URL you
 * did not guess" are indistinguishable, and the first reading is the
 * one it files. Routing costs nothing and removes a false negative.
 *
 * 301 rather than 302, deliberately: these mappings are not going to
 * change, and a permanent redirect is the one an indexer will follow
 * and remember rather than re-check forever.
 */
export const conventionalRoutes = new Hono<HonoEnv>();

/**
 * Every mapping points at a page that genuinely answers the question.
 * Nothing here redirects somewhere vaguely adjacent to look complete —
 * a redirect to a page that does not answer is worse than the 404,
 * because it costs the reader a hop before disappointing them.
 */
const GUESSED: Record<string, string> = {
  // Who runs this, what it is, and is it a scam — /what is literally
  // built as the ten-second version for a buyer's human.
  "/about": "/what",
  "/faq": "/what",
  // What you get, what you own, and what is guaranteed.
  "/terms": "/rights",
  "/legal": "/rights",
  /**
   * The mailbox is the contact route and it is the only one. Pointed
   * at /what rather than /what#contact: the anchor does not exist,
   * and a redirect to a fragment nothing renders is a small lie that
   * costs the reader a scroll and tells them nobody checked.
   */
  "/contact": "/what",
  "/support": "/what",
  // What a signature proves, who holds the key, what is not built.
  "/security": "/attestation",
  /**
   * /privacy became a real room 2026-08-21 — the MCP connector
   * directories require a public privacy policy and treat a redirect
   * to a JSON file as absence. The structured stance in trust.json
   * stays for the automated readers; the room serves the humans and
   * the reviewers. Only the alias remains here.
   */
  "/privacy-policy": "/privacy",
  // /.well-known/security.txt left this map 2026-08-01: a real RFC
  // 9116 file is served by well-known.ts now, and a redirect here
  // would shadow it (this router mounts first).
};

for (const [guessed, real] of Object.entries(GUESSED)) {
  conventionalRoutes.get(guessed, (c) => c.redirect(real, 301));
}

/** Exported for the test that holds every target to being a real page. */
export const CONVENTIONAL_REDIRECTS = GUESSED;
