import { describe, expect, it } from 'vitest';
import { installedSkill, installedSkillFiles } from './helpers/installed-skill';
import { skillGraph } from '../scripts/lib/skill-tree.mjs';
import baseline from '../research/skill-ps4-2026-09-17/baseline/SKILL.md?raw';

describe('the installed skill keeps the whole store reachable', () => {
  it('preserves every previously advertised HTTPS endpoint and shelf item', () => {
    const endpoints = (text: string) => new Set([...text.matchAll(/https:\/\/scvd\.store\/[^\s`<>"),;]+/g)].map((m) => m[0]));
    const current = endpoints(installedSkill);
    expect([...endpoints(baseline)].filter((url) => !current.has(url))).toEqual([]);
  });
  it('the content guard fails when a referenced purchase file disappears', () => {
    const broken = { ...installedSkillFiles };
    delete broken['references/purchases.md'];
    expect(() => skillGraph(broken)).toThrow(/Missing skill reference/);
  });
});
