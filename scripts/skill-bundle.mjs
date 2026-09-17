import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { skillGraph, skillFingerprint } from './lib/skill-tree.mjs';

export function readSkillTree(root, { validate = true } = {}) {
  const files = {};
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Skill file cannot be a symlink: ${full}`);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.md')) files[path.relative(root, full).split(path.sep).join('/')] = fs.readFileSync(full, 'utf8');
      else if (dir === root && entry.name === '.clawhubignore') {
        const patterns = fs.readFileSync(full, 'utf8').split('\n').map(s => s.trim()).filter(s => s && !s.startsWith('#'));
        if (patterns.length !== 1 || patterns[0] !== 'published.json') throw new Error('ClawHub ignore must exclude only published.json');
      } else if (!(dir === root && entry.name === 'published.json')) throw new Error(`Unexpected skill payload file: ${full}`);
    }
  }
  if (fs.existsSync(path.join(root, 'published.json')) && !fs.existsSync(path.join(root, '.clawhubignore'))) {
    throw new Error('Publication bookkeeping must be excluded by .clawhubignore');
  }
  walk(root);
  if (validate) skillGraph(files);
  return files;
}

export function syncSkill(source, destination, check = true) {
  const files = readSkillTree(source);
  const installed = readSkillTree(destination, { validate: check });
  if (check) {
    if (skillFingerprint(files) !== skillFingerprint(installed)) throw new Error('Generated skill differs; run npm run skill:build');
  } else {
    for (const name of Object.keys(installed)) {
      if (!Object.hasOwn(files, name)) fs.unlinkSync(path.join(destination, name));
    }
    for (const [name, text] of Object.entries(files)) {
      const target = path.join(destination, name);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, text);
    }
  }
  return { files: Object.keys(files).length, treeSha256: skillFingerprint(files) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('../', import.meta.url));
  console.log(JSON.stringify(syncSkill(path.join(root, 'skills/scvd-general-store'), path.join(root, 'registry/clawhub'), !process.argv.includes('--write'))));
}
