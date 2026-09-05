#!/usr/bin/env node
/**
 * WALK LEDGER IDENTIFIER VERIFIER.
 *
 * Every identifier in research/x402-walk-ledger/ledger.jsonl claims a kind.
 * This asks a node whether that claim survives, and prints enough for anyone
 * to re-run it: the RPC, the chain, the head block, the moment, and a control
 * hash taken from that block.
 *
 * The control is the point. A run of nulls proves nothing on its own — it
 * looks identical whether the identifiers are unaddressable or the endpoint
 * is simply not answering us. So a real transaction from the head block goes
 * through the same endpoint first, and a run that cannot resolve it exits
 * non-zero having claimed nothing. That is 0200project's method, adopted
 * whole: they used it on 2026-09-04 to establish that a null we published
 * was about our identifier rather than their reach, and it is the reason
 * that finding took one round.
 *
 * A row whose `identifier_kind` is a nonce must NOT resolve; a row naming a
 * `settlement_tx_hash` must. Either surprise exits non-zero.
 *
 *   node scripts/walk-ledger-verify.mjs [--rpc <url>] [--json]
 */

import { readFileSync } from "node:fs";

const RPC = process.argv.includes("--rpc")
  ? process.argv[process.argv.indexOf("--rpc") + 1]
  : (process.env.BASE_RPC_URL ?? "https://mainnet.base.org");
const asJson = process.argv.includes("--json");
const LEDGER = new URL("../research/x402-walk-ledger/ledger.jsonl", import.meta.url);

async function rpc(method, params) {
  const response = await fetch(RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!response.ok) throw new Error(`${method}: HTTP ${response.status}`);
  const body = await response.json();
  if (body.error) throw new Error(`${method}: ${JSON.stringify(body.error)}`);
  return body.result;
}

const resolves = async (hash) => {
  const [tx, receipt] = await Promise.all([
    rpc("eth_getTransactionByHash", [hash]),
    rpc("eth_getTransactionReceipt", [hash]),
  ]);
  return { tx: tx !== null, receipt: receipt !== null };
};

const chainId = Number(BigInt(await rpc("eth_chainId", [])));
const headHex = await rpc("eth_blockNumber", []);
const head = Number(BigInt(headHex));
const readAt = new Date().toISOString();

// The control, before any claim: a transaction we know exists must come back.
const block = await rpc("eth_getBlockByNumber", [headHex, false]);
const control = block?.transactions?.[0];
if (!control) {
  console.error(`✗ head block ${head} carried no transactions; no control available. Nothing claimed.`);
  process.exit(1);
}
const controlSeen = await resolves(control);
if (!controlSeen.tx || !controlSeen.receipt) {
  console.error(`✗ control ${control} did not resolve at ${RPC}. Reach is not established, so a null below would mean nothing. Nothing claimed.`);
  process.exit(1);
}

const rows = readFileSync(LEDGER, "utf8")
  .split("\n")
  .filter((line) => line.trim().length > 0)
  .map((line) => JSON.parse(line));

const findings = [];
for (const row of rows) {
  for (const [field, value] of [
    ["authorization_nonce", row.authorization_nonce],
    ["settlement_tx_hash", row.settlement_tx_hash],
  ]) {
    if (typeof value !== "string") continue;
    const seen = await resolves(value);
    const found = seen.tx || seen.receipt;
    // A nonce that resolves is not a nonce. A settlement hash that does not
    // resolve is not a settlement. Both are findings, not noise.
    const expected = field === "settlement_tx_hash";
    findings.push({ row: row.row, field, value, found, surprising: found !== expected });
  }
}

const surprises = findings.filter((f) => f.surprising);
const report = {
  rpc: RPC,
  chain_id: chainId,
  head_block: head,
  control,
  read_at: readAt,
  rows: rows.length,
  findings,
  surprises: surprises.length,
};

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`\nWalk ledger identifiers — chain ${chainId} via ${RPC}`);
  console.log(`head ${head}, read ${readAt}`);
  console.log(`control ${control} resolves ✓\n`);
  for (const f of findings) {
    const mark = f.surprising ? "✗" : "·";
    console.log(`  ${mark} row ${f.row} ${f.field} ${f.value} ${f.found ? "RESOLVES" : "null"}`);
  }
  console.log(
    surprises.length === 0
      ? `\nClean. ${findings.length} identifiers, every one what its row says it is.\n`
      : `\n${surprises.length} identifier(s) are not what their row claims.\n`,
  );
}

process.exit(surprises.length === 0 ? 0 : 1);
