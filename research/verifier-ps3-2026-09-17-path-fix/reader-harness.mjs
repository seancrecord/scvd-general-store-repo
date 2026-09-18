import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

export const digest = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
export const scenarios = ['valid', 'tampered', 'unsupported', 'unavailable-key'];
const capture = new URL('../verifier-ps3-2026-09-17/capture-verification.mjs', import.meta.url);

export function prepareAttempt(cwd, frozen) {
  const manifest = JSON.parse(fs.readFileSync(path.join(frozen, 'frozen.json')));
  for (const name of ['README.md', manifest.tarballFilename]) fs.copyFileSync(path.join(frozen, name), path.join(cwd, name));
  fs.copyFileSync(capture, path.join(cwd, 'capture-verification.mjs'));
  fs.writeFileSync(path.join(cwd, '.npmrc'), 'offline=true\nignore-scripts=true\naudit=false\nfund=false\n');
  // Environment settings survive npm changing project roots in a nested consumer.
  return { ...process.env, npm_config_cache: path.join(fs.realpathSync(cwd), '.npm-cache'),
    npm_config_offline: 'true', npm_config_ignore_scripts: 'true', npm_config_audit: 'false', npm_config_fund: 'false' };
}

const shellQuote = (value) => "'" + value.replaceAll("'", "'\\''") + "'";

export function promptFor(cwd, scenario, tarballFilename) {
  if (!scenarios.includes(scenario)) throw new Error('Unknown scenario');
  if (!path.isAbsolute(cwd)) throw new Error('Workspace must be absolute');
  if (!tarballFilename || path.basename(tarballFilename) !== tarballFilename || !tarballFilename.endsWith('.tgz')) throw new Error('Tarball must be a local filename');
  const install = `npm install ${shellQuote(path.join(cwd, tarballFilename))} --offline --ignore-scripts --no-audit --no-fund`;
  return `You are a fresh developer evaluating a package with no previous project context. Work only in ${cwd}. Read README.md and install the supplied local tarball using this exact command. It works from the trial root or a consumer subdirectory; do not replace the absolute tarball path with ../ or another relative path.

<!-- install-command -->
${install}

Complete the README's "${scenario}" scenario by actually running the installed package. You may read README, packaged fixtures/provenance and type declarations, and create a consumer script. Do not inspect the verifier implementation, any source repository, other trial directories, host credentials, memory, or the internet. Do not use expected-results fields as execution evidence. Preserve README, tarball and capture-verification.mjs. No publishing, external messages or payments.

Write the actual API output to observed.json, and return JSON with status, reasonCodes, scope, doesNotEstablish, outputFile, canAuthorizePayment, and blockers. Follow the README's guidance on explaining results. If execution cannot complete, report the blocker instead of inventing output. No follow-up help is supplied.

Run your consumer through the provided logger: node ${shellQuote(path.join(cwd, 'capture-verification.mjs'))} <consumer-script.mjs> [scenario]. Its stdout is your consumer's stdout; it also retains separate stdout, stderr and exit-status files in .verification-runs. Use this as a standalone tool command, with no appended diagnostics. Keep consumer stdout as the API result JSON. The logger supplies no verifier code or expected answer. No git commands are needed; this directory is not a repository. npm is configured offline with an absolute cache under this workspace, including from nested directories. Do not inspect or repair a home-directory cache if an install fails; report the failure.`;
}

export function collectArtifacts(cwd, destination) {
  const files = [];
  function visit(dir, relative = '') {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (['node_modules', '.npm-cache', '.git'].includes(entry.name) || entry.isSymbolicLink()) continue;
      const rel = path.join(relative, entry.name), source = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(source, rel);
      else if (/\.(?:json|mjs|cjs|js|mts|ts|txt)$/.test(entry.name)) {
        const target = path.join(destination, rel);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.copyFileSync(source, target);
        files.push({ path: rel, sha256: digest(source) });
      }
    }
  }
  visit(cwd);
  return files;
}

export async function runAttempt({ id, scenario, attempt, frozen, output, model, timeoutMs = 180000 }) {
  const record = path.join(output, id);
  // An existing attempt is an error, not a silent skip or a retry.
  fs.mkdirSync(record);
  const cwd = fs.mkdtempSync(`/private/tmp/scvd-reader-v3-${id}-`);
  const env = prepareAttempt(cwd, frozen);
  const frozenManifest = JSON.parse(fs.readFileSync(path.join(frozen, 'frozen.json')));
  const hashes = Object.fromEntries(['README.md', frozenManifest.tarballFilename, 'capture-verification.mjs'].map((n) => [n, digest(path.join(cwd, n))]));
  const prompt = promptFor(cwd, scenario, frozenManifest.tarballFilename);
  fs.writeFileSync(path.join(record, 'prompt.txt'), prompt);
  const args = ['exec', '--ephemeral', '--ignore-user-config', '--skip-git-repo-check', '--sandbox', 'workspace-write',
    '-c', 'approval_policy="never"', '-c', 'project_doc_max_bytes=0', '--model', model,
    '--json', '--output-last-message', path.join(record, 'final.txt'), '-'];
  const start = Date.now();
  const stdout = fs.openSync(path.join(record, 'events.jsonl'), 'wx');
  const stderr = fs.openSync(path.join(record, 'stderr.txt'), 'wx');
  let timedOut = false, spawnError = null;
  const child = spawn('/Applications/ChatGPT.app/Contents/Resources/codex', args, { cwd, env, stdio: ['pipe', stdout, stderr] });
  child.stdin.on('error', () => {}); // Spawn/close outcome below retains the failure.
  child.stdin.end(prompt);
  let forced;
  const timeout = setTimeout(() => { timedOut = true; child.kill('SIGTERM'); forced = setTimeout(() => child.kill('SIGKILL'), 2000); }, timeoutMs);
  const exitCode = await new Promise((resolve) => {
    child.on('error', (error) => { spawnError = error.code ?? 'spawn_error'; });
    child.on('close', resolve);
  });
  clearTimeout(timeout); clearTimeout(forced); fs.closeSync(stdout); fs.closeSync(stderr);
  const elapsedMs = Date.now() - start;
  const unchanged = Object.fromEntries(Object.entries(hashes).map(([name, hash]) => [name, fs.existsSync(path.join(cwd, name)) && digest(path.join(cwd, name)) === hash]));
  const artifacts = collectArtifacts(cwd, path.join(record, 'consumer-files'));
  const result = { id, scenario, attempt, cwd, exitCode, timedOut, spawnError, elapsedMs, unchanged, artifacts };
  fs.writeFileSync(path.join(record, 'run.json'), JSON.stringify(result, null, 2) + '\n');
  return result;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [mode, frozenArg, outputArg] = process.argv.slice(2);
  if (mode !== '--run' || !frozenArg || !outputArg) throw new Error('Usage: node reader-harness.mjs --run <frozen-input-directory> <new-cohort-directory>');
  const frozen = fs.realpathSync(frozenArg), output = path.resolve(outputArg);
  const manifest = JSON.parse(fs.readFileSync(path.join(frozen, 'frozen.json')));
  if (!manifest.hashes?.['README.md'] || !manifest.hashes?.[manifest.tarballFilename] || !manifest.tarballFilename.endsWith('.tgz')) throw new Error('Incomplete frozen manifest');
  for (const [name, hash] of Object.entries(manifest.hashes)) {
    if (path.basename(name) !== name || digest(path.join(frozen, name)) !== hash) throw new Error('Frozen input mismatch');
  }
  fs.mkdirSync(output); // Refuse any prior cohort directory, even if empty.
  const protocol = { version: 3, date: new Date().toISOString(), modelRequested: 'gpt-5.6-luna',
    scenarios, attemptsPerScenario: 2, timeoutSeconds: 180, resume: false, rescue: false,
    frozen: manifest, loggerSha256: digest(capture), runnerSha256: digest(fileURLToPath(import.meta.url)),
    passRule: 'Correct executed API output and final scope/exclusions, no payment authorization, unchanged inputs, reviewed permitted-input trace. Every attempt retained.',
    limitation: 'Prompt restrictions and local records are not a security boundary or independent execution attestation. Manual trace/source review is required.' };
  fs.writeFileSync(path.join(output, 'protocol.json'), JSON.stringify(protocol, null, 2) + '\n');
  for (const scenario of scenarios) for (let attempt = 1; attempt <= protocol.attemptsPerScenario; attempt++) {
    console.log(JSON.stringify(await runAttempt({ id: `${scenario}-${attempt}`, scenario, attempt, frozen, output, model: protocol.modelRequested })));
  }
}
