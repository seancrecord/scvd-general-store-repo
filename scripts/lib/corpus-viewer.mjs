import { createEvidenceBundle, verifyEvidenceBundle } from '../../verifier/evidence-bundle.js';

const CONFIG = `configs:
- config_name: observations
  default: true
  data_files:
  - split: train
    path: viewer/observations.jsonl
- config_name: rounds
  data_files:
  - split: train
    path: viewer/rounds.jsonl
`;

const viewerGuide = repo => `
## Loading the table views

The default \`observations\` configuration contains one host observation per row.
The \`rounds\` configuration contains one summary per signed snapshot. These are
unsigned projections for browsing and analysis; the numbered JSON snapshots
remain the signed evidence. Other observation families and detailed probe
fields remain in those originals.

\`\`\`python
from datasets import load_dataset

observations = load_dataset(${JSON.stringify(repo)}, name="observations", split="train")
rounds = load_dataset(${JSON.stringify(repo)}, name="rounds", split="train")
\`\`\`

Each observation links its source snapshot and digest; \`row_pointer\` addresses
the row within that document's \`snapshot\` object. Capture and observation dates
are separate. A readiness observation is an unpaid protocol check, not proof
that a payment will succeed or that a seller will deliver. These table views
do not independently verify Bitcoin timestamp proofs.
`;

const freshnessGuide = `
## Observation dates and reproducible analysis

Correction prepared September 28, 2026: the initial table projection used the
round date as each host's observation date. The corrected observations table
uses the signed host row's \`observed_at\`, empty when unrecorded, and preserves
the round date separately as \`round_observed_at\`. \`captured_at\` dates the
snapshot. Older readings can be carried forward into a later round; a new
snapshot is not a fresh probe of every endpoint. Recorded \`probe_method\` and
\`battery\` accompany the row; absent values stay unknown. Signed originals
were not changed by this correction.

[Recompute the findings](https://github.com/seancrecord/scvd-general-store-repo/blob/main/examples/corpus-recompute.ipynb)
from a repository checkout with Python 3 and Node 22. The notebook fetches the
originals, verifies their digests, signatures and chain linkage with the existing
verifier, and separates fresh comparable readings from carried-forward rows.
[Reuse one listing observation](https://github.com/seancrecord/scvd-general-store-repo/blob/main/examples/README.md#reuse-corpus-evidence)
with the local adapter. Its output is an unsigned projection linked to a signed
source, not current readiness or evidence that a payment completed.
`;

// Refuse an unfamiliar configuration rather than overwrite a keeper's edits.
export function configureCorpusCard(card, repo) {
  if (typeof repo !== "string" || !/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error("invalid_dataset_repository");
  if (!card.startsWith('---\n') || !card.includes('\n---', 4)) throw new Error('missing_card_frontmatter');
  const end = card.indexOf('\n---', 4);
  let metadata = card.slice(4, end);
  const configured = (metadata + '\n').includes(CONFIG);
  if (!configured && /^configs:/m.test(metadata)) throw new Error('existing_viewer_config_requires_review');
  // Let Hub calculate table size; the original card counted snapshots, not rows.
  metadata = metadata.replace(/^size_categories:[^\n]*(?:\n[ \t]*-[^\n]*)*\n?/m, '').trimEnd();
  if (!configured) metadata += '\n' + CONFIG.trimEnd();
  const body = card.slice(end);
  const guide = viewerGuide(repo).trim();
  let output = '---\n' + metadata + body + (body.includes(guide) ? '' : '\n\n' + guide + '\n');
  // Correct the known legacy sentence; preserve any keeper-authored replacement.
  output = output.replace('One probe per host per round, at indexer cadence: a door that was down for the minute of the probe reads as unreachable for the week.',
    'A snapshot can carry earlier host readings forward. Use each host observation date; an unreachable reading describes that attempt, not an entire week.');
  return output + (output.includes(freshnessGuide.trim()) ? '' : '\n' + freshnessGuide);
}

const scalar = value => value === undefined || value === null ? '' : String(value);
const jsonLines = rows => rows.map(row => JSON.stringify(row)).join('\n') + '\n';

/** Unsigned projections. Each pointer addresses the authenticated snapshot, not the envelope. */
export async function buildCorpusViewer(documents, { base, publicKey }) {
  const rounds = [];
  const observations = [];
  let previous = null;
  let sequence = 0;
  for (const doc of [...documents].sort((a,b) => a.snapshot.sequence - b.snapshot.sequence)) {
    const bundle = await createEvidenceBundle(doc, { maxBytes: 64 * 1024 * 1024 });
    const checked = await verifyEvidenceBundle(bundle, { publicKey, maxBytes: 64 * 1024 * 1024 });
    if (!checked.valid) throw new Error(`invalid_snapshot_signature: ${checked.problems.join(',')}`);
    const s = checked.signed_claims;
    if (s.sequence !== sequence + 1 || s.previous_digest !== previous) throw new Error('incomplete_or_broken_corpus_chain');
    if (!Array.isArray(s.round.hosts)) throw new Error('missing_host_rows');
    const source = { sequence: s.sequence, week: s.week, captured_at: s.taken_at,
      observed_at: scalar(s.round.at), snapshot_digest: doc.digest,
      snapshot_url: `${base.replace(/\/+$/, '')}/corpus/${s.sequence}.json` };
    rounds.push({ ...source, host_rows: s.round.hosts.length,
      listed_resources: scalar(s.round.listed_resources), coverage_suspect: scalar(s.round.coverage_suspect),
      previous_digest: scalar(s.previous_digest), view_scope: 'Unsigned summary; consult signed snapshot for coverage and gaps. Bitcoin timestamp not verified by this projection.' });
    s.round.hosts.forEach((host, i) => observations.push({ ...source,
      // Rounds carry older host readings forward. Missing per-host time stays unknown.
      round_observed_at: source.observed_at, observed_at: scalar(host.observed_at),
      probe_method: scalar(host.probe_method), battery: scalar(host.battery),
      row_pointer: `/round/hosts/${i}`, host: scalar(host.host), url: scalar(host.url),
      source: scalar(host.source), verdict: scalar(host.verdict),
      failed_json: JSON.stringify(host.failed ?? null), advisories_json: JSON.stringify(host.advisories ?? null),
      view_scope: 'Unsigned host-row projection; not current readiness, payment or delivery proof. Other observation families remain in the original snapshot.' }));
    sequence = s.sequence;
    previous = doc.digest;
  }
  if (!rounds.length) throw new Error('empty_corpus');
  return { rounds: jsonLines(rounds), observations: jsonLines(observations) };
}
