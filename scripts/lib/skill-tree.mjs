import { posix } from 'node:path';
import { createHash } from 'node:crypto';

// Traverse links rather than concatenate a directory: an orphan is not reachable
// to the installed reader, even if a content grep can still find its promises.
export function skillGraph(files) {
  const reached = new Map();
  function visit(name) {
    if (reached.has(name)) return;
    if (!Object.hasOwn(files, name)) throw new Error(`Missing skill reference: ${name}`);
    const text = files[name];
    reached.set(name, text);
    for (const match of text.matchAll(/\[[^\]]*\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g)) {
      const href = match[1];
      if (/^(?:https?:|mailto:|#)/.test(href)) continue;
      const target = decodeURIComponent(href.split('#')[0]);
      const resolved = posix.normalize(posix.join(posix.dirname(name), target));
      if (target.startsWith('/') || resolved === '..' || resolved.startsWith('../') || target.includes('\\') || /^[a-z]+:/i.test(target)) {
        throw new Error(`Skill reference escapes bundle: ${href}`);
      }
      visit(resolved);
    }
  }
  visit('SKILL.md');
  const orphans = Object.keys(files).filter((name) => !reached.has(name));
  if (orphans.length) throw new Error(`Unreachable skill files: ${orphans.join(', ')}`);
  return reached;
}

export function skillFingerprint(files) {
  skillGraph(files);
  return createHash('sha256').update(JSON.stringify(Object.entries(files)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, text]) => [name, createHash('sha256').update(text).digest('hex')]))).digest('hex');
}
