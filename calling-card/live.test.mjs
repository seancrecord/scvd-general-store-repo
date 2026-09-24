import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,stat,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import * as callingCard from './calling-card.mjs';
const {normalizeCallingCard,diagnosePaymentChallenge,createReportQueue,localCallingCardState,guidedModule,createCallingCardFetch,webCryptoSigner}=callingCard;
const service={origin:'https://scvd.store',paths:{keys:'/bot-auth/keys',observe:'/bot-auth/observe',reports:'/bot-auth/reports'},term_seconds:86400};
const card=normalizeCallingCard({name:'Example',allowed_origins:['https://merchant.example'],networks:['eip155:8453']}).card;

test('conflicts offer distinct public choices, retain provenance, and resolve only the chosen field',()=>{
  const input=[{name:'First',destinations:['https://merchant.example']},{agent_name:'Second'}];
  const unresolved=normalizeCallingCard(input);
  assert.equal(unresolved.ready,false);
  assert.deepEqual(unresolved.choices.name,['First','Second']);
  assert.equal(unresolved.sources.name.length,2);
  const resolved=normalizeCallingCard(input,{resolutions:{name:'Second'}});
  assert.equal(resolved.ready,true);
  assert.equal(resolved.card.name,'Second');
  assert.equal(resolved.fields.name,'chosen');
  assert.equal(normalizeCallingCard({name:'Agent'},{resolutions:{allowed_origins:'https://merchant.example'}}).ready,true);
});

test('payment explanations distinguish unread, malformed, unsupported and network mismatches without consuming the body',async()=>{
  const response=body=>new Response('private resource body',{status:402,headers:body?{'payment-required':btoa(JSON.stringify(body))}:{}});
  assert.equal(diagnosePaymentChallenge(response()),'challenge_body_not_read');
  const challenge={x402Version:2,accepts:[{scheme:'exact',network:'eip155:8453',asset:'0xasset',amount:'1000'}]};
  const payment=response(challenge);
  assert.equal(diagnosePaymentChallenge(payment,[]),'wallet_networks_unknown');
  assert.equal(diagnosePaymentChallenge(payment,['eip155:1']),'no_declared_network_offered');
  assert.equal(diagnosePaymentChallenge(payment,['eip155:8453']),'declared_network_offered');
  assert.equal(await payment.text(),'private resource body');
  assert.equal(diagnosePaymentChallenge(response({...challenge,x402Version:1})),'unsupported_payment_version');
  assert.equal(diagnosePaymentChallenge(response({...challenge,accepts:[{network:'eip155:8453'}]})),'malformed_challenge');
});

test('local setup publishes only public data, persists a private key with restricted permissions, and reuses it after uncertain publication',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'calling-card-local-'));
  try{
    const url=pathToFileURL(join(dir,'my-calling-card.mjs')).href;
    const config={card,service};
    const posts=[];
    const transport=async(_url,init)=>{posts.push(JSON.parse(init.body));throw new Error('lost reply');};
    await assert.rejects(localCallingCardState(url,config,'setup',{fetch:transport}));
    const privatePath=join(dir,'.my-calling-card.mjs.local','identity.json');
    const persisted=JSON.parse(await readFile(privatePath,'utf8'));
    assert.ok(persisted.private_key.d);
    if(process.platform!=='win32')assert.equal((await stat(privatePath)).mode&0o077,0);
    let publicWire;
    const setup=await localCallingCardState(url,config,'setup',{fetch:async(_url,init)=>{publicWire=init.body;return Response.json({published:true});}});
    assert.equal(setup.card.public_key.x,persisted.card.public_key.x);
    assert.equal(publicWire.includes(persisted.private_key.d),false);
    assert.equal(publicWire.includes('"d"'),false);
    const envelope=JSON.parse(publicWire);
    const key=await crypto.subtle.importKey('jwk',setup.card.public_key,'Ed25519',false,['verify']);
    assert.equal(await crypto.subtle.verify('Ed25519',key,Buffer.from(envelope.signature,'hex'),new TextEncoder().encode(JSON.stringify(envelope.payload))),true);
    envelope.payload.action='revoke';
    assert.equal(await crypto.subtle.verify('Ed25519',key,Buffer.from(envelope.signature,'hex'),new TextEncoder().encode(JSON.stringify(envelope.payload))),false);
    assert.equal(posts.length,1);
    const updated=await localCallingCardState(url,{...config,card:{...card,allowed_origins:['https://new.example']}},'load');
    assert.deepEqual(updated.card.allowed_origins,['https://new.example']);
    assert.equal(updated.card.public_key.x,setup.card.public_key.x);
    assert.equal(await readFile(join(dir,'.my-calling-card.mjs.local','.gitignore'),'utf8'),'*\n');
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('report sharing is opt-in, allowlists fields, has a finite queue, and failure cannot alter delivered responses',async()=>{
  const pair=await crypto.subtle.generateKey('Ed25519',true,['sign','verify']);
  const public_key=await crypto.subtle.exportKey('jwk',pair.publicKey);
  const identity={...card,public_key};const sign=webCryptoSigner(pair.privateKey);
  const messages=[];
  const transport=async(_url,init)=>{messages.push(JSON.parse(init.body));return new Response(null,{status:503});};
  const disabled=createReportQueue({service,card:identity,sign,fetch:transport});
  disabled.submit('https://merchant.example',{outcome:'response_received'});
  assert.deepEqual(await disabled.flush(),{sent:0,failed:0,dropped:0});
  const enabled=createReportQueue({service,card:identity,sign,fetch:transport,enabled:true});
  const request=createCallingCardFetch({card,fetch:async()=>new Response('delivered'),onResult:result=>enabled.submit('https://merchant.example',{...result,body:'must-not-share',authorization:'must-not-share'})});
  assert.equal(await (await request('https://merchant.example/private?token=secret')).text(),'delivered');
  assert.deepEqual(await enabled.flush(),{sent:0,failed:1,dropped:0});
  assert.equal(JSON.stringify(messages).includes('must-not-share'),false);
  assert.equal(JSON.stringify(messages).includes('token=secret'),false);
  assert.equal(messages[0].payload.consent,true);
  const bounded=createReportQueue({service,card:identity,sign,fetch:transport,enabled:true});
  for(let i=0;i<12;i++)bounded.submit('https://merchant.example',{outcome:'response_received'});
  assert.deepEqual(await bounded.flush(),{sent:0,failed:8,dropped:4});
  bounded.submit('https://merchant.example/path?token=private',{outcome:'response_received'});
  assert.deepEqual(await bounded.flush(),{sent:0,failed:8,dropped:5});
});

test('generated guided integration imports without generating a key or sending any request',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'calling-card-guided-'));
  try{
    const source=await readFile(new URL('./calling-card.mjs',import.meta.url),'utf8');
    const file=join(dir,'my-calling-card.mjs');
    await writeFile(file,guidedModule(source,card,service));
    const module=await import(pathToFileURL(file).href);
    assert.equal(typeof module.connectLocal,'function');
    await assert.rejects(stat(join(dir,'.my-calling-card.mjs.local')),{code:'ENOENT'});
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('receiver recognition is explicitly reported and never inferred from HTTP success',async()=>{
  for(const [headers,expected] of [[{},'not_observed'],[{'Calling-Card-Recognition':'signature_verified'},'receiver_reported_verified']]){
    let result;
    const request=createCallingCardFetch({card,fetch:async()=>new Response('ok',{headers}),onResult:row=>{result=row;}});
    await request('https://merchant.example');
    assert.equal(result.identity_acceptance,expected);
    assert.equal(result.payment,'not_observed');
  }
});
