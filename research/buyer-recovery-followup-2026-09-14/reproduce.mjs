import { readFile, writeFile, unlink } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
const guide = process.argv[2] === '--guide';
if (process.argv.length > 2 && !guide) throw new Error('Use --guide or omit arguments for reconciliation probes.');
const filename = guide ? 'buyer-recovery-guide-measure.spec.ts' : 'buyer-reconciliation-candidates-opt-in.spec.ts';
const target = new URL('../../test/' + filename, import.meta.url);
// Never overwrite a colleague's test or silently turn defect witnesses into CI.
await writeFile(target, await readFile(new URL(guide ? './reconciliation-guide-proof.ts' : './reconciliation-candidates.ts', import.meta.url)), { flag: 'wx' });
try {
  const child = spawn('npm', ['test', '--', 'test/' + filename], { cwd: root, stdio: 'inherit' });
  process.exitCode = await new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('exit', (code) => resolve(code ?? 1));
  });
} finally {
  await unlink(target);
}
