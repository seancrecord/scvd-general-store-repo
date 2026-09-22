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
  PAID_RESIDUAL, TRANSFER_TOPIC, USDC_BASE, readDoor, readDoorRail, windowTrustworthy, railCoveredByRun,
  knownAnswersFor, knownAnswerRun, balanceFromCallResult, rpcRetryable,
} from "./lib/paid-doors.mjs";
import { railFor } from "./lib/evm-chains.mjs";
import { useEnvProxy } from "./lib/proxy-fetch.mjs";

// Node's fetch ignores HTTPS_PROXY; in a proxied sandbox that reads as
// "host unreachable" when the host is merely unrouted. See the module.
await useEnvProxy();

/**
 * The rail this run reads, from the store's own registry rather than a
 * constant private to this file. --rail takes a CAIP-2 id; Base stays
 * the default so every existing invocation keeps its meaning.
 */
const RAIL_FLAG = process.argv.includes("--rail")
  ? process.argv[process.argv.indexOf("--rail") + 1]
  : "eip155:8453";
const RAIL = railFor(RAIL_FLAG);
if (!RAIL) {
  console.error(`\n✗ --rail ${RAIL_FLAG}: this instrument does not read that rail. It reads: ${Object.keys(await import("./lib/evm-chains.mjs").then((m) => m.EVM_RAILS)).join(", ")}\n`);
  process.exit(1);
}
const RPC = process.env.BASE_RPC_URL ?? RAIL.rpc;
/** The public endpoint's own eth_getLogs ceiling, per rail. */
const LOG_SPAN = BigInt(process.env.BASE_LOG_SPAN ?? RAIL.logSpan);
const RAIL_USDC = RAIL.usdc;
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
 * chain; most of the 4xx family is the provider's stated ceiling and
 * retrying it is just rudeness that ends in the same answer. The
 * distinction matters here more than usual, because a page this
 * function gives up on becomes an incomplete window, and an incomplete
 * window is refused a zero — so a retryable hiccup left unretried would
 * be published as ignorance.
 *
 * 429 AND 408 ARE THE EXCEPTIONS, and leaving them in with the rest was
 * a live defect until 2026-09-22. "Too many requests" and "request
 * timeout" are the provider saying COME BACK, not the provider stating
 * a limit on what it will ever answer — the opposite of a ceiling.
 * Found while walking a 126-page window to answer a counterparty: one
 * 429 in the middle truncated the window, the door fell through to its
 * balance, and the row came back PAID with `distinct_payers: null`
 * where a completed walk would have counted them. The verdict was not
 * wrong; the reading was poorer than the data allowed, for no reason
 * but a misfiled status code. This store has the 107-of-132 correction
 * on file for mishandling this exact status in the other direction.
 */

async function rpc(method, params, attempts = 6) {
  let last;
  for (let i = 0; i < attempts; i += 1) {
    if (i > 0) await new Promise((done) => setTimeout(done, 500 * 2 ** (i - 1)));
    try {
      const r = await fetch(RPC, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        signal: AbortSignal.timeout(30_000),
      });
      if (rpcRetryable(r.status)) {
        last = new Error(`${method}: HTTP ${r.status}`);
        // A rate limit answered as fast as the last request is a rate
        // limit again. Honour Retry-After when it is given, and give
        // the backoff below room when it is not.
        const after = Number(r.headers.get("retry-after"));
        if (Number.isFinite(after) && after > 0) await new Promise((done) => setTimeout(done, Math.min(after, 20) * 1000));
        continue;
      }
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
 * THE HORIZON CANARY (2026-09-19, StillOS Notary's third failure mode).
 *
 * A provider that prunes logs past a horizon returns an EMPTY ARRAY,
 * not an error, for any range older than it keeps. That is byte-identical
 * to a door nobody paid. The retry catch above cannot see it, because
 * nothing failed.
 *
 * So before any empty window is allowed to become a zero, ask the same
 * range a question we already know the answer to: were there ANY USDC
 * transfers at all in it? On a mainnet USDC contract there are
 * thousands per hundred blocks. An empty answer there is the provider
 * telling us it does not serve this range, and the window is reported
 * incomplete rather than quiet.
 *
 * One extra call, and only on the doors that would otherwise read
 * ZERO_OBSERVED — the only rows where the difference can be believed.
 */
async function horizonServes(fromBlock, toBlock) {
  const from = BigInt(fromBlock);
  const end = BigInt(toBlock);
  const probeTo = from + 99n > end ? end : from + 99n;
  try {
    const page = await rpc("eth_getLogs", [{
      address: RAIL_USDC, topics: [TRANSFER_TOPIC],
      fromBlock: hex(from), toBlock: hex(probeTo),
    }]);
    return { served: Array.isArray(page) && page.length > 0, probed: `${from}-${probeTo}`, saw: Array.isArray(page) ? page.length : null };
  } catch (error) {
    return { served: false, probed: `${from}-${probeTo}`, saw: null, error: error?.message ?? String(error) };
  }
}

/**
 * The transfer window, and whether it was COMPLETE. A provider that
 * caps a range hands back an empty array that looks exactly like a
 * quiet door, so a capped read is reported as incomplete rather than
 * as a zero. The window is walked in spans and any failure marks it.
 * An empty result is additionally canaried against the horizon above.
 */
async function transferWindow(payTo, fromBlock, toBlock, span = LOG_SPAN) {
  const logs = [];
  let from = BigInt(fromBlock);
  const end = BigInt(toBlock);
  while (from <= end) {
    const to = from + span - 1n > end ? end : from + span - 1n;
    try {
      const page = await rpc("eth_getLogs", [{
        address: RAIL_USDC, topics: [TRANSFER_TOPIC, null, topicOf(payTo)],
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
  if (logs.length === 0) {
    // Nothing found. Before that becomes a zero, prove the provider
    // serves this range at all. The rule is in the library; this is
    // only the request that feeds it.
    const canary = await horizonServes(fromBlock, toBlock);
    const trust = windowTrustworthy({ logs, canary });
    if (!trust.trustworthy) {
      return { logs, complete: false, incomplete_because: `${trust.because} Refusing to read it as a zero.`, horizon_canary: canary };
    }
    return { logs, complete: true, horizon_canary: canary };
  }
  return { logs, complete: true };
}

const doorsFile = flags.doors ?? fail("need --doors <file.json>");
const atBlock = Number(flags["at-block"] ?? fail("need --at-block <n>: a reading with no named height is not comparable with anyone's"));
/**
 * STATE ONLY (2026-09-17). Two calls per address — balance and
 * transaction count at the named height — and no transfer window. A
 * positive settles PAID from the balance alone; a zero settles only
 * under the nonce argument and reaches all of history; anything else
 * is UNKNOWN. Payer counts are not attempted and the row says so. This
 * is what made 132 addresses affordable on Base, and it is how 43
 * doors on a rail nobody measured get read at all: a 30-day window on
 * Arbitrum is ~1,000 log pages per address.
 */
const STATE_ONLY = flags["state-only"] === true;
const fromBlock = STATE_ONLY
  ? null
  : Number(flags["from-block"] ?? fail("need --from-block <n>: an unnamed floor reads as all of history, and this instrument cannot afford all of history (or pass --state-only for balance and nonce alone)"));
if (fromBlock !== null && fromBlock > atBlock) fail(`--from-block ${fromBlock} is above --at-block ${atBlock}`);
const outDir = flags.out ?? `research/paid-doors-${new Date().toISOString().slice(0, 10)}`;
const doorsDoc = JSON.parse(readFileSync(doorsFile, "utf8"));
// A bare list, or a posed question carrying its frozen inputs beside it.
const doors = Array.isArray(doorsDoc) ? doorsDoc : doorsDoc.doors;
if (!Array.isArray(doors)) fail(`${doorsFile}: expected an array of doors, or an object with a doors[] array`);
mkdirSync(outDir, { recursive: true });

const head = Number(BigInt(await rpc("eth_blockNumber", [])));
if (atBlock > head) fail(`--at-block ${atBlock} is past the chain head ${head}`);
if (STATE_ONLY) {
  console.log(`reading ${doors.length} doors on ${RAIL.label} (${RAIL_FLAG}) — state only at block ${atBlock} (head ${head})`);
  console.log(`balance and transaction count per address; no transfer window, no payer counts\n`);
} else {
  const spans = Math.ceil((atBlock - fromBlock + 1) / Number(LOG_SPAN));
  console.log(`reading ${doors.length} doors on ${RAIL.label} (${RAIL_FLAG}) over blocks ${fromBlock}-${atBlock} (head ${head})`);
  console.log(`${spans} log page(s) per door at the RPC's ${LOG_SPAN}-block ceiling\n`);
}

/**
 * THE KNOWN-ANSWER RUN, BEFORE ANY DOOR (StillOS Notary's seventh term,
 * issue #622, 2026-09-19).
 *
 * Declaring scope catches what an operator knows it could not see.
 * Every defect this thread actually produced was the other kind —
 * their field name, their page cap, our swallowed rate limit, our
 * proxy trap, both our loose rails — confident, well-formed, wrong,
 * and invisible to the instrument that made it. An input whose answer
 * is fixed in advance catches all of them, because each one moves a
 * number that is not allowed to move.
 *
 * It runs FIRST, on purpose, so a broken reader spends nothing on
 * doors and publishes nothing about them. The rules and the pinned
 * pair live in the library; this is the request that feeds them.
 */
const controls = knownAnswersFor(RAIL_FLAG);
const controlRows = [];
for (const control of controls) {
  // Through readEvmRail, the same path every door takes. A control
  // read by its own private code proves that code works and nothing else.
  controlRows.push(await readEvmRail({ payTo: control.address, scheme: "exact" }, { stateOnly: true }));
}
const knownAnswers = knownAnswerRun({ rail: RAIL_FLAG, controls, rows: controlRows });
for (const c of knownAnswers.controls) {
  console.log(`  ${(c.ok ? "control ok" : "CONTROL FAILED").padEnd(16)} ${String(c.control).padEnd(40)} ${c.observed ?? "not read"}`);
}
if (!knownAnswers.passed) {
  console.error(`\n✗ ${knownAnswers.because}\n\n  Nothing is published from a run that cannot read an answer it already had.\n`);
  process.exit(1);
}
console.log("");

const readings = [];

/** One EVM rail, read. Split out so a multi-rail door reuses it. */
async function readEvmRail({ payTo, scheme }, { stateOnly = STATE_ONLY } = {}) {
  // A failed state read is recorded on the row, never folded into a
  // null that reads as "holds nothing" — the 107-of-132 lesson.
  let readError = null;
  const swallow = (error) => { readError = readError ?? (error?.message ?? String(error)); return null; };
  // The known-answer controls below read state only whatever the run
  // is doing: their funded address is an Aave pool with millions of
  // transfers, and a window over it would cost more than the reading.
  const from = stateOnly ? null : fromBlock;
  const [balance, nonce, window] = await Promise.all([
    rpc("eth_call", [{ to: RAIL_USDC, data: `0x70a08231${payTo.slice(2).toLowerCase().padStart(64, "0")}` }, hex(atBlock)]).catch(swallow),
    rpc("eth_getTransactionCount", [payTo, hex(atBlock)]).catch(swallow),
    stateOnly ? Promise.resolve(null) : transferWindow(payTo, fromBlock, atBlock),
  ]);
  // `0x` back from eth_call is an address with no code answering, not
  // a zero balance — see balanceFromCallResult. Decoding it here, once,
  // keeps the rule where it can be tested.
  const decoded = balance === null ? { balance: null, error: null } : balanceFromCallResult(balance);
  if (decoded.error) readError = readError ?? decoded.error;
  const row = readDoorRail({
    rail: RAIL_FLAG, payTo, atBlock, fromBlock: from, scheme: scheme ?? null,
    balance: decoded.balance,
    nonce: nonce === null ? null : Number(BigInt(nonce)),
    ...(window ? { logs: window.logs, logsComplete: window.complete } : {}),
  });
  if (decoded.balance !== null) row.balance_atomic = decoded.balance.toString();
  if (nonce !== null) row.nonce = Number(BigInt(nonce));
  if (readError) { row.read_failed = true; row.read_error = readError; }
  if (window && !window.complete) row.incomplete_because = window.incomplete_because;
  // A guard nobody can see is worth no more than no guard. When a zero
  // rests on a canaried window, the row carries the canary.
  if (window?.horizon_canary) row.horizon_canary = window.horizon_canary;
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
  row.established_by = `this door advertises ${payTo ?? "an address"} on ${rail ?? "an unnamed rail"}, which this run does not read (this reader holds one rail per run and is reading ${RAIL_FLAG}); UNKNOWN is a gap in the observer, not a finding about the door`;
  return row;
}

for (const door of doors) {
  const entry = { name: door.name, url: door.url, rails: [] };

  if (Array.isArray(door.rails) && door.rails.length > 0) {
    // PINNED MULTI-RAIL. Every advertised rail is read or named, which
    // is what the door rule requires before a zero may stand.
    entry.pinned_rails = door.rails.length;
    for (const rail of door.rails) {
      /*
       * A 0x ADDRESS IS NOT A PERMISSION TO READ IT HERE (2026-09-19).
       * This reader holds one rail per run — RAIL_FLAG — and every EVM
       * chain uses the same address format. Reading a pinned Polygon
       * payTo against Base's USDC contract answers a question nobody
       * asked and answers it confidently: the address exists on both
       * chains, the call succeeds, and the row looks like a reading.
       * That is StillOS's truncation near-miss in a third coat — a
       * well-formed wrong value. A rail is read only when the door
       * pinned it to the rail this run is reading.
       */
      const isEvm = typeof rail.payTo === "string" && rail.payTo.startsWith("0x");
      const thisRail = railCoveredByRun(rail.rail, RAIL_FLAG);
      entry.rails.push(isEvm && thisRail ? await readEvmRail(rail) : outOfReachRail(rail));
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

/**
 * THE NUMBER THAT MUST NEVER BE BURIED (carried over from floor-check,
 * 2026-09-17). A row resting on a failed request is a gap in this
 * reader, not in the door, and a run with many of them is a run to
 * throw away rather than publish. Refuse above one in twenty.
 */
const railRows = readings.flatMap((r) => r.rails ?? []);
const readFailures = railRows.filter((r) => r.read_failed).length;
if (railRows.length > 0 && readFailures > railRows.length / 20) {
  console.error(`\n✗ ${readFailures} of ${railRows.length} rail reads failed. That is a reading about our own request budget, not about these doors — not publishing it.\n`);
  process.exit(1);
}
const report = {
  known_answer_run: knownAnswers,
  read_failures: readFailures,
  read_failures_note: "Rail rows whose balance or nonce request never answered after retries. They sit inside UNKNOWN and are a gap in this reader, never a finding about the door. A run where this is not near zero is not published.",
  what_this_is: "Whether anyone has paid each door's advertised payTo, read to a named block height. Never a ranking: rule 43 forbids ordering one host against another, and these rows are in the order they were given.",
  definition_from: "StillOS Notary (stillosdigitalholdings.com), supplied 2026-09-15 on issue #622 after they withdrew their own implementation. The definition is theirs; this reader is ours, so that a defect in one is not a defect in both.",
  read_at: new Date().toISOString(),
  rail: RAIL_FLAG, rail_label: RAIL.label, asset: RAIL_USDC,
  window: STATE_ONLY
    ? { state_only: true, from_block: null, at_block: atBlock, means: "balance and transaction count at the named height; no transfer window was read, so PAID rows carry no payer count and every ZERO_OBSERVED rests on the nonce argument" }
    : { from_block: fromBlock, at_block: atBlock, log_span: Number(LOG_SPAN) },
  chain_head_when_read: head,
  distinct_counterparty_means: "a unique sending address. A facilitator settling for ten buyers counts once, so this measures settling addresses and not customers.",
  residual: PAID_RESIDUAL,
  what_this_is_not: "Not a statement that a door has never been paid: the strongest negative here is ZERO_OBSERVED over the named window, and only a row whose scope reads all_time (the nonce-zero argument) reaches further back than from_block. Not a measure of demand, revenue or quality. Not comparable with any reading taken at a different height.",
  posed_inputs: Array.isArray(doorsDoc) ? null : (doorsDoc.frozen_inputs ?? null),
  doors: readings,
};
writeFileSync(join(outDir, "reading.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(`\n→ ${join(outDir, "reading.json")}`);
