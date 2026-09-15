// Reproduce the bounded review of these public snapshots, not a full Wave 1 score.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('.',import.meta.url));
const read=name=>JSON.parse(fs.readFileSync(root+name,'utf8'));
const menu=read('menu.snapshot'),openapi=read('openapi.snapshot'),manifest=read('manifest.snapshot');
const raw=read('comparison.json'),requests=read('prepayment.json'),links=read('links.json');
const canonical=v=>JSON.stringify(v,(_k,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b))):x);
function shape(s){assert(s&&typeof s==='object'&&s.properties&&typeof s.properties==='object'&&!Array.isArray(s.properties),'An absent input schema cannot count as agreement.');return {required:[...(s.required??[])].sort(),properties:Object.fromEntries(Object.entries(s.properties).map(([k,v])=>[k,Object.fromEntries(['type','maxLength','minLength','enum'].filter(f=>f in v).map(f=>[f,v[f]]))]))};}
function compare(item,doc){
 const op=doc.paths['/api/buy/'+item.id]?.get;
 const schema=op?.['x-request-schema']??op?.['x-payment-info']?.input?.schema;
 const resource=manifest.resources.find(r=>new URL(r.resource).pathname==='/api/buy/'+item.id);
 const pairs=[['manifest price',item.price_tiers_usdc,resource?.price_usdc_options],['manifest fulfillment',item.fulfillment,resource?.fulfillment],['manifest input schema',shape(item.spec.inputs),shape(resource?.inputSchema)],['OpenAPI price',item.price_tiers_usdc,op?.['x-payment']?.price_usdc_options],['OpenAPI inputs',shape(item.spec.inputs),shape(schema)],['manifest spec',item.spec,resource?.spec]];
 return pairs.filter(([,a,b])=>canonical(a)!==canonical(b)).map(([field])=>field);
}
const reviewed=menu.items.map(item=>({item:item.id,issues:compare(item,openapi)}));
// Controls keep the review from mistaking missing evidence or changed limits for agreement.
const item=menu.items.find(i=>Object.values(i.spec.inputs.properties).some(p=>Number.isInteger(p.maxLength)));
assert(item);const changed=structuredClone(openapi),schema=changed.paths['/api/buy/'+item.id].get['x-payment-info'].input.schema;
const field=Object.keys(schema.properties).find(k=>Number.isInteger(schema.properties[k].maxLength));
schema.properties[field].maxLength++;assert(compare(item,changed).includes('OpenAPI inputs'));
const absent=structuredClone(openapi);delete absent.paths['/api/buy/'+item.id].get['x-payment-info'].input.schema;
assert.throws(()=>compare(item,absent),/absent input schema/);
const template=r=>/[{}<>]/.test(decodeURIComponent(r.url));
const counts=rows=>Object.fromEntries([...new Set(rows.map(r=>String(r.status??r.instrument_error)))].map(k=>[k,rows.filter(r=>String(r.status??r.instrument_error)===k).length]));
const examples=requests.filter(r=>r.scenario==='published_example');
const quote=r=>r.status===402||r.body?.error?.code===402;
const summary={
 source:'Public snapshots acquired September 15; production is distinct from the local recovery branch.',
 scope:'Eight discovery snapshots; unsigned HTTP/default-MCP input cases; direct concrete-path crawl. Not recursive coverage or paid/cold-agent acceptance.',
 surfaces:read('acquisition.json').length,items:menu.items.length,spend_usdc:0,
 prepayment:{requests:requests.length,http_statuses:counts(requests.filter(r=>r.door==='http')),mcp_http_statuses:counts(requests.filter(r=>r.door==='mcp')),server_or_transport_failures:requests.filter(r=>r.status>=500||r.instrument_error).length,published_examples:examples.length,published_example_quotes:examples.filter(quote).length,example_refusals:examples.filter(r=>!quote(r)).map(r=>({item:r.item,door:r.door,status:r.status,code:r.body?.error?.data?.code??r.body?.code??null}))},
 comparison:{raw_issue_count:raw.reduce((n,r)=>n+r.issues.length,0),reviewed_issue_count:reviewed.reduce((n,r)=>n+r.issues.length,0),reviewed,collector_defect:'The old comparator reads only x-request-schema. These snapshots publish the input schema at x-payment-info.input.schema. Missing collector data was misreported as a product contradiction.',controls:['changed maxLength rejected','absent schema rejected']},
 links:{requests:links.length,statuses:counts(links),literal_404s:links.filter(r=>r.status===404&&!template(r)),unsubstituted_template_404s:links.filter(r=>r.status===404&&template(r)).map(r=>({url:r.url,from:r.from})),server_or_transport_failures:links.filter(r=>r.status>=500||r.instrument_error).length,unexpected_auth_responses:links.filter(r=>r.status===401||r.status===403).length,redirects:links.filter(r=>r.status>=300&&r.status<400).length,limits:'Redirect targets/loops not followed by this collector; GET against documented POST routes and missing-query refusals are not dead endpoints. The extractor also truncates nested URL values at colon and includes punctuation. Template substitution and recursive links remain untested.'},
 overall_wave_1:'incomplete',new_confirmed_store_defects:0,new_benchmark_defects:['obsolete OpenAPI input field','URL/template extraction creates invalid requests'],
};
fs.writeFileSync(root+'reviewed-summary.json',JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify({items:summary.items,requests:summary.prepayment.requests,reviewed_comparison_issues:summary.comparison.reviewed_issue_count,literal_404s:summary.links.literal_404s.length,spend_usdc:0}));
