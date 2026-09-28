import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync } from 'node:fs';
import { inspectOne, exitCodeFor } from 'scvd-preflight';
const report = JSON.parse(readFileSync(new URL('./node_modules/scvd-preflight/fixtures/inspection/mpp-only.json',import.meta.url)));
let calls=0;
const server=createServer((req,res)=>{calls++;let raw='';req.on('data',c=>raw+=c);req.on('end',()=>{assert.equal(req.url,'/api/preflight/v2');assert.equal(req.method,'POST');assert.deepEqual(JSON.parse(raw),{url:report.inspection.subject_url});assert.equal(req.headers['payment-signature'],undefined);res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(report));});});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
try {
 const base=`http://127.0.0.1:${server.address().port}`;
 const result=await inspectOne(report.inspection.subject_url,{base});
 assert.deepEqual(result.body,report);assert.deepEqual(result.inspection,report.inspection);assert.equal(result.inspectionExitCode,0);assert.equal(exitCodeFor([result]),1);
 const cli=await promisify(execFile)(process.execPath,[new URL('./node_modules/scvd-cli/scvd.mjs',import.meta.url).pathname,'--base',base,'inspect',report.inspection.subject_url,'--json']);
 assert.deepEqual(JSON.parse(cli.stdout),report);assert.equal(calls,2);
 console.log('fresh installed JavaScript and CLI consumers passed');
} finally {server.close();server.closeAllConnections();}
