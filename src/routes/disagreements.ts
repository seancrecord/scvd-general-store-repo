import { Hono } from "hono";
import { escapeHtml } from "@/lib/sanitize";
import { renderSimplePage, wantsHtml } from "@/pages/simple-page";
import { CORRECTIONS_POINTER } from "@/store/corrections";
import {
  COUNTERPART,
  DISAGREEMENTS,
  DISAGREEMENTS_NOT,
  DISAGREEMENTS_PRIVATE_FIRST,
  DISAGREEMENTS_STANDFIRST,
  DISAGREEMENTS_STATES,
  DISAGREEMENTS_TRIGGERED,
  disagreementsNoneOpenLine,
  openDisagreements,
} from "@/store/disagreements";
import type { HonoEnv } from "@/types";

/**
 * GET /disagreements — the public disagreement record (house rule 51).
 * Mechanism above the list, like /corrections: what a state means
 * goes first, because a list of divergences read without it reads as
 * a quarrel. Words live in src/store/disagreements.ts.
 */
export const disagreementsRoutes = new Hono<HonoEnv>();

const STATE_WORDS: Record<string, string> = {
  open: "open — both readings stand",
  withdrawn_by_us: "withdrawn by us",
  withdrawn_by_them: "withdrawn by them",
  both_stand: "both stand, re-read",
};

disagreementsRoutes.get("/disagreements", (c) => {
  const base = c.env.STORE_BASE_URL;
  const newestFirst = [...DISAGREEMENTS].sort((a, b) => b.published_on.localeCompare(a.published_on));
  const open = openDisagreements();

  if (wantsHtml(c.req.header("Accept"))) {
    const reading = (label: string, r: (typeof DISAGREEMENTS)[number]["ours"]) =>
      `<p class="menu-desc"><strong>${escapeHtml(label)} (${escapeHtml(r.instrument)}) said:</strong> ${escapeHtml(r.said)}</p>
       <p class="menu-meta">Derivation: ${escapeHtml(r.derivation)} Published at <a href="${escapeHtml(r.url)}">${escapeHtml(r.url)}</a>, read ${escapeHtml(r.read_on)}.</p>`;
    const rows = newestFirst
      .map(
        (entry) => `<div class="menu-item" id="${escapeHtml(entry.id)}">
        <div class="menu-line">
          <span class="menu-name">${escapeHtml(entry.published_on)}</span>
          <span class="menu-meta">${escapeHtml(STATE_WORDS[entry.state] ?? entry.state)}</span>
        </div>
        <p class="menu-desc"><strong>About:</strong> ${escapeHtml(entry.subject)}</p>
        <p class="menu-desc"><strong>Trigger:</strong> ${escapeHtml(entry.trigger)}</p>
        ${reading("We", entry.ours)}
        ${reading("They", entry.theirs)}
        <p class="menu-desc"><strong>Where it stands:</strong> ${escapeHtml(entry.state_rests_on)}${entry.correction_date ? ` <a href="/corrections">Correction of ${escapeHtml(entry.correction_date)}.</a>` : ""}</p>
        <p class="menu-meta">Sent to the other side ${escapeHtml(entry.sent_privately_on)}; published here ${escapeHtml(entry.published_on)}.</p>
      </div>`,
      )
      .join("\n");

    return c.html(
      renderSimplePage({
        title: "Disagreements",
        description:
          "Where this store's reading and another instrument's diverge: both readings with their derivations, a state a reader can check, never a joint statement and never settled while it is not.",
        path: "/disagreements",
        bodyHtml: `<section>
          <p class="menu-desc">${escapeHtml(DISAGREEMENTS_STANDFIRST)}</p>
          <p class="menu-desc"><strong>${escapeHtml(DISAGREEMENTS_STATES)}</strong></p>
          <p class="menu-desc">${escapeHtml(DISAGREEMENTS_TRIGGERED)}</p>
          <p class="menu-desc">${escapeHtml(DISAGREEMENTS_PRIVATE_FIRST)}</p>
        </section>
        <section>
          <p class="menu-desc">${open.length === 0 ? escapeHtml(disagreementsNoneOpenLine()) : `${open.length} of ${DISAGREEMENTS.length} on record still stand${open.length === 1 ? "s" : ""} open.`}</p>
          ${rows}
        </section>
        <section>
          <p class="menu-desc"><strong>The other side.</strong> ${escapeHtml(COUNTERPART.their_side)} The arrangement: ${escapeHtml(COUNTERPART.arrangement)}.</p>
          <p class="menu-desc">${escapeHtml(DISAGREEMENTS_NOT)}</p>
          <p class="menu-meta">Where a reading of ours was withdrawn, the correction is on <a href="/corrections">/corrections</a>; the shared vocabulary and its dated cross-instrument mappings are on <a href="/defects">/defects</a>.</p>
        </section>`,
      }),
    );
  }

  return c.json({
    title: "Disagreements",
    summary: DISAGREEMENTS_STANDFIRST,
    states: DISAGREEMENTS_STATES,
    triggered_not_scheduled: DISAGREEMENTS_TRIGGERED,
    private_first: DISAGREEMENTS_PRIVATE_FIRST,
    counterpart: COUNTERPART,
    open: open.length,
    on_record: DISAGREEMENTS.length,
    none_open: open.length === 0 ? disagreementsNoneOpenLine() : undefined,
    disagreements: newestFirst.map((entry) => ({ ...entry })),
    what_this_is_not: DISAGREEMENTS_NOT,
    disagreements_url: `${base}/disagreements`,
    vocabulary: `${base}/defects`,
    corrections: CORRECTIONS_POINTER,
  });
});
