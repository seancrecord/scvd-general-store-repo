import { skillGraph } from '../../scripts/lib/skill-tree.mjs';

const raw = import.meta.glob('../../registry/clawhub/**/*.md', {
  query: '?raw', import: 'default', eager: true,
});
export const installedSkillFiles = Object.fromEntries(Object.entries(raw)
  .map(([name, text]) => [name.replace('../../registry/clawhub/', ''), text]));
export const installedSkillEntry = installedSkillFiles['SKILL.md']!;
export const installedSkill = [...skillGraph(installedSkillFiles).values()].join('\n\n');

const canonicalRaw = import.meta.glob('../../skills/scvd-general-store/**/*.md', {
  query: '?raw', import: 'default', eager: true,
});
export const canonicalSkill = [...skillGraph(Object.fromEntries(Object.entries(canonicalRaw)
  .map(([name, text]) => [name.replace('../../skills/scvd-general-store/', ''), text]))).values()].join('\n\n');
