import path from 'node:path';
import { BaseSequencer } from 'vitest/node';
import timings from './ci-test-timings.json' with { type: 'json' };

// Timings choose placement only, never membership. Unknown files retain the
// measured average import cost; stale hints can slow CI but cannot omit a test.
export function partition(files, count, root) {
  if (!Number.isInteger(count) || count < 1) throw new Error('Invalid shard count');
  const key = file => path.relative(root, file.moduleId).split(path.sep).join('/');
  const weight = file => timings.importMs / timings.files + (timings.testMs[key(file)] ?? 0);
  const groups = Array.from({ length: count }, () => ({ files: [], weight: 0 }));
  const ordered = [...files].sort((a, b) => weight(b) - weight(a) || key(a).localeCompare(key(b), 'en'));
  for (const file of ordered) {
    const group = groups.reduce((best, candidate) => candidate.weight < best.weight ? candidate : best);
    group.files.push(file);
    group.weight += weight(file);
  }
  return groups.map(group => group.files);
}

export default class CiSequencer extends BaseSequencer {
  async shard(files) {
    const { shard, root } = this.ctx.config;
    if (!shard || !Number.isInteger(shard.index) || shard.index < 1 || shard.index > shard.count) {
      throw new Error('Invalid shard index');
    }
    return partition(files, shard.count, root)[shard.index - 1];
  }
}
