#!/usr/bin/env node
// Index existing reviewed cohorts without rescoring or pooling them. Native
// traces stay in their original private archives; only public evidence is read.
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export function indexJourneyEvidence(root) {
  const cohorts = [], other = [];
  for (const entry of readdirSync(resolve(root, 'research'), { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const base = `research/${entry.name}`;
    const scorePath = `${base}/score.json`;
    if (!existsSync(resolve(root, scorePath))) continue;
    const raw = readFileSync(resolve(root, scorePath));
    const score = JSON.parse(raw);
    if (score.schema_version !== 2 || !Array.isArray(score.runs)) {
      other.push({ score: scorePath, reason: 'Different instrument/schema; inspect separately' });
      continue;
    }
    const planPath = `${base}/plan.json`;
    const planBytes = existsSync(resolve(root, planPath)) ? readFileSync(resolve(root, planPath)) : null;
    const plan = planBytes ? JSON.parse(planBytes) : null;
    const nativePath = `${base}/native-report-index.json`;
    const native = existsSync(resolve(root, nativePath)) ? JSON.parse(readFileSync(resolve(root, nativePath))) : null;
    const report = ['REPORT.md', 'README.md'].map(name => `${base}/${name}`).find(p => existsSync(resolve(root, p))) ?? null;
    cohorts.push({ id: entry.name, report, score: scorePath, score_sha256: hash(raw),
      plan: plan ? planPath : null, plan_file_sha256: planBytes ? hash(planBytes) : null,
      scope: score.limitation ?? 'Read the original report for scope',
      discovery: score.discovery, directed: score.directed,
      declared_spend_usdc: plan?.spend_usdc ?? null,
      native_report_manifest: native ? nativePath : null,
      native_reports_indexed: Array.isArray(native) ? native.length : null,
      // A plan's model is requested configuration, never a recovered model
      // revision. Keep that distinct from resolved metadata in native traces.
      runs: score.runs.map(run => ({ cell: run.cell?.id, host: run.cell?.host,
        requested_model: run.cell?.model, resolved_model: null,
        lane: run.cell?.lane, verification_condition: run.cell?.verification,
        usable: run.usable,
        stages: Object.fromEntries(Object.entries(run.stages ?? {}).map(([name, stage]) => [name, { state: stage.state, reason: stage.reason }])),
        observed_failure_stages: Object.entries(run.stages ?? {}).filter(([, stage]) => ['fail', 'incomplete'].includes(stage.state)).map(([name]) => name),
      })),
    });
  }
  cohorts.sort((a, b) => a.id.localeCompare(b.id));
  return { schema_version: 1, kind: 'historical_reviewed_cohort_index',
    limits: ['Not a fresh acquisition or rescore', 'No pooled conversion or model ranking',
      'Public score.json files only; older prose audits and private traces remain outside this index',
      'Same cell IDs in different cohorts are distinct attempts', 'Failure stages describe observations, not causes'],
    cohorts, other_instruments: other };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const output = process.argv[2];
  if (!output) throw new Error('Usage: node scripts/journey-evidence-index.mjs NEW_OUTPUT.json');
  const index = indexJourneyEvidence(resolve(import.meta.dirname, '..'));
  writeFileSync(resolve(output), JSON.stringify(index, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ cohorts_indexed: index.cohorts.length,
    runs_indexed: index.cohorts.reduce((n, c) => n + c.runs.length, 0),
    other_instruments: index.other_instruments.length, output }));
}
