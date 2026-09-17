import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fs.realpathSync(path.dirname(fileURLToPath(import.meta.url)));
const inside = (p) => p === root || p.startsWith(root + path.sep);
const [script, ...args] = process.argv.slice(2);
if (!script || !inside(fs.realpathSync(process.cwd())) || !inside(fs.realpathSync(script))) {
  throw new Error('Run a consumer script inside the assigned workspace.');
}
const source = fs.readFileSync(script);
const id = crypto.randomUUID();
const directory = path.join(root, '.verification-runs');
fs.mkdirSync(directory, { recursive: true });
const stem = path.join(directory, id);
const result = spawnSync(process.execPath, [script, ...args], {
  cwd: process.cwd(), encoding: 'utf8', timeout: 30000, maxBuffer: 4 * 1024 * 1024,
});
const stdout = result.stdout ?? '';
const stderr = result.stderr ?? '';
fs.writeFileSync(`${stem}.stdout.txt`, stdout, { flag: 'wx' });
fs.writeFileSync(`${stem}.stderr.txt`, stderr, { flag: 'wx' });
const record = {
  id, cwd: path.relative(root, process.cwd()) || '.', script: path.relative(root, fs.realpathSync(script)), args,
  scriptSha256: crypto.createHash('sha256').update(source).digest('hex'),
  exitCode: result.status, signal: result.signal, errorCode: result.error?.code ?? null,
  stdoutFile: `.verification-runs/${id}.stdout.txt`, stderrFile: `.verification-runs/${id}.stderr.txt`,
};
// Every invocation has its own record. A later shell failure cannot replace it.
// These are local records, not attestations: source and host trace review still matter.
fs.writeFileSync(`${stem}.json`, JSON.stringify(record, null, 2) + '\n', { flag: 'wx' });
process.stdout.write(stdout);
process.stderr.write(stderr);
process.stderr.write(`\nVerification record: .verification-runs/${id}.json\n`);
process.exitCode = result.status ?? 1;
