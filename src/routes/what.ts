import { agentJobEntries, AGENT_JOBS_TITLE, AGENT_JOBS_DESCRIPTION } from "@/store/agent-jobs";
import { Hono } from "hono";
import { catalogLastUpdated } from "@/lib/freshness";
import { jsonLdBody } from "@/lib/jsonld";
import { escapeHtml, linkStoreUrls } from "@/lib/sanitize";
import { prefersMarkdown } from "@/lib/accept";
import { jsonDocumentMarkdownResponse } from "@/lib/json-markdown";
import { renderSimplePage, wantsHtml } from "@/pages/simple-page";
import { MENU_ITEMS, STORE_METADATA } from "@/store";
import { CAPABILITY_QUERY, SPEC_RETURNS } from "@/store/spec";
import { WHAT_COPY, whatFaq, type FaqPair } from "@/store/copy/what";
import { buyUrlTemplate } from "@/lib/buyer-contract";
import type { HonoEnv } from "@/types";
import { checkoutMethod, type PurchaseCapabilityConfig } from "@/lib/purchase-capabilities";

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
function longTailFaq(base: string, config?: PurchaseCapabilityConfig): FaqPair[] {
  return MENU_ITEMS.filter((item) => CAPABILITY_QUERY[item.id]).map((item) => {
    const query = CAPABILITY_QUERY[item.id]!;
    const question = `${query.startsWith("Be ") ? "How can I" : "How do I"} ${query.charAt(0).toLowerCase()}${query.slice(1)}?`;
    const price =
      item.pricing === "fixed"
        ? `$${item.price_usdc}`
        : `$${item.price_usdc} minimum`;
    const returns = SPEC_RETURNS[item.id] ?? item.description;
    // The URL an answer engine repeats is the one with the door's
    // inputs already in place; the bare door quotes and then refuses
    // the purchase on every input-taking item (2026-09-28).
    const template = buyUrlTemplate(item, base);
    const slots = template === `${base}/api/buy/${item.id}` ? "" : " (fill the angle-bracketed slot first)";
    return {
      question,
      answer: `"${item.name}" (${price}, ${checkoutMethod(config)}): ${returns} Buy: GET ${template}${slots} — machine spec at ${base}/menu/${item.id}, live terms in the 402 itself.`,
    };
  });
}

whatRoutes.get("/what", (c) => {
  const base = c.env.STORE_BASE_URL;
  const pairs = whatFaq(base);
  const jobs = agentJobEntries(base);
  const longTail = longTailFaq(base, c.env);
  /*
   * Hoisted so the markdown twin below renders the same
   * object the JSON serves rather than a second copy.
   */
  const pagePayload = {
    what: WHAT_COPY.directAnswer,
    for_whom: WHAT_COPY.forWhom,
    faq: pairs,
    jobs,
    one_question_per_shelf: longTail,
    standing_policy: WHAT_COPY.standingPolicyJson,
    questions: `POST ${base}/api/request, a human reads every one on Sundays.`,
  };
  if (prefersMarkdown(c.req.header("Accept"), "text/html", c.req.header("User-Agent"))) {
    return jsonDocumentMarkdownResponse({
      base,
      path: "/what",
      title: AGENT_JOBS_TITLE,
      description: AGENT_JOBS_DESCRIPTION,
      document: pagePayload as unknown as Record<string, unknown>,
    });
  }
  if (wantsHtml(c.req.header("Accept"), c.req.header("User-Agent"))) {
    const pairsHtml = pairs.map(pair => {
      const job = jobs.find(job => job.question === pair.question);
      return `<div class="menu-item"${job ? ` id="job-${job.id}"` : ""}>
        <h2 class="menu-name">${escapeHtml(pair.question)}</h2>
        <p class="menu-desc">${linkStoreUrls(escapeHtml(pair.answer))}</p>
        ${job ? `<p><a href="${escapeHtml(job.next_step.url)}">${escapeHtml(job.next_step.label)} →</a></p><label for="prompt-${job.id}">Prompt to give your agent (replace bracketed inputs)</label><textarea id="prompt-${job.id}" readonly rows="6" style="width:100%;box-sizing:border-box">${escapeHtml(job.prompt)}</textarea>` : ""}
      </div>`;
    }).join("\n");
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
        title: AGENT_JOBS_TITLE,
        description:
          AGENT_JOBS_DESCRIPTION,
        path: "/what",
        bodyHtml: `<section>
          <p class="menu-desc">${WHAT_COPY.directAnswer}</p>
          <p class="menu-desc">${WHAT_COPY.intro}</p>
          <nav aria-label="Find an answer by task"><ul>${jobs.map(job => `<li><a href="#job-${job.id}">${escapeHtml(job.title)}</a></li>`).join("")}</ul></nav>
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
  return c.json(pagePayload);
});
