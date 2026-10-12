#!/usr/bin/env node
// Exercise the bundled Worker outside Vitest. All storage is ephemeral and
// outbound requests are intercepted: this script cannot buy or call live APIs.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { Miniflare, convertV4MiniflareOptions, Log, LogLevel } from 'miniflare';
import { parseJsonc } from './lib/jsonc.mjs';

const root = resolve(import.meta.dirname, '..');
const output = process.argv[2];
const twoWorkers = process.argv[3] === '--two-workers';
if (!output || (process.argv[3] && !twoWorkers) || process.argv.length > 5) throw new Error('Usage: node scripts/capacity-local.mjs NEW_OUTPUT.json [--two-workers]');
const temp = mkdtempSync(join(tmpdir(), 'scvd-capacity-'));
const report = { schema_version: 2, topology: twoWorkers ? 'doors-and-store' : 'store-only', measured_at: new Date().toISOString(),
  instrument_sha256: createHash('sha256').update(readFileSync(import.meta.filename)).digest('hex'),
  scope: 'Bundled local workerd; ephemeral storage; mocked facilitator; no live egress or payments',
  production_capacity_proven: false, journey_timeout_ms: 10000, scenarios: [], errors: [],
  limits: ['Timings start after runtime readiness, not isolate compilation. One machine, empty synthetic storage, mocked egress; no geographic, sustained, paid-settlement or production capacity claim.', 'With two Workers, local HTTP routing derives from configured route patterns; deployed Cloudflare zone routing itself is not exercised. MPP is disabled in this x402 fixture.'] };
const config = parseJsonc(readFileSync(join(root, 'wrangler.jsonc'), 'utf8'));
report.state = 'running';
writeFileSync(resolve(output), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
const checkpoint = () => writeFileSync(resolve(output), JSON.stringify(report, null, 2) + '\n');
let mf;
try {
  const configs = [config, ...(twoWorkers ? [parseJsonc(readFileSync(join(root, 'doors/wrangler.jsonc'), 'utf8'))] : [])];
  const bundles = configs.map((cfg, i) => {
    const dir = join(temp, String(i));
    const built = spawnSync(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'deploy', '--dry-run', '--config', i ? 'doors/wrangler.jsonc' : 'wrangler.jsonc', '--outdir', dir],
      { cwd: root, encoding: 'utf8', env: { ...process.env, WRANGLER_SEND_METRICS: 'false' } });
    if (built.status !== 0) throw new Error('Dry-run bundle failed; run npm run build:check for diagnostics');
    const entry = basename(cfg.main).replace(/\.[^.]+$/, '.js');
    const names = readdirSync(dir).filter(n => n !== 'README.md' && !n.endsWith('.map'));
    names.sort((a, b) => a === entry ? -1 : b === entry ? 1 : a.localeCompare(b));
    const modules = names.map(name => ({path: join(dir, name), type: name === entry ? 'ESModule' : /\.(md|m?js)$/.test(name) ? 'Text' : name.endsWith('.wasm') ? 'CompiledWasm' : 'Data'}));
    return {dir, modules, sha256: createHash('sha256').update(readFileSync(join(dir, entry))).digest('hex')};
  });
  report.bundles = configs.map((cfg, i) => ({name: cfg.name, sha256: bundles[i].sha256,
    config_sha256: createHash('sha256').update(readFileSync(join(root, i ? 'doors/wrangler.jsonc' : 'wrangler.jsonc'))).digest('hex')}));
  const modes = ['cold_quote', 'cold_discovery_quote', 'warm_discovery_quote', ...(twoWorkers ? ['forwarded_invalid_payment'] : [])];
  for (const mode of modes) {
    for (const concurrency of twoWorkers ? [1, 10, 50, 100, 250] : [1, 10, 50]) {
      report.in_progress = {mode, concurrency, phase: 'runtime_setup'};
      checkpoint();
      let supported = 0;
      const rejected = [];
      const outboundService = async request => {
        const url = new URL(request.url);
        if (url.hostname === 'api.cdp.coinbase.com' && url.pathname.endsWith('/x402/supported')) {
          supported++;
          return Response.json({ kinds: [
            { x402Version: 2, scheme: 'exact', network: 'eip155:8453' },
            { x402Version: 2, scheme: 'exact', network: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp', extra: { feePayer: 'DGxcPrAHL9YM3hW7iXuHFJmr87Zr6AMA4jCYHBpuvMgE' } },
          ], extensions: [], signers: {} });
        }
        rejected.push(`${request.method} ${url.origin}${url.pathname}`);
        return new Response('Fixture egress refused', { status: 503 });
      };
      const workers = configs.map((cfg, i) => ({
        name: cfg.name, modules: bundles[i].modules, modulesRoot: bundles[i].dir,
        routes: (cfg.routes ?? []).map(route => typeof route === 'string' ? route : route.pattern),
        compatibilityDate: cfg.compatibility_date, compatibilityFlags: cfg.compatibility_flags,
        bindings: { ...cfg.vars, STORE_BASE_URL: 'https://scvd.store',
          SIGNING_KEY: '9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60',
          PAY_TO_ADDRESS: '0x1111111111111111111111111111111111111111', CDP_API_KEY_ID: '', CDP_API_KEY_SECRET: '',
          MPP_CHECKOUT_ENABLED: 'false', BASE_RPC_URL: 'https://fixture.invalid', CF_VERSION_METADATA: { id: 'local-capacity' } },
        kvNamespaces: Object.fromEntries(cfg.kv_namespaces.map(x => [x.binding, 'fixture-' + x.id])),
        r2Buckets: Object.fromEntries(cfg.r2_buckets.map(x => [x.binding, 'fixture-' + x.bucket_name])),
        durableObjects: Object.fromEntries((cfg.durable_objects?.bindings ?? []).map(x => [x.name, { className: x.class_name, useSQLite: true }])),
        serviceBindings: Object.fromEntries((cfg.services ?? []).map(x => [x.binding, x.service])),
        outboundService,
      }));
      mf = new Miniflare(convertV4MiniflareOptions({ log: new Log(LogLevel.ERROR), workers }));
      await mf.ready;
      let sharedStorage = null;
      if (twoWorkers) {
        const checked = [];
        for (const ns of config.kv_namespaces) {
          const source = await mf.getKVNamespace(ns.binding, config.name);
          const target = await mf.getKVNamespace(ns.binding, configs[1].name);
          await source.put('capacity:shared-sentinel', ns.binding);
          if (await target.get('capacity:shared-sentinel') !== ns.binding) throw new Error('Fixture KV is not shared: ' + ns.binding);
          await source.delete('capacity:shared-sentinel');
          checked.push(ns.binding);
        }
        sharedStorage = {kv_bindings: checked, state: 'pass'};
      }
      // HTTP dispatch avoids the synchronous proxy used by getWorker().fetch:
      // that proxy stalled the Node event loop at 250 catalogue/quote journeys.
      const call = (url, init) => mf.dispatchFetch(url, init);
      const quote = async () => {
        const forwarded = mode === 'forwarded_invalid_payment';
        const response = await call('https://scvd.store/api/buy/hello', forwarded ? {headers: {'PAYMENT-SIGNATURE': 'fixture-invalid-payload'}} : undefined);
        if (forwarded) {
          await response.arrayBuffer();
          if (response.headers.get('X-Scvd-Doors') !== 'paid' || response.status < 400 || response.status >= 500) throw new Error(`Invalid forwarding/refusal: ${response.status}`);
          return;
        }
        if (twoWorkers && response.headers.get('X-Scvd-Doors')) throw new Error('Unpaid quote unexpectedly forwarded instead of answered by doors');
        const wire = response.headers.get('PAYMENT-REQUIRED');
        await response.arrayBuffer();
        if (response.status !== 402 || !wire) throw new Error(`Invalid quote status/header: ${response.status}`);
        const offer = JSON.parse(Buffer.from(wire, 'base64').toString('utf8'));
        if (offer.x402Version !== 2 || !offer.accepts?.length) throw new Error('Invalid quote envelope');
      };
      if (mode.startsWith('warm')) await quote();
      report.in_progress.phase = 'journeys';
      checkpoint();
      const start = performance.now();
      const journey = async () => {
        const began = performance.now();
        if (mode.includes('discovery')) {
          const response = await call('https://scvd.store/menu.json');
          await response.arrayBuffer();
          if (response.status !== 200) throw new Error(`Catalogue status ${response.status}`);
        }
        await quote();
        return performance.now() - began;
      };
      const results = await Promise.allSettled(Array.from({ length: concurrency }, () => {
        let timer;
        const deadline = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Journey deadline exceeded')), report.journey_timeout_ms); });
        return Promise.race([journey(), deadline]).finally(() => clearTimeout(timer));
      }));
      const timings = results.filter(r => r.status === 'fulfilled').map(r => r.value).sort((a, b) => a - b);
      const failedTimings = results.filter(r => r.status === 'rejected').length;
      const failures = results.filter(r => r.status === 'rejected').map(r => String(r.reason));
      report.scenarios.push({ mode, concurrency, shared_storage: sharedStorage, complete: timings.length, failed: failedTimings, failures,
        requests_per_journey: mode.includes('discovery') ? 2 : 1,
        wall_ms: Math.round(performance.now() - start), p95_successful_journey_ms: timings.length ? Math.round(timings[Math.ceil(timings.length * .95) - 1]) : null,
        supported_calls: supported, refused_egress: rejected, payments: 0 });
      console.log(JSON.stringify(report.scenarios.at(-1)));
      if (failures.length || rejected.length) process.exitCode = 1;
      report.in_progress.phase = 'cleanup';
      checkpoint();
      await mf.dispose(); mf = undefined;
    }
  }
} catch (error) {
  report.errors.push(String(error)); process.exitCode = 1;
} finally {
  if (mf) await mf.dispose().catch(error => report.errors.push(`Cleanup: ${String(error)}`));
  report.state = process.exitCode || report.errors.length ? 'failed' : 'completed';
  delete report.in_progress;
  report.finished_at = new Date().toISOString();
  checkpoint();
  rmSync(temp, { recursive: true, force: true });
}
