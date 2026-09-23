import { discoverBuyerLinks } from './lib/buyer-links.mjs';
import { compareBuyerContracts } from './lib/buyer-contracts.mjs';
// Public-only, unsigned observations. Never loads wallet configuration.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
const root=process.argv[2]??'research/buyer-waves-2026-09-12',origin='https://scvd.store';
const read=n=>JSON.parse(fs.readFileSync(root+'/'+n+'.snapshot'));
const menu=read('menu'),openapi=read('openapi'),manifest=read('manifest'),tools=read('mcp').result.tools;
if(fs.existsSync(root+'/prepayment.json'))throw new Error('Use a fresh snapshot directory; existing request evidence must not be overwritten.');
const rows=[];let serial=0;
const save=()=>fs.writeFileSync(root+'/prepayment.json',JSON.stringify(rows,null,2)+'\n');
async function request(url,init={},meta={}){const row={id:++serial,...meta,url:String(url),sent_at:new Date().toISOString(),payment_submitted:false};try{const r=await fetch(url,{...init,signal:AbortSignal.timeout(20000),redirect:'manual'});row.status=r.status;row.headers=Object.fromEntries(r.headers);const text=await r.text();try{row.body=JSON.parse(text);}catch{row.text=text.slice(0,1000);row.bytes=Buffer.byteLength(text);}row.received_at=new Date().toISOString();}catch(e){row.instrument_error=e.name;}return row;}
async function knock(item,door,args,scenario,extra={}){let row;if(door==='http'){const u=new URL('/api/buy/'+item.id,origin);for(const[k,v]of Object.entries(args))u.searchParams.set(k,String(v));row=await request(u,{}, {item:item.id,door,scenario,args,...extra});}else{const tool=tools.find(t=>t.itemIds?.includes(item.id)||t.inputSchema?.properties?.item_id?.enum?.includes(item.id));if(!tool)return {item:item.id,door,scenario,instrument_error:'no_discovered_tool'};row=await request(origin+'/mcp',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:serial+1,method:'tools/call',params:{name:tool.name,arguments:{item_id:item.id,...args}}})},{item:item.id,door,scenario,args,tool:tool.name,...extra});}rows.push(row);save();return row;}
const tasks=[];const urlRefusals=['http://example.com/','https://127.0.0.1/','https://localhost/','https://[::1]/','https://10.0.0.1/','https://example.com:8443/','https://user:pass@example.com/','file:///tmp/buyer-audit','not a URL'];
for(const item of menu.items){
 const tool=tools.find(t=>t.itemIds?.includes(item.id)||t.inputSchema?.properties?.item_id?.enum?.includes(item.id));
 const example=tool?.inputSchema?.examples?.find(e=>e.item_id===item.id);const args=Object.fromEntries(Object.entries(example??{}).filter(([k])=>k!=='item_id'));
 for(const door of ['http','mcp'])tasks.push(()=>knock(item,door,args,'published_example',{example_found:!!example}));
 for(const field of item.spec.inputs.required??[])for(const door of ['http','mcp']){const omitted={...args};delete omitted[field];tasks.push(()=>knock(item,door,omitted,'omitted_required',{field}));}
 // Query strings do not carry JSON types. Test actual typed JSON at MCP.
 const fields=[...new Set([...(item.spec.inputs.required??[]),'agent_name'])].filter(f=>item.spec.inputs.properties[f]?.type==='string');
 for(const field of fields)for(const value of [null,{},[]])tasks.push(()=>knock(item,'mcp',{...args,[field]:value},'wrong_type',{field,value_type:value===null?'null':Array.isArray(value)?'array':'object'}));
 if(item.spec.inputs.properties.url)for(const url of urlRefusals)for(const door of ['http','mcp'])tasks.push(()=>knock(item,door,{...args,url},'url_refusal',{field:'url'}));
}
let next=0;await Promise.all(Array.from({length:3},async()=>{while(next<tasks.length){const index=next++;await tasks[index]();if((index+1)%60===0)console.log(JSON.stringify({completed:index+1,total:tasks.length}));}}));
const comparisons=compareBuyerContracts({menu,openapi,manifest});
fs.writeFileSync(root+'/comparison.json',JSON.stringify(comparisons,null,2)+'\n');
const errors=rows.filter(r=>r.body?.error&&!(r.status===402||r.body.error.code===402));fs.writeFileSync(root+'/error-examples.json',JSON.stringify(errors,null,2)+'\n');
const discovery=discoverBuyerLinks({surfaces:Object.fromEntries(['home','skill','llms'].map(name=>[name,fs.readFileSync(root+'/'+name+'.snapshot','utf8')])),menu,openapi});
const allLinks=new Map(discovery.links.map(({url,from})=>[url,from])),unresolvedLinks=discovery.unresolved;
fs.writeFileSync(root+'/unresolved-links.json',JSON.stringify(unresolvedLinks,null,2)+'\n');
const links=[];next=0;const list=[...allLinks];await Promise.all(Array.from({length:3},async()=>{while(next<list.length){const[url,from]=list[next++];const row=await request(url,{}, {from});if(row.status!==402)delete row.body;if(row.status>=300&&row.status<400){row.redirect=row.headers.location;/* A redirect is recorded, not silently called a dead page. */}links.push(row);}}));fs.writeFileSync(root+'/links.json',JSON.stringify(links,null,2)+'\n');
const catalog={at:new Date().toISOString(),items:menu.items.map(i=>({id:i.id,price_usdc:i.price_usdc,fulfillment:i.fulfillment,required:i.spec.inputs.required??[],networks:openapi.paths['/api/buy/'+i.id]?.get['x-payment']?.networks,description:i.description,outputs:i.spec.capability,delivery:i.spec.outputs.delivery})),minimum_per_rail_usdc:menu.items.reduce((s,i)=>s+Math.round(i.price_usdc*1e6),0)/1e6,source_hash:createHash('sha256').update(fs.readFileSync(root+'/menu.snapshot')).digest('hex')};fs.writeFileSync(root+'/catalog.json',JSON.stringify(catalog,null,2)+'\n');
console.log(JSON.stringify({prepayment_requests:rows.length,comparison_issues:comparisons.reduce((n,c)=>n+c.issues.length,0),links:links.length,unresolved_links:unresolvedLinks.length,spend:0}));
