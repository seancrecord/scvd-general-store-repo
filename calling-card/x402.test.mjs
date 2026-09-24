import {test} from 'node:test';
import assert from 'node:assert/strict';
import {wrapFetchWithPayment,x402Client} from '@x402/fetch';
import {ExactEvmScheme} from '@x402/evm/exact/client';
import {privateKeyToAccount} from 'viem/accounts';
import {createCallingCardFetch,webCryptoSigner} from './calling-card.mjs';

// Public fixture key. No RPC or external transport is used by these checks.
const signer=privateKeyToAccount('0x'+'01'.repeat(32));
const network='eip155:8453';
const terms={scheme:'exact',network,asset:'0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',amount:'1000',payTo:'0x1111111111111111111111111111111111111111',maxTimeoutSeconds:60,extra:{name:'USD Coin',version:'2'}};
const challenge=(offer=terms)=>Response.json({x402Version:2,resource:{url:'https://merchant.example/resource',description:'Fixture',mimeType:'application/json'},accepts:[offer]},{status:402,headers:{'payment-required':btoa(JSON.stringify({x402Version:2,resource:{url:'https://merchant.example/resource',description:'Fixture',mimeType:'application/json'},accepts:[offer]}))}});
async function identity(fetch,onResult){
 const pair=await crypto.subtle.generateKey('Ed25519',true,['sign','verify']);
 const public_key=await crypto.subtle.exportKey('jwk',pair.publicKey);
 return {key:pair.publicKey,request:createCallingCardFetch({card:{name:'SDK integration fixture',allowed_origins:['https://merchant.example'],networks:[network],signature_agent:'https://identity.example',public_key},sign:webCryptoSigner(pair.privateKey),fetch,onResult})};
}
function client(){return new x402Client().register(network,new ExactEvmScheme(signer));}
async function verifyIntroduction(request,key){
 const params=request.headers.get('signature-input').slice(5);
 const message='"@authority": merchant.example\n"signature-agent": '+request.headers.get("signature-agent")+'\n"@signature-params": '+params;
 const signature=request.headers.get('signature').slice(6,-1);
 assert.equal(await crypto.subtle.verify('Ed25519',key,Buffer.from(signature,'base64'),new TextEncoder().encode(message)),true);
}

test('stock x402 client preserves the POST and signs each introduction around its authorized payment retry',async()=>{
 const sent=[],outcomes=[];
 const {request,key}=await identity(async req=>{sent.push(req);return sent.length===1?challenge():Response.json({delivered:true});},r=>outcomes.push(r));
 const paid=wrapFetchWithPayment(request,client());
 const response=await paid('https://merchant.example/resource',{method:'POST',body:'{"question":"fixture"}',headers:{'Content-Type':'application/json'}});
 assert.deepEqual(await response.json(),{delivered:true});
 assert.equal(sent.length,2);
 assert.equal(sent[0].headers.has('payment-signature'),false);
 const payment=JSON.parse(atob(sent[1].headers.get('payment-signature')));
 assert.equal(payment.accepted.network,network);
 assert.equal(payment.payload.authorization.from.toLowerCase(),signer.address.toLowerCase());
 assert.equal(payment.payload.authorization.value,terms.amount);
 for(const req of sent){await verifyIntroduction(req,key);assert.equal(await req.text(),'{"question":"fixture"}');assert.equal(req.redirect,'manual');}
 assert.notEqual(sent[0].headers.get('signature-input'),sent[1].headers.get('signature-input'));
 assert.equal(outcomes[0].payment,'challenge_received');
 assert.equal(outcomes[1].payment,'not_observed');
});

test('stock spending cap and explicit payment veto still stop before a paid request',async()=>{
 for(const veto of [false,true]){
  let sends=0;
  const {request}=await identity(async()=>{sends++;return challenge(veto?terms:{...terms,amount:'2000000'});});
  const payer=client();if(veto)payer.onBeforePaymentCreation(()=>({abort:true,reason:'Operator has not authorized spending'}));
  await assert.rejects(wrapFetchWithPayment(request,payer)('https://merchant.example/resource'));
  assert.equal(sends,1);
 }
});

test('lost paid response does not trigger an extra payment or expose payment material in diagnostics',async()=>{
 let sends=0;const outcomes=[];
 const {request}=await identity(async()=>{sends++;if(sends===1)return challenge();throw new Error('connection lost');},r=>outcomes.push(r));
 await assert.rejects(wrapFetchWithPayment(request,client())('https://merchant.example/resource'),/request_outcome_unknown/);
 assert.equal(sends,2);
 assert.equal(outcomes.at(-1).payment,'unknown');
 assert.equal(outcomes.at(-1).next_action,'reconcile_before_retry');
 assert.equal(JSON.stringify(outcomes).includes('authorization'),false);
 assert.equal(JSON.stringify(outcomes).includes(signer.address),false);
});
