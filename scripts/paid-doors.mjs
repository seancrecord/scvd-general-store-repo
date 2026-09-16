#!/usr/bin/env node
/**
 * npm run paid-doors -- --doors <file.json> --from-block <n> --at-block <n> --out <dir>
 *
 * Reads, for each door, whether anyone has paid its advertised payTo,
 * to a named block height. The rules live in scripts/lib/paid-doors.mjs;
 * this file only fetches and writes. Read-only: it signs nothing,
 * spends nothing, and needs no key.
 *
 * The door file is a list of { name, url, payTo?, rail? }. A payTo left
 * out is resolved from the door's own unpaid 402, which is the same
 * question a buyer asks and costs nothing.
 *
 * BOTH ENDS OF THE WINDOW ARE REQUIRED. The public Base RPC caps
 * eth_getLogs at 2,000 blocks, so reading one address from genesis is
 * ~25,000 requests; nobody reproduces that, and a reading nobody can
 * reproduce is not evidence. Naming the floor makes the read cheap,
 * reproducible and comparable, at the cost of a scope that every row
 * then carries.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  PAID_RESIDUAL, TRANSFER_TOPIC, USDC_BASE, readDoor, readDoorRail,
} from "./lib/paid-doors.mjs";

const RPC = process.env.BASE_RPC_URL ?? "https://mainnet.base.org";
/** The public Base RPC's own ceiling, reported as -32614 / HTTP 413. */
const LOG_SPAN = BigInt(process.env.BASE_LOG_SPAN ?? 2000);
const UA = "scvd-paid-doors/1.0 (+https://scvd.store/what) read-only";
const flags = {};
for (let i = 2; i < process.argv.length; i += 1) {
  const a = process.argv[i];
  if (a.startsWith("--")) flags[a.slice(2)] = process.argv[i + 1]?.startsWith("--") ? true : process.argv[++i];
}
const fail = (m) => { console.error(`\n✗ ${m}\n`); process.exit(1); };

/**
 * One RPC call, retried only on transport trouble. A 5xx or a dropped
 * socket is the provider having a bad second and says nothing about the
 * chain; a 4xx is the provider's stated ceiling and retrying it is just
 * rudeness that ends in the same answer. The distinction matters here
 * more than usual, because a page this function gives up on becomes an
 * incomplete window, and an incomplete window is refused a zero — so a
 * retryable hiccup left unretried would be published as ignorance.
 */
async function rpc(method, params, attempts = 4) {
  let last;
  for (let i = 0; i < attempts; i += 1) {
    if (i > 0) await new Promise((done) => setTimeout(done, 500 * 2 ** (i - 1)));
    try {
      const r = await fetch(RPC, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        signal: AbortSignal.timeout(30_000),
      });
      if (r.status >= 500) { last = new Error(`${method}: HTTP ${r.status}`); continue; }
      if (!r.ok) throw new Error(`${method}: HTTP ${r.status}`);
      const b = await r.json();
      if (b.error) throw new Error(`${method}: ${JSON.stringify(b.error)}`);
      return b.result;
    } catch (error) {
      if (error?.message?.startsWith(`${method}: HTTP 4`)) throw error;
      last = error;
    }
  }
  throw new Error(`${last?.message ?? last} (after ${attempts} attempts)`);
}

const hex = (n) => `0x${BigInt(n).toString(16)}`;
const topicOf = (addr) => `0x${addr.slice(2).toLowerCase().padStart(64, "0")}`;

/** The advertised payTo, from the door's own unpaid 402. Costs nothing. */
async function resolvePayTo(url) {
  try {
    const res = await fetch(url, { method: "GET", headers: { "User-Agent": UA, Accept: "application/json" }, redirect: "manual", signal: AbortSignal.timeout(25_000) });
    const text = await res.text();
    let challenge = null;
    const header = res.headers.get("payment-required");
    if (header) { try { challenge = JSON.parse(Buffer.from(header, "base64").toString("utf8")); } catch { /* fall through to body */ } }
    if (!challenge) { try { challenge = JSON.parse(text); } catch { /* none */ } }
    const accepts = challenge?.accepts;
    if (!Array.isArray(accepts) || accepts.length === 0) {
      return { payTo: null, rail: null, unparsed: { status: res.status, note: "no accepts[] in header or body" } };
    }
    // Anything unparseable is EMITTED with its key and rail, never dropped:
    // a payTo we cannot read is a fact about our reader, not about the door.
    const out = accepts.map((a) => ({ rail: a.network ?? null, payTo: a.payTo ?? null, asset: a.asset ?? null, scheme: a.scheme ?? null }));
    const evm = out.find((a) => typeof a.payTo === "string" && a.payTo.startsWith("0x"));
    return { payTo: evm?.payTo ?? null, rail: evm?.rail ?? null, scheme: evm?.scheme ?? null, all_accepts: out, status: res.status };
  } catch (error) {
    return { payTo: null, rail: null, unparsed: { error: error?.message ?? String(error) } };
  }
}

/**
 * The transfer window, and whether it was COMPLETE. A provider that
 * caps a range hands back an empty array that looks exactly like a
 * quiet door, so a capped read is reported as incomplete rather than
 * as a zero. The window is walked in spans and any failure marks it.
 */
async function transferWindow(payTo, fromBlock, toBlock, span = LOG_SPAN) {
  const logs = [];
  let from = BigInt(fromBlock);
  const end = BigInt(toBlock);
  while (from <= end) {
    const to = from + span - 1n > end ? end : from + span - 1n;
    try {
      const page = await rpc("eth_getLogs", [{
        address: USDC_BASE, topics: [TRANSFER_TOPIC, null, topicOf(payTo)],
        fromBlock: hex(from), toBlock: hex(to),
      }]);
      for (const l of page) {
        logs.push({ from: `0x${String(l.topics?.[1] ?? "").slice(-40)}`, value: BigInt(l.data ?? "0x0"), txHash: l.transactionHash ?? null });
      }
    } catch (error) {
      return { logs, complete: false, incomplete_because: `${error?.message ?? error} (span ${from}-${to})` };
    }
    from = to + 1n;
  }
  return { logs, complete: true };
}

const doorsFile = flags.doors ?? fail("need --doors <file.json>");
const atBlock = Number(flags["at-block"] ?? fail("need --at-block <n>: a reading with no named height is not comparable with anyone's"));
const fromBlock = Number(flags["from-block"] ?? fail("need --from-block <n>: an unnamed floor reads as all of history, and this instrument cannot afford all of history"));
if (fromBlock > atBlock) fail(`--from-block ${fromBlock} is above --at-block ${atBlock}`);
const outDir = flags.out ?? `research/paid-doors-${new Date().toISOString().slice(0, 10)}`;
const doorsDoc = JSON.parse(readFileSync(doorsFile, "utf8"));
// A bare list, or a posed question carrying its frozen inputs beside it.
const doors = Array.isArray(doorsDoc) ? doorsDoc : doorsDoc.doors;
if (!Array.isArray(doors)) fail(`${doorsFile}: expected an array of doors, or an object with a doors[] array`);
mkdirSync(outDir, { recursive: true });

const head = Number(BigInt(await rpc("eth_blockNumber", [])));
if (atBlock > head) fail(`--at-block ${atBlock} is past the chain head ${head}`);
const spans = Math.ceil((atBlock - fromBlock + 1) / Number(LOG_SPAN));
console.log(`reading ${doors.length} doors over Base blocks ${fromBlock}-${atBlock} (head ${head})`);
console.log(`${spans} log page(s) per door at the RPC's ${LOG_SPAN}-block ceiling\n`);

const readings = [];

/** One EVM rail, read. Split out so a multi-rail door reuses it. */
async function readEvmRail({ payTo, scheme }) {
  const [balance, nonce, window] = await Promise.all([
    rpc("eth_call", [{ to: USDC_BASE, data: `0x70a08231${payTo.slice(2).toLowerCase().padStart(64, "0")}` }, hex(atBlock)]).catch(() => null),
    rpc("eth_getTransactionCount", [payTo, hex(atBlock)]).catch(() => null),
    transferWindow(payTo, fromBlock, atBlock),
  ]);
  const row = readDoorRail({
    rail: "eip155:8453", payTo, atBlock, fromBlock, scheme: scheme ?? null,
    balance: balance === null ? null : BigInt(balance),
    nonce: nonce === null ? null : Number(BigInt(nonce)),
    logs: window.logs, logsComplete: window.complete,
  });
  if (!window.complete) row.incomplete_because = window.incomplete_because;
  return row;
}

/**
 * A rail this instrument cannot read at all. Emitted with its own name
 * rather than dropped, because under the door rule an unread rail is
 * what collapses a zero — silently skipping it would manufacture a
 * confident answer out of a gap.
 */
function outOfReachRail({ rail, payTo }) {
  const row = readDoorRail({ rail: rail ?? "non-evm", payTo: null, atBlock, fromBlock });
  row.advertised_pay_to = payTo ?? null;
  row.established_by = `this door advertises ${payTo ?? "an address"} on ${rail ?? "an unnamed rail"}, which this instrument does not read; UNKNOWN is a gap in the observer, not a finding about the door`;
  return row;
}

for (const door of doors) {
  const entry = { name: door.name, url: door.url, rails: [] };

  if (Array.isArray(door.rails) && door.rails.length > 0) {
    // PINNED MULTI-RAIL. Every advertised rail is read or named, which
    // is what the door rule requires before a zero may stand.
    entry.pinned_rails = door.rails.length;
    for (const rail of door.rails) {
      const isEvm = typeof rail.payTo === "string" && rail.payTo.startsWith("0x");
      entry.rails.push(isEvm ? await readEvmRail(rail) : outOfReachRail(rail));
    }
  } else {
    const resolved = door.payTo
      ? { payTo: door.payTo, rail: door.rail ?? "eip155:8453", scheme: door.scheme ?? null }
      : await resolvePayTo(door.url);
    entry.resolved_pay_to = resolved.payTo;
    entry.resolved_rail = resolved.rail;
    entry.resolution = resolved.all_accepts ?? resolved.unparsed ?? null;
    if (!resolved.payTo) {
      entry.rails.push(readDoorRail({ rail: resolved.rail ?? "unresolved", payTo: null, atBlock, fromBlock }));
    } else {
      entry.rails.push(await readEvmRail(resolved));
      for (const a of resolved.all_accepts ?? []) {
        if (a.payTo && !String(a.payTo).startsWith("0x")) entry.rails.push(outOfReachRail({ rail: a.rail, payTo: a.payTo }));
      }
    }
  }

  // THE DOOR, from every rail — never picked from one.
  entry.door = readDoor({ name: door.name, rails: entry.rails });
  console.log(`  ${String(door.name).padEnd(26)} ${entry.door.verdict.padEnd(14)} rails: ${entry.rails.map((r) => r.verdict).join("/")}`);
  readings.push(entry);
}

const report = {
  what_this_is: "Whether anyone has paid each door's advertised payTo, read to a named block height. Never a ranking: rule 43 forbids ordering one host against another, and these rows are in the order they were given.",
  definition_from: "StillOS Notary (stillosdigitalholdings.com), supplied 2026-09-15 on issue #622 after they withdrew their own implementation. The definition is theirs; this reader is ours, so that a defect in one is not a defect in both.",
  read_at: new Date().toISOString(),
  rail: "eip155:8453", asset: USDC_BASE,
  window: { from_block: fromBlock, at_block: atBlock, log_span: Number(LOG_SPAN) },
  chain_head_when_read: head,
  distinct_counterparty_means: "a unique sending address. A facilitator settling for ten buyers counts once, so this measures settling addresses and not customers.",
  residual: PAID_RESIDUAL,
  what_this_is_not: "Not a statement that a door has never been paid: the strongest negative here is ZERO_OBSERVED over the named window, and only a row whose scope reads all_time (the nonce-zero argument) reaches further back than from_block. Not a measure of demand, revenue or quality. Not comparable with any reading taken at a different height.",
  posed_inputs: Array.isArray(doorsDoc) ? null : (doorsDoc.frozen_inputs ?? null),
  doors: readings,
};
writeFileSync(join(outDir, "reading.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(`\n→ ${join(outDir, "reading.json")}`);
