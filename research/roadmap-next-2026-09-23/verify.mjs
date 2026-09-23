// Offline replay: hashes and signature first, then the two roadmap readings.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash, webcrypto } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { createEvidenceBundle, verifyEvidenceBundle } from "../../verifier/evidence-bundle.js";

globalThis.crypto ??= webcrypto;
const read = name => {
  const bytes = readFileSync(new URL(name, import.meta.url));
  return name.endsWith(".gz") ? gunzipSync(bytes) : bytes;
};
const json = name => JSON.parse(read(name));
const manifest = json("manifest.json");
for (const entry of manifest.files) {
  const bytes = read(entry.file);
  assert.equal(bytes.length, entry.decoded_bytes, entry.file);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), entry.decoded_sha256, entry.file);
}

const corpus = json("corpus-8.json.gz");
const key = json("signing-key.json").public_key;
const maxBytes = 33_554_432;
const verification = await verifyEvidenceBundle(await createEvidenceBundle(corpus, { maxBytes }), { publicKey: key, maxBytes });
assert.equal(verification.valid, true);
assert.equal(verification.evidence_complete, true);
const snapshot = corpus.snapshot;
const rows = snapshot.round.hosts;
assert.equal(json("corpus-index.json").entries.at(-1).digest, corpus.digest);
// Recompute the stored counts independently, preserving the unmeasured rows.
const measured = rows.filter(r => !["not_probed", "unreachable"].includes(r.verdict) && r.mpp && r.protocols_spoken);
const both = measured.filter(r => r.protocols_spoken.includes("x402") && r.protocols_spoken.includes("mpp"));
const neither = measured.filter(r => !r.protocols_spoken.includes("x402") && !r.protocols_spoken.includes("mpp"));
const unmeasured = rows.filter(r => !["not_probed", "unreachable"].includes(r.verdict) && !(r.mpp && r.protocols_spoken));
const counts = {
  probed: rows.filter(r => r.verdict !== "not_probed").length,
  measured: measured.length, unmeasured: unmeasured.length,
  unreachable: rows.filter(r => r.verdict === "unreachable").length,
  not_probed: rows.filter(r => r.verdict === "not_probed").length,
  speaking_mpp: measured.filter(r => r.protocols_spoken.includes("mpp")).length,
  mpp_only: measured.filter(r => r.protocols_spoken.includes("mpp") && !r.protocols_spoken.includes("x402")).length,
  both: both.length,
  x402_only: measured.filter(r => r.protocols_spoken.includes("x402") && !r.protocols_spoken.includes("mpp")).length,
  neither: neither.length,
  batteries: [...new Set(measured.map(r => r.mpp.battery))].sort(),
};
assert.deepEqual(counts, snapshot.round.mpp);
const { what_this_is, ...briefCounts } = json("corpus-brief.json").mpp;
assert.deepEqual(briefCounts, counts);
const history = json("host-history.json");
const originalRow = rows.find(r => r.host === history.host);
const projectedRow = history.timeline.find(r => r.sequence === snapshot.sequence);
assert.deepEqual(projectedRow.mpp, originalRow.mpp);
assert.deepEqual(projectedRow.protocols_spoken, originalRow.protocols_spoken);

const checks = new Map();
for (const offset of [1400, 1500, 1600]) for (const row of json(`directory-checks-${offset}.json`).data) {
  if (checks.has(row.id)) assert.deepEqual(checks.get(row.id), row);
  checks.set(row.id, row);
}
function window(start, end) {
  const selected = [...checks.values()].filter(r => r.checked_at >= start && r.checked_at < end)
    .sort((a, b) => a.checked_at.localeCompare(b.checked_at));
  assert.ok(selected.length);
  const values = selected.map(r => r.response_time_ms).sort((a, b) => a - b);
  const middle = Math.floor(values.length / 2);
  return { start, end, count: selected.length, first: selected[0].checked_at, last: selected.at(-1).checked_at,
    median_ms: values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2,
    p95_nearest_rank_ms: values[Math.ceil(values.length * .95) - 1], max_ms: values.at(-1),
    over_500_ms: values.filter(n => n > 500).length,
    all_up: selected.every(r => r.is_up), status_codes: [...new Set(selected.map(r => r.status_code))],
    endpoints_found: [...new Set(selected.map(r => r.endpoints_found))].sort((a, b) => a - b),
    max_interval_ms: Math.max(...selected.slice(1).map((r, i) => Date.parse(r.checked_at) - Date.parse(selected[i].checked_at))) };
}
const runs = [];
for (const entry of manifest.files.filter(e => e.file.startsWith("cold-runs/") && e.file.endsWith(".txt"))) {
  const text = read(entry.file).toString();
  const raw = read(entry.file.replace(/\.txt$/, ".json")).toString();
  // Preserve the old malformed artifact; decode its documented npm prefix
  // explicitly rather than silently treating it as a clean JSON capture.
  assert.match(raw.slice(0, raw.indexOf("{")), /cold:read/);
  const second = JSON.parse(raw.slice(raw.indexOf("{")));
  const first = text.match(/first knock\s+(\d+) ms\s+(\w+)/);
  const warm = text.match(/warm \((\d+)\)\s+(\d+) ms/);
  const at = text.match(/cold read, (\S+)/)[1];
  assert.notEqual(at, second.read_at);
  runs.push({ run_id: Number(entry.file.split("/")[1]), text_at: at,
    text_first_ms: Number(first[1]), text_first_isolate: first[2],
    text_warm_knocks: Number(warm[1]), text_warm_median_ms: Number(warm[2]),
    json_at: second.read_at, json_first_isolate: second.doors[0].first_isolate,
    json_burst_doors: second.burst.doors, json_burst_answered: second.burst.answered,
    json_burst_402: second.burst.challenged_402 });
}
console.log(JSON.stringify({
  manifest_files_verified: manifest.files.length,
  mpp: { sequence: snapshot.sequence, digest: corpus.digest, taken_at: snapshot.taken_at,
    signature_valid: true, bitcoin_proof_verified: false, counts,
    observed_dates: [...new Set(measured.map(r => r.observed_at.slice(0, 10)))].sort(),
    brief_counts_match: true, sample_host_history_matches: true, sample_host: history.host },
  directory: {
    before: window("2026-09-05T00:00:00Z", "2026-09-05T12:00:00Z"),
    after_activation: window("2026-09-05T19:55:00Z", "2026-09-06T12:00:00Z"),
    overnight: window("2026-09-06T00:00:00Z", "2026-09-06T12:00:00Z"),
  }, cold_runs: runs,
}, null, 2));
