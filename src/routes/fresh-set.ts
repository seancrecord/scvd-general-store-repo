import { Hono } from "hono";
import { jsonLdScript, organizationRef } from "@/lib/jsonld";
import { escapeHtml } from "@/lib/sanitize";
import { renderSimplePage, wantsHtml } from "@/pages/simple-page";
import { buildFreshSet, type FreshSet, type FreshSetRow } from "@/services/fresh-set";
import type { HonoEnv } from "@/types";
import { CORRECTIONS_POINTER } from "@/store/corrections";

/**
 * GET /fresh-set — the walkable set, served. One door, two dialects:
 * agents get the full JSON (the routing surface), eyes get the page.
 *
 * The HTML renders a bounded sample of the rows and points at the
 * JSON for the whole set — a reader deciding whether to trust the
 * surface needs the method and a taste of the data; a router needs
 * every row and no prose. Splitting the caps keeps both honest.
 */
export const freshSetRoutes = new Hono<HonoEnv>();

/** Rows rendered into HTML. The JSON carries up to FRESH_SET_ROW_CAP. */
const HTML_ROW_CAP = 100;

function rowHtml(row: FreshSetRow): string {
  const rails = row.rails?.length ? row.rails.join(", ") : "&mdash;";
  const ask =
    row.min_usdc !== undefined ? `$${row.min_usdc}` : "&mdash;";
  return `<tr>
    <td>${escapeHtml(row.host)}</td>
    <td>${escapeHtml(rails === "&mdash;" ? "" : rails) || "&mdash;"}</td>
    <td>${escapeHtml(ask)}</td>
    <td><a href="${escapeHtml(row.history_url)}">history</a></td>
  </tr>`;
}

function freshSetDatasetJsonLd(base: string, set: FreshSet): string {
  const dataset = {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: "The fresh set — x402 doors that answered a conformant challenge this week",
    description:
      "The public x402 endpoints that answered a spec-conformant payment challenge in the latest weekly census, each with the rails and cheapest USDC ask its own 402 offered, and a link to its signed observation history. Dated observations, never scores; failing doors are counted in aggregates and never named.",
    url: `${base}/fresh-set`,
    license: "https://creativecommons.org/licenses/by/4.0/",
    isAccessibleForFree: true,
    creator: organizationRef(base),
    temporalCoverage: set.week,
    dateModified: set.observed_at,
    variableMeasured: [
      {
        "@type": "PropertyValue",
        name: "doors answering a spec-conformant x402 challenge",
        value: set.aggregates.ready,
      },
      {
        "@type": "PropertyValue",
        /*
         * H2's lesson, kept here too: `probed` includes revisit rows
         * — doors no feed named THIS round, walked from an earlier
         * listing — so "listed doors" was the substitution the
         * per-host page already corrected.
         */
        name: "doors probed (named by a feed this round, or revisited from an earlier listing)",
        value: set.aggregates.probed,
      },
    ],
    distribution: {
      "@type": "DataDownload",
      encodingFormat: "application/json",
      contentUrl: `${base}/fresh-set`,
    },
    isBasedOn: `${base}/corpus`,
  };
  return jsonLdScript(dataset);
}

freshSetRoutes.get("/fresh-set", async (c) => {
  const base = c.env.STORE_BASE_URL;
  const set = await buildFreshSet(c.env);
  if (!wantsHtml(c.req.header("Accept"), c.req.header("User-Agent"))) {
    if (!set) {
      return c.json(
        {
          rows: [],
          corrections: CORRECTIONS_POINTER,
          note: "No census round has completed yet; the first walk populates this surface.",
        },
        200,
      );
    }
    return c.json({ ...set, corrections: CORRECTIONS_POINTER });
  }

  const bodyHtml = set
    ? `<section>
    <p class="menu-desc">${escapeHtml(set.what_this_is)} Observed week
    ${escapeHtml(set.week)}. <strong>Free.</strong> The full set is this same
    URL as JSON (<code>Accept: application/json</code>) &mdash; up to
    ${set.rows.length >= HTML_ROW_CAP ? "the row cap" : "every row"}, no
    account, no key.</p>
    <p class="menu-desc">${escapeHtml(set.what_this_is_not)} The
    <a href="/registry">registry tally</a> publishes what the failures add up
    to, without names; this page is the other half of that bargain &mdash;
    names appear only on the ready side.</p>
  </section>
  <section>
    <h2>Week ${escapeHtml(set.week)}: ${set.aggregates.ready} doors answered</h2>
    <p class="menu-meta">${set.aggregates.probed} doors probed (named by a
    feed this round, or revisited from an earlier listing):
    ${set.aggregates.ready} answered a conformant challenge,
    ${set.aggregates.not_ready} answered something that was not one,
    ${set.aggregates.unreachable} did not answer at all.
    ${set.coverage.walk && set.coverage.walk.walked < set.coverage.walk.roster ? `The week ended before the walk did (${set.coverage.walk.walked} of ${set.coverage.walk.roster} rostered doors walked).` : ""}
    ${set.coverage.coverage_suspect ? "The discovery feed's own coverage was suspect this round; the denominator may undercount." : ""}</p>
    <table border="1" cellpadding="6">
      <tr><th>door</th><th>rails offered</th><th>cheapest USDC ask</th><th>signed history</th></tr>
      ${set.rows.slice(0, HTML_ROW_CAP).map(rowHtml).join("\n")}
    </table>
    ${set.rows.length > HTML_ROW_CAP ? `<p class="menu-meta">${set.rows.length - HTML_ROW_CAP} more rows in the JSON dialect of this URL.</p>` : ""}
  </section>
  <section>
    <h2>Method, and what a row does not say</h2>
    <p class="menu-meta">One signed GET per host per week (Web Bot Auth; the
    knock is verifiable in your own logs at <a href="/bot-auth">/bot-auth</a>),
    reading the door's 402 challenge against the x402 v2 spec. No purchase is
    made, so a row says nothing about delivery, settlement, or the seller
    behind the door &mdash; it says the door was answering correctly at a
    dated moment, which is where routing starts, not where trust ends. Rails
    and asks are read from the door's own challenge header, never recomputed.
    Every row links its host's full dated history, replayed from the signed,
    Bitcoin-anchored <a href="/corpus">corpus</a>${set.evidence.corpus_sequence ? ` (this week is frozen as sequence ${set.evidence.corpus_sequence})` : ""}.</p>
    <p class="menu-meta">If your door should be here and is not: check it
    free with <code>POST ${escapeHtml(base)}/api/preflight</code> &mdash; the
    same battery the census runs, on demand.</p>
  </section>
  ${freshSetDatasetJsonLd(base, set)}`
    : `<section><h2>No round yet</h2>
    <p class="menu-desc">The census walks weekly; the first completed walk
    populates this surface. The machinery is described on
    <a href="/registry">the registry page</a>.</p></section>`;

  return c.html(
    renderSimplePage({
      title: "The fresh set",
      description:
        "The x402 doors that answered a spec-conformant payment challenge in the latest weekly census — dated, with rails and asks, every row citing its signed history.",
      path: "/fresh-set",
      bodyHtml,
    }),
  );
});
