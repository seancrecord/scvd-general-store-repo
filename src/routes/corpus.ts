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
  return c.json({
    what_this_is:
      "The corpus: the public x402 ecosystem as this store's weekly ward round observed it, frozen one snapshot per round — hash-chained, ed25519-signed, and each digest submitted to OpenTimestamps for Bitcoin anchoring. Dated observations of moments, kept because a continuous record cannot be backfilled later at any price.",
    what_this_is_not:
      "Not a rating, not a ranking, not a score on any operator, and never becoming one. Each entry records what a probe saw at a moment. Judgments are a different product with its own published criteria, and accumulating scores on actors is the thing this store's rule 43 forbids by name.",
    started: records[0]?.snapshot.taken_at ?? null,
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
