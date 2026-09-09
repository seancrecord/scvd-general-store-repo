// Reconcile saved public reads offline. Never submits a directory correction.
import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createEvidenceBundle, verifyEvidenceBundle, detachedTimestamp } from '../verifier/evidence-bundle.js';

const directory=new URL('../research/verification-2026-09-08/',import.meta.url);
const read=async name=>JSON.parse(await readFile(new URL(name+'.json',directory),'utf8'));
const receipt=await read('receipt'), key=await read('key'), listing=await read('listing'), facilitator=await read('coinbase');
const transaction=(await read('base-transaction')).data.result;
const chainReceipt=(await read('base-receipt')).data.result;
const bundle=await createEvidenceBundle(receipt.data,{sourceUrl:receipt.url,capturedAt:receipt.read_at,issuerDocument:key.data});
const verified=await verifyEvidenceBundle(bundle,{publicKey:key.data.public_key});
assert.equal(verified.valid,true,'captured receipt must verify against the separately captured key');
const claims=verified.signed_claims;
assert.equal(chainReceipt.status,'0x1');
assert.equal(transaction.hash,claims.settlement_tx);
assert.equal(chainReceipt.transactionHash,transaction.hash);
assert.equal(chainReceipt.blockHash,transaction.blockHash);
const usdc='0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const transferTopic='0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const transfers=chainReceipt.logs.filter(l=>l.address.toLowerCase()===usdc && l.topics[0]===transferTopic).map(l=>({from:'0x'+l.topics[1].slice(-40),to:'0x'+l.topics[2].slice(-40),atomic_amount:BigInt(l.data).toString()}));
const transfer=transfers.find(t=>t.from.toLowerCase()===claims.payer.toLowerCase() && Number(t.atomic_amount)/1e6===Number(claims.paid_usdc));
assert.ok(transfer,'matching USDC transfer required');
const settler=facilitator.data.data.settlers.find(s=>s.enabled && s.network_caip2===claims.network && s.address.toLowerCase()===transaction.from.toLowerCase());
assert.ok(settler,'origin must exist in directory tracked settlers');
const payoutPaths=[];
function walk(value,path='data') {
  if (typeof value==='string' && value.toLowerCase()===transfer.to.toLowerCase()) payoutPaths.push(path);
  else if(value && typeof value==='object') for(const [k,v] of Object.entries(value)) walk(v,path+'.'+k);
}
walk(listing.data.data);
assert.ok(payoutPaths.length,'directory must advertise the actual receiving address');
const msBetween=(a,b)=>Date.parse(b)-Date.parse(a);
const result={
  source_reads:{receipt:receipt.read_at,key:key.read_at,listing:listing.read_at,coinbase:facilitator.read_at},
  trust_basis:'Receipt signature checked locally against the key captured separately over issuer HTTPS; historical key authorization is not independently established. RPC evidence is one provider, not a locally validated chain.',
  receipt_id:claims.cert_id,
  receipt_verification:verified,
  settlement:{transaction:transaction.hash,network:claims.network,block_number:Number(BigInt(transaction.blockNumber)),block_hash:transaction.blockHash,status:'success',transaction_origin:transaction.from,tracked_coinbase_settler:true,token:usdc,transfer,directory_payout_paths:payoutPaths},
  directory_traction:listing.data.data.assessment.traction,
  inference:'The captured directory already tracks this Coinbase origin and advertises this receiving address. Investigate service/network attribution, harvest coverage or computation freshness; adding a custom facilitator is not supported by this example.',
  commercial_limit:'One keeper-reported browser canary. It does not establish independent demand or predict a ranking change.',
  anchor_sample:{denominator:1,selection:'Known keeper receipt, not a random sample or corpus census',claimed_submission_count:1,claimed_bounded_count:1,independently_verified_bitcoin_count:0,linked_evidence_present_count:0,issue_to_submission_ms:msBetween(claims.date,receipt.data.existence.submitted_at),issue_to_claimed_block_time_ms:msBetween(claims.date,receipt.data.existence.existed_by.block_time),issue_to_recorded_upgrade_ms:msBetween(claims.date,receipt.data.existence.upgraded_at),claimed_block:receipt.data.existence.existed_by,measurement_limit:'These are stored event timestamps and a server-supplied block time, not a continuous latency observation. The bundle does not verify Bitcoin proof operations or headers.'},
  corpus_reads:{index:await read('corpus'),latest:await read('corpus-latest'),first:'corpus-first.json was readable (14,523 bytes); used only as a captured-file checkpoint in the PQ experiment, not a corpus-coverage denominator.'},
  attribution:'Directory data: x402-list.com, CC BY 4.0. https://www.x402-list.com/api/v1/services/sean-claude-van-damme-s-general-store and https://www.x402-list.com/api/v1/facilitators/coinbase',
};
for(const [name,value] of [['receipt.bundle.json',bundle],['observation-result.json',result]]) await writeFile(new URL(name,directory),JSON.stringify(value,null,2)+'\n');
await writeFile(new URL('receipt.payload.json',directory),bundle.artifact.signed_payload);
await writeFile(new URL('receipt.payload.json.ots',directory),detachedTimestamp(bundle.timestamp.digest,bundle.timestamp.proof_base64));
console.log(JSON.stringify({result:fileURLToPath(new URL('observation-result.json',directory)),signature_valid:verified.valid,missing_evidence:verified.missing_evidence,tracked_coinbase_settler:true,payout_matches:payoutPaths.length,anchor_sample:result.anchor_sample},null,2));
