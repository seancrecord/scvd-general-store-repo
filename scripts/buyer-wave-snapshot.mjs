// Acquire a fresh public starting point. No wallet, dotenv or source-derived catalog.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
const root=process.argv[2];
if(!root)throw new Error('Supply a new evidence directory.');
fs.mkdirSync(root,{recursive:true});
fs.writeFileSync(root+'/acquisition.started',new Date().toISOString(),{flag:'wx'});
const paths={home:'/',menu:'/menu.json',openapi:'/openapi.json',manifest:'/.well-known/x402.json',a2a:'/.well-known/agent-card.json',llms:'/llms.txt',skill:'/skill.md',mcp:'/mcp'};
const observations=[];
for(const [name,path] of Object.entries(paths)){
 const url='https://scvd.store'+path,sent_at=new Date().toISOString();
 const init=name==='mcp'?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list'})}:{};
 const response=await fetch(url,{...init,redirect:'manual',signal:AbortSignal.timeout(30000)});
 const body=await response.text();
 fs.writeFileSync(root+'/'+name+'.snapshot',body,{flag:'wx'});
 observations.push({name,url,method:init.method??'GET',sent_at,received_at:new Date().toISOString(),status:response.status,headers:Object.fromEntries(response.headers),sha256:createHash('sha256').update(body).digest('hex')});
 fs.writeFileSync(root+'/acquisition.json',JSON.stringify(observations,null,2)+'\n');
 if(response.status!==200)throw new Error(name+' did not return 200; inspect acquisition before continuing.');
}
console.log('Saved '+observations.length+' public surfaces to '+root);
