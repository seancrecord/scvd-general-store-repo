import assert from 'node:assert/strict';
import test from 'node:test';
import { generateKeyPairSync, sign, createHash } from 'node:crypto';
import { buildCorpusViewer, configureCorpusCard } from './lib/corpus-viewer.mjs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const key = publicKey.export({ type: 'spki', format: 'der' }).subarray(-32).toString('hex');
function round(sequence, previous, hosts) {
  const snapshot = { version: 1, sequence, taken_at: '2026-09-28T00:00:00Z', previous_digest: previous, source: 'ward_round', week: '2026-W40', round: { at: '2026-09-27T00:00:00Z', hosts } };
  const bytes = JSON.stringify(snapshot);
  return { snapshot, digest: createHash('sha256').update(bytes).digest('hex'), signature: sign(null, Buffer.from(bytes), privateKey).toString('hex'), public_key: key };
}
test('viewer keeps observations distinct, links exact signed rows and leaves original bytes unchanged', async () => {
  const a = round(1, null, [{ host: 'a.test', verdict: 'not_probed', failed: [], advisories: [] }]);
  const b = round(2, a.digest, [{ host: 'a.test', url: 'https://a.test/', verdict: 'ready', failed: [], advisories: ['no-offer'] }]);
  const before = JSON.stringify([a,b]);
  const views = await buildCorpusViewer([a,b], { base: 'https://scvd.store', publicKey: key });
  const rows = views.observations.trim().split('\n').map(JSON.parse);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].verdict, 'not_probed');
  assert.equal(rows[0].url, '');
  assert.equal(rows[1].snapshot_digest, b.digest);
  assert.equal(rows[1].row_pointer, '/round/hosts/0');
  assert.equal(rows[1].observed_at, '');
  assert.equal(rows[1].round_observed_at, b.snapshot.round.at);
  assert.equal(rows[1].captured_at, b.snapshot.taken_at);
  assert.equal(JSON.stringify([a,b]), before);
  const tampered = structuredClone(b); tampered.snapshot.round.hosts[0].verdict = 'broken';
  await assert.rejects(buildCorpusViewer([a,tampered], { base: 'https://scvd.store', publicKey: key }), /digest/);
  await assert.rejects(buildCorpusViewer([b], { base: 'https://scvd.store', publicKey: key }), /chain/);
  const forged = structuredClone(a); forged.signature = '00'.repeat(64);
  await assert.rejects(buildCorpusViewer([forged], { base: 'https://scvd.store', publicKey: key }), /signature/);
});
test('explicit viewer files exclude signed raw JSON and preserve the live card prose', () => {
  const card = '---\nlicense: cc-by-4.0\nsize_categories:\n- n<1K\n---\nExisting prose.\n';
  const updated = configureCorpusCard(card, "keeper-scvd/test");
  assert.ok(updated.includes('path: viewer/observations.jsonl'));
  assert.ok(updated.includes('path: viewer/rounds.jsonl'));
  assert.ok(updated.includes('Existing prose.\n'));
  assert.ok(!updated.includes('size_categories:'));
  assert.ok(updated.includes('## Loading the table views'));
  assert.ok(updated.includes('name="observations"'));
  assert.ok(updated.includes('load_dataset("keeper-scvd/test"'));
  assert.ok(updated.includes('unsigned projections'));
  assert.ok(updated.includes('examples/corpus-recompute.ipynb'));
  assert.ok(updated.includes('round_observed_at'));
  assert.ok(updated.includes('Older readings can be carried forward'));
  assert.equal(configureCorpusCard(updated, "keeper-scvd/test"), updated);
  const legacy = 'One probe per host per round, at indexer cadence: a door that was down for the minute of the probe reads as unreachable for the week.';
  const corrected = configureCorpusCard(card + legacy, 'keeper-scvd/test');
  assert.ok(!corrected.includes(legacy));
  assert.ok(corrected.includes('A snapshot can carry earlier host readings forward.'));
  assert.throws(()=>configureCorpusCard('---\nconfigs:\n- config_name: custom\n---\nProse', 'keeper-scvd/test'), /existing/);
});
test('viewer dates each host observation independently of the newer snapshot round', async () => {
  const observed = '2026-09-21T01:00:00Z';
  const doc = round(1, null, [{ host: 'dated.test', observed_at: observed, probe_method: 'POST', battery: 'preflight-v2' }, { host: 'undated.test' }]);
  const views = await buildCorpusViewer([doc], { base: 'https://scvd.store', publicKey: key });
  const [dated, undated] = views.observations.trim().split('\n').map(JSON.parse);
  assert.equal(dated.observed_at, observed);
  assert.equal(dated.round_observed_at, doc.snapshot.round.at);
  assert.equal(dated.probe_method, 'POST');
  assert.equal(dated.battery, 'preflight-v2');
  assert.equal(undated.observed_at, '');
  assert.equal(undated.probe_method, '');
});

test('publisher repairs an up-to-date HF mirror without uploading old signed rounds or contacting Zenodo', async () => {
  const doc = round(1, null, [{ host: 'a.test', verdict: 'not_probed' }]);
  const script = `
    import assert from 'node:assert/strict';
    const doc = ${JSON.stringify(doc)};
    const key = ${JSON.stringify(key)};
    process.env.STORE_BASE_URL = 'https://scvd.store';
    process.env.HF_TOKEN = 'test-only';
    process.env.ZENODO_TOKEN = 'test-only';
    process.argv.push('--hf-only', '--refresh-viewer');
    let committed = false;
    globalThis.fetch = async (url, init = {}) => {
      assert.ok(!String(url).includes('zenodo.org'));
      const path = new URL(url).pathname;
      const json = value => new Response(JSON.stringify(value));
      if (path === '/corpus.json') return json({ sameAs: ['https://huggingface.co/datasets/keeper-scvd/test'], distribution: [{contentUrl:'https://scvd.store/corpus/1.json'}] });
      if (path === '/corpus/1.json') return json(doc);
      if (path === '/corpus/tiers.json') return json({});
      if (path === '/.well-known/scvd-signing-key') return json({public_key:key});
      if (path.endsWith('/tree/main')) return json([{path:'1.json'}]);
      if (path.endsWith('/raw/main/README.md')) return new Response('---\\nlicense: cc-by-4.0\\n---\\nOriginal prose.\\n');
      if (path.endsWith('/preupload/main')) return json({files:JSON.parse(init.body).files.map(f=>({...f,uploadMode:'regular'}))});
      if (path.endsWith('/commit/main')) {
        const lines = init.body.trim().split('\\n').map(JSON.parse);
        const files = lines.slice(1).map(l=>l.value);
        assert.ok(!files.some(f=>f.path==='1.json'));
        assert.deepEqual(files.map(f=>f.path).sort(), ['README.md','corpus.json','tiers.json','viewer/observations.jsonl','viewer/rounds.jsonl']);
        const card = Buffer.from(files.find(f=>f.path==='README.md').content,'base64').toString();
        assert.ok(card.includes('path: viewer/observations.jsonl'));
        committed = true;
        return json({});
      }
      throw new Error('unexpected fixture request '+path);
    };
    process.on('exit',()=> { if (!committed) process.exitCode=1; });
    await import(${JSON.stringify(new URL('./corpus-publish.mjs', import.meta.url).href)});
  `;
  await promisify(execFile)(process.execPath, ['--input-type=module', '-e', script]);
});
