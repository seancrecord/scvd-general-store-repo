import { namedExclusions } from "@/store/exclusions";
import { jsonLdScript, organizationRef } from "@/lib/jsonld";
import { delisting } from "@/store/delisted";
import { deriveDoorIndex } from "@/services/door-index";
import { effectiveObservation } from "@/services/passport";
import { deriveTier, tierIndex, tierInputFromHistory } from "@/services/passport-tier";
import { Hono, type Context } from "hono";
import {
  getCorpusEntry,
  listCorpus,
  verifyCorpusChain,
} from "@/services/corpus";
import { batteryDeltaSeries } from "@/services/battery-delta";
import { PREFLIGHT_VERSION } from "@/services/preflight";
import { deriveWalletFacts } from "@/services/operator-facts";
import { subjectHistory } from "@/services/subject-history";
import { deriveDiff, deriveTrajectory } from "@/services/trajectory";
import { deriveWeeklyBrief, type WeeklyBrief } from "@/services/weekly-brief";
import { renderSimplePage, wantsHtml } from "@/pages/simple-page";
import { escapeHtml } from "@/lib/sanitize";
import {
  CORPUS_DATASET_DESCRIPTION,
  CORPUS_DATASET_LICENSE,
  CORPUS_DATASET_NAME,
  corpusDatasetIdentityFields,
  corpusDatasetRef,
} from "@/store/corpus-dataset";
import type { HonoEnv } from "@/types";
import { CORRECTIONS_POINTER } from "@/store/corrections";
import { NEVER_A_RANKING_SENTENCE } from "@/store/copy/doctrine";

/**
 * GET /corpus.json — the ecosystem's observed history, published.
 *
 * Machine surface, deliberately: the corpus's audience is a verifier,
 * an underwriter's crawler, or a future accreditor asking "how long
 * has this store been watching, and can the record be trusted." A
 * human room is the keeper's call and is not made here (rule 7); the
 * data publishes either way, because a corpus nobody can read is a
 * private notebook wearing an instrument's name.
 *
 * The chain verification runs LIVE on every request and its verdict
 * is served beside the entries — a published "intact: true" computed
 * at read time is a claim a stranger can immediately re-run, which is
 * the only kind this store publishes.
 */
export const corpusRoutes = new Hono<HonoEnv>();

corpusRoutes.get("/corpus.json", async (c) => {
  const base = c.env.STORE_BASE_URL;
  // List once, verify against what was listed. These two used to run
  // "in parallel" while the second one listed the whole keyspace again.
  const records = await listCorpus(c.env);
  const chain = await verifyCorpusChain(c.env, records);
  const first = records[0]?.snapshot.taken_at ?? null;
  const last = records[records.length - 1]?.snapshot.taken_at ?? null;
  return c.json({
    /**
     * THE CORPUS DECLARES ITSELF A DATASET, and the reason is
     * AEO-shaped rather than decorative.
     *
     * Current answer-engine guidance is blunt on one point: FIRST-PARTY
     * data earns citations that third-party statistics cannot, because
     * a citing system names the original source. The corpus is exactly
     * that — weekly signed observations of the x402 neighbourhood that
     * nobody else holds in this form — and it was being served as bare
     * JSON. To a crawler that is a file. As `schema.org/Dataset` it is
     * an entity of the kind those systems cite by name.
     *
     * JSON-LD IS JSON, so the document is both at once: the store's own
     * shape for anyone reading it directly, and a Dataset for anything
     * that speaks schema.org. Keys outside the vocabulary are simply
     * not interpreted; nothing had to move to make room.
     *
     * Name, description and licence are imported, not typed here: the
     * storefront declares this same Dataset in its own JSON-LD, and the
     * two copies drifted the first time they were written by hand (the
     * storefront's had no description at all — an invalid Dataset in
     * Search Console's reading). The licence question — long answered
     * "assert none" — is settled at length in corpus-dataset.ts.
     */
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: CORPUS_DATASET_NAME,
    description: CORPUS_DATASET_DESCRIPTION,
    license: CORPUS_DATASET_LICENSE,
    ...corpusDatasetIdentityFields(),
    url: `${base}/corpus.json`,
    creator: organizationRef(base),
    isAccessibleForFree: true,
    conditionsOfAccess: "Free to read. No account, no key, no rate limit.",
    ...(first ? { temporalCoverage: `${first}/${last ?? ".."}` } : {}),
    ...(last ? { dateModified: last } : {}),
    measurementTechnique:
      "One GET per declared host per week against the published preflight battery, at indexer cadence. Coverage caveats ride inside each round verbatim.",
    variableMeasured: [
      "host listed in the x402 discovery document",
      "conformance verdict: ready, not_ready, unreachable or not_probed",
      "named failing checks and advisories",
      "week-over-week delta: newly failing, newly fixed, flappers",
      "population known versus walked, and the coverage percentage between them",
      "listing lifecycle: first seen, last seen, newly delisted, listed again",
      "the discovery catalog's copy of each door's terms against the live 402: agrees, differs (field and rail), not listed, or not comparable, with the catalog's own lastUpdated",
    ],
    distribution: [
      {
        "@type": "DataDownload",
        encodingFormat: "application/json",
        contentUrl: `${base}/corpus.json`,
        name: "Index of every snapshot, with the chain check",
      },
      ...records.map((record) => ({
        "@type": "DataDownload" as const,
        encodingFormat: "application/json",
        contentUrl: `${base}/corpus/${record.snapshot.sequence}.json`,
        name: `Snapshot ${record.snapshot.sequence} (${record.snapshot.week})`,
      })),
    ],
    what_this_is:
      "The corpus: the public x402 ecosystem as this store's weekly ward round observed it, frozen one snapshot per round — hash-chained, ed25519-signed, and each digest submitted to OpenTimestamps for Bitcoin anchoring. Dated observations of moments, kept because a continuous record cannot be backfilled later at any price.",
    what_this_is_not:
      `${NEVER_A_RANKING_SENTENCE} Each entry records what a probe saw at a moment, and never becomes a ranking of one host against another. What may be derived from the entries — a tier, a fraction — is published only with its rule, its denominator and its rows (the 2026-09-02 amendment to rule 43, at /criteria).`,
    /**
     * The per-subject read, advertised where a crawler will find it.
     * A template rather than an enumeration: the corpus can hold
     * hundreds of hosts and listing them all here would bloat the
     * index for no reader's benefit.
     */
    per_subject: {
      url_template: `${base}/corpus/host/{host}.json`,
      what_it_answers:
        "Everything this store has observed about one host over time, replayed from the signed chain, with every round it was NOT observed carrying a reason: not listed by any feed, listed but not walked, possibly beyond the round's cap, or the instrument itself degraded. The gaps are the point — a timeline with misses omitted reads as continuous coverage.",
      what_it_will_not_answer:
        "A ranking, or any figure without its working. A derived reading of these rows — a tier, a fraction — appears only with the rule it came from, the denominator, and the rows, so you can redo the arithmetic or apply your own rule to the same rows. The dated observations are all there either way.",
    },
    tiers: {
      url: `${base}/corpus/tiers.json`,
      what_it_answers:
        "Every host's tier — observed, established, standing, broken or indeterminate — derived from its own rounds by the rule on /criteria and printed with the fraction it came from, alphabetical by host. The rows behind every line are the per-subject read above.",
    },
    started: first,
    entries: records.length,
    chain,
    how_to_verify: [
      `1. Fetch any entry at ${base}/corpus/{sequence}.json.`,
      "2. Recompute sha256 over the canonical snapshot (fixed field order: version, sequence, taken_at, previous_digest, source, week, round) and compare to `digest`.",
      "3. Check `signature` over the same canonical string against the key at /.well-known/scvd-signing-key with your own ed25519 library.",
      "4. Check `previous_digest` equals the prior entry's digest, back to sequence 1 — that is the whole chain.",
      "5. Base64-decode `ots.proof_base64` and run `ots verify` against the digest: a Bitcoin-confirmed proof means the snapshot existed by that block, on evidence that is not ours.",
    ],
    corrections: CORRECTIONS_POINTER,
    honest_limits:
      "The observations are ours: one instrument, weekly cadence, the hosts the discovery list declared. A host absent from a round was unlisted that week, beyond the round's stated caps, or dropped by our own coverage — the round's own coverage fields say which, so absence alone proves nothing about the host. One structural exclusion, stated because it flatters our trust-gap numbers: the round can never probe this store's own host (a Worker cannot fetch itself), so our own door is in no denominator here. The chain proves the record has not been rewritten; it cannot prove the round saw everything, and coverage caveats ride inside each round verbatim (capped, coverage_suspect, coverage_drop).",
    latest: records[records.length - 1] ?? null,
    index: records.map((record) => ({
      sequence: record.snapshot.sequence,
      week: record.snapshot.week,
      taken_at: record.snapshot.taken_at,
      digest: record.digest,
      previous_digest: record.snapshot.previous_digest,
      ots_status: record.ots?.status ?? "unsubmitted",
      /*
       * hosts_observed keeps its historical meaning (every row the
       * round carries, `not_probed` population rows included) under
       * the frozen-fields law; hosts_probed beside it is the number
       * its name always suggested. Two fields, because renaming a
       * served field is a rewrite and a row nobody probed was never
       * "observed" in any sense a reader would accept.
       */
      hosts_observed: record.snapshot.round.hosts.length,
      hosts_probed: record.snapshot.round.hosts.filter(
        (host) => host.verdict !== "not_probed",
      ).length,
      url: `${base}/corpus/${record.snapshot.sequence}.json`,
    })),
  });
});

/**
 * GET /corpus/host/{host}.json — everything the chain has recorded
 * about one host, with the gaps named.
 *
 * DERIVED AT READ, never stored. The corpus entries are the record;
 * this is a view over them, so it cannot drift from what was signed
 * and every row carries the digest and URL of the entry it came from.
 * A reader who does not trust the view can fetch the entries and
 * rebuild it.
 *
 * The gaps are the product. Serving only the weeks we looked would
 * read as continuous coverage, which is the thing this store spends
 * its whole design budget refusing to imply.
 */
corpusRoutes.get("/corpus/host/:file{.+\\.json}", async (c) => {
  const host = c.req.param("file").replace(/\.json$/, "");
  if (!host || host.length > 253 || !/^[a-z0-9.:_-]+$/i.test(host)) {
    return c.json(
      {
        error:
          "Ask for a host, e.g. /corpus/host/example.com.json. The index of everything observed is at /corpus.json.",
      },
      400,
    );
  }
  /* The tier rides the newest-wins fold, so a paid refresh moves it
   * here the same hour it moves the passport (2026-09-02). */
  const observation = await effectiveObservation(c.env, host);
  return c.json({
    ...observation.history,
    tier: deriveTier(
      tierInputFromHistory(observation.history, observation),
      `${c.env.STORE_BASE_URL}/criteria`,
    ),
  });
});

/**
 * GET /corpus/host/{host} — the same history as the JSON, as a page
 * (2026-09-03, the AEO plan's PR 3).
 *
 * The store held hundreds of dated, signed observations per host and
 * published every one of them as JSON only. A crawler does not read
 * JSON. The instruments that get cited for "is this x402 endpoint
 * working" publish one page per subject with the verdict in the
 * title; this is ours, derived at read from the same rows as the
 * .json twin, so the two cannot disagree. Title: the host, the tier
 * and the fraction it came from — the N7 rule, which is the rule
 * against a ranking: unordered, denominator beside every number.
 *
 * A host the chain never met is a 404, not an empty page: a page for
 * any string somebody types would let anyone mint a URL on this
 * domain. A host that asked to be delisted keeps its record and loses
 * its page (store/delisted.ts).
 */
corpusRoutes.get("/corpus/host/:host{[a-z0-9.:_-]+}", async (c) => {
  const base = c.env.STORE_BASE_URL;
  const host = c.req.param("host").toLowerCase();
  if (host.endsWith(".json") || host.length > 253) {
    return c.json({ error: `Ask for a host, e.g. ${base}/corpus/host/example.com` }, 400);
  }
  const observation = await effectiveObservation(c.env, host);
  const history = observation.history;
  if (history.rounds_since_first_sighting === 0 && !history.listing) {
    return c.json(
      {
        error: `The chain has never carried ${host}. Every host it has is at ${base}/doors.`,
        doors: `${base}/doors`,
      },
      404,
    );
  }
  const tier = deriveTier(tierInputFromHistory(history, observation), `${base}/criteria`);
  const gone = delisting(host);
  const title = gone
    ? `x402 endpoint readiness: ${host} — delisted`
    : `x402 endpoint readiness: ${host} — ${tier.line}`;
  const description = gone
    ? `${host} asked for its page to come down on ${gone.on}. The signed corpus rows stand and the aggregates still count it; only this page is withdrawn.`
    : `What scvd.store's weekly ward round observed about ${host}: ${tier.line}, derived from ${history.rounds_probed} probed round${history.rounds_probed === 1 ? "" : "s"} since first sighting, every missed week named with its reason. Dated observations of moments, never a ranking.`;
  const rows = history.timeline
    .map(
      (round) => `<tr>
        <td>${escapeHtml(round.week)}</td>
        <td>${round.listed ? "listed" : "not listed"}</td>
        <td>${round.probed ? "probed" : escapeHtml(round.gap ?? "not probed")}</td>
        <td><code>${escapeHtml(round.verdict ?? "—")}</code></td>
        <td>${escapeHtml((round.failed ?? []).join(", ") || "—")}</td>
        <td><a href="${escapeHtml(round.entry_url)}"><code>${escapeHtml(String(round.sequence))}</code></a></td>
      </tr>`,
    )
    .join("");
  const jsonLd = jsonLdScript({
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: `x402 endpoint readiness — ${host}`,
    description,
    url: `${base}/corpus/host/${host}`,
    sameAs: `${base}/corpus/host/${host}.json`,
    about: { "@type": "WebSite", url: `https://${host}/` },
    isPartOf: corpusDatasetRef(base),
    license: "https://creativecommons.org/licenses/by/4.0/",
    isAccessibleForFree: true,
    creator: organizationRef(base),
    ...(history.last_observed ? { dateModified: history.last_observed } : {}),
    ...(history.first_observed && history.last_observed
      ? { temporalCoverage: `${history.first_observed}/${history.last_observed}` }
      : {}),
    variableMeasured: [
      "conformance verdict per weekly round: ready, not_ready, unreachable or not_probed",
      "named failing checks per probed round",
      "rounds missed, each with its reason",
      `passport tier under the published rule: ${tier.line}`,
    ],
    distribution: {
      "@type": "DataDownload",
      encodingFormat: "application/json",
      contentUrl: `${base}/corpus/host/${host}.json`,
    },
  });
  const bodyHtml = gone
    ? `<section>
        <p class="menu-desc">${escapeHtml(description)}</p>
        <p class="menu-meta">Reason recorded: ${escapeHtml(gone.reason)}. The aggregates at <a href="/corpus">/corpus</a> and <a href="/doors">/doors</a> are unchanged; the signed rows are at <code>${escapeHtml(`${base}/corpus/host/${host}.json`)}</code>.</p>
      </section>${jsonLd}`
    : `<section>
        <p class="menu-desc"><strong>${escapeHtml(tier.line)}</strong> — ${escapeHtml(tier.rule)}. The rule and every tier are at <a href="/criteria">/criteria</a>; the rows are below. ${escapeHtml(NEVER_A_RANKING_SENTENCE)}</p>
        <p class="menu-meta">Latest observation: <code>${escapeHtml(String(tier.latest.verdict ?? "none"))}</code>${tier.latest.observed_at ? ` on ${escapeHtml(tier.latest.observed_at)}` : ""}. Rounds since first sighting: ${history.rounds_since_first_sighting}; probed: ${history.rounds_probed}; missed: ${history.rounds_gapped}${history.observation_coverage_pct !== null ? ` (our coverage of this host: ${history.observation_coverage_pct}%)` : ""}.${tier.coverage_suspect ? " Our own coverage was suspect somewhere in the window, which the tier already reflects." : ""}</p>
      </section>
      <section>
        <h2>Every round, including the ones we missed</h2>
        <table>
          <thead><tr><th>Week</th><th>Listed</th><th>Probed</th><th>Verdict</th><th>Failed checks</th><th>Entry</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <p class="menu-meta">A missed week is a fact about us, not about the door. Gaps by reason: ${escapeHtml(
          Object.entries(history.gaps_by_reason)
            .filter(([, count]) => count > 0)
            .map(([reason, count]) => `${reason} ${count}`)
            .join(", ") || "none",
        )}.</p>
      </section>
      ${
        history.payment_address
          ? `<section><h2>Payment address</h2><p class="menu-desc">${escapeHtml(JSON.stringify(history.payment_address))}</p></section>`
          : ""
      }
      <section>
        <h2>What this cannot see</h2>
        <ul class="menu-desc">${history.what_this_cannot_see.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>
      </section>
      <section>
        <h2>Check it yourself</h2>
        <p class="menu-desc">The free preflight runs the same battery on any door right now: <code>POST ${escapeHtml(base)}/api/preflight/v1</code> with <code>{"url": "https://${escapeHtml(host)}/…"}</code>. The signed rows behind this page are at <a href="/corpus/host/${escapeHtml(host)}.json"><code>/corpus/host/${escapeHtml(host)}.json</code></a>; every entry links the snapshot it came from and the chain at <a href="/corpus.json"><code>/corpus.json</code></a>. If you operate this host and want the page withdrawn, the <a href="/notice">notice desk</a> is the door. Corrections: <a href="/corrections">/corrections</a>.</p>
      </section>${jsonLd}`;
  return c.html(
    renderSimplePage({
      title,
      description,
      path: `/corpus/host/${host}`,
      bodyHtml,
    }),
  );
});

/**
 * GET /corpus/round/{week} — one stable page per signed week (PR 3).
 * /corpus/brief stays the latest and takes ?week=; this is the same
 * brief at an address that never changes, with the week's numbers in
 * the title and a Dataset node, which is the shape a citing engine
 * lifts a weekly figure from.
 */
corpusRoutes.get("/corpus/round/:week{[0-9]{4}-W[0-9]{2}}", async (c) => {
  const base = c.env.STORE_BASE_URL;
  const week = c.req.param("week");
  const { brief, known_weeks } = deriveWeeklyBrief(await listCorpus(c.env), base, week);
  if (!brief) {
    return c.json(
      { error: `The chain holds no signed week named ${week}.`, known_weeks, corrections: CORRECTIONS_POINTER },
      404,
    );
  }
  if (!wantsHtml(c.req.header("Accept"), c.req.header("User-Agent"))) {
    return c.json({ ...brief, weeks_held: known_weeks, corrections: CORRECTIONS_POINTER });
  }
  const description = `The x402 corpus for ${brief.week}: ${brief.doors.listed} doors named, ${brief.doors.probed} probed, ${brief.doors.payable} payable and ${brief.doors.not_payable} not, defects by name, and the gaps counted against the observer. Signed snapshot ${brief.sequence}, ed25519 and Bitcoin-anchored. Not a ranking.`;
  return c.html(
    renderSimplePage({
      title: `x402 endpoint readiness, week ${brief.week}: ${brief.doors.payable} of ${brief.doors.probed} probed doors payable`,
      description,
      path: `/corpus/round/${brief.week}`,
      bodyHtml: `${briefHtml(brief)}${jsonLdScript({
        "@context": "https://schema.org",
        "@type": "Dataset",
        name: `x402 endpoint readiness — ${brief.week}`,
        description,
        url: `${base}/corpus/round/${brief.week}`,
        isPartOf: corpusDatasetRef(base),
        temporalCoverage: brief.week,
        dateModified: brief.taken_at,
        license: "https://creativecommons.org/licenses/by/4.0/",
        isAccessibleForFree: true,
        creator: organizationRef(base),
        variableMeasured: [
          "doors named by the feeds",
          "doors probed",
          "doors payable as served",
          "doors not payable as served",
          "doors unreachable",
          "defects by class",
        ],
        distribution: {
          "@type": "DataDownload",
          encodingFormat: "application/json",
          contentUrl: `${base}/corpus/${brief.sequence}.json`,
        },
      })}`,
    }),
  );
});

/**
 * GET /corpus/tiers.json — every host's tier with its fraction,
 * alphabetical by host. Ordered by tier would be a ranking, and this
 * store does not publish one. One pass over the signed chain plus one
 * bulk read of the paid refreshes; derived at read, never stored.
 */
corpusRoutes.get("/corpus/tiers.json", async (c) => {
  return c.json(await tierIndex(c.env, c.env.STORE_BASE_URL));
});

/**
 * GET /corpus/trajectory.json — the chain read as time (roadmap 3.5,
 * ledger M3).
 *
 * Same law as the per-subject view: DERIVED AT READ from the signed
 * snapshots, never stored, so it cannot drift from what was signed.
 * Every point names the digest and sequence of the snapshot it came
 * from; counts always travel with their denominators and no ratio is
 * served. This is also the state-of-the-market reporting asset — any
 * prose about "how the neighbourhood is doing" quotes these numbers,
 * not a parallel set that could disagree with them.
 */
corpusRoutes.get("/corpus/trajectory.json", async (c) => {
  const base = c.env.STORE_BASE_URL;
  const trajectory = deriveTrajectory(await listCorpus(c.env));
  return c.json({
    ...trajectory,
    corrections: CORRECTIONS_POINTER,
    how_to_rederive: `Fetch ${base}/corpus/{sequence}.json for each point (sequences are named on the points), recount the round's rows with your own tools, and compare digests against the chain at ${base}/corpus.json. Nothing here exists outside those signed entries.`,
  });
});

/**
 * THE WEEK'S DOORS (roadmap S1, the keeper's name 2026-09-01): one
 * brief per signed week, derived from the trajectory point, HTML for
 * a person and JSON for a machine at the same address. ?week= names a
 * week the chain holds; absent, the latest.
 */
function briefHtml(brief: WeeklyBrief): string {
  const d = brief.doors;
  const g = brief.our_gaps;
  const defects =
    brief.defects.length === 0
      ? `<p class="menu-desc">No failed checks recorded on the probed doors this week.</p>`
      : `<table border="1" cellpadding="6"><tr><th>defect, by its registered name</th><th>doors</th></tr>${brief.defects
          .map(
            (row) =>
              `<tr><td><a href="/defects#${escapeHtml(row.id)}">${escapeHtml(row.title)}</a> <code>${escapeHtml(row.id)}</code></td><td>${row.count}</td></tr>`,
          )
          .join("")}</table>`;
  const networks = Object.entries(brief.networks)
    .sort((a, b) => b[1] - a[1])
    .map(([network, count]) => `<code>${escapeHtml(network)}</code> ${count}`)
    .join(" · ");
  const previous = brief.previous
    ? `<p class="menu-meta">The week before, ${escapeHtml(brief.previous.week)}: ${brief.previous.payable} payable and ${brief.previous.not_payable} not, of ${brief.previous.probed} probed. Two points, not a trend.</p>`
    : "";
  return `<section>
    <p class="menu-desc"><strong>Week ${escapeHtml(brief.week)}</strong>, read from signed snapshot ${brief.sequence}, taken ${escapeHtml(brief.taken_at.slice(0, 10))}${brief.battery ? `, verdicts under battery <code>${escapeHtml(brief.battery)}</code>` : ""}.</p>
    <p class="menu-desc"><strong>${d.listed} doors named</strong> by the discovery feeds; <strong>${d.probed} knocked on</strong>. Of those, <strong>${d.payable} answered with a challenge a buyer could pay</strong>, ${d.not_payable} answered with one a buyer could not pay as served, and ${d.unreachable} did not answer. ${d.offers_seen} carried a parseable offer.</p>
    ${networks ? `<p class="menu-meta">Doors per chain, from the offers' own declarations: ${networks}.</p>` : ""}
    ${previous}
  </section>
  <section>
    <h2>Defects, by name</h2>
    ${defects}
    <p class="menu-meta">Names are the store's <a href="/defects">defect vocabulary</a>; a defect is a fact about one challenge at one moment, never about an operator.</p>
  </section>
  <section>
    <h2>The gaps, counted against us</h2>
    <p class="menu-desc">${g.not_probed} doors a feed named that this round never reached. ${g.observer_degraded} ticks where our own vantage was blind, which are nobody's outage. ${g.coverage_suspect ? "<strong>The round itself flagged its coverage as suspect.</strong>" : "The round did not flag its coverage as suspect."}</p>
  </section>
  <section>
    <h2>What this is not</h2>
    <p class="menu-desc">${escapeHtml(brief.not_a_ranking)}</p>
    <p class="menu-meta">${escapeHtml(brief.how_to_rederive)} Every door, alphabetical: <a href="/doors">/doors</a>.</p>
  </section>`;
}

async function serveBrief(c: Context<HonoEnv>, html: boolean) {
  const base = c.env.STORE_BASE_URL;
  const week = c.req.query("week") ?? undefined;
  const { brief, known_weeks } = deriveWeeklyBrief(await listCorpus(c.env), base, week);
  if (!brief) {
    /*
     * A week we do not hold is a 404 naming the weeks we do (rule 52).
     * An EMPTY chain is not an error — the room exists, the first
     * Sunday round fills it — so it answers 200 with the empty state
     * said plainly rather than a number we do not have.
     */
    const status = week ? 404 : 200;
    const note = week
      ? `The chain holds no signed week named ${week}.`
      : "The chain holds no signed week yet; the first Sunday round writes the first brief.";
    const body = {
      artifact: "weekly_brief" as const,
      name: "The Week's Doors" as const,
      week: null,
      ...(week ? { error: note } : { note }),
      known_weeks,
      corrections: CORRECTIONS_POINTER,
    };
    return html
      ? c.html(
          renderSimplePage({
            title: "The Week's Doors",
            description: "The weekly brief of the x402 corpus: doors named, probed, payable and not, defects by name, and the gaps counted against the observer. Not a ranking.",
            path: "/corpus/brief",
            markdownAlt: "/corpus/brief",
            feedAlt: { path: "/feeds/brief.xml", title: "The Week's Doors, as Atom" },
            bodyHtml: `<section><p class="menu-desc">${escapeHtml(note)}${known_weeks.length ? ` Weeks held: ${known_weeks.map((w) => `<a href="/corpus/brief?week=${escapeHtml(w)}">${escapeHtml(w)}</a>`).join(", ")}.` : ""}</p></section>`,
          }),
          status,
        )
      : c.json(body, status);
  }
  if (html) {
    return c.html(
      renderSimplePage({
        title: `The Week's Doors — ${brief.week}`,
        description: `The x402 corpus for ${brief.week} in one page: ${brief.doors.listed} doors named, ${brief.doors.probed} probed, ${brief.doors.payable} payable and ${brief.doors.not_payable} not, defects by name, and the gaps counted against the observer. Not a ranking.`,
        path: "/corpus/brief",
        markdownAlt: "/corpus/brief",
        feedAlt: { path: "/feeds/brief.xml", title: "The Week's Doors, as Atom" },
        bodyHtml: briefHtml(brief),
      }),
    );
  }
  return c.json({ ...brief, weeks_held: known_weeks, corrections: CORRECTIONS_POINTER });
}

// One address, both dialects — a .json twin would be a seventh surface
// to list, and the room contract already answers JSON here.
corpusRoutes.get("/corpus/brief", (c) => serveBrief(c, wantsHtml(c.req.header("Accept"), c.req.header("User-Agent"))));

/**
 * GET /corpus/diff.json?since={week} — what changed between a named
 * signed week and the latest one (roadmap 3.5, ledger J2).
 *
 * The cheapest real agent loop is "poll the diff, act on transitions",
 * and until now the transitions existed only as arithmetic a caller
 * had to run across two full snapshots. `since` must name a week the
 * chain actually holds: a week we cannot see gets a 404 carrying the
 * weeks we CAN see, never a guessed baseline (rule 52).
 */
corpusRoutes.get("/corpus/diff.json", async (c) => {
  const records = await listCorpus(c.env);
  const knownWeeks = records.map((record) => record.snapshot.week);
  const since = c.req.query("since");
  if (!since) {
    return c.json(
      {
        error:
          "Name a baseline week, e.g. /corpus/diff.json?since=2026-W34. The comparison is always against the latest signed snapshot.",
        known_weeks: knownWeeks,
      },
      400,
    );
  }
  const diff = deriveDiff(records, since);
  if (!diff) {
    return c.json(
      {
        error: `No signed snapshot for week ${since}, so there is no baseline to diff against — this store does not invent one. The weeks the chain holds are listed below.`,
        known_weeks: knownWeeks,
      },
      404,
    );
  }
  return c.json({
    ...diff,
    how_to_rederive: `Fetch ${c.env.STORE_BASE_URL}/corpus/${diff.from.sequence}.json and ${c.env.STORE_BASE_URL}/corpus/${diff.to.sequence}.json, compare the rounds' rows yourself, and check the digests against the chain.`,
  });
});

/**
 * GET /corpus/wallet-facts.json — T1 under the G2 ruling (roadmap
 * 3.6; docs/G2_OPERATOR_LINKING_RULING_2026-08.md).
 *
 * COUNTS ONLY, latest signed week: how many receiving addresses the
 * probed doors advertised, how many receive at more than one door,
 * and the largest cluster — with denominators, and with the
 * shared-wallet caveat inline. No address, digest, host name or
 * operator claim is served here, ever: the store provides the wallet
 * fact and the receiver makes the call, and this surface is the
 * proof that a market-structure number can be published without
 * naming anyone.
 */
corpusRoutes.get("/corpus/wallet-facts.json", async (c) => {
  const base = c.env.STORE_BASE_URL;
  const facts = await deriveWalletFacts(await listCorpus(c.env));
  if (!facts) {
    // An empty chain is fully visible — nothing signed yet is the
    // honest answer, not a missing door. Same contract as
    // /corpus/trajectory.json serving an empty weeks array.
    return c.json({
      week: null,
      corrections: CORRECTIONS_POINTER,
      explanation:
        "The corpus chain holds no signed week yet, so there is nothing to count over. This surface fills with the first ward round. The index is at /corpus.json.",
      exclusions: namedExclusions(base),
    });
  }
  return c.json({
    ...facts,
    corrections: CORRECTIONS_POINTER,
    how_to_rederive: `Fetch ${base}/corpus/${facts.sequence}.json, digest each row's advertised payment addresses with the documented salt (rows frozen after 2026-08-27 already carry pay_to_digest), cluster by digest, and recount. The snapshot's digest is named above so you know you counted what we counted.`,
    per_host: `Each door's own page at ${base}/corpus/host/{host}.json carries its payment_address block: whether its advertised address also receives at other doors that week, without naming them.`,
    /**
     * S9 (2026-09-02): what the store's OWN demand numbers subtract,
     * by name, with the dated register of every time the list moved.
     * On this surface because it is the wallet-facts page: the house's
     * wallets are wallet facts too, and the only ones it names.
     */
    exclusions: namedExclusions(base),
  });
});

/**
 * WHAT THE STRICTER BATTERY CATCHES, COUNTED (2026-08-29, the keeper's
 * "we are monitoring to see if v2 is more effective").
 *
 * We were not monitoring. `also_under` said it on every reading and
 * nothing added it up, so the call he deferred turned on a number
 * that did not exist. It exists here, over every signed week, derived
 * from check names the rows have always carried — no row rewritten,
 * nothing resigned, and the history counted rather than a series
 * started the day somebody remembered.
 *
 * PUBLISHED RATHER THAN KEPT, on the same principle as the coverage
 * gaps: this is a number about OUR OWN instrument's usefulness, and a
 * store that publishes the defects it finds in other people's doors
 * does not get to hold its own instrument's scorecard back until the
 * figure flatters it.
 */
corpusRoutes.get("/corpus/battery-delta.json", async (c) => {
  const base = c.env.STORE_BASE_URL;
  const records = await listCorpus(c.env);
  const series = batteryDeltaSeries(
    records.map((record) => ({
      week: record.snapshot.week,
      sequence: record.snapshot.sequence,
      rows: (record.snapshot.round.hosts ?? []) as {
        verdict: string;
        failed: string[];
      }[],
    })),
  );
  return c.json({
    ...series,
    corrections: CORRECTIONS_POINTER,
    how_to_rederive: `Fetch ${base}/corpus/{sequence}.json for any week, take each host row's verdict and failed[], and count the rows whose every failed name is one of v2_only_checks above — those are the doors v1 would have passed. The check names are published at ${base}/api/preflight/checks; nothing here is computed from anything the signed snapshots do not already contain.`,
    the_open_question: `Whether v2 should become the headline battery on every instrument is the keeper's call, not this number's: the change renames the criteria on every artifact this store has already signed. See ${base}/api/preflight/${PREFLIGHT_VERSION} for what each battery folds.`,
  });
});

corpusRoutes.get("/corpus/:file{[0-9]+\\.json}", async (c) => {
  const sequence = Number.parseInt(c.req.param("file"), 10);
  const record = await getCorpusEntry(c.env, sequence);
  if (!record) {
    return c.json(
      {
        error: `No corpus entry at sequence ${sequence}. The index is at /corpus.json.`,
      },
      404,
    );
  }
  return c.json(record);
});
