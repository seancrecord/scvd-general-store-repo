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
 * Two readings per row, and the second is the one that matters:
 *
 *   1. As a TRANSACTION. A nonce must not resolve by hash; a settlement
 *      hash must. Either surprise exits non-zero.
 *   2. As an AUTHORIZATION. "No node will ever answer a nonce" was this
 *      store's overstatement on 2026-09-04. EIP-3009 settlements emit
 *      AuthorizationUsed(authorizer, nonce) on the USDC contract with the
 *      nonce INDEXED, so eth_getLogs answers it — and on 2026-09-05 that
 *      lookup recovered six settlement hashes the ledger had published as
 *      unaddressable. So: a nonce whose AuthorizationUsed log exists but
 *      whose row carries no settlement_tx_hash is a finding (the row is
 *      poorer than the chain), and a settlement_tx_hash whose receipt does
 *      not carry that nonce's AuthorizationUsed log is a finding (the row
 *      claims a settlement that did not spend that authorization). Both
 *      exit non-zero. A nonce with no log anywhere in the window is
 *      reported, not failed: absence on one chain in one window is a
 *      dated observation, and the row is expected to say so itself.
 *
 *   node scripts/walk-ledger-verify.mjs [--rpc <url>] [--json]
 */

import { readFileSync } from "node:fs";

const RPC = process.argv.includes("--rpc")
  ? process.argv[process.argv.indexOf("--rpc") + 1]
  : (process.env.BASE_RPC_URL ?? "https://mainnet.base.org");
const asJson = process.argv.includes("--json");
const LEDGER = new URL("../research/x402-walk-ledger/ledger.jsonl", import.meta.url);
const USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
// keccak256("AuthorizationUsed(address,bytes32)")
const AUTHORIZATION_USED = "0x98de503528ee59b575ef0c0a2576a82497bfc029a5685b209e9ec333479b10a5";
// How far either side of a row's observed_at to look for its authorization, in blocks (~2s each on Base).
const LOG_WINDOW_BLOCKS = 45000;

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

// Blocks are ~2s on Base; find the block nearest a timestamp by bisection.
async function blockAt(unixSeconds) {
  let lo = Math.max(0, head - 5_000_000), hi = head;
  while (hi - lo > 50) {
    const mid = (lo + hi) >> 1;
    const ts = Number(BigInt((await rpc("eth_getBlockByNumber", ["0x" + mid.toString(16), false])).timestamp));
    if (ts < unixSeconds) lo = mid; else hi = mid;
  }
  return lo;
}

async function authorizationLogs(nonce, aroundBlock) {
  const from = Math.max(0, aroundBlock - LOG_WINDOW_BLOCKS), to = Math.min(head, aroundBlock + LOG_WINDOW_BLOCKS);
  const logs = [];
  for (let a = from; a <= to; a += 10000) {
    const chunk = await rpc("eth_getLogs", [{
      fromBlock: "0x" + a.toString(16),
      toBlock: "0x" + Math.min(a + 9999, to).toString(16),
      topics: [AUTHORIZATION_USED, null, nonce],
    }]);
    logs.push(...chunk);
  }
  return { logs, from, to };
}

const findings = [];
for (const row of rows) {
  // Reading 1: as a transaction.
  for (const [field, value] of [
    ["authorization_nonce", row.authorization_nonce],
    ["settlement_tx_hash", row.settlement_tx_hash],
  ]) {
    if (typeof value !== "string") continue;
    const seen = await resolves(value);
    const found = seen.tx || seen.receipt;
    const expected = field === "settlement_tx_hash";
    findings.push({ row: row.row, field, value, found, surprising: found !== expected, reading: "as transaction" });
  }
  // Reading 2: as an authorization — the one a nonce actually answers to.
  if (typeof row.authorization_nonce !== "string" || typeof row.observed_at !== "string") continue;
  const observed = Math.floor(Date.parse(row.observed_at) / 1000);
  if (Number.isNaN(observed)) continue;
  const { logs, from, to } = await authorizationLogs(row.authorization_nonce, await blockAt(observed));
  const spentIn = logs.map((l) => l.transactionHash);
  const claimed = typeof row.settlement_tx_hash === "string" ? row.settlement_tx_hash : null;
  if (claimed && !spentIn.includes(claimed)) {
    findings.push({ row: row.row, field: "settlement_tx_hash", value: claimed, found: false, surprising: true, reading: `as authorization: the claimed settlement did not spend this nonce (AuthorizationUsed seen in: ${spentIn.join(", ") || "none"})` });
  } else if (!claimed && spentIn.length > 0) {
    findings.push({ row: row.row, field: "authorization_nonce", value: row.authorization_nonce, found: true, surprising: true, reading: `as authorization: spent in ${spentIn.join(", ")} but the row carries no settlement_tx_hash — the chain knows more than the row` });
  } else if (!claimed) {
    findings.push({ row: row.row, field: "authorization_nonce", value: row.authorization_nonce, found: false, surprising: false, reading: `as authorization: no AuthorizationUsed log in blocks ${from}..${to} on chain ${chainId} — not settled here in this window, which the row should say` });
  } else {
    findings.push({ row: row.row, field: "settlement_tx_hash", value: claimed, found: true, surprising: false, reading: "as authorization: the claimed settlement spent this nonce" });
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
    console.log(`  ${mark} row ${f.row} ${f.field} ${f.value.slice(0, 18)}… ${f.found ? "RESOLVES" : "null"} — ${f.reading}`);
  }
  console.log(
    surprises.length === 0
      ? `\nClean. ${findings.length} identifiers, every one what its row says it is.\n`
      : `\n${surprises.length} identifier(s) are not what their row claims.\n`,
  );
}

process.exit(surprises.length === 0 ? 0 : 1);
