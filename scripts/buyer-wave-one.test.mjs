import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const here=path.dirname(fileURLToPath(import.meta.url));
function fixture(t,{legacy=false,missing=false,changed=false,bodyOnly=false,duplicate=false}={}){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'buyer-wave-contract-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const ids=['small_blessing','the_confession','signature_agent_card','settlement_attestation','attestation_bundle','standing_watch','aura_walk','bitcoin_anchor','graffiti_on_a_train'];
 const schema={type:'object',required:['host'],properties:{host:{type:'string',maxLength:80},agent_name:{type:'string',maxLength:80}}};
 const items=ids.map(id=>({id,price_usdc:.001,price_tiers_usdc:[.001],fulfillment:'instant',spec:{inputs:schema,outputs:{delivery:'inline'},capability:'fixture'}}));
 const paths=Object.fromEntries(items.map(i=>['/api/buy/'+i.id,{get:{'x-payment':{price_usdc_options:[.001],networks:['eip155:8453']},...(missing?{}:legacy?{'x-request-schema':schema}:{'x-payment-info':{input:{schema}}})}}]));
 const openapi=structuredClone({paths});if(changed){const input=openapi.paths['/api/buy/small_blessing'].get['x-payment-info'].input;input.schema=structuredClone(input.schema);input.schema.properties.host.maxLength=81;}
 if(duplicate){const op=openapi.paths['/api/buy/small_blessing'].get;op['x-request-schema']=structuredClone(schema);op['x-request-schema'].properties.host.maxLength=81;}
 const write=(name,value)=>fs.writeFileSync(path.join(root,name),typeof value==='string'?value:JSON.stringify(value));
 write('menu.snapshot',{items});write('openapi.snapshot',openapi);write('manifest.snapshot',{resources:items.map(i=>({resource:'https://scvd.store/api/buy/'+i.id,price_usdc_options:[.001],fulfillment:i.fulfillment,inputSchema:schema,spec:i.spec}))});
 write('mcp.snapshot',{result:{tools:[{name:'buy_fixture',itemIds:ids,inputSchema:{examples:ids.map(item_id=>({item_id,host:'fixture.example'}))}}]}});
 write('home.snapshot','<a href="https://scvd.store/literal.">literal trailing dot</a> <a href="/fixture-page#paying">fragment</a>');
 write('skill.snapshot','GET `https://scvd.store/api/order/{order_id}` and `https://scvd.store/api/order/%7Border_id%7D`.\nUse `https://scvd.store/api/buy/launch_check?url=https://example.com/a`.\nRead https://scvd.store/openapi.json.\nSee https://scvd.store/menu.json): and https://scvd.store/observatory:\nhttps://scvd.store/menu.json。留言簿免费。');write('llms.snapshot','');
 write('acquisition.json',[{name:'fixture',url:'https://scvd.store/'}]);
 fs.mkdirSync(path.join(root,'cold'));write('cold/reviewed-metrics.json',{entries:[]});write('readiness.json',{});
 const mock=path.join(root,'network.mjs');write('network.mjs',`const accepts=[{network:'eip155:8453',amount:'1000'}];globalThis.fetch=async(input,init={})=>{const url=new URL(input);if(url.pathname==='/mcp'&&init.method==='POST')return Response.json({error:{code:402,data:{'x402/payment-required':{accepts}}}});if(url.pathname.startsWith('/api/buy/'))return Response.json({accepts},{status:402,headers:${bodyOnly ? '{}' : "{'payment-required':Buffer.from(JSON.stringify({accepts})).toString('base64')}"}});return Response.json({ok:true});};`);
 const run=(script)=>spawnSync(process.execPath,['--import',mock,path.join(here,script),root],{encoding:'utf8',timeout:30000});
 const collected=run('buyer-wave-one.mjs');assert.equal(collected.status,0,collected.stderr);
 return {root,read:name=>JSON.parse(fs.readFileSync(path.join(root,name))),write,run};
}
for(const legacy of [false,true])test(`collector reads the ${legacy?'legacy':'current'} published input schema`,t=>{const f=fixture(t,{legacy});assert.deepEqual(f.read('comparison.json').flatMap(r=>r.issues),[]);});
test('collector distinguishes a missing schema from a contradictory limit',t=>{
 const absent=fixture(t,{missing:true}).read('comparison.json').flatMap(r=>r.issues);assert(absent.length);assert(absent.every(r=>r.kind==='missing'));
 const changed=fixture(t,{changed:true}).read('comparison.json').flatMap(r=>r.issues);assert.equal(changed.length,1);assert.equal(changed[0].kind,'contradiction');assert.equal(changed[0].field,'OpenAPI inputs');
});
test('collector preserves nested URLs and literal hrefs, and records unfilled templates without fetching them',t=>{
 const f=fixture(t),urls=f.read('links.json').map(r=>r.url);
 assert(urls.includes('https://scvd.store/api/buy/launch_check?url=https://example.com/a'));
 assert(urls.includes('https://scvd.store/literal.'));
 assert(urls.includes('https://scvd.store/openapi.json'));
 assert(!urls.includes('https://scvd.store/openapi.json.'));
 assert(urls.includes('https://scvd.store/fixture-page'));
 assert(!urls.some(u=>/\{|%7b/i.test(u)));
 assert(f.read('unresolved-links.json').some(r=>r.reason==='template_needs_concrete_value'));
});
test('scorer does not invent historical reproduced findings or cold-cohort facts',t=>{
 const f=fixture(t),r=f.run('buyer-wave-score.mjs');assert.equal(r.status,0,r.stderr);
 const score=f.read('score.json');assert.equal(score.existing_findings_reproduced,null);assert.equal(score.findings_review,'not_provided');
 assert.equal(score.initial_surfaces,1);assert(!JSON.stringify(score).includes('BUY-040'));assert(!JSON.stringify(score).includes('five walks'));
});
test('scorer requires real request references before crediting a reviewed finding',t=>{
 const f=fixture(t);f.write('reviewed-findings.json',{findings:[{id:'BUY-040',state:'reproduced',request_ids:[999999]}]});
 const bad=f.run('buyer-wave-score.mjs');assert.notEqual(bad.status,0);assert.match(bad.stderr,/request reference/);
 f.write('reviewed-findings.json',{findings:[{id:'BUY-040',state:'reproduced',request_ids:[f.read('prepayment.json')[0].id]}]});
 const good=f.run('buyer-wave-score.mjs');assert.equal(good.status,0,good.stderr);assert.deepEqual(f.read('score.json').existing_findings_reproduced,['BUY-040']);
});

test('body-only 402 terms survive collection and price scoring without the optional header',t=>{
 const f=fixture(t,{bodyOnly:true}),r=f.run('buyer-wave-score.mjs');assert.equal(r.status,0,r.stderr);
 const score=f.read('score.json');assert(score.price_checks.length);assert(score.price_checks.every(r=>r.pass));
 assert(f.read('shelf-quote-grid.json').every(r=>r.offers.length===1));
});

test('two published schema copies cannot disagree silently',t=>{
 const issues=fixture(t,{duplicate:true}).read('comparison.json').flatMap(r=>r.issues);
 assert.equal(issues.length,1);assert.equal(issues[0].field,'OpenAPI duplicate inputs');assert.equal(issues[0].kind,'contradiction');
});

test('prose colons and localized sentence stops do not become endpoint names',t=>{
 const urls=fixture(t).read('links.json').map(r=>r.url);
 assert(urls.includes('https://scvd.store/menu.json'));assert(urls.includes('https://scvd.store/observatory'));
 assert(!urls.some(u=>u.endsWith(':')||decodeURIComponent(u).includes('。')));
});

async function crawl(url, replies, options={}) {
 const { inspectBuyerLink } = await import('./lib/buyer-links.mjs');
 const calls=[];
 const fetcher=async (input,init)=>{
  calls.push({url:String(input),method:init.method,redirect:init.redirect});
  const next=replies[calls.length-1];
  if(next instanceof Error)throw next;
  assert(next, 'unexpected extra network request');
  return new Response(next.body??'',{status:next.status??200,headers:next.headers??{'content-type':'application/json'}});
 };
 return {result:await inspectBuyerLink({url,from:'fixture'}, {fetcher,...options}),calls};
}
test('link check follows a relative redirect and verifies the final promised JSON',async()=>{
 const {result,calls}=await crawl('https://scvd.store/old.json',[{status:301,headers:{location:'/new.json'}},{body:'{"ok":true}'}]);
 assert.equal(result.state,'checked');assert.equal(result.format,'json');assert.equal(result.hops.length,2);
 assert.deepEqual(calls.map(c=>c.url),['https://scvd.store/old.json','https://scvd.store/new.json']);
 assert(calls.every(c=>c.method==='GET'&&c.redirect==='manual'));
});
test('redirect loops fail with their entire observed chain',async()=>{
 const {result,calls}=await crawl('https://scvd.store/a',[{status:302,headers:{location:'/b'}},{status:302,headers:{location:'/a'}}]);
 assert.equal(result.state,'finding');assert.equal(result.code,'redirect_loop');assert.equal(calls.length,2);
});
test('redirect limit and outside-origin destinations remain explicit gaps',async()=>{
 const limited=await crawl('https://scvd.store/a',[{status:302,headers:{location:'/b'}}],{maxRedirects:0});
 assert.equal(limited.result.state,'incomplete');assert.equal(limited.result.code,'redirect_limit');
 for(const location of ['https://elsewhere.example/a','http://scvd.store/a','https://scvd.store/admin','https://user:secret@scvd.store/a']){
  const {result,calls}=await crawl('https://scvd.store/a',[{status:302,headers:{location}}]);
  assert.equal(result.state,'incomplete');assert.equal(result.code,'redirect_outside_scope');assert.equal(calls.length,1);
  assert(!JSON.stringify(result).includes('secret'));
 }
});
test('promised JSON cannot be HTML or malformed bytes even with status 200',async()=>{
 const html=await crawl('https://scvd.store/contract.json',[{body:'<html>login</html>',headers:{'content-type':'text/html'}}]);
 assert.equal(html.result.state,'finding');assert.equal(html.result.code,'unexpected_content_type');
 const malformed=await crawl('https://scvd.store/contract.json',[{body:'{broken'}]);
 assert.equal(malformed.result.state,'finding');assert.equal(malformed.result.code,'invalid_json');
});
test('status 402 is payment terms, and an authenticated or dead destination is distinct',async()=>{
 for(const [status,code,state] of [[402,'payment_required','checked'],[401,'authentication_required','finding'],[403,'access_refused','finding'],[404,'not_found','finding'],[405,'method_not_allowed','needs_review'],[500,'server_error','finding']]){
  const {result}=await crawl('https://scvd.store/api/example',[{status,body:'{}'}]);
  assert.equal(result.code,code);assert.equal(result.state,state);
 }
});
test('truncated and failed reads never pass as validated documents',async()=>{
 const large=await crawl('https://scvd.store/large.json',[{body:'{"large":"payload"}'}],{maxBytes:5});
 assert.equal(large.result.state,'incomplete');assert.equal(large.result.code,'body_limit');
 const failed=await crawl('https://scvd.store/failed.json',[new Error('secret transport detail')]);
 assert.equal(failed.result.state,'incomplete');assert.equal(failed.result.code,'transport_error');
 assert(!JSON.stringify(failed.result).includes('secret transport detail'));
});
test('a missing redirect destination is a finding and templates never make requests',async()=>{
 const absent=await crawl('https://scvd.store/a',[{status:301}]);assert.equal(absent.result.code,'redirect_missing_location');
 const template=await crawl('https://scvd.store/api/verify/%7Bcert_id%7D',[]);
 assert.equal(template.result.state,'incomplete');assert.equal(template.calls.length,0);
});

test('a JSON redirect destination gets its format checked even when the starting URL has no extension',async()=>{
 const {result}=await crawl('https://scvd.store/menu',[{status:301,headers:{location:'/menu.json'}},{body:'<html>wrong document</html>',headers:{'content-type':'text/html'}}]);
 assert.equal(result.state,'finding');assert.equal(result.code,'unexpected_content_type');
});
