import { Hono } from "hono";
import { catalogLastUpdated } from "@/lib/freshness";
import { jsonLdBody } from "@/lib/jsonld";
import { escapeHtml, linkStoreUrls } from "@/lib/sanitize";
import { renderSimplePage, wantsHtml } from "@/pages/simple-page";
import { MENU_ITEMS, STORE_METADATA } from "@/store";
import { CAPABILITY_QUERY, SPEC_RETURNS } from "@/store/spec";
import { WHAT_COPY, whatFaq, type FaqPair } from "@/store/copy/what";
import type { HonoEnv } from "@/types";

/**
 * GET /what, the Operator Glance. All the words live in
 * src/store/copy/what.ts (keeper-editable); this file only hangs
 * them up and rides the FAQPage JSON-LD along as invisible plumbing.
 */
export const whatRoutes = new Hono<HonoEnv>();

/** Invisible plumbing: schema.org FAQPage. Inert data, not script. */
function faqJsonLd(pairs: FaqPair[]): string {
  return jsonLdBody({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    dateModified: catalogLastUpdated(),
    mainEntity: pairs.map((pair) => ({
      "@type": "Question",
      name: pair.question,
      acceptedAnswer: { "@type": "Answer", text: pair.answer },
    })),
  });
}

/**
 * THE LONG TAIL, derived so it cannot go stale (the keeper's AEO
 * ruling, 2026-08-04): answer engines are asked capability questions,
 * not product names, and CAPABILITY_QUERY already holds each item's
 * question in the register an agent would actually use (⚑ keeper's
 * pen on those phrasings). Question = the query as a question; answer
 * = assembled entirely from already-approved copy (item name, live
 * price, the registrar-plain Returns line, the buy URL). Nothing here
 * is hand-typed prose, so nothing here rots when a price moves.
 */
function longTailFaq(base: string): FaqPair[] {
  return MENU_ITEMS.filter((item) => CAPABILITY_QUERY[item.id]).map((item) => {
    const query = CAPABILITY_QUERY[item.id]!;
    const question = `${query.startsWith("Be ") ? "How can I" : "How do I"} ${query.charAt(0).toLowerCase()}${query.slice(1)}?`;
    const price =
      item.pricing === "fixed"
        ? `$${item.price_usdc}`
        : `$${item.price_usdc} minimum`;
    const returns = SPEC_RETURNS[item.id] ?? item.description;
    return {
      question,
      answer: `"${item.name}" (${price}, USDC on Base, Polygon, or Solana over x402): ${returns} Buy: GET ${base}/api/buy/${item.id} — machine spec at ${base}/menu/${item.id}, live terms in the 402 itself.`,
    };
  });
}

whatRoutes.get("/what", (c) => {
  const base = c.env.STORE_BASE_URL;
  const pairs = whatFaq(base);
  const longTail = longTailFaq(base);
  if (wantsHtml(c.req.header("Accept"))) {
    const pairsHtml = pairs
      .map(
        (pair) => `<div class="menu-item">
        <div class="menu-line"><span class="menu-name">${escapeHtml(pair.question)}</span></div>
        <p class="menu-desc">${linkStoreUrls(escapeHtml(pair.answer))}</p>
      </div>`,
      )
      .join("\n");
    const longTailHtml = longTail
      .map(
        (pair) => `<div class="menu-item">
        <div class="menu-line"><span class="menu-name">${escapeHtml(pair.question)}</span></div>
        <p class="menu-desc">${linkStoreUrls(escapeHtml(pair.answer))}</p>
      </div>`,
      )
      .join("\n");
    return c.html(
      renderSimplePage({
        title: "What is this?",
        /**
         * RE-CUT 2026-08-18: this description still read "an x402
         * general store selling small signed goods" — the
         * pre-2026-08-07 position, surviving on the one page whose
         * whole job is answering "what is this". A meta description
         * is the sentence search engines quote; it now mirrors the
         * directAnswer's shape instead of paraphrasing a store that
         * stopped existing in August. ⚑ KEEPER REVIEW — new ink.
         */
        description:
          "What scvd.store is, what it costs, and how to check the signatures: an evidence observatory for agentic commerce — free conformance checks, signed observations.",
        path: "/what",
        bodyHtml: `<section>
          <p class="menu-desc">${WHAT_COPY.directAnswer}</p>
          <p class="menu-desc">${WHAT_COPY.intro}</p>
          ${pairsHtml}
          <p class="menu-desc">Standing policy, in writing at <code>${escapeHtml(base)}/skill.md</code>: ${WHAT_COPY.standingPolicy}</p>
          <p class="menu-meta">A question this page doesn't answer: POST ${escapeHtml(base)}/api/request. A human reads every one on Sundays. Coffee's for closers.</p>
        </section>
        <section>
          <h2>One question per shelf</h2>
          <p class="menu-desc">The question each item exists to answer, in the words an agent would actually use. Every answer is assembled from the live menu at request time — prices here cannot go stale, because nothing here was typed.</p>
          ${longTailHtml}
        </section>
        <script type="application/ld+json">${faqJsonLd([...pairs, ...longTail])}</script>`,
      }),
    );
  }
  return c.json({
    what: WHAT_COPY.directAnswer,
    for_whom: WHAT_COPY.forWhom,
    faq: pairs,
    one_question_per_shelf: longTail,
    standing_policy: WHAT_COPY.standingPolicyJson,
    questions: `POST ${base}/api/request, a human reads every one on Sundays.`,
  });
});
