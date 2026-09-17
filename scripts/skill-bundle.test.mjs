import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { skillGraph, skillFingerprint } from './lib/skill-tree.mjs';
import { readSkillTree, syncSkill } from './skill-bundle.mjs';
const tree = { 'SKILL.md': '[Buy](references/buy.md)', 'references/buy.md': 'Keep the retry key.' };
test('missing, escaping and orphaned references cannot pass a content audit', () => {
  assert.throws(() => skillGraph({ 'SKILL.md': tree['SKILL.md'] }), /Missing/);
  assert.throws(() => skillGraph({ 'SKILL.md': '[escape](../secret.md)' }), /escapes/);
  assert.throws(() => skillGraph({ ...tree, 'references/unused.md': 'unused' }), /Unreachable/);
  assert.throws(() => skillGraph({ 'SKILL.md': '[escape](%2Foutside.md)' }), /escapes/);
  assert.equal(skillGraph(tree).size, 2);
});
test('a reference-only change changes the release fingerprint', () => {
  assert.notEqual(skillFingerprint(tree), skillFingerprint({ ...tree, 'references/buy.md': 'New retry policy.' }));
  assert.equal(skillFingerprint(tree), skillFingerprint(Object.fromEntries(Object.entries(tree).reverse())));
});
test('an isolated installed copy contains every reference and detects tampering', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-install-'));
  try {
    const source = path.join(root, 'source'); const installed = path.join(root, 'installed');
    fs.mkdirSync(path.join(source, 'references'), { recursive: true }); fs.mkdirSync(installed);
    for (const [name, text] of Object.entries(tree)) fs.writeFileSync(path.join(source, name), text);
    fs.writeFileSync(path.join(installed, 'SKILL.md'), 'old');
    syncSkill(source, installed, false); assert.deepEqual(readSkillTree(installed), tree);
    fs.writeFileSync(path.join(installed, 'references/buy.md'), 'tampered');
    assert.throws(() => syncSkill(source, installed), /differs/);
    fs.unlinkSync(path.join(installed, 'references/buy.md'));
    assert.throws(() => readSkillTree(installed), /Missing/);
    syncSkill(source, installed, false);
    assert.deepEqual(readSkillTree(installed), tree);
    fs.writeFileSync(path.join(installed, '.clawhubignore'), 'references/\n');
    assert.throws(() => readSkillTree(installed), /ignore/);
    fs.unlinkSync(path.join(installed, '.clawhubignore'));
    fs.writeFileSync(path.join(installed, 'published.json'), '{}');
    assert.throws(() => readSkillTree(installed), /bookkeeping/);
    fs.unlinkSync(path.join(installed, 'published.json'));
    fs.writeFileSync(path.join(installed, 'untracked.txt'), 'unexpected payload');
    assert.throws(() => readSkillTree(installed), /Unexpected/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
test('canonical skill entry routes to task references; both payloads have the same graph', () => {
  const source = readSkillTree('skills/scvd-general-store');
  const installed = readSkillTree('registry/clawhub');
  assert.ok(Object.keys(source).length > 1, 'monolithic skill has no installed references');
  assert.equal(skillFingerprint(source), skillFingerprint(installed));
});
