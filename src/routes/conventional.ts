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
   * The one that is NOT a room, because there is no privacy room and
   * inventing one would be surfacing the thing the keeper asked to
   * keep behind the scenes. The full data stance — no cookies, no
   * IPs, nothing client-side, uniqueness deliberately unavailable —
   * is published as structured data for the readers who ask this
   * question, which are overwhelmingly automated.
   */
  "/privacy": "/.well-known/trust.json",
  "/privacy-policy": "/.well-known/trust.json",
  // The conventional home of a security contact file; we do not serve
  // one, but the trust document says who to write to and how.
  "/.well-known/security.txt": "/.well-known/trust.json",
};

for (const [guessed, real] of Object.entries(GUESSED)) {
  conventionalRoutes.get(guessed, (c) => c.redirect(real, 301));
}

/** Exported for the test that holds every target to being a real page. */
export const CONVENTIONAL_REDIRECTS = GUESSED;
