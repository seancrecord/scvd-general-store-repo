import fs from 'node:fs';
import path from 'node:path';

// The native skip_host_skill_discovery flag still exposed local skill
// metadata on 0.153.4. Disable every local entry using the documented
// per-skill setting instead. This reads names only and never edits a skill
// or the user's configuration. The caller freezes the inventory privately.
export function disabledCodexSkills(home, adminRoot='/etc/codex/skills') {
  if (typeof home !== 'string' || !path.isAbsolute(home)) throw new Error('Codex isolation requires an absolute HOME.');
  const entries=new Set(), visited=new Set();
  const walk=filename=>{
    let real,stat;
    try { real=fs.realpathSync(filename);stat=fs.statSync(real); }
    catch(error) { if(error.code==='ENOENT')return;throw error; }
    if(stat.isFile()&&path.basename(filename)==='SKILL.md'){
      entries.add(filename);entries.add(real);return;
    }
    if(!stat.isDirectory()||visited.has(real))return;
    visited.add(real);
    if(visited.size>10000)throw new Error('Codex skill inventory exceeds its directory bound.');
    for(const name of fs.readdirSync(filename).sort())walk(path.join(filename,name));
  };
  for(const root of [path.join(home,'.codex/skills'),path.join(home,'.agents/skills'),adminRoot])walk(root);
  if(entries.size>4096)throw new Error('Codex skill inventory exceeds its entry bound.');
  return [...entries].sort();
}
