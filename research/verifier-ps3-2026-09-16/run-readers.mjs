import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';

const frozen = '/private/tmp/scvd-ps3-frozen';
const output = new URL('./readers/', import.meta.url);
fs.mkdirSync(output, { recursive: true });
const scenarios = ['valid', 'tampered', 'unsupported', 'unavailable-key'];
const digest = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const protocol = {
  date: '2026-09-16', host: 'Codex CLI', modelRequested: 'gpt-5.6-luna', attemptsPerScenario: 2,
  scenarios, timeoutSeconds: 180, resume: false, rescue: false,
  sourceAccess: 'README plus local tarball only; no monorepo access is permitted in the prompt',
  isolationLimit: 'Fresh ephemeral context and separate directory, not a security boundary against reading other filesystem paths. Trace is inspected for compliance.',
  readmeSha256: digest(`${frozen}/README.md`), tarballSha256: digest(`${frozen}/x402-verify-1.4.0.tgz`),
  secondHost: { host: 'Claude Code', status: 'unavailable', reason: 'Installed 2.1.273; claude auth status reported loggedIn:false. No sign-in or credential changes attempted.' },
  passRule: 'Executed installed code yields correct status/reason/scope and exclusions; no payment authority inferred. Retain every attempt and tool failure. Missing host is not a pass.',
};
fs.writeFileSync(new URL('protocol.json', output), `${JSON.stringify(protocol, null, 2)}\n`);
const only = process.argv[2];
for (const scenario of scenarios) for (let attempt = 1; attempt <= 2; attempt++) {
  const id = `${scenario}-${attempt}`;
  if (only && id !== only) continue;
  const record = new URL(`${id}/`, output);
  if (fs.existsSync(record)) continue; // Never replace or silently rerun a retained attempt.
  fs.mkdirSync(record);
  const cwd = fs.mkdtempSync(`/private/tmp/scvd-reader-${id}-`);
  for (const name of ['README.md', 'x402-verify-1.4.0.tgz']) fs.copyFileSync(`${frozen}/${name}`, path.join(cwd, name));
  fs.writeFileSync(path.join(cwd, '.npmrc'), 'offline=true\nignore-scripts=true\naudit=false\nfund=false\ncache=./.npm-cache\n');
  const prompt = `You are a fresh developer evaluating a package with no previous project context. Work only in ${cwd}. Read README.md and install the supplied local tarball. Complete the README's "${scenario}" scenario by actually running the installed package. You may read the README, packaged fixtures/provenance and type declarations, and create a consumer script. Do not inspect the verifier implementation, any source repository, other trial directories, host credentials, memory, or the internet. Do not use an expected-results field as execution evidence. Preserve the original README/tarball. No publishing, external messages or payments.\n\nWrite the actual API output to observed.json. Return JSON with status, reasonCodes, scope, doesNotEstablish, outputFile, canAuthorizePayment, and blockers. Explain within scope/exclusions what the output proves. If execution cannot complete, report the blocker instead of inventing an output. No follow-up help will be supplied. The local .npmrc preconfigures an offline cache; no other package or service is needed.`;
  fs.writeFileSync(new URL('prompt.txt', record), prompt);
  const args = ['exec', '--ephemeral', '--ignore-user-config', '--skip-git-repo-check', '--sandbox', 'workspace-write',
    '-c', 'approval_policy="never"', '-c', 'project_doc_max_bytes=0', '--model', protocol.modelRequested,
    '--json', '--output-last-message', new URL('final.txt', record).pathname, '-'];
  const start = Date.now();
  const stdout = fs.openSync(new URL('events.jsonl', record), 'w');
  const stderr = fs.openSync(new URL('stderr.txt', record), 'w');
  const child = spawn('/Applications/ChatGPT.app/Contents/Resources/codex', args, { cwd, stdio: ['pipe', stdout, stderr] });
  child.stdin.end(prompt);
  let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; child.kill('SIGTERM'); }, protocol.timeoutSeconds * 1000);
  const exitCode = await new Promise((resolve) => child.on('close', resolve));
  clearTimeout(timeout); fs.closeSync(stdout); fs.closeSync(stderr);
  for (const name of ['observed.json', 'verify.mjs', 'consumer.mjs', 'package.json', 'package-lock.json']) {
    if (fs.existsSync(path.join(cwd, name))) fs.copyFileSync(path.join(cwd, name), new URL(name, record));
  }
  const result = { id, scenario, attempt, cwd, exitCode, timedOut, elapsedMs: Date.now() - start,
    readmeUnchanged: digest(path.join(cwd, 'README.md')) === protocol.readmeSha256,
    tarballUnchanged: digest(path.join(cwd, 'x402-verify-1.4.0.tgz')) === protocol.tarballSha256 };
  fs.writeFileSync(new URL('run.json', record), `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result));
}
