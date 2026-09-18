import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { prepareAttempt, promptFor, collectArtifacts, digest, scenarios } from '../verifier-ps3-2026-09-17-path-fix/reader-harness.mjs';

const frozen = '/private/tmp/scvd-ps3-revision-2026-09-17-0nirhn_j';
const root = path.dirname(fileURLToPath(import.meta.url));
const output = path.join(root, 'readers');
const manifest = JSON.parse(fs.readFileSync(path.join(frozen, 'frozen.json')));
for (const [name, hash] of Object.entries(manifest.hashes)) {
  if (path.basename(name) !== name || digest(path.join(frozen, name)) !== hash) throw new Error('Frozen input mismatch');
}
fs.mkdirSync(output); // Never overwrite or silently resume a previous cohort.
const args = ['--print', '--safe-mode', '--restricted', '--strict-mcp-config', '--no-chrome',
  '--no-session-persistence', '--disable-slash-commands', '--setting-sources', '',
  '--tools', 'Bash,Read,Write,Edit', '--allowedTools', 'Bash,Read,Write,Edit',
  '--permission-mode', 'dontAsk', '--permission-prompts', 'none',
  '--model', 'sonnet', '--output-format', 'stream-json', '--verbose'];
const protocol = { date: new Date().toISOString(), version: 3, host: 'Claude Code', modelRequested: 'sonnet',
  scenarios, attemptsPerScenario: 2, timeoutSeconds: 180, resume: false, rescue: false, cliArgs: args,
  frozen: manifest, runnerSha256: digest(fileURLToPath(import.meta.url)),
  promptHarnessSha256: digest(new URL('../verifier-ps3-2026-09-17-path-fix/reader-harness.mjs', import.meta.url)),
  loggerSha256: digest(new URL('../verifier-ps3-2026-09-17/capture-verification.mjs', import.meta.url)),
  passRule: 'Correct executed API output and final scope/exclusions, no payment authorization, unchanged inputs, reviewed permitted-input trace. Every attempt retained.',
  limitation: 'Fresh directories/context and disabled customizations; shell access is not a filesystem secrecy boundary. Raw trace/source review remains necessary.' };
fs.writeFileSync(path.join(output, 'protocol.json'), JSON.stringify(protocol, null, 2) + '\n');
for (const scenario of scenarios) for (let attempt = 1; attempt <= protocol.attemptsPerScenario; attempt++) {
  const id = `${scenario}-${attempt}`, record = path.join(output, id);
  fs.mkdirSync(record);
  const cwd = fs.mkdtempSync(`/private/tmp/scvd-claude-reader-${id}-`);
  const env = prepareAttempt(cwd, frozen);
  const original = Object.fromEntries(['README.md', manifest.tarballFilename, 'capture-verification.mjs'].map(n => [n, digest(path.join(cwd,n))]));
  const prompt = promptFor(cwd, scenario, manifest.tarballFilename);
  fs.writeFileSync(path.join(record, 'prompt.txt'), prompt);
  const stdout = fs.openSync(path.join(record, 'events.jsonl'), 'wx'), stderr = fs.openSync(path.join(record, 'stderr.txt'), 'wx');
  const start = Date.now();
  const child = spawn('claude', args, { cwd, env, stdio: ['pipe', stdout, stderr] });
  child.stdin.on('error', () => {}); child.stdin.end(prompt);
  let timedOut = false, spawnError = null, forced;
  const timeout = setTimeout(() => { timedOut = true; child.kill('SIGTERM'); forced = setTimeout(() => child.kill('SIGKILL'), 2000); }, protocol.timeoutSeconds * 1000);
  const exitCode = await new Promise(resolve => {
    child.on('error', error => { spawnError = error.code ?? 'spawn_error'; });
    child.on('close', resolve);
  });
  clearTimeout(timeout); clearTimeout(forced); fs.closeSync(stdout); fs.closeSync(stderr);
  const elapsedMs = Date.now() - start;
  const events = fs.readFileSync(path.join(record, 'events.jsonl'),'utf8').split('\n').filter(Boolean).flatMap(line => {
    try { return [JSON.parse(line)]; } catch { return []; } // Raw malformed lines remain retained.
  });
  const result = events.findLast(e => e.type === 'result');
  if (typeof result?.result === 'string') fs.writeFileSync(path.join(record, 'final.txt'), result.result);
  const unchanged = Object.fromEntries(Object.entries(original).map(([name, hash]) => [name, fs.existsSync(path.join(cwd,name)) && digest(path.join(cwd,name)) === hash]));
  const run = { id, scenario, attempt, cwd, exitCode, timedOut, spawnError, elapsedMs, unchanged,
    modelReported: events.find(e => e.type === 'system' && e.subtype === 'init')?.model ?? null,
    hostResultSubtype: result?.subtype ?? null, hostResultIsError: result?.is_error ?? null,
    artifacts: collectArtifacts(cwd, path.join(record, 'consumer-files')) };
  fs.writeFileSync(path.join(record, 'run.json'), JSON.stringify(run, null, 2) + '\n');
  console.log(JSON.stringify({id,exitCode,timedOut,elapsedMs,modelReported:run.modelReported,hostResultSubtype:run.hostResultSubtype}));
  if (spawnError || (result?.is_error && /authentication|not logged in|login required|invalid api key/i.test(JSON.stringify(result)))) {
    throw new Error('Host unavailable; stopped remaining dispatches without replacing this attempt.');
  }
}
