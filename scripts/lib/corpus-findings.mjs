// Dated research over signed host rows. Never infer a new observation from a new snapshot.
const tally = values => Object.fromEntries([...new Set(values)].sort().map(value => [value, values.filter(v => v === value).length]));
const known = value => typeof value === 'string' && value.length > 0;
const time = value => known(value) && Number.isFinite(Date.parse(value));
const identity = row => known(row.host) && known(row.url) ? JSON.stringify([row.host, row.url]) : null;
const checks = row => Array.isArray(row.failed) && row.failed.every(v => typeof v === 'string');
const ref = (doc, index) => ({ sequence: doc.snapshot.sequence, digest: doc.digest,
  snapshot_url: `https://scvd.store/corpus/${doc.snapshot.sequence}.json`, row_pointer: `/round/hosts/${index}` });

function indexed(doc) {
  const groups = new Map();
  doc.snapshot.round.hosts.forEach((row, index) => {
    const key = identity(row);
    if (key) groups.set(key, [...(groups.get(key) ?? []), { row, index }]);
  });
  return groups;
}

export function deriveCorpusFindings(documents) {
  const docs = [...documents].sort((a, b) => a.snapshot.sequence - b.snapshot.sequence);
  if (!docs.length) throw new Error('empty_corpus');
  const pairs = [];
  const events = [];
  for (let i = 1; i < docs.length; i++) {
    const before = docs[i - 1], after = docs[i];
    const a = indexed(before), b = indexed(after);
    const summary = { from_sequence: before.snapshot.sequence, to_sequence: after.snapshot.sequence,
      shared_exact_host_url: 0, eligible_fresh_pairs: 0, exclusions: {},
      not_ready_to_ready: 0, ready_to_not_ready: 0, repeated_failed_check_pairs: 0,
      failed_checks_repeated: {}, failed_checks_no_longer_reported: {}, failed_checks_newly_reported: {} };
    const exclude = reason => { summary.exclusions[reason] = (summary.exclusions[reason] ?? 0) + 1; };
    for (const [key, current] of b) {
      const previous = a.get(key);
      if (!previous) continue;
      summary.shared_exact_host_url++;
      if (previous.length !== 1 || current.length !== 1) { exclude('duplicate_identity'); continue; }
      const { row: was, index: ai } = previous[0], { row: now, index: bi } = current[0];
      // Exclusions are mutually exclusive, in this order. Unknown is never GET.
      if (!time(was.observed_at) || !time(now.observed_at)) { exclude('missing_or_invalid_observation_time'); continue; }
      if (Date.parse(now.observed_at) === Date.parse(was.observed_at)) { exclude('same_observation_time'); continue; }
      if (Date.parse(now.observed_at) < Date.parse(was.observed_at)) { exclude('time_moved_backwards'); continue; }
      if (!known(was.probe_method) || !known(now.probe_method)) { exclude('method_not_recorded'); continue; }
      if (was.probe_method !== now.probe_method) { exclude('method_changed'); continue; }
      if (!known(was.battery) || !known(now.battery)) { exclude('battery_not_recorded'); continue; }
      if (was.battery !== now.battery) { exclude('battery_changed'); continue; }
      if (![was.verdict, now.verdict].every(v => ['ready', 'not_ready'].includes(v))) { exclude('not_probed_or_unreachable'); continue; }
      if (!checks(was) || !checks(now)) { exclude('failed_checks_not_recorded'); continue; }
      summary.eligible_fresh_pairs++;
      const repeated = [...new Set(was.failed)].filter(c => now.failed.includes(c)).sort();
      const removed = [...new Set(was.failed)].filter(c => !now.failed.includes(c)).sort();
      const added = [...new Set(now.failed)].filter(c => !was.failed.includes(c)).sort();
      if (was.verdict === 'not_ready' && now.verdict === 'ready') summary.not_ready_to_ready++;
      if (was.verdict === 'ready' && now.verdict === 'not_ready') summary.ready_to_not_ready++;
      if (repeated.length) summary.repeated_failed_check_pairs++;
      for (const [field, values] of [['failed_checks_repeated', repeated], ['failed_checks_no_longer_reported', removed], ['failed_checks_newly_reported', added]]) {
        for (const value of values) summary[field][value] = (summary[field][value] ?? 0) + 1;
      }
      events.push({ host: now.host, url: now.url, method: now.probe_method, battery: now.battery,
        from: { ...ref(before, ai), observed_at: was.observed_at, verdict: was.verdict },
        to: { ...ref(after, bi), observed_at: now.observed_at, verdict: now.verdict },
        repeated_failed_checks: repeated, no_longer_reported_failed_checks: removed, newly_reported_failed_checks: added });
    }
    if (summary.shared_exact_host_url !== summary.eligible_fresh_pairs + Object.values(summary.exclusions).reduce((n, v) => n + v, 0)) throw new Error('unreconciled_pair_denominator');
    pairs.push(summary);
  }
  const latest = docs.at(-1), rows = latest.snapshot.round.hosts;
  const catalog = rows.flatMap((row, i) => row.catalog?.state === 'differs' ? [{
    ...ref(latest, i), host: row.host, url: row.url, method: row.probe_method ?? null,
    observed_at: row.observed_at ?? null, verdict: row.verdict,
    catalog_updated_at: row.catalog.last_updated ?? null, fields: row.catalog.fields ?? [],
  }] : []);
  const comparable = rows.filter(row => ['agrees', 'differs'].includes(row.catalog?.state));
  const latestSummary = { sequence: latest.snapshot.sequence, snapshot_time: latest.snapshot.taken_at,
    round_time: latest.snapshot.round.at, host_rows: rows.length,
    verdicts: tally(rows.map(r => r.verdict ?? 'missing')), methods: tally(rows.map(r => r.probe_method ?? 'missing')),
    observation_time_missing_or_invalid: rows.filter(r => !time(r.observed_at)).length,
    observation_time_range: rows.map(r => r.observed_at).filter(time).sort().filter((_, i, a) => i === 0 || i === a.length - 1),
    catalog_states: tally(rows.map(r => r.catalog?.state ?? 'missing')), catalog_comparable: comparable.length,
    catalog_differs: catalog.length, catalog_differs_while_x402_ready: catalog.filter(r => r.verdict === 'ready').length,
    mpp_spoken_rows: rows.filter(r => r.mpp?.spoken === true).length,
    mpp_spoken_and_x402_not_ready: rows.filter(r => r.mpp?.spoken === true && r.verdict === 'not_ready').length };
  return { version: 1, scope: 'Unsigned derivation over host rows in a pinned signed snapshot chain; no live seller probes or paid transactions.',
    limits: ['Host rows are sampled endpoints, not every route or independent purchases.',
      'New snapshot time is not a new probe time. Missing row observation times and methods stay unknown.',
      'Same recorded battery is a comparability filter, not proof that every implementation detail remained identical.',
      'Failed checks are x402 battery outcomes; MPP-only endpoints can be x402 not_ready without an MPP defect.',
      'Repeated failure at two moments does not establish continuous failure, repair time, repair causation, or current state.',
      'Catalog comparison is the signed row’s recorded comparison, not a new comparison with a live directory.',
      'No payment, delivery, buyer behavior, market share, or Bitcoin timestamp verification is established.'],
    snapshot_count: docs.length, host_rows_across_snapshots: docs.reduce((n, d) => n + d.snapshot.round.hosts.length, 0),
    latest: latestSummary, pairs, comparable_events: events, catalog_difference_rows: catalog };
}
