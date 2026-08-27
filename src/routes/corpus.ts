import { Hono } from "hono";
import {
  getCorpusEntry,
  listCorpus,
  verifyCorpusChain,
} from "@/services/corpus";
import { subjectHistory } from "@/services/subject-history";
import { deriveDiff, deriveTrajectory } from "@/services/trajectory";
import {
  CORPUS_DATASET_DESCRIPTION,
  CORPUS_DATASET_LICENSE,
  CORPUS_DATASET_NAME,
} from "@/store/corpus-dataset";
import type { HonoEnv } from "@/types";

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
    url: `${base}/corpus.json`,
    creator: { "@type": "Organization", name: "scvd.store", url: base },
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
      "Not a rating, not a ranking, not a score on any operator, and never becoming one. Each entry records what a probe saw at a moment. Judgments are a different product with its own published criteria, and accumulating scores on actors is the thing this store's rule 43 forbids by name.",
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
        "A reliability figure. Dividing rounds-ready by rounds-probed is one step away and it is a score on an operator, which this store does not keep on anyone. The dated observations are all there; the aggregate is deliberately withheld.",
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
    honest_limits:
      "The observations are ours: one instrument, weekly cadence, the hosts the discovery list declared. A host absent from the round was unlisted or unreachable that week, nothing more. The chain proves the record has not been rewritten; it cannot prove the round saw everything, and coverage caveats ride inside each round verbatim (capped, coverage_suspect, coverage_drop).",
    latest: records[records.length - 1] ?? null,
    index: records.map((record) => ({
      sequence: record.snapshot.sequence,
      week: record.snapshot.week,
      taken_at: record.snapshot.taken_at,
      digest: record.digest,
      previous_digest: record.snapshot.previous_digest,
      ots_status: record.ots?.status ?? "unsubmitted",
      hosts_observed: record.snapshot.round.hosts.length,
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
  return c.json(await subjectHistory(c.env, host, c.env.STORE_BASE_URL));
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
    how_to_rederive: `Fetch ${base}/corpus/{sequence}.json for each point (sequences are named on the points), recount the round's rows with your own tools, and compare digests against the chain at ${base}/corpus.json. Nothing here exists outside those signed entries.`,
  });
});

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
