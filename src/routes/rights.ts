import { Hono } from "hono";
import { escapeHtml } from "@/lib/sanitize";
import { renderSimplePage, wantsHtml } from "@/pages/simple-page";
import { RIGHTS, RIGHTS_LIMIT, RIGHTS_STANDFIRST } from "@/store/rights";
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
  const payload = {
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
      redistribution_permitted: true,
      attribution_required: false,
      commercial_use_permitted: true,
      additional_licence_or_fee: null,
      keeper_words_included: true,
    },
  };
  if (!wantsHtml(c.req.header("Accept"))) {
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
        "Who owns what you bought from this x402 store, whether it transfers, and what you may do with it — including the keeper's own words, at no additional cost and under no additional licence.",
      path: "/rights",
      bodyHtml: `<section>
        <p class="menu-desc">${escapeHtml(RIGHTS_STANDFIRST)}</p>
      </section>
      <section>
        <h2>The rulings</h2>
        ${clauses}
      </section>
      <section>
        <h2>The limit</h2>
        <p class="menu-meta">${escapeHtml(RIGHTS_LIMIT)}</p>
        <p class="menu-meta">See also: <a href="/attestation">what a signature proves</a>, and <a href="/wind-down">what happens if the lights go off</a>. This page is the middle of those two.</p>
      </section>`,
    }),
  );
});
