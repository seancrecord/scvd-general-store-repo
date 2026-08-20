import { Hono } from "hono";
import { CENSUS_FINDING, CENSUS_WHY_IT_MATTERS } from "@/store/copy/census";
import { escapeHtml } from "@/lib/sanitize";
import { renderSimplePage, wantsHtml } from "@/pages/simple-page";
import type { HonoEnv } from "@/types";

/**
 * GET /corpus — the crawlable landing beside /corpus.json.
 *
 * The corpus has published as a machine Dataset since it began, and
 * the route said out loud that a human room was the keeper's call and
 * had not been made. The call came 2026-08-10, from the same finding
 * that built /conformance: five outside models asked "what is
 * scvd.store" and none of them found the corpus, because a JSON file
 * with no landing page is invisible to everything that learns from
 * pages. This room says what the record is, what it has found, and
 * how to check it — the data itself still lives at /corpus.json and
 * only there, so the two cannot disagree about contents.
 */
export const corpusLandingRoutes = new Hono<HonoEnv>();

function landingJson(base: string) {
  return {
    what_this_is:
      "Weekly signed observations of the x402 ecosystem: which listed hosts answered, and what one conformance probe saw at that moment. Hash-chained, ed25519-signed, each digest submitted to OpenTimestamps for Bitcoin anchoring. Free to read.",
    census: CENSUS_FINDING,
    data: `${base}/corpus.json`,
    per_host: `${base}/corpus/host/{host}.json`,
    how_to_verify: `Printed on the document itself, at ${base}/corpus.json — recompute the digests, check the signatures against the published key, and run ots verify on evidence that is not ours.`,
  };
}

/**
 * The Dataset markup, ON THE HTML PAGE (2026-08-18, the AEO
 * straggler). /corpus.json has carried schema.org Dataset since it
 * began — but dataset crawlers read HTML pages, not JSON endpoints,
 * so the one surface that made the corpus findable as a dataset was
 * the one surface that never declared it. The node here names the
 * data's real home; the two cannot disagree about contents because
 * this page holds none.
 */
function corpusDatasetJsonLd(base: string): string {
  const dataset = {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: "The scvd corpus — weekly observations of the public x402 ecosystem",
    description:
      "One snapshot per weekly ward round of the public x402 discovery list: which hosts were listed, which answered, and what a single conformance probe saw at that moment. Hash-chained, ed25519-signed, each digest submitted to OpenTimestamps for Bitcoin anchoring. Dated observations of moments, never scores on operators.",
    url: `${base}/corpus`,
    sameAs: `${base}/corpus.json`,
    license: "https://creativecommons.org/licenses/by/4.0/",
    isAccessibleForFree: true,
    creator: { "@type": "Organization", name: "scvd.store", url: base },
    distribution: {
      "@type": "DataDownload",
      encodingFormat: "application/json",
      contentUrl: `${base}/corpus.json`,
    },
  };
  return `<script type="application/ld+json">${JSON.stringify(dataset)}</script>`;
}

function landingHtml(base: string): string {
  return `<section>
      <p class="menu-desc"><strong>Weekly signed observations of the x402 ecosystem. Hash-chained. Bitcoin-anchored. Free to read.</strong></p>
      <p class="menu-desc">Once a week this store walks the public x402 discovery list and freezes what it saw: which hosts were listed, which answered, and what a single conformance probe found at that moment. Each snapshot is ed25519-signed, chained to the one before it by hash, and its digest is submitted to OpenTimestamps for anchoring into Bitcoin — so the record provably existed when we say it did, on evidence this store does not control.</p>
      <p class="menu-desc">A continuous record like this cannot be backfilled later at any price, which is the whole reason to keep it now.</p>
    </section>
    <section>
      <h2>What it has found</h2>
      <p class="menu-desc">${escapeHtml(CENSUS_FINDING)}</p>
      <p class="menu-desc">${escapeHtml(CENSUS_WHY_IT_MATTERS)}</p>
      <p class="menu-desc">The rounds since then track the same population week over week: newly failing hosts, newly fixed ones, flappers, and hosts leaving or rejoining the discovery list — with every coverage caveat recorded inside the round it applies to.</p>
    </section>
    <section>
      <h2>Reading it</h2>
      <p class="menu-desc">The whole record, with the live chain check and the verification steps printed on the document itself: <a href="/corpus.json"><code>/corpus.json</code></a>.</p>
      <p class="menu-desc">One host's history, replayed from the signed chain: <code>/corpus/host/{host}.json</code>. Every round we have no verdict for carries a reason — no feed named the host, a feed named it but the round did not reach it, or the instrument itself was degraded that week. The gaps are the point: a timeline with the misses left out reads as continuous coverage, and this one refuses to.</p>
      <p class="menu-desc">Verification needs nothing from us: recompute any snapshot's sha256, check the signature against the key at <a href="/.well-known/scvd-signing-key"><code>/.well-known/scvd-signing-key</code></a>, walk the previous_digest chain back to the first entry, and run <code>ots verify</code> on the Bitcoin-anchored proof. The exact steps, field order included, ride on <a href="/corpus.json"><code>/corpus.json</code></a> itself.</p>
    </section>
    <section>
      <h2>What it is not</h2>
      <p class="menu-desc">Not a rating, not a ranking, and never a score on any operator. Each entry records what one probe saw at one moment. Dividing rounds-ready by rounds-probed is one step away and it is an accumulating score on an actor, which is the thing this store does not keep on anyone — the dated observations are all there; that ratio is withheld deliberately, not forgotten.</p>
      <p class="menu-desc">The observations are ours: one instrument, weekly cadence, the hosts the discovery list declared. The chain proves the record has not been rewritten; it cannot prove a round saw everything, and each round says so itself where its coverage fell short.</p>
    </section>
    <section>
      <p class="menu-meta">The externally anchored chain over this store's own signing keys, kept by the same mechanism: <a href="/.well-known/anchor-log.json"><code>/.well-known/anchor-log.json</code></a>. The conformance battery every probe runs is the same one the free desk serves at <a href="/conformance">/conformance</a>.</p>
    </section>`;
}

corpusLandingRoutes.get("/corpus", (c) => {
  const base = c.env.STORE_BASE_URL;
  if (wantsHtml(c.req.header("Accept"))) {
    return c.html(
      renderSimplePage({
        title: "The corpus",
        description:
          "Weekly signed observations of the x402 ecosystem — which listed hosts answered and what a conformance probe saw. Hash-chained, ed25519-signed.",
        path: "/corpus",
        bodyHtml: `${landingHtml(base)}\n${corpusDatasetJsonLd(base)}`,
      }),
    );
  }
  return c.json(landingJson(base));
});
