import { Hono } from "hono";
import { escapeHtml } from "@/lib/sanitize";
import { renderSimplePage, wantsHtml } from "@/pages/simple-page";
import { ladderRung } from "@/services/menu-markdown";
import { PREFLIGHT_VERSION_NEXT } from "@/services/preflight";
import { getMenuItem } from "@/store";
import type { HonoEnv } from "@/types";

/**
 * FOR OPERATORS (2026-09-03, the ROI list's item 5). Every item on
 * the shelf with a real ticket is bought by somebody who RUNS a door,
 * and until today none of them had a front door of its own: an
 * operator arriving here met the whole shelf, novelties and all, in
 * the order it was built. This room is the seller's side in the
 * order a launch actually happens, free instrument first in every
 * section, every price read off the shelf at request.
 *
 * DERIVED, NOT TYPED (rule 46). The stages are editorial — which
 * item belongs to which moment is a judgment no field on MenuItem
 * holds — but everything a stage asserts about an item (that it
 * exists, its name, its price, its cadence) is read from the menu
 * through ladderRung, and an id that leaves the shelf drops out of
 * the stage rather than printing a rung to nowhere; a test holds the
 * stage lists to the shelf.
 */
export const operatorsRoutes = new Hono<HonoEnv>();

export interface OperatorStage {
  moment: string;
  question: string;
  /** The free instrument that answers first, when one does. */
  free: { name: string; how: (base: string) => string } | null;
  /** Shelf ids, in the order to consider them. */
  items: readonly string[];
}

export const OPERATOR_STAGES: readonly OperatorStage[] = [
  {
    moment: "Before you launch",
    question: "Does my door serve a 402 a stock client can actually pay?",
    free: {
      name: "The preflight",
      how: (base) => `POST ${base}/api/preflight/${PREFLIGHT_VERSION_NEXT} with {"url": "..."} — one probe, every check by name, free. The same check as a GitHub Action: seancrecord/scvd-general-store-repo/action/preflight, which fails your deploy on not_ready.`,
    },
    items: ["launch_check", "opening_day", "onpage_audit"],
  },
  {
    moment: "The week you launch",
    question: "Can a buyer see that somebody outside looked?",
    free: {
      name: "The passport",
      how: (base) => `${base}/passport/{your-host} — issued from the Sunday census once your door is on the ready side; the chip on that page is the thing to paste in a README, and it goes dark rather than stale.`,
    },
    items: ["passport_refresh", "service_audit"],
  },
  {
    moment: "Standing",
    question: "Will I know when it breaks, and can I show a partner what moved through it?",
    free: {
      name: "Your history",
      how: (base) => `${base}/corpus/host/{your-host}.json — every signed round that met your door, the gaps named, free forever.`,
    },
    items: ["standing_watch", "conformance_watch", "operator_statement", "trust_profile"],
  },
  {
    moment: "When something goes wrong",
    question: "What did a neutral party see, and what does a cold buyer meet at my door?",
    free: {
      name: "The look",
      how: (base) => `POST ${base}/api/look/v1 with {"url": "..."} — the live probe folded with everything the chain holds about your host, free.`,
    },
    items: ["the_case_file", "aura_walk"],
  },
];

/** Stage ids that are not on the shelf: must be empty, and a test says so. */
export function unshelvedOperatorItems(): string[] {
  return OPERATOR_STAGES.flatMap((stage) => stage.items).filter((id) => !getMenuItem(id));
}

function stages(base: string) {
  return OPERATOR_STAGES.map((stage) => ({
    moment: stage.moment,
    question: stage.question,
    ...(stage.free ? { free_first: { name: stage.free.name, how: stage.free.how(base) } } : {}),
    on_the_shelf: stage.items
      .map((id) => ladderRung(base, id, getMenuItem(id)?.subtitle ?? getMenuItem(id)?.description ?? ""))
      .filter((rung): rung is Record<string, unknown> => rung !== null),
  }));
}

const STANDFIRST =
  "You run an x402 door. This is the shelf from your side, in the order a launch happens: what is free first at each moment, and what is for sale when you need it signed, dated and servable to somebody else. Every price here is read off the shelf when the page is served; the 402 at the door is the only price that binds.";

const NOT =
  "Nothing here ranks you, scores you, or certifies you. Every paid item is a dated observation with its derivation and denominator beside it, signed so a stranger can check it without asking us, and it names what it did not see. Nothing charges again by itself: term items end on their date and say how to buy another.";

operatorsRoutes.get("/operators", (c) => {
  const base = c.env.STORE_BASE_URL;
  const rows = stages(base);
  if (!wantsHtml(c.req.header("Accept"))) {
    return c.json({
      title: "For operators",
      summary: STANDFIRST,
      stages: rows,
      what_this_is_not: NOT,
      all_items: `${base}/menu.json`,
      how_paying_works: `${base}/how-it-works`,
    });
  }
  const sections = rows
    .map(
      (stage) => `<section>
      <h2>${escapeHtml(stage.moment)}</h2>
      <p class="menu-desc"><em>${escapeHtml(stage.question)}</em></p>
      ${stage.free_first ? `<p class="menu-desc"><strong>Free first — ${escapeHtml(stage.free_first.name)}.</strong> ${escapeHtml(stage.free_first.how)}</p>` : ""}
      <ul class="menu-desc">${stage.on_the_shelf
        .map(
          (rung) =>
            `<li><a href="/menu/${escapeHtml(String(rung["id"]))}"><strong>${escapeHtml(String(rung["name"]))}</strong></a> — ${escapeHtml(String(rung["why"]))} <em>${escapeHtml(String(rung["price"]))}</em></li>`,
        )
        .join("")}</ul>
    </section>`,
    )
    .join("\n");
  return c.html(
    renderSimplePage({
      title: "For operators",
      description:
        "The shelf from the seller's side, in the order a launch happens: what is free first at each moment, and what is for sale when you need it signed and servable. Never a score.",
      path: "/operators",
      bodyHtml: `<section>
        <p class="menu-desc">${escapeHtml(STANDFIRST)}</p>
      </section>
      ${sections}
      <section>
        <p class="menu-desc"><strong>${escapeHtml(NOT)}</strong></p>
        <p class="menu-meta">The whole shelf: <a href="/menu.json"><code>/menu.json</code></a>. How paying works, order of operations included: <a href="/how-it-works">/how-it-works</a>. JSON twin of this page at the same URL with <code>Accept: application/json</code>.</p>
      </section>`,
    }),
  );
});
