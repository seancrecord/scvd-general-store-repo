import { BASE_NETWORK } from '../../../src/lib/payment-networks';
import { SANCTIONS_ORACLE_BASE, oracleCalldata, decodeOracleBoolean } from '../../../src/lib/sanctions-oracle';

export interface Provider {
  id: string;
  operator: string;
  budgetId: string;
  endpoint: string;
  costs: { chain: number; block: number; call: number };
}
export interface ReaderPolicy {
  id: string;
  deadlineMs: number;
  maxAgeMs: number;
  maxAncestry: number;
  maxResponseBytes: number;
}
export interface Admission {
  id: string;
  caller: string;
  tier: 'free' | 'paid';
  policyId: string;
}
export interface Lease { token: string; allowances: { id: string; units: number }[] }
export interface Budget {
  reserve(request: Admission): Promise<Lease | null>;
  release(token: string): Promise<void>;
}
interface Block { number: number; hash: string; parentHash: string; timestampMs: number }
export interface Attempt { witness: string; method: string; units: number; responseBytes: number; outcome: 'pending' | 'result' | 'failed' }
type Timer = number | ReturnType<typeof setTimeout>;
export const label = (x: unknown): x is string => typeof x === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(x);
const positive = (x: number) => Number.isSafeInteger(x) && x > 0;
function require(value: unknown): asserts value { if (!value) throw Error('screening_unavailable'); }
function object(x: unknown): Record<string, unknown> { require(x && typeof x === 'object' && !Array.isArray(x)); return x as Record<string, unknown>; }
function quantity(x: unknown): number {
  require(typeof x === 'string' && /^0x(?:0|[1-9a-f][0-9a-f]*)$/.test(x) && x.length <= 16);
  const n = Number(BigInt(x)); require(Number.isSafeInteger(n)); return n;
}
function hash(x: unknown): string { require(typeof x === 'string' && /^0x[0-9a-f]{64}$/.test(x)); return x; }
function block(x: unknown): Block {
  const b = object(x), timestampMs = quantity(b.timestamp) * 1000;
  require(Number.isSafeInteger(timestampMs));
  return { number: quantity(b.number), hash: hash(b.hash), parentHash: hash(b.parentHash), timestampMs };
}
export function validateReaderPolicy(p: ReaderPolicy): void {
  require(label(p.id) && positive(p.deadlineMs) && p.deadlineMs <= 10000 && positive(p.maxAgeMs));
  require(Number.isSafeInteger(p.maxAncestry) && p.maxAncestry >= 0 && p.maxAncestry <= 64);
  require(positive(p.maxResponseBytes) && p.maxResponseBytes <= 1048576);
}
export function allowance(p: ReaderPolicy, costs: Provider['costs']): number {
  require([costs.chain, costs.block, costs.call].every(positive));
  const units = costs.chain + (1 + p.maxAncestry) * costs.block + costs.call;
  require(positive(units)); return units;
}

/** Runnable transport, still unwired to checkout. Credentials are constructor inputs only. */
export function createBaseReader(options: {
  providers: [Provider, Provider]; policy: ReaderPolicy; budget: Budget;
  now: () => number; waitUntil: (promise: Promise<unknown>) => void;
  fetchImpl?: typeof fetch;
  schedule?: (callback: () => void, ms: number) => Timer;
  cancel?: (timer: Timer) => void;
}) {
  const pair = structuredClone(options.providers), p = structuredClone(options.policy);
  validateReaderPolicy(p); require(pair.length === 2);
  for (const field of ['id', 'operator', 'budgetId'] as const) {
    require(pair.every(v => label(v[field])) && new Set(pair.map(v => v[field])).size === 2);
  }
  for (const v of pair) {
    let u: URL;
    try {u = new URL(v.endpoint);} catch {throw Error('screening_provider_configuration_unavailable');}
    require(u.protocol === 'https:' && !u.username && !u.password && !u.hash);
    allowance(p, v.costs);
  }
  require(new URL(pair[0].endpoint).hostname !== new URL(pair[1].endpoint).hostname);
  const fetchImpl = options.fetchImpl ?? fetch;
  const schedule = options.schedule ?? setTimeout, cancel = options.cancel ?? clearTimeout;
  const time = () => { const t = options.now(); require(Number.isSafeInteger(t) && t >= 0); return t; };
  return async (input: { network: string; address: string }, admission: Omit<Admission, 'policyId'>) => {
    const attempts: Attempt[] = [];
    const unavailable = () => ({ status: 'unavailable' as const, production_ready: false, attempts: structuredClone(attempts) });
    const calldata = typeof input?.address === 'string' ? oracleCalldata(input.address) : null;
    if (input?.network !== BASE_NETWORK || calldata === null)
      return { status: 'unsupported' as const, production_ready: false, attempts };
    const address = input.address.toLowerCase();
    if (!label(admission.id) || !label(admission.caller) || !['free', 'paid'].includes(admission.tier)) return unavailable();
    const identity = { ...admission, policyId: p.id };
    const controller = new AbortController();
    const reservation: { lease: Lease | null } = {lease:null};
    let timer: Timer | undefined;
    const pending: Promise<unknown>[] = [];
    let start: number;
    try {start = time();} catch {return unavailable();}
    const deadline = new Promise<never>((_, reject) => {
      timer = schedule(() => { controller.abort(); reject(Error('screening_deadline')); }, p.deadlineMs);
    });
    const work = (async () => {
      const lease = reservation.lease = await options.budget.reserve(identity);
      require(lease && !controller.signal.aborted);
      require(lease.allowances.length === pair.length && pair.every((v, i) => lease?.allowances[i]?.id === v.id && lease.allowances[i]?.units === allowance(p, v.costs)));
      const used = [0, 0];
      async function rpc(index: 0 | 1, method: string, params: unknown[], units: number): Promise<unknown> {
        const v = pair[index];
        const current=time();require(!controller.signal.aborted && current >= start && current - start < p.deadlineMs);
        require(used[index]! + units <= allowance(p, v.costs)); used[index]! += units;
        const id = attempts.length + 1;
        const attempt: Attempt = { witness: v.id, method, units, responseBytes: 0, outcome: 'pending' }; attempts.push(attempt);
        const request = (async () => {
          try {
            const response = await fetchImpl(v.endpoint, { method: 'POST', redirect: 'error', signal: controller.signal,
              headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id, method, params }) });
            const reader = response.body?.getReader(); require(reader);
            const chunks: Uint8Array[] = [];
            try {
              require(response.ok);
              for (;;) {
                const part = await reader.read(); if (part.done) break;
                attempt.responseBytes += part.value.byteLength; require(attempt.responseBytes <= p.maxResponseBytes);
                chunks.push(part.value);
              }
            } finally { await reader.cancel().catch(() => {}); }
            const bytes = new Uint8Array(attempt.responseBytes); let offset = 0;
            for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
            const body = object(JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM:false }).decode(bytes)));
            require(body.jsonrpc === '2.0' && body.id === id && !Object.hasOwn(body, 'error') && Object.hasOwn(body, 'result'));
            attempt.outcome = 'result'; return body.result;
          } catch { attempt.outcome = 'failed'; throw Error('screening_rpc_failed'); }
        })();
        pending.push(request); return request;
      }
      // All reads, including handshake/head resolution, occur after durable admission.
      const heads = await Promise.all(pair.map(async (v, n) => {
        const i = n as 0 | 1;
        require(await rpc(i, 'eth_chainId', [], v.costs.chain) === '0x' + BigInt(BASE_NETWORK.split(':')[1]!).toString(16));
        return block(await rpc(i, 'eth_getBlockByNumber', ['safe', false], v.costs.block));
      }));
      const candidate = heads[0]!.number <= heads[1]!.number ? heads[0]! : heads[1]!;
      require(time() >= candidate.timestampMs && time() - candidate.timestampMs <= p.maxAgeMs);
      const answers = await Promise.all(pair.map(async (v, n) => {
        const i = n as 0 | 1; let cursor = heads[i]!;
        require(cursor.number - candidate.number <= p.maxAncestry);
        require(cursor.timestampMs <= time() && cursor.timestampMs >= candidate.timestampMs);
        while (cursor.number > candidate.number) {
          const parent = block(await rpc(i, 'eth_getBlockByHash', [cursor.parentHash, false], v.costs.block));
          require(parent.hash === cursor.parentHash && parent.number === cursor.number - 1 && parent.timestampMs <= cursor.timestampMs);
          cursor = parent;
        }
        require(cursor.hash === candidate.hash && cursor.parentHash === candidate.parentHash && cursor.timestampMs === candidate.timestampMs);
        const raw = await rpc(i, 'eth_call', [{ to: SANCTIONS_ORACLE_BASE, data: calldata }, { blockHash: candidate.hash, requireCanonical: true }], v.costs.call);
        const listed = decodeOracleBoolean(raw); require(listed !== null && typeof raw === 'string');
        return { witness: v.id, safeHead: heads[i]!, raw, listed };
      }));
      require(answers[0]!.listed === answers[1]!.listed);
      const end = time(); require(end >= start && end - start < p.deadlineMs && end - candidate.timestampMs <= p.maxAgeMs);
      return { status: 'observed_unsigned' as const, production_ready: false, network: BASE_NETWORK, address,
        contract: SANCTIONS_ORACLE_BASE, calldata, block: candidate, policyId: p.id, confirmationPolicy: 'safe' as const,
        result: answers[0]!.listed ? 'listed' as const : 'not_listed' as const, witnesses: answers,
        observedAtMs: end, attempts: structuredClone(attempts) };
    })();
    try { return await Promise.race([work, deadline]); }
    catch { return unavailable(); }
    finally {
      if (timer !== undefined) cancel(timer); controller.abort();
      // Late admission and non-cooperative fetches keep their lease. Release is
      // durable and idempotent; failure leaves capacity closed for reconciliation.
      options.waitUntil((async () => {
        await work.catch(() => {}); await Promise.allSettled(pending);
        if (reservation.lease) await options.budget.release(reservation.lease.token);
      })().catch(() => {}));
    }
  };
}
