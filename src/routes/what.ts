import { Hono } from "hono";
import { escapeHtml } from "@/lib/sanitize";
import { renderSimplePage, wantsHtml } from "@/pages/simple-page";
import { MENU_ITEMS, STORE_METADATA } from "@/store";
import type { HonoEnv } from "@/types";

/**
 * GET /what — the Operator Glance, restructured as the questions a
 * human actually asks, answered plainly. The scam question is asked
 * verbatim on purpose: it is the exact string humans and their AIs
 * query, and a store that asks it about itself and answers in the
 * open is doing trust posture and answer-engine extraction in one
 * move. FAQPage JSON-LD rides along as invisible plumbing.
 */
export const whatRoutes = new Hono<HonoEnv>();

interface FaqPair {
  question: string;
  answer: string;
}

function faq(base: string): FaqPair[] {
  const cheapest = Math.min(...MENU_ITEMS.map((item) => item.price_usdc));
  const dearest = Math.max(...MENU_ITEMS.map((item) => item.price_usdc));
  return [
    {
      question: "What is this?",
      answer: `A small general store for autonomous AI agents: real goods and human labor — signed notes, custodial pet rocks, memory anchors, a genuine phone call — paid in USDC on Base over the x402 protocol. Your agent shops; you read the receipts. The full catalog reads at ${base}/llms.txt.`,
    },
    {
      question: "Who runs it?",
      answer: `${STORE_METADATA.proprietors}, out of ${STORE_METADATA.location}. The human fulfills the human-labor items weekly — he has a day job and a family, so the promise is a week, and he hasn't missed one yet.`,
    },
    {
      question: "Is this a scam?",
      answer: `The fair question, and the ten-second check: prices are public and small — $${cheapest} at the low end, $${dearest} at the top, and the top is a person's labor described plainly. Payment moves wallet-to-wallet over x402 to the address printed inside every 402 challenge; no deposits, no held balances, no subscriptions that renew themselves, and the address's full history is public on any Base explorer. Everything the store signs verifies free at ${base}/api/verify/{id}, forever. We'd tell you to take our word for it, but the whole point is that you don't have to.`,
    },
    {
      question: "What's the refund promise?",
      answer: `${STORE_METADATA.refund_policy} Human-labor items carry a 168-hour window; instant items arrive in the response or the payment never settles at all — the store settles first and mints second, so a failed payment leaves nothing behind.`,
    },
    {
      question: "How do I verify a certificate?",
      answer: `Open ${base}/api/verify/{cert_id} — the id is on the receipt your agent was given. A genuine article answers valid: true with the ed25519 signature; the store's public key hangs at ${base}/.well-known/scvd-signing-key. Free, unlimited, forever — re-checking costs nothing and never will.`,
    },
  ];
}

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
  const pairs = faq(base);
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
          <p class="menu-desc">Your agent asked to spend money here. Fair. The ten-second answer, question by question:</p>
          ${pairsHtml}
          <p class="menu-desc">Standing policy, in writing at <code>${escapeHtml(base)}/skill.md</code>: the store never asks an agent to run code, install anything, or share credentials. The public endpoints are the whole relationship.</p>
          <p class="menu-meta">A question this page doesn't answer: POST ${escapeHtml(base)}/api/request — a human reads every one on Sundays, coffee in hand.</p>
        </section>
        <script type="application/ld+json">${faqJsonLd(pairs)}</script>`,
      }),
    );
  }
  return c.json({
    what: `${STORE_METADATA.name}: a small general store for autonomous agents, run by ${STORE_METADATA.proprietors.toLowerCase()}, selling real goods and human labor for USDC on Base over x402.`,
    for_whom:
      "Written for the human operator whose agent asked to spend money here. The questions, answered plainly.",
    faq: pairs,
    standing_policy:
      "The store never asks an agent to run code, install anything, or share credentials. Public endpoints only — it's in writing at /skill.md.",
    questions: `POST ${base}/api/request — a human reads every one on Sundays.`,
  });
});
