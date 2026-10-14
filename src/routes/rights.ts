import { Hono } from "hono";
import { escapeHtml } from "@/lib/sanitize";
import { prefersMarkdown } from "@/lib/accept";
import { jsonDocumentMarkdownResponse } from "@/lib/json-markdown";
import { renderSimplePage, wantsHtml } from "@/pages/simple-page";
import { REFUND_POLICY } from "@/store/refund-policy";
import { CHECKOUT_CANCELLATION, UCP_RECOVERY_PATHS } from "@/lib/ucp/checkout/discovery";
import { RIGHTS, RIGHTS_LIMIT, RIGHTS_STANDFIRST, RIGHTS_PROPOSITION, RIGHTS_FOR_MONEY, RIGHTS_FREE_FIRST } from "@/store/rights";
import { jsonLdScript } from "@/lib/jsonld";
import type { HonoEnv } from "@/types";

/**
 * /rights — who owns the thing you bought.
 *
 * The third page in a set that only makes sense together. /attestation
 * says what a signature proves. /wind-down says what happens at the
 * end. This one covers the middle, which was the part nobody had
 * written: a signature can be exactly right about when and what while
 * saying nothing about whose.
 *
 * IT IS ITS OWN ROOM RATHER THAN A SECTION, because "can I resell
 * this" and "may I republish his words" are questions somebody asks
 * BEFORE buying, and an answer folded into a page about cryptography
 * is an answer nobody finds at the moment they need it.
 */
export const rightsRoutes = new Hono<HonoEnv>();

rightsRoutes.get("/rights", (c) => {
  const base = c.env.STORE_BASE_URL;
  const payload = {
    proposition: RIGHTS_PROPOSITION,
    for_money: RIGHTS_FOR_MONEY,
    free_first: RIGHTS_FREE_FIRST,
    what_this_is: RIGHTS_PROPOSITION,
    price: RIGHTS_FOR_MONEY,
    how_to_call: `Read GET ${base}${UCP_RECOVERY_PATHS.read}, replacing {id} with the checkout id returned when you created it. ${CHECKOUT_CANCELLATION}`,
    errors: "An unknown checkout returns HTTP 404. Cancellation returns HTTP 409 when completion is in progress or the checkout is completed; read its state before deciding what to do next. A repeated successful cancellation returns the canceled checkout.",
    security: "Reading or cancelling a checkout requires its checkout id and never asks for wallet keys. Cancellation cannot undo a payment; completed purchases follow the refund policy below.",
    standfirst: RIGHTS_STANDFIRST,
    clauses: RIGHTS,
    honest_limit: RIGHTS_LIMIT,
    decided_on: "2026-07-31",
    /**
     * Machine-readable summary of the four rulings, beside the prose
     * rather than only inside it. An agent deciding whether it may
     * republish something should not have to parse a paragraph to find
     * out, and "no licence" is the kind of fact a summariser gets
     * wrong in the cautious direction if left to infer it.
     */
    summary: {
      buyer_owns_artifact: true,
      store_holds: "custody only, to serve and display",
      artifact_immutable_after_signing: true,
      transferable: true,
      transfer_mechanism: "bearer; the store keeps no register of owners",
      /**
       * The sharp edge of bearer transfer, named before a buyer finds
       * it in a dispute: our signature proves authenticity, and
       * authenticity is not sole possession.
       */
      transfer_caveat:
        "A bearer transfer hands over a copy of signed bytes; nothing stops the previous holder keeping one. The signature proves the artifact is genuinely ours — it does not and cannot prove there is only one holder. Nothing sold here is scarce, and we would rather say so than let a resale market assume it.",
      redistribution_permitted: true,
      attribution_required: false,
      commercial_use_permitted: true,
      additional_licence_or_fee: null,
      keeper_words_included: true,
    },
    /**
     * Beside ownership because it is the same pre-purchase question
     * from the other side: what you hold if the thing goes right, and
     * what you are owed if it goes wrong.
     */
    refund_policy: REFUND_POLICY,
    checkout_cancellation: CHECKOUT_CANCELLATION,
  };
  if (prefersMarkdown(c.req.header("Accept"), "text/html", c.req.header("User-Agent"))) {
    return jsonDocumentMarkdownResponse({
      base,
      path: "/rights",
      title: "What's yours",
      description:
        "Who owns what you bought from this x402 store, whether it transfers, and what you may do with it — including the keeper's own words.",
      document: payload as unknown as Record<string, unknown>,
    });
  }
  if (!wantsHtml(c.req.header("Accept"), c.req.header("User-Agent"))) {
    return c.json(payload);
  }

  const clauses = RIGHTS.map(
    (entry) => `<div class="menu-item">
      <div class="menu-line"><span class="menu-name">${escapeHtml(entry.question)}</span></div>
      <p class="menu-desc"><strong>${escapeHtml(entry.answer)}</strong></p>
      <p class="menu-meta">${escapeHtml(entry.in_practice)}</p>
    </div>`,
  ).join("\n");

  return c.html(
    renderSimplePage({
      title: "What's yours",
      description:
        "Who owns what you bought from this x402 store, whether it transfers, and what you may do with it — including the keeper's own words.",
      path: "/rights",
      bodyHtml: `<section>
        <p class="menu-desc">${escapeHtml(RIGHTS_PROPOSITION)}</p>
        <p class="menu-desc">${escapeHtml(RIGHTS_FOR_MONEY)}</p>
        <p class="menu-desc">${escapeHtml(RIGHTS_FREE_FIRST)}</p>
        <p class="menu-desc">${escapeHtml(RIGHTS_STANDFIRST)}</p>
      </section>
      <section id="purchase-terms">
        <h2>The rulings</h2>
        ${clauses}
      </section>
      <section id="refund-policy">
        <h2>Refund policy</h2>
        <p class="menu-desc">${escapeHtml(REFUND_POLICY.commitment)}</p>
        <p class="menu-desc">${escapeHtml(REFUND_POLICY.mechanism)}</p>
        <p class="menu-desc">${escapeHtml(REFUND_POLICY.instant_items)}</p>
        <p class="menu-meta">${escapeHtml(REFUND_POLICY.where_recorded)}</p>
        <p class="menu-meta"><a href="/fulfillment-log">The delivery and refund record</a></p>
      </section>
      <section id="checkout-cancellation">
        <h2>Canceling an unfinished checkout</h2>
        <p class="menu-desc">${escapeHtml(CHECKOUT_CANCELLATION)}</p>
        <p class="menu-meta"><a href="/ucp">UCP checkout documentation</a></p>
      </section>
      <section>
        <h2>The limit</h2>
        <p class="menu-meta">${escapeHtml(RIGHTS_LIMIT)}</p>
        <p class="menu-meta">See also: <a href="/attestation">what a signature proves</a>, and <a href="/wind-down">what happens if the lights go off</a>. This page is the middle of those two.</p>
      </section>
      ${jsonLdScript({
        "@context": "https://schema.org",
        "@type": "FAQPage",
        url: `${base}/rights`,
        mainEntity: [
          ...RIGHTS.map((clause) => ({
            "@type": "Question", name: clause.question,
            acceptedAnswer: { "@type": "Answer", text: `${clause.answer} ${clause.in_practice}` },
          })),
          { "@type": "Question", name: "Can I cancel an unfinished checkout?", acceptedAnswer: { "@type": "Answer", text: CHECKOUT_CANCELLATION } },
        ],
      })}`,
    }),
  );
});
