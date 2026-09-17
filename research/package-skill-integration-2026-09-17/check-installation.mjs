import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { readSkillTree } from '../../scripts/skill-bundle.mjs';
import { skillFingerprint } from '../../scripts/lib/skill-tree.mjs';
const cwd=fs.mkdtempSync('/private/tmp/scvd-skill-install-final-');
const cli='/Users/seanrecord/.npm/_npx/ce22f0ddc7d4a641/node_modules/skills/bin/cli.mjs';
const args=[cli,'add',path.resolve('skills/scvd-general-store'),'--agent','codex','claude-code','--copy','--yes'];
const result=spawnSync(process.execPath,args,{cwd,env:{...process.env,DISABLE_TELEMETRY:'1',DO_NOT_TRACK:'1'},encoding:'utf8',timeout:60000});
fs.writeFileSync('research/package-skill-integration-2026-09-17/installation-final.txt',result.stdout+result.stderr);
if(result.status!==0)throw Error('Skill installation failed; see retained output');
const canonicalSha256=skillFingerprint(readSkillTree('skills/scvd-general-store'));
const installations=['.agents/skills/scvd-general-store','.claude/skills/scvd-general-store'].map(name=>{
 const files=readSkillTree(path.join(cwd,name));const treeSha256=skillFingerprint(files);
 if(treeSha256!==canonicalSha256)throw Error(`Installed tree differs: ${name}`);
 return {path:path.join(cwd,name),files:Object.keys(files).length,treeSha256};
});
fs.writeFileSync('research/package-skill-integration-2026-09-17/installation-final.json',JSON.stringify({cliVersion:'1.5.26',cwd,args,exitCode:result.status,canonicalSha256,installations,scope:'Local source, project installation, copy mode. No remote marketplace installation claim.'},null,2)+'\n');console.log('Both installed skill trees match the current canonical source.');
