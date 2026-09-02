import { Hono } from "hono";
import { CENSUS_FINDING, CENSUS_WHY_IT_MATTERS } from "@/store/copy/census";
import { jsonLdScript, organizationRef } from "@/lib/jsonld";
import { escapeHtml } from "@/lib/sanitize";
import { renderSimplePage, wantsHtml } from "@/pages/simple-page";
import { deriveWalletFacts, type WalletFacts } from "@/services/operator-facts";
import { listCorpus } from "@/services/corpus";
import type { HonoEnv } from "@/types";
import { NEVER_A_RANKING_SENTENCE } from "@/store/copy/doctrine";

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
    every_door_listed: `${base}/doors.json`,
    per_host: `${base}/corpus/host/{host}.json`,
    weekly_brief: `${base}/corpus/brief`,
    as_time: `${base}/corpus/trajectory.json`,
    since_diff: `${base}/corpus/diff.json?since={week}`,
    wallet_facts: `${base}/corpus/wallet-facts.json`,
    battery_delta: `${base}/corpus/battery-delta.json`,
    standing_notes: `${base}/api/standing-note`,
    how_to_verify: `Printed on the document itself, at ${base}/corpus.json — recompute the digests, check the signatures against the published key, and run ots verify on evidence that is not ours.`,
    /*
     * This body hands a machine a FINDING (census, above) and the
     * address of every other corpus door. Signed history is never
     * retro-edited here, so a reader standing on a claim has to be
     * able to reach the record of what we later found wrong from the
     * claim itself — and this is the door that names all the others.
     */
    corrections: `${base}/corrections`,
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
    creator: organizationRef(base),
    distribution: {
      "@type": "DataDownload",
      encodingFormat: "application/json",
      contentUrl: `${base}/corpus.json`,
    },
  };
  return jsonLdScript(dataset);
}

/**
 * THE FINDING IS WOVEN, NOT BOLTED ON (keeper, 2026-08-29: "Yes or
 * weave it into an existing place").
 *
 * It was drafted in August as a Gazette line and never ran, because
 * the Gazette had retired three weeks before the draft was written.
 * The keeper caught that from a phone. What survived the strike is
 * the finding itself, which is real and had never been said anywhere
 * a person reads.
 *
 * DERIVED, NOT FROZEN, and the original draft said why in its own
 * margin: "the number will move each week and the line should quote
 * the live surface, not freeze it." A sentence carrying 544 and 78
 * and 60 as typed constants is a sentence that starts rotting on
 * Sunday. So the paragraph interpolates the same reading
 * /corpus/wallet-facts.json serves, and when the chain holds nothing
 * yet it says what it can without inventing a figure — the same
 * contract every other derived surface here keeps.
 */
function landingHtml(base: string, facts: WalletFacts | null): string {
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
      <p class="menu-desc">Which doors are in it: <a href="/doors">every door we have checked</a>, one entry each with the most recent dated observation and a link to its full history &mdash; <a href="/doors.json"><code>/doors.json</code></a> for the machine copy. Alphabetical, never ranked. That list is newer than the record it reads: until 2026-08-29 this index named the snapshots and the per-host template, and nothing anywhere answered &ldquo;which hosts do you have?&rdquo;</p>
      <p class="menu-desc">One host's history, replayed from the signed chain: <code>/corpus/host/{host}.json</code>. Every round we have no verdict for carries a reason — no feed named the host, a feed named it but the round did not reach it, or the instrument itself was degraded that week. The gaps are the point: a timeline with the misses left out reads as continuous coverage, and this one refuses to.</p>
      <p class="menu-desc">The week, on one page: <a href="/corpus/brief">The Week's Doors</a> &mdash; doors named, probed, payable and not, defects by name, and the gaps counted against us, read from the latest signed snapshot. Quotable, dated, never a ranking; <code>?week=</code> names an earlier one.</p>
      <p class="menu-desc">The chain read as time: <a href="/corpus/trajectory.json"><code>/corpus/trajectory.json</code></a> serves one point per signed week — counts with their denominators, never a ratio, every point naming the digest it derives from. What changed since a week you already saw: <code>/corpus/diff.json?since={week}</code> — doors appeared and disappeared, verdict transitions, and drift in a door's own declared terms. A week the chain does not hold gets a 404 naming the weeks it does.</p>
      <p class="menu-desc">What our own stricter battery catches that the frozen one misses: <a href="/corpus/battery-delta.json"><code>/corpus/battery-delta.json</code></a> counts, per signed week and overall, how many doors <code>v1</code> would have called ready that <code>v2</code> caught. It is a scorecard for our own instrument and it is published on the same terms as the gaps we count against ourselves &mdash; including when the number is zero. Whether <code>v2</code> should become the headline battery everywhere is a separate question the count does not settle, because that change renames the criteria on every artifact this store has already signed.</p>
      <p class="menu-desc">Wallet facts, counted and never judged: <a href="/corpus/wallet-facts.json"><code>/corpus/wallet-facts.json</code></a> says how many receiving addresses the week's doors advertised and how many receive at more than one door — counts only, no names, no addresses, and never an operator claim.${
        facts
          ? ` <strong>This week: ${facts.distinct_addresses} distinct receiving addresses across ${facts.hosts_with_pay_to} doors that advertised one, ${facts.addresses_at_multiple_doors} of them receiving at more than one door, and the largest single cluster fronting ${facts.largest_cluster_doors}.</strong> Those figures move every Sunday and are read from the latest signed week as this page was served, not typed into it.`
          : " The chain holds no signed week yet, so there is nothing to count over — this sentence fills with the first ward round rather than quoting a number we do not have."
      } Each door's own page carries its <code>payment_address</code> fact. Custodial and platform wallets make unrelated doors share one address; the observation is served, the inference is yours.</p>
      <p class="menu-desc">And the subject gets a voice: an operator who proves control of a door or a wallet can attach a standing note at <a href="/api/standing-note"><code>/api/standing-note</code></a> — their dated statement, riding beside our observation on every surface that shows it. Beside, never instead.</p>
      <p class="menu-desc">Verification needs nothing from us: recompute any snapshot's sha256, check the signature against the key at <a href="/.well-known/scvd-signing-key"><code>/.well-known/scvd-signing-key</code></a>, walk the previous_digest chain back to the first entry, and run <code>ots verify</code> on the Bitcoin-anchored proof. The exact steps, field order included, ride on <a href="/corpus.json"><code>/corpus.json</code></a> itself.</p>
    </section>
    <section>
      <h2>What it is not</h2>
      <p class="menu-desc">Not a rating. ${escapeHtml(NEVER_A_RANKING_SENTENCE)} Each entry records what one probe saw at one moment, and no entry is ever ordered against another. A reading derived from the entries — a tier, a fraction — is published only with the rule it came from, its denominator and its rows, so the arithmetic can be redone or replaced; the rule and the dated note are at <a href="/criteria">/criteria</a>.</p>
      <p class="menu-desc">The observations are ours: one instrument, weekly cadence, the hosts the discovery list declared. The chain proves the record has not been rewritten; it cannot prove a round saw everything, and each round says so itself where its coverage fell short.</p>
    </section>
    <section>
      <p class="menu-meta">The externally anchored chain over this store's own signing keys, kept by the same mechanism: <a href="/.well-known/anchor-log.json"><code>/.well-known/anchor-log.json</code></a>. The conformance battery every probe runs is the same one the free desk serves at <a href="/conformance">/conformance</a>.</p>
    </section>`;
}

corpusLandingRoutes.get("/corpus", async (c) => {
  const base = c.env.STORE_BASE_URL;
  if (wantsHtml(c.req.header("Accept"))) {
    /*
     * The same derivation /corpus/wallet-facts.json runs, so the page
     * and the JSON can never quote different numbers. It fails soft:
     * a derivation that throws leaves the paragraph in its
     * figure-free form rather than taking the whole page down for a
     * sentence — the corpus index is how a reader reaches everything
     * else here.
     */
    const facts = await deriveWalletFacts(await listCorpus(c.env)).catch(
      () => null,
    );
    return c.html(
      renderSimplePage({
        title: "The corpus",
        description:
          "Weekly signed observations of the x402 ecosystem — which listed hosts answered and what a conformance probe saw. Hash-chained, ed25519-signed.",
        path: "/corpus",
        bodyHtml: `${landingHtml(base, facts)}\n${corpusDatasetJsonLd(base)}`,
      }),
    );
  }
  return c.json(landingJson(base));
});
