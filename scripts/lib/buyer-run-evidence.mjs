import {createHash,createPublicKey,verify} from 'node:crypto';
import {toEventSelector} from 'viem';

export function newAttempt(item,inputs,network){return {version:1,item_id:item.id,fulfillment:item.fulfillment,exact_buyer_inputs:structuredClone(inputs),network,started_at:new Date().toISOString(),quoted_terms:[],payment_submitted:false,chain_result:{state:'unobserved'},store_result:null,artifact:null,verification_result:null,round_trips:[],unexpected_retries:0,waits:[],recipient_understanding:{state:'unreviewed'},acceptance:{state:'incomplete'}};}
export function validEnvelope(e){try{return verify(null,Buffer.from(e.signed_payload),createPublicKey({format:'der',type:'spki',key:Buffer.concat([Buffer.from('302a300506032b6570032100','hex'),Buffer.from(e.public_key,'hex')])}),Buffer.from(e.signature,'hex'));}catch{return false;}}
export async function recordRoundTrip(attempt,request,response,startedAt){
 const signature=request.headers.get('PAYMENT-SIGNATURE')??request.headers.get('X-PAYMENT');const paid=Boolean(signature);
 const row={method:request.method,url:request.url,sent_at:startedAt,received_at:new Date().toISOString(),status:response.status,payment_submitted:paid};
 if(paid){if(attempt.round_trips.some(r=>r.payment_submitted))attempt.unexpected_retries++;attempt.payment_submitted=true;row.payment_sha256=createHash('sha256').update(signature).digest('hex');try{const payload=JSON.parse(Buffer.from(signature,'base64'));attempt.selected_terms=payload.accepted;}catch{/* Unknown signed wire format is retained as an evidence gap. */}}
 const pr=response.headers.get('payment-required');if(pr){try{attempt.quoted_terms.push(JSON.parse(Buffer.from(pr,'base64')));}catch{row.quote_parse_error=true;}}
 if(response.status===402){try{row.quote_body=await response.clone().json();if(!pr&&Array.isArray(row.quote_body.accepts))attempt.quoted_terms.push(row.quote_body);}catch{row.quote_body_unreadable=true;}}
 const paymentResponse=response.headers.get('payment-response');if(paymentResponse){try{attempt.payment_receipt=JSON.parse(Buffer.from(paymentResponse,'base64'));}catch{row.receipt_parse_error=true;}}
 attempt.round_trips.push(row);
}
export function assessAttempt(a){const checks={quote_retained:a.quoted_terms.length>0,one_payment_submission:a.payment_submitted&&a.unexpected_retries===0,chain_confirmed:a.chain_result.state==='confirmed'&&a.chain_result.matches_quote===true,store_success:a.store_result?.http_status===200,certificate_signature:validEnvelope(a.artifact),original_verified:a.verification_result?.valid===true&&a.verification_result?.signature===a.artifact?.signature&&a.verification_result?.signed_payload===a.artifact?.signed_payload,inputs_preserved:a.product_review?.inputs_preserved===true,promised_good_received:a.product_review?.promised_good_received===true,recipient_understands:a.recipient_understanding.state==='reviewed'&&a.recipient_understanding.understands===true};
 const failed=Object.entries(checks).filter(([,v])=>!v).map(([k])=>k);const incomplete=a.chain_result.state==='unobserved'||!a.product_review||a.recipient_understanding.state==='unreviewed';const knownFailure=(a.artifact?.signed_payload&&!checks.certificate_signature)||(a.verification_result&&!checks.original_verified)||(a.chain_result.state==='confirmed'&&!checks.chain_confirmed)||a.unexpected_retries>0||a.product_review?.inputs_preserved===false||a.product_review?.promised_good_received===false||(a.recipient_understanding.state==='reviewed'&&!checks.recipient_understands);return {state:failed.length===0?'pass':knownFailure?'fail':incomplete?'incomplete':'fail',checks,unmet:failed};}
export async function collectEvmReceipt(a,rpcUrl){
 const cert=JSON.parse(a.artifact?.signed_payload??'{}'),terms=a.selected_terms;if(!cert.settlement_tx||!terms)return {state:'unobserved',reason:'missing original transaction or selected quote'};
 const r=await fetch(rpcUrl,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_getTransactionReceipt',params:[cert.settlement_tx]}),signal:AbortSignal.timeout(20000)});const body=await r.json();if(body.error||!body.result)return {state:'unobserved',reason:'RPC did not return a receipt'};
 const receipt=body.result;
 // keccak256("Transfer(address,address,uint256)"), the ERC-20 event signature.
 const transfer=toEventSelector('Transfer(address,address,uint256)');
 const address=t=>'0x'+String(t).slice(-40).toLowerCase();
 const matches=receipt.status==='0x1'&&receipt.logs.some(l=>l.address.toLowerCase()===terms.asset.toLowerCase()&&l.topics[0]===transfer&&address(l.topics[1])===cert.payer?.toLowerCase()&&address(l.topics[2])===terms.payTo.toLowerCase()&&BigInt(l.data)===BigInt(terms.amount));
 return {state:'confirmed',matches_quote:matches,receipt,observed_at:new Date().toISOString(),limit:'RPC receipt observation; does not establish irreversible finality or rule out other authorizations.'};
}

export async function collectSolanaReceipt(a,rpcUrl){
 const cert=JSON.parse(a.artifact?.signed_payload??'{}'),terms=a.selected_terms;if(!cert.settlement_tx||!terms)return {state:'unobserved',reason:'missing original transaction or selected quote'};
 const r=await fetch(rpcUrl,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'getTransaction',params:[cert.settlement_tx,{encoding:'jsonParsed',commitment:'confirmed',maxSupportedTransactionVersion:0}]}),signal:AbortSignal.timeout(20000)});const body=await r.json();const tx=body.result;if(body.error||!tx)return {state:'unobserved',reason:'RPC did not return a transaction'};
 const pre=tx.meta?.preTokenBalances??[],post=tx.meta?.postTokenBalances??[];const relevant=[...pre,...post].filter(b=>b.mint===terms.asset);
 if(!relevant.some(b=>b.owner===cert.payer)||!relevant.some(b=>b.owner===terms.payTo))return {state:'unobserved',reason:'USDC ownership/balance evidence unavailable',transaction:tx};
 const sum=(list,owner)=>list.filter(b=>b.mint===terms.asset&&b.owner===owner).reduce((n,b)=>n+BigInt(b.uiTokenAmount.amount),0n);
 const amount=BigInt(terms.amount);const matches=tx.meta.err===null&&tx.transaction.signatures.includes(cert.settlement_tx)&&sum(post,cert.payer)-sum(pre,cert.payer)===-amount&&sum(post,terms.payTo)-sum(pre,terms.payTo)===amount;
 return {state:'confirmed',matches_quote:matches,transaction:tx,observed_at:new Date().toISOString(),limit:'Confirmed RPC transaction and matching owner/mint balance changes; no irreversible-finality claim.'};
}

// Reserve every transmitted authorization against the ceiling, even when its
// response says no charge. Only reconciliation can safely release that reserve.
export function checkSubmission(attempt,journal,wire,ceiling){
 if(attempt.payment_submitted)throw new Error('Buyer guard: automatic second payment submission refused; reconcile the original.');
 const terms=JSON.parse(Buffer.from(wire,'base64')).accepted;
 if(!terms||terms.network!==attempt.network||!/^\d+$/.test(terms.amount))throw new Error('Buyer guard: unknown selected payment terms.');
 const equal=o=>['network','asset','payTo','amount','scheme'].every(k=>o[k]===terms[k]);
 if(!attempt.quoted_terms.some(q=>q.accepts?.some(equal)))throw new Error('Buyer guard: selected offer was not retained.');
 const reserved=journal.filter(a=>a.payment_submitted).reduce((n,a)=>n+BigInt(a.selected_terms.amount),0n);
 if(!Number.isFinite(ceiling)||ceiling<=0||reserved+BigInt(terms.amount)>BigInt(Math.floor(ceiling*1e6)))throw new Error('Buyer guard: total USDC ceiling would be exceeded.');
 return terms;
}
