import { createHash } from 'node:crypto';

const ORIGIN = 'https://scvd.store';
function scope(url) {
  try {
    const u = new URL(url);
    if (u.origin !== ORIGIN || u.username || u.password || /^\/(admin|api\/admin|logout)(?:\/|$)/.test(u.pathname)) return 'outside_scope';
    if (/[{}<>]|%(?:7b|7d|3c|3e)/i.test(u.href)) return 'unresolved_template';
    return null;
  } catch { return 'invalid_url'; }
}
function publicUrl(url) {
  try { const u=new URL(url);u.username='';u.password='';return u.href; } catch { return null; }
}

// Read-only, bounded direct-link follow-through. A budget stop is missing
// evidence, never proof that a destination or its promised document works.
export async function inspectBuyerLink(seed, { fetcher=fetch, maxRedirects=5, maxBytes=4*1024*1024, timeoutMs=20000 }={}) {
  const row={url:publicUrl(seed.url),from:seed.from??null,sent_at:new Date().toISOString(),payment_submitted:false,hops:[]};
  const finish=(state,code,extra={})=>({...row,state,code,...extra,received_at:new Date().toISOString()});
  const excluded=scope(seed.url);if(excluded)return finish('incomplete',excluded);
  let current=new URL(seed.url);current.hash='';
  const seen=new Set();
  let expected=seed.expected_type??(current.pathname.endsWith('.json')?'json':current.pathname.endsWith('.md')?'markdown':null);
  row.expected_type=expected;
  const signal=AbortSignal.timeout(timeoutMs);
  for(let followed=0;;followed++) {
    if(seen.has(current.href))return finish('finding','redirect_loop');
    seen.add(current.href);
    let response;
    try { response=await fetcher(current.href,{method:'GET',redirect:'manual',signal,headers:{accept:expected==='json'?'application/json':'*/*'}}); }
    catch { return finish('incomplete','transport_error'); }
    const type=(response.headers.get('content-type')??'').split(';')[0].trim().toLowerCase();
    const hop={url:current.href,status:response.status,content_type:type};row.hops.push(hop);
    if([301,302,303,307,308].includes(response.status)) {
      await response.body?.cancel().catch(()=>{});
      const location=response.headers.get('location');
      if(!location)return finish('finding','redirect_missing_location');
      let next;try {next=new URL(location,current);next.hash='';}catch{return finish('finding','redirect_invalid_location');}
      hop.location=publicUrl(next.href);
      if(scope(next.href))return finish('incomplete','redirect_outside_scope');
      if(seen.has(next.href))return finish('finding','redirect_loop');
      if(followed>=maxRedirects)return finish('incomplete','redirect_limit');
      current=next;continue;
    }
    const chunks=[];let bytes=0;
    try {
      const reader=response.body?.getReader();
      if(reader)for(;;){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>maxBytes){await reader.cancel();return finish('incomplete','body_limit',{bytes_observed:bytes});}chunks.push(part.value);}
    } catch { return finish('incomplete','body_read_error'); }
    const body=Buffer.concat(chunks);hop.bytes=bytes;hop.sha256=createHash('sha256').update(body).digest('hex');
    if(response.status===402)return finish('checked','payment_required');
    if(response.status===401)return finish('finding','authentication_required');
    if(response.status===403)return finish('finding','access_refused');
    if(response.status===404||response.status===410)return finish('finding','not_found');
    if(response.status===405)return finish('needs_review','method_not_allowed');
    if(response.status>=500)return finish('finding','server_error');
    if(response.status<200||response.status>=300)return finish('needs_review','http_refusal');
    expected??=current.pathname.endsWith('.json')?'json':current.pathname.endsWith('.md')?'markdown':null;
    row.expected_type=expected;
    if(expected==='json'){
      if(!(type==='application/json'||type.endsWith('+json')))return finish('finding','unexpected_content_type');
      try{JSON.parse(body.toString('utf8'));}catch{return finish('finding','invalid_json');}
      return finish('checked','document_read',{format:'json'});
    }
    if(expected==='markdown'&&!['text/plain','text/markdown'].includes(type))return finish('finding','unexpected_content_type');
    return finish('checked','document_read',{format:expected??'not_asserted'});
  }
}

export function discoverBuyerLinks({surfaces,menu,openapi}) {
 const origin=ORIGIN;
const allLinks=new Map(),unresolvedLinks=[];
const add=(url,from)=>{try{
 const u=new URL(url.replaceAll('&amp;','&'),origin);
 if(u.origin!==origin||/^\/(admin|api\/admin|logout)/.test(u.pathname))return;
 // URL normalizes braces to percent escapes. Keep unresolved templates as gaps,
 // rather than fetching invented IDs and recording their 404s as broken links.
 if(/[{}<>]|%(?:7b|7d|3c|3e)/i.test(u.href)){unresolvedLinks.push({url:u.href,from,reason:'template_needs_concrete_value'});return;}
 u.hash='';if(!allLinks.has(u.href))allLinks.set(u.href,from);
}catch{unresolvedLinks.push({url,from,reason:'invalid_url'});}};
for(const name of ['home','skill','llms']){
 const text=surfaces[name];
 for(const m of text.matchAll(/href=["']([^"']+)["']/g))add(m[1],name);
 // Actual href values remain literal, even when they end in punctuation.
 const prose=text.replace(/href=["'][^"']+["']/g,'');
 for(const m of prose.matchAll(/https:\/\/scvd\.store\/[^\s<>"'`。]+/g)){
  let url=m[0];
  if(prose[m.index+url.length]!=='`'){
   url=url.replace(/[.,;:]+$/,'');
   while(url.endsWith(')')&&(url.match(/\)/g)?.length??0)>(url.match(/\(/g)?.length??0))url=url.slice(0,-1);
  }
  add(url,name);
 }
}
for(const i of menu.items){for(const k of ['listing_url','input_contract_url','sample_url'])if(i[k])add(i[k],'menu:'+i.id);if(i.spec.verification?.sample_verify_url)add(i.spec.verification.sample_verify_url,'menu:'+i.id);}
for(const path of Object.keys(openapi.paths))if(openapi.paths[path].get&&!path.includes('{'))add(path,'openapi');
for(const p of ['/.well-known/security.txt','/.well-known/scvd-signing-key','/.well-known/mcp','/.well-known/a2a.json','/developers','/sitemap.xml'])add(p,'well-known/docs');
 return {links:[...allLinks].map(([url,from])=>({url,from})),unresolved:unresolvedLinks};
}
