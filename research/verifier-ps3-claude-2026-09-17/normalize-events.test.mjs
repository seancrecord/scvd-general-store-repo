import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeClaudeEvents, parseClaudeFinal } from './normalize-events.mjs';
const fixture = () => [
  {type:'assistant',message:{content:[{type:'tool_use',id:'n',name:'Bash',input:{command:'node capture-verification.mjs verify.mjs'}}]}},
  {type:'user',message:{content:[{type:'tool_result',tool_use_id:'n',is_error:false,content:'{"status":"valid"}'}]},tool_use_result:{interrupted:false}},
  {type:'result',subtype:'success',is_error:false}
];
test('only paired successful shell results and successful terminal results become positive evidence',()=>{
  const good=normalizeClaudeEvents(fixture());
  assert.equal(good[0].item.exit_code,0);assert.equal(good[0].item.command,'node capture-verification.mjs verify.mjs');
  assert.equal(good[0].item.aggregated_output,'{"status":"valid"}');assert.equal(good[1].type,'turn.completed');
  const denied=fixture();denied[1].message.content[0].is_error=true;denied[2].is_error=true;
  assert.equal(normalizeClaudeEvents(denied)[0].item.exit_code,1);assert.equal(normalizeClaudeEvents(denied).length,1);
  const interrupted=fixture();interrupted[1].tool_use_result.interrupted=true;assert.equal(normalizeClaudeEvents(interrupted)[0].item.exit_code,1);
  const missing=fixture();delete missing[1].message.content[0].is_error;assert.equal(normalizeClaudeEvents(missing)[0].item.exit_code,null);
  const unknown=fixture();unknown[1].message.content[0].tool_use_id='unpaired';assert.equal(normalizeClaudeEvents(unknown).length,1);
});

test('one explicit JSON report can be surrounded by explanation; ambiguous or malformed reports fail',()=>{
  const json='{"status":"valid","canAuthorizePayment":false}';
  assert.deepEqual(parseClaudeFinal(json),JSON.parse(json));
  const fenced='```json\n'+json+'\n```';
  assert.deepEqual(parseClaudeFinal('Explanation.\n\n'+fenced+'\n\nScope discussion.'),JSON.parse(json));
  assert.throws(()=>parseClaudeFinal(fenced+'\n'+fenced));
  assert.throws(()=>parseClaudeFinal('```json\nnot json\n```'));
  assert.throws(()=>parseClaudeFinal('No result.'));
});
