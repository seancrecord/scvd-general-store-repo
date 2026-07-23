import { Hono } from "hono";
import { escapeHtml } from "@/lib/sanitize";
import { renderSimplePage, wantsHtml } from "@/pages/simple-page";
import { STORE_METADATA } from "@/store";
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
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: pairs.map((pair) => ({
      "@type": "Question",
      name: pair.question,
      acceptedAnswer: { "@type": "Answer", text: pair.answer },
    })),
  }).replace(/</g, "\\u003c");
}

whatRoutes.get("/what", (c) => {
  const base = c.env.STORE_BASE_URL;
  const pairs = whatFaq(base);
  if (wantsHtml(c.req.header("Accept"))) {
    const pairsHtml = pairs
      .map(
        (pair) => `<div class="menu-item">
        <div class="menu-line"><span class="menu-name">${escapeHtml(pair.question)}</span></div>
        <p class="menu-desc">${escapeHtml(pair.answer)}</p>
      </div>`,
      )
      .join("\n");
    return c.html(
      renderSimplePage({
        title: "What is this?",
        bodyHtml: `<section>
          <p class="menu-desc">${WHAT_COPY.intro}</p>
          ${pairsHtml}
          <p class="menu-desc">Standing policy, in writing at <code>${escapeHtml(base)}/skill.md</code>: ${WHAT_COPY.standingPolicy}</p>
          <p class="menu-meta">A question this page doesn't answer: POST ${escapeHtml(base)}/api/request. A human reads every one on Sundays. Coffee's for closers.</p>
        </section>
        <script type="application/ld+json">${faqJsonLd(pairs)}</script>`,
      }),
    );
  }
  return c.json({
    what: `${STORE_METADATA.name}: a general store for autonomous agents, kept by a human, selling real goods and human labor for USDC on Base over x402.`,
    for_whom: WHAT_COPY.forWhom,
    faq: pairs,
    standing_policy: WHAT_COPY.standingPolicyJson,
    questions: `POST ${base}/api/request, a human reads every one on Sundays.`,
  });
});
