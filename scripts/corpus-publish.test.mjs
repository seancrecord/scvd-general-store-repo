import assert from "node:assert/strict";
import test from "node:test";
import {
  anchorsFrom,
  commitSummary,
  hfCommitBody,
  plan,
  roundFilesFrom,
  weekOf,
  zenodoMetadataFor,
} from "./lib/corpus-publish.mjs";

const index = {
  identifier: { "@type": "PropertyValue", propertyID: "DOI", value: "10.5281/zenodo.22284887" },
  sameAs: ["https://doi.org/10.5281/zenodo.22284887", "https://huggingface.co/datasets/keeper-scvd/x402-endpoint-readiness"],
  distribution: [
    { contentUrl: "https://scvd.store/corpus.json" },
    { contentUrl: "https://scvd.store/corpus/1.json" },
    { contentUrl: "https://scvd.store/corpus/3.json" },
    { contentUrl: "https://scvd.store/corpus/2.json" },
  ],
};

test("the DOI and the Hugging Face repo are read from the index, never typed", () => {
  assert.deepEqual(anchorsFrom(index), { doi: "10.5281/zenodo.22284887", conceptId: 22284887, hfRepo: "keeper-scvd/x402-endpoint-readiness" });
  assert.deepEqual(anchorsFrom({}), { doi: null, conceptId: null, hfRepo: null });
});

test("round files come from the index's distribution, ascending, the index itself excluded", () => {
  assert.deepEqual(roundFilesFrom(index).map((r) => r.name), ["1.json", "2.json", "3.json"]);
});

test("the plan sends only the rounds a mirror lacks, and always the index and the tiers", () => {
  const p = plan(index, ["1.json", "2.json", "corpus.json"]);
  assert.deepEqual(p.missingRounds.map((r) => r.name), ["3.json"]);
  assert.deepEqual(p.always, ["corpus.json", "tiers.json"]);
  assert.equal(p.latest.sequence, 3);
  assert.equal(p.nothingNew, false);
  assert.equal(plan(index, ["1.json", "2.json", "3.json"]).nothingNew, true);
});

test("a signed round is never re-sent; a mirror holding every round gets nothing", () => {
  const p = plan(index, ["1.json", "2.json", "3.json"]);
  assert.equal(p.missingRounds.length, 0);
});

test("Zenodo's new version keeps every field of the last one and moves only version and date", () => {
  const previous = { title: "t", upload_type: "dataset", license: "cc-by-4.0", version: "2026-W35", creators: [{ name: "x" }], related_identifiers: [{ identifier: "https://scvd.store/corpus" }] };
  const next = zenodoMetadataFor(previous, "2026-W36", "2026-09-07");
  assert.equal(next.version, "2026-W36");
  assert.equal(next.publication_date, "2026-09-07");
  assert.equal(next.title, "t");
  assert.deepEqual(next.related_identifiers, previous.related_identifiers);
  assert.equal(previous.version, "2026-W35", "the previous metadata is not mutated");
});

test("the Hugging Face commit body is NDJSON: a header, then one line per file, inline or LFS", () => {
  const body = hfCommitBody("s", [
    { path: "6.json", mode: "regular", base64: "e30=" },
    { path: "corpus.json", mode: "lfs", sha256: "ab", size: 12 },
  ]);
  const lines = body.trim().split("\n").map((l) => JSON.parse(l));
  assert.deepEqual(lines[0], { key: "header", value: { summary: "s" } });
  assert.deepEqual(lines[1], { key: "file", value: { path: "6.json", content: "e30=", encoding: "base64" } });
  assert.deepEqual(lines[2], { key: "lfsFile", value: { path: "corpus.json", algo: "sha256", oid: "ab", size: 12 } });
  assert.ok(body.endsWith("\n"));
});

test("the week is read from the round file, and the summary names the round the same way on both mirrors", () => {
  assert.equal(weekOf({ snapshot: { week: "2026-W36" } }), "2026-W36");
  assert.equal(commitSummary("2026-W36", 6), "Round 6 (2026-W36): one signed weekly observation appended; index and tiers refreshed");
});
