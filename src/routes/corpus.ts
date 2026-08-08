import { Hono } from "hono";
import {
  getCorpusEntry,
  listCorpus,
  verifyCorpusChain,
} from "@/services/corpus";
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
  const [records, chain] = await Promise.all([
    listCorpus(c.env),
    verifyCorpusChain(c.env),
  ]);
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
     * NO LICENCE IS ASSERTED. Inventing legal terms for the data would
     * be exactly the wrong reflex under the keeper's no-lawyers ruling.
     * What is stated instead is the fact: free to read, no account, no
     * key — which is the thing a reader actually needs to know.
     */
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: "The scvd corpus — weekly observations of the public x402 ecosystem",
    description:
      "One snapshot per weekly ward round of the public x402 discovery list: which hosts were listed, which answered, and what a single conformance probe saw at that moment. Hash-chained, ed25519-signed, each digest submitted to OpenTimestamps for Bitcoin anchoring. Dated observations of moments, never scores on operators.",
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
