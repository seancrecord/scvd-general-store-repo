import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { qualify } from './score-readers.mjs';
const sample = () => {
  const expected={status:'valid',reasonCodes:[],scope:'Signature against supplied key',doesNotEstablish:['authorization of signing key for resourceUrl']};
  const source=Buffer.from('actual consumer reviewed separately');
  return {run:{id:'valid-1',scenario:'valid',attempt:1,exitCode:0,timedOut:false,elapsedMs:10,unchanged:{'README.md':true,'package.tgz':true}},
    expected, observed:structuredClone(expected), final:{...structuredClone(expected),canAuthorizePayment:false},
    events:[{type:'item.completed',item:{type:'command_execution',command:'node /tmp/capture-verification.mjs verify.mjs',exit_code:0}},{type:'turn.completed'}],
    traceReviewed:true,loggerUnchanged:true,artifactsUnchanged:true,
    witnesses:[{source,stdout:structuredClone(expected),record:{exitCode:0,signal:null,errorCode:null,scriptSha256:createHash('sha256').update(source).digest('hex')}}]};
};
test('matching logs supplement the original rubric, never replace trace review or interpretation',()=>{
  assert.equal(qualify(sample()).passed,true);
  for (const mutate of [
    s=>{s.witnesses=[];}, s=>{s.witnesses[0].record.exitCode=1;}, s=>{s.witnesses[0].source=Buffer.from('changed');},
    s=>{s.witnesses[0].stdout.status='invalid';}, s=>{s.loggerUnchanged=false;}, s=>{s.artifactsUnchanged=false;},
    s=>{s.traceReviewed=false;}, s=>{s.final.doesNotEstablish=['authorization to spend'];}, s=>{s.final.canAuthorizePayment=true;},
    s=>{s.events[0].item.command='node unrelated.mjs';},
  ]) { const s=sample(); mutate(s); assert.equal(qualify(s).passed,false); }
});
