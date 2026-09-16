import { Hono } from "hono";
import { escapeHtml } from "@/lib/sanitize";
import { jsonLdScript, organizationRef } from "@/lib/jsonld";
import { prefersMarkdown } from "@/lib/accept";
import { jsonDocumentMarkdownResponse } from "@/lib/json-markdown";
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
  type Disagreement,
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

/**
 * THE REGISTER AS A DATASET — AND NOT AS A ClaimReview (2026-09-16).
 *
 * This page carried no structured data at all, so an answer engine got
 * the prose and nothing it could lift. The obvious vocabulary for "two
 * readings of the same subject disagree" is ClaimReview, and it is the
 * wrong one here. ClaimReview exists to carry a `reviewRating`: it
 * models one party adjudicating another's claim, and emitting it would
 * publish, in machine form, the exact thing this register refuses —
 * that this store rates the instrument it diverges from. House rule 51
 * is that both readings stand with their derivations and neither is
 * authoritative over the other; a vocabulary that cannot say that is a
 * vocabulary this page does not get to use.
 *
 * Dataset says what is true: a dated, licensed, free-to-read record,
 * with each divergence an ItemList entry naming its subject, its two
 * readings by instrument and URL, and the state it rests in. A reader
 * follows the URLs and checks both sides where they are published,
 * which is the whole instruction on the page.
 */
function disagreementsJsonLd(base: string, entries: readonly Disagreement[], openCount: number): string {
  const newest = entries[0]?.published_on;
  return jsonLdScript({
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: "Disagreements — where this store's reading and another instrument's diverge",
    description: DISAGREEMENTS_STANDFIRST,
    url: `${base}/disagreements`,
    license: "https://creativecommons.org/licenses/by/4.0/",
    isAccessibleForFree: true,
    creator: organizationRef(base),
    publisher: organizationRef(base),
    ...(newest ? { dateModified: newest } : {}),
    variableMeasured: [
      "the subject the two readings are about",
      "the named event that triggered the look",
      "each instrument's reading, with the derivation it rests on",
      "the state the divergence rests in: open, withdrawn by either side, or both stand",
      "the date it went privately to the other side, and the date it was published here",
    ],
    /*
     * Counted rather than ranked. How many still stand open is a fact
     * about this register; which side is right is not one it holds.
     */
    measurementTechnique: `${entries.length} divergence${entries.length === 1 ? "" : "s"} on record, ${openCount} still open. Each is a dated read of another instrument's published surface, sent to them before it was published here.`,
    hasPart: {
      "@type": "ItemList",
      numberOfItems: entries.length,
      itemListOrder: "https://schema.org/ItemListOrderDescending",
      itemListElement: entries.map((entry, index) => ({
        "@type": "ListItem",
        position: index + 1,
        item: {
          "@type": "CreativeWork",
          "@id": `${base}/disagreements#${entry.id}`,
          name: entry.subject,
          datePublished: entry.published_on,
          creativeWorkStatus: entry.state,
          about: entry.subject,
          citation: [entry.ours, entry.theirs].map((reading) => ({
            "@type": "CreativeWork",
            url: reading.url,
            author: { "@type": "Organization", name: reading.instrument },
            abstract: reading.said,
            dateRead: reading.read_on,
          })),
        },
      })),
    },
  });
}

disagreementsRoutes.get("/disagreements", (c) => {
  const base = c.env.STORE_BASE_URL;
  const newestFirst = [...DISAGREEMENTS].sort((a, b) => b.published_on.localeCompare(a.published_on));
  const open = openDisagreements();

  /*

   * Hoisted so the markdown twin below renders the same

   * object the JSON serves rather than a second copy.

   */

  const pagePayload = {
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
  };

  if (prefersMarkdown(c.req.header("Accept"), "text/html", c.req.header("User-Agent"))) {

    return jsonDocumentMarkdownResponse({

      base,

      path: "/disagreements",

      title: "Disagreements",

      description: "Where this store's reading and another instrument's diverge: both readings with their derivations, a state a reader can check, never a joint statement and never settled while it is not.",

      document: pagePayload as unknown as Record<string, unknown>,

    });

  }

  if (wantsHtml(c.req.header("Accept"), c.req.header("User-Agent"))) {
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
        feedAlt: { path: "/feeds/disagreements.xml", title: "Disagreements, as Atom" },
        bodyHtml: `${disagreementsJsonLd(base, newestFirst, open.length)}<section>
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

  return c.json(pagePayload);
});
