import { env } from 'cloudflare:test';
import { beforeEach, expect, it, vi } from 'vitest';
import { KV_KEYS } from '@/lib/kv-keys';
import { signMessage } from '@/lib/signing';
import { canonicalizeCorpusSnapshot, getCorpusEntry } from '@/services/corpus';
import { sha256Hex } from '@/services/anchor-log';
import { sweepCorpusAnchors, CORPUS_ANCHORS_PER_PASS } from '@/services/corpus-anchors';
import { pendingProofBytes, bitcoinProofBytes } from './helpers/ots';
import type { CorpusSnapshot } from '@/services/corpus';
import type { Env } from '@/types';
import { corpusEntries } from '@/routes/feeds';
import workerSource from '../src/index.ts?raw';

const e = env as unknown as Env;
const now = new Date('2026-09-09T04:00:00Z');
const encoded = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const key = (n: number) => `${KV_KEYS.corpusPrefix}${String(n).padStart(9, '0')}`;

beforeEach(async () => {
  const rows = await e.COUNTERS.list({ prefix: KV_KEYS.corpusPrefix });
  await Promise.all(rows.keys.map(row => e.COUNTERS.delete(row.name)));
});

async function seed(n = 1, status: 'pending' | 'failed' | 'complete' = 'pending') {
  const snapshot: CorpusSnapshot = {
    version: 1, sequence: n, taken_at: now.toISOString(), previous_digest: null,
    source: 'ward_round', week: '2026-W37',
    round: { week: '2026-W37', at: now.toISOString(), hosts: [], listed_resources: 0,
      coverage_suspect: false, capped: false, our_search_presence: true },
  };
  const payload = canonicalizeCorpusSnapshot(snapshot);
  const signed = await signMessage(payload, e.SIGNING_KEY);
  const record = { snapshot, digest: await sha256Hex(payload), signature: signed.signature,
    public_key: signed.publicKey, ots: { status, submitted_at: now.toISOString(),
      proof_base64: encoded(status === 'complete' ? bitcoinProofBytes(100) : pendingProofBytes()),
      calendar: 'https://cal.test' } };
  await e.COUNTERS.put(key(n), JSON.stringify(record));
  return record;
}

it('finishes an existing proof without changing the signed history, and does no work twice', async () => {
  const before = await seed();
  const fetcher = vi.fn(async () => new Response(bitcoinProofBytes(100)));
  const result = await sweepCorpusAnchors(e, { now, fetch: fetcher });
  expect(result.upgraded).toBe(1);
  const after = await getCorpusEntry(e, 1);
  expect(after).toEqual({ ...before, ots: { ...before.ots, status: 'complete',
    proof_base64: encoded(bitcoinProofBytes(100)), upgraded_at: now.toISOString() } });
  await sweepCorpusAnchors(e, { now, fetch: fetcher });
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it('keeps pending proofs pending on a calendar miss or another pending answer', async () => {
  const before = await seed();
  for (const response of [new Response('', { status: 404 }), new Response(pendingProofBytes())]) {
    const result = await sweepCorpusAnchors(e, { now, fetch: async () => response });
    expect(result.upgraded).toBe(0);
    expect((await getCorpusEntry(e, 1))?.ots).toEqual(before.ots);
  }
});

it('retries failed submissions and bounds work newest first', async () => {
  await seed(1, 'failed');
  const result = await sweepCorpusAnchors(e, { now, fetch: async () => new Response(pendingProofBytes()) });
  expect(result.submitted).toBe(1);
  for (let n = 2; n <= CORPUS_ANCHORS_PER_PASS + 2; n++) await seed(n);
  const pass = await sweepCorpusAnchors(e, { now, fetch: async () => new Response(bitcoinProofBytes(100)) });
  expect(pass.attempted).toBe(CORPUS_ANCHORS_PER_PASS);
  expect(pass.deferred).toBe(2);
  expect((await getCorpusEntry(e, 1))?.ots?.status).toBe('pending');
});

it('refuses a tampered snapshot and counts a missing R2 object', async () => {
  const record = await seed();
  record.snapshot.week = '2026-W01';
  await e.COUNTERS.put(key(1), JSON.stringify(record));
  await e.COUNTERS.put(key(2), JSON.stringify({ pointer: true, sequence: 2, r2_key: 'missing', ots: record.ots }));
  const fetcher = vi.fn();
  const result = await sweepCorpusAnchors(e, { now, fetch: fetcher });
  expect(result.invalid).toBe(1);
  expect(result.unreadable).toBe(1);
  expect(fetcher).not.toHaveBeenCalled();
});

it('keeps the R2 object and its KV pointer in agreement', async () => {
  const record = await seed();
  let body = JSON.stringify(record);
  const bucket = { get: vi.fn(async () => ({ text: async () => body })),
    put: vi.fn(async (_key: string, value: string) => { body = value; }) };
  const pointer = { pointer: true, sequence: 1, r2_key: 'corpus/1.json',
    digest: record.digest, signature: record.signature, public_key: record.public_key,
    week: record.snapshot.week, ots: record.ots };
  await e.COUNTERS.put(key(1), JSON.stringify(pointer));
  const withBucket = { ...e, CORPUS_R2: bucket as unknown as R2Bucket };
  await sweepCorpusAnchors(withBucket, { now, fetch: async () => new Response(bitcoinProofBytes(100)) });
  const saved = JSON.parse(body);
  expect(saved.snapshot).toEqual(record.snapshot);
  expect(saved.signature).toBe(record.signature);
  const stored = await e.COUNTERS.get(key(1), 'json') as typeof pointer;
  expect(stored.ots).toEqual(saved.ots);
  expect(stored.ots.status).toBe('complete');
});

it('does not anchor a valid record returned under the wrong sequence or a malformed row', async () => {
  const record = await seed(1);
  await e.COUNTERS.delete(key(1));
  await e.COUNTERS.put(key(2), JSON.stringify(record));
  await e.COUNTERS.put(key(3), JSON.stringify({ snapshot: null }));
  const fetcher = vi.fn(async () => new Response(bitcoinProofBytes(100)));
  const result = await sweepCorpusAnchors(e, { now, fetch: fetcher });
  expect(result.invalid).toBe(2);
  expect(fetcher).not.toHaveBeenCalled();
  expect(await e.COUNTERS.get(key(1))).toBeNull();
});

it('has an hourly caller and does not describe a pending submission as Bitcoin-anchored', async () => {
  expect(workerSource).toContain('sweepCorpusAnchors(env)');
  await seed();
  const entries = await corpusEntries(e, 'https://scvd.store');
  expect(entries).toHaveLength(1);
  expect(entries[0]?.summary).toContain('pending');
  expect(entries[0]?.summary).not.toContain('Bitcoin-anchored');
});
