// Offline checks over the public export. No wallet, store internals or network.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash,createPublicKey,verify} from 'node:crypto';
const read=name=>JSON.parse(fs.readFileSync(name==='evidence.json'&&process.argv[2]?process.argv[2]:new URL(name,import.meta.url)));
const hash=s=>createHash('sha256').update(s).digest('hex');
const signature=(payload,sig,key)=>verify(null,Buffer.from(payload),createPublicKey({format:'der',type:'spki',key:Buffer.concat([Buffer.from('302a300506032b6570032100','hex'),Buffer.from(key,'hex')])}),Buffer.from(sig,'hex'));
const assertSignature=o=>{
 assert(signature(o.signed_payload,o.signature,o.public_key));
 assert(!signature(o.signed_payload+' ',o.signature,o.public_key),'changed bytes must fail');
};
const e=read('evidence.json');
const registry=read('cold-recipient/signing-key.json');
const publishedKeys=[registry.key_history.current,...registry.key_history.retired].map(k=>k.public_key);
assert.equal(e.payments.length,12);
assert.equal(new Set(e.payments.map(p=>p.artifact.certificate_id)).size,e.payments.length);
assert.equal(new Set(e.payments.map(p=>p.idempotency_key_sha256)).size,e.payments.length);
const mixed=e.payments.filter(p=>p.id.startsWith('mixed-'));
assert.equal(mixed.length,10);
assert.equal(new Set(mixed.map(p=>p.item)).size,5);
assert.equal(mixed.filter(p=>p.door==='http').length,5);
assert.equal(mixed.filter(p=>p.door==='mcp').length,5);
const sends=mixed.map(p=>p.checkout_calls.find(c=>c.paid));
assert(Math.max(...sends.map(c=>Date.parse(c.sent_at)))<Math.min(...sends.map(c=>Date.parse(c.headers_received_at))),'ten requests must overlap');
for(const p of mixed){
 assert.equal(p.checkout_calls.filter(c=>c.paid).length,1);
 assert.equal(p.checkout_calls.length,2);
 assert.equal(p.checkout_calls.find(c=>c.paid).status,200);
 assert.equal(p.checkout_calls.find(c=>c.paid).protocol_error,false);
}
const authTopic='0x98de503528ee59b575ef0c0a2576a82497bfc029a5685b209e9ec333479b10a5';
const transferTopic='0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
// Standard keccak256 event selectors, checked against the raw receipt logs.
const eventTopics=new Set();
const addr=t=>'0x'+t.slice(-40).toLowerCase();
for(const p of e.payments){
 const a=p.artifact;assertSignature(a);assert(publishedKeys.includes(a.public_key));
 const cert=JSON.parse(a.signed_payload);
 assert.equal(cert.cert_id,a.certificate_id);assert.equal(cert.item,p.item);
 assert.equal(cert.purpose,p.inputs.purpose);
 assert.equal(cert.network,e.network);
 assert.equal(Math.round(cert.paid_usdc*1e6),Number(p.quoted_terms.amount));
 assert.equal(cert.payer.toLowerCase(),e.payer.toLowerCase());
 assert.equal(p.review.correct_item,true);assert.equal(p.review.public_verify,true);
 assert.equal(p.review.recovery.recovery_state,'ready');
 assert.equal(p.review.recovery.same_signed_payload,true);
 assert.equal(p.review.recovery.same_deliverable,true);
 assert.equal(p.review.recovery.settlement_attempted,false);
 const row=e.money.rows.find(r=>r.id===p.id);assert.equal(row.authorization_uses,1);
 assert.equal(row.used.length,1);assert.equal(row.used[0].transaction,cert.settlement_tx);
 const receipt=e.money.receipts.find(r=>r.transactionHash===cert.settlement_tx);
 assert.equal(receipt.status,'0x1');assert(BigInt(receipt.blockNumber)<=BigInt(e.money.to_block));
 const auth=receipt.logs[row.used[0].authorization_offset],transfer=receipt.logs[row.used[0].transfer_offset];
 eventTopics.add(auth.topics[0]);assert.equal(auth.topics[0],authTopic);
 assert.equal(auth.address.toLowerCase(),p.quoted_terms.asset.toLowerCase());
 assert.equal(addr(auth.topics[1]),e.payer.toLowerCase());assert.equal(auth.topics[2],p.authorization.nonce);
 assert.equal(transfer.address.toLowerCase(),p.quoted_terms.asset.toLowerCase());
 assert.equal(transfer.topics[0],transferTopic);
 assert.equal(addr(transfer.topics[1]),e.payer.toLowerCase());
 assert.equal(addr(transfer.topics[2]),p.quoted_terms.payTo.toLowerCase());
 assert.equal(BigInt(transfer.data),BigInt(p.quoted_terms.amount));
 assert.equal(row.used[0].transfer_offset,row.used[0].authorization_offset+1);
 if(p.item==='spot_check'){
  const o=a.observation;assertSignature(o);
  assert.equal(JSON.stringify(o.record),o.signed_payload);
  assert.equal(o.record.host,p.inputs.host);assert.equal(a.spot_check.host,p.inputs.host);
  assert.equal(hash(o.signed_payload),o.evidence_hash);assert.equal(cert.attests,o.evidence_hash);
  assert(o.record.what_this_is.includes('No request was made to the host'));
 }else if(p.item==='the_confession'){
  const o=a.confession_receipt;assertSignature(o);
  const payload=JSON.parse(o.signed_payload);
  assert.deepEqual(payload,o.receipt);assert.equal(payload.confession,p.inputs.confession);
  assert.equal(payload.cert_id,a.certificate_id);
 }else if(p.item==='small_blessing'){
  const o=a.purchased_text;assertSignature(o);
  const payload=JSON.parse(o.signed_payload);
  assert.equal(payload.deliverable,a.deliverable);assert.equal(payload.cert_id,a.certificate_id);
  assert.equal(payload.item_id,p.item);
 }else{
  const o=a.attestation??a.reconciliation,entries=[];
  for(const pair of Object.entries(o)){if(pair[0]==='signature')break;entries.push(pair);}
  const payload=JSON.stringify(Object.fromEntries(entries));
  assertSignature({signed_payload:payload,signature:o.signature,public_key:o.public_key});
  assert.equal(o.tx_hash,p.inputs.tx_hash);assert.equal(cert.attests,o.evidence_hash);
  const core=[];for(const pair of entries){if(pair[0]==='evidence_hash')break;if(o.reconciliation_id&&pair[0]==='reading')continue;core.push(pair);}
  assert.equal(hash(JSON.stringify(Object.fromEntries(core))),o.evidence_hash);
 }
}
assert.equal(eventTopics.size,1);
assert.equal(e.money.unmatched_pairs.length,0);
const spend=e.payments.reduce((s,p)=>s+BigInt(p.quoted_terms.amount),0n);
assert.equal(spend,54000n);
assert.equal(BigInt(e.money.recognized_spend_atomic),spend);
assert.equal(BigInt(e.money.all_outgoing_atomic),spend);
assert.equal(BigInt(e.money.start_balance_atomic)-BigInt(e.money.end_balance_atomic),spend);
assert(e.money.authorization_expiry.all_authorizations_expired);
const control=e.payments.find(p=>p.id==='cancel-response-control');
const cancelled=control.checkout_calls.find(c=>c.body_cancelled_at);
const retry=control.checkout_calls.find(c=>c.kind==='intentional_replay');
assert(cancelled&&!cancelled.certificate_id);assert.equal(cancelled.status,200);
assert(Date.parse(e.control_settled_before_replay.at)<Date.parse(retry.sent_at));
assert.equal(e.control_settled_before_replay.row.authorization_uses,1);
assert.equal(e.control_settled_before_replay.row.delivered,false);
assert.equal(e.control_settled_before_replay.row.used[0].transaction,control.review.transaction);
const cold=read('cold-recipient/certificate.json'),handover=read('cold-recipient/handover.json'),keys=read('cold-recipient/signing-key.json');
assertSignature(cold);assertSignature(handover);
assert.equal(hash(cold.signed_payload),cold.artifact_hash);
assert.equal(hash(handover.signed_payload),handover.artifact_hash);
assert(keys.key_history.retired.some(k=>k.public_key===cold.public_key));
assert.equal(handover.handover.outgoing_public_key,cold.public_key);
const result={passed:true,purchases:e.payments.length,distinct_products:new Set(e.payments.map(p=>p.item)).size,spend_usdc:Number(spend)/1e6,mixed_first_paid_attempt_successes:mixed.length,clean_cancel_recovered:true,historical_signature_and_handover_verified:true,ots_verified:false,ordinary_wallet_only_artifact_recovery:false};
console.log(JSON.stringify(result,null,2));
