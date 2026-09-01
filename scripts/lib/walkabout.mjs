/**
 * THE WALKABOUT RUNNER — the pure half.
 *
 * WALKABOUT.md is the law; this file is the eight rules as functions
 * with no network and no filesystem in them, so every one can be
 * tested against synthetic bytes (scripts/walkabout.test.mjs) and the
 * CLI in scripts/walkabout.mjs is only wiring: fetch, sign, append.
 *
 * Vocabulary is the Launch Check's, on purpose. A walk and a launch
 * check are the same instrument pointed at different consent — one
 * at a door that listed itself, one at a door whose operator asked —
 * so their records must join without translation (rule 51: no
 * instrument has authority over another's register; the cheapest way
 * to honour that is to speak one register).
 */

import { createHash, randomBytes } from "node:crypto";

export const UA =
  "scvd-walkabout/1.0 (+https://scvd.store/what) x402-field-research";

/** Rule 1's defaults. The standing weekly approval covers EXACTLY these. */
export const DEFAULT_CAPS = Object.freeze({
  perItemUsd: 0.05,
  runUsd: 10,
  perDomain: 1,
});

export const STORE_HOST = "scvd.store";
export const BASE_CAIP2 = "eip155:8453";
export const BASE_USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
/** Chainalysis on-chain sanctions oracle on Base (launch-check.ts). */
export const SANCTIONS_ORACLE_BASE =
  "0x3A91A31cB3dC49b4db9Ce721F50a9D076c8D739B";
const IS_SANCTIONED_SELECTOR = "0xdf592f7d";
const BOOL_TRUE = `0x${"0".repeat(63)}1`;
const BOOL_FALSE = `0x${"0".repeat(64)}`;
export const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

/** The Launch Check's verdicts, verbatim, so the two records join. */
export const VERDICTS = Object.freeze([
  "settled",
  "payment_refused",
  "no_payment_gate",
  "malformed_challenge",
  "unpaid_by_rule",
  "unreachable",
]);

/**
 * The 402 shape buckets, stated before any percentage (rule 5 of the
 * walk): x402Version + accepts[] IS the standard body.
 */
export const SHAPES = Object.freeze([
  "spec_conformant",
  "other_structured",
  "empty",
  "non_402",
]);

/** Bodies above this are stored as sha256 + a head, never dropped. */
export const BODY_VERBATIM_LIMIT = 8192;
export const BODY_HEAD_BYTES = 2048;

/** ISO-8601 week key, the same one the bounty board budgets by. */
export function isoWeek(date = new Date()) {
  const d = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function decodeBase64Json(value) {
  try {
    return JSON.parse(Buffer.from(value, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

function isSpecShaped(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    "x402Version" in value &&
    Array.isArray(value.accepts)
  );
}

/**
 * Read a door's answer to an unpaid request. Header first (the copy
 * our own till reads back), body second — both placements, the
 * lesson of the 2026-08-28 correction. Returns the bucket, the
 * challenge if one was readable, and where it was found.
 */
export function parseChallenge(status, headers, bodyText) {
  const get = (name) => {
    if (!headers) return null;
    if (typeof headers.get === "function") return headers.get(name);
    const key = Object.keys(headers).find(
      (k) => k.toLowerCase() === name.toLowerCase(),
    );
    return key ? headers[key] : null;
  };
  if (status !== 402) {
    return { shape: "non_402", challenge: null, source: null };
  }
  const header = get("payment-required");
  if (header) {
    const decoded = decodeBase64Json(header);
    if (isSpecShaped(decoded)) {
      return { shape: "spec_conformant", challenge: decoded, source: "header" };
    }
    if (decoded && typeof decoded === "object") {
      return { shape: "other_structured", challenge: decoded, source: "header" };
    }
  }
  const body = parseJson(bodyText ?? "");
  if (isSpecShaped(body)) {
    return { shape: "spec_conformant", challenge: body, source: "body" };
  }
  if (body && typeof body === "object") {
    return { shape: "other_structured", challenge: body, source: "body" };
  }
  if (!header && !(bodyText ?? "").trim()) {
    return { shape: "empty", challenge: null, source: null };
  }
  return { shape: "other_structured", challenge: null, source: null };
}

function amountOf(accept) {
  const raw = accept.amount ?? accept.maxAmountRequired;
  if (typeof raw !== "string" || !/^\d+$/.test(raw)) return Number.NaN;
  return Number(raw) / 1e6;
}

/**
 * Pick the one accept this instrument can honour: exact scheme, Base,
 * USDC, a payTo, and no transfer method outside its reach. A door that
 * offers only something else is recorded, not paid — a statement about
 * our reach, never about the seller.
 */
export function chooseAccept(accepts) {
  if (!Array.isArray(accepts) || accepts.length === 0) {
    return { accept: null, reason: "no_accepts" };
  }
  const candidates = accepts.filter(
    (a) =>
      a &&
      typeof a === "object" &&
      (a.scheme ?? "exact") === "exact" &&
      a.network === BASE_CAIP2 &&
      typeof a.payTo === "string" &&
      typeof a.asset === "string" &&
      a.asset.toLowerCase() === BASE_USDC,
  );
  if (candidates.length === 0) {
    return { accept: null, reason: "no_base_usdc_exact_accept" };
  }
  const accept = candidates[0];
  const method = accept.extra?.assetTransferMethod;
  if (method && method !== "eip3009") {
    return { accept, reason: `transfer_method_out_of_reach:${method}` };
  }
  const amountUsd = amountOf(accept);
  if (Number.isNaN(amountUsd)) {
    return { accept, reason: "unreadable_amount" };
  }
  return {
    accept,
    reason: null,
    amountUsd,
    amountAtomic: String(accept.amount ?? accept.maxAmountRequired),
    payTo: accept.payTo,
    network: accept.network,
    asset: accept.asset,
  };
}

/**
 * Rules 1, 2 and the house's own law, before any signature: the caps,
 * one purchase per domain, never our own door, never a house wallet
 * as payTo. Returns the reason to withhold, or null to proceed.
 */
export function ruleCheck(
  { amountUsd, payTo, domain },
  state,
  caps = DEFAULT_CAPS,
  houseWallets = [],
) {
  if (domain === STORE_HOST || domain.endsWith(`.${STORE_HOST}`)) {
    return "own_door";
  }
  const house = new Set(houseWallets.map((w) => String(w).toLowerCase()));
  if (payTo && house.has(String(payTo).toLowerCase())) {
    return "own_wallet";
  }
  if ((state.domains?.[domain] ?? 0) >= caps.perDomain) {
    return "per_domain_cap";
  }
  if (Number.isNaN(amountUsd)) return "unreadable_amount";
  if (amountUsd > caps.perItemUsd) return "per_item_cap";
  if ((state.spentUsd ?? 0) + amountUsd > caps.runUsd) return "run_cap";
  return null;
}

/** Caps above the defaults leave the standing approval; say why. */
export function capsNeedPress(caps) {
  return (
    caps.perItemUsd > DEFAULT_CAPS.perItemUsd ||
    caps.runUsd > DEFAULT_CAPS.runUsd ||
    caps.perDomain > DEFAULT_CAPS.perDomain
  );
}

/** EIP-3009 authorization for one exact payment, nonce fresh. */
export function buildAuthorization({
  from,
  payTo,
  amountAtomic,
  timeoutSeconds = 300,
  now = Math.floor(Date.now() / 1000),
  nonce = `0x${randomBytes(32).toString("hex")}`,
}) {
  return {
    from,
    to: payTo,
    value: amountAtomic,
    validAfter: "0",
    validBefore: String(now + timeoutSeconds),
    nonce,
  };
}

export function typedData(accept, authorization) {
  return {
    domain: {
      name: accept.extra?.name ?? "USD Coin",
      version: accept.extra?.version ?? "2",
      chainId: 8453,
      verifyingContract: accept.asset,
    },
    types: {
      TransferWithAuthorization: [
        { name: "from", type: "address" },
        { name: "to", type: "address" },
        { name: "value", type: "uint256" },
        { name: "validAfter", type: "uint256" },
        { name: "validBefore", type: "uint256" },
        { name: "nonce", type: "bytes32" },
      ],
    },
    primaryType: "TransferWithAuthorization",
    message: authorization,
  };
}

/** The x402 v2 envelope, as the PAYMENT-SIGNATURE header value. */
export function paymentHeader(accept, signature, authorization) {
  return Buffer.from(
    JSON.stringify({
      x402Version: 2,
      accepted: accept,
      payload: { signature, authorization },
    }),
  ).toString("base64");
}

/**
 * Rule 3. Fails closed on everything but the oracle saying false,
 * byte for byte: `listed: null` means the screen did not answer and
 * the CLI withholds payment.
 */
export async function screenAddress(address, rpcUrl, fetchImpl = fetch) {
  const source = `Chainalysis on-chain sanctions oracle (${SANCTIONS_ORACLE_BASE} on ${BASE_CAIP2})`;
  if (!/^0x[0-9a-fA-F]{40}$/.test(address ?? "")) {
    return { listed: null, source: `${source} — address shape unscreenable` };
  }
  try {
    const data =
      IS_SANCTIONED_SELECTOR + address.slice(2).toLowerCase().padStart(64, "0");
    const response = await fetchImpl(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_call",
        params: [{ to: SANCTIONS_ORACLE_BASE, data }, "latest"],
      }),
    });
    if (!response.ok) {
      return { listed: null, source: `${source} (HTTP ${response.status})` };
    }
    const body = await response.json();
    if (body?.result === BOOL_TRUE) return { listed: true, source };
    if (body?.result === BOOL_FALSE) return { listed: false, source };
    return { listed: null, source: `${source} — unexpected result` };
  } catch (error) {
    return { listed: null, source: `${source} — ${error?.message ?? "error"}` };
  }
}

/** What the door did with a signed payment. */
export function classifyPaid(status, bodyText) {
  if (status >= 200 && status < 300) {
    return {
      verdict: "settled",
      deliverable: (bodyText ?? "").trim().length > 0 ? "body" : "empty",
    };
  }
  return { verdict: "payment_refused", deliverable: null };
}

/** Rule 5: verbatim, or sha256 + a head when huge. Never dropped. */
export function bodyRecord(text) {
  const bytes = Buffer.byteLength(text ?? "", "utf8");
  if (bytes <= BODY_VERBATIM_LIMIT) {
    return { body: text ?? "", body_bytes: bytes };
  }
  return {
    body_sha256: createHash("sha256").update(text, "utf8").digest("hex"),
    body_head: Buffer.from(text, "utf8")
      .subarray(0, BODY_HEAD_BYTES)
      .toString("utf8"),
    body_bytes: bytes,
  };
}

/** Headers as a plain object, lower-cased, for the raw record. */
export function headersRecord(headers) {
  const out = {};
  if (!headers) return out;
  if (typeof headers.forEach === "function") {
    headers.forEach((value, key) => {
      out[key.toLowerCase()] = value;
    });
    return out;
  }
  for (const [key, value] of Object.entries(headers)) {
    out[key.toLowerCase()] = value;
  }
  return out;
}

export function hostOf(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Targets, rule 2: doors that listed themselves. From the August
 * ledger (settled, or a spec-shaped 402) and the latest corpus round
 * (probed ready, with a URL). Never our own host; one URL per domain.
 */
export function deriveTargets({ ledgerLines = [], corpusHosts = [] } = {}) {
  const byDomain = new Map();
  const consider = (url, source) => {
    const domain = hostOf(url);
    if (!domain) return;
    if (domain === STORE_HOST || domain.endsWith(`.${STORE_HOST}`)) return;
    if (!byDomain.has(domain)) byDomain.set(domain, { url, domain, source });
  };
  for (const line of ledgerLines) {
    const entry = typeof line === "string" ? parseJson(line) : line;
    if (!entry || !entry.url) continue;
    const specShaped =
      entry.status === 402 &&
      !(entry.error ?? "").includes("No PAYMENT-REQUIRED") &&
      !(entry.error ?? "").includes("No accepts");
    if (entry.paid === true || specShaped) {
      consider(entry.url, "field-run-2026-08-18");
    }
  }
  for (const row of corpusHosts) {
    if (row?.verdict === "ready" && typeof row.url === "string") {
      consider(row.url, `corpus:${row.source ?? "round"}`);
    }
  }
  return [...byDomain.values()];
}

function pct(part, whole) {
  return whole === 0 ? "0.0%" : `${((part / whole) * 100).toFixed(1)}%`;
}

/**
 * Every number a report prints comes out of this function, from the
 * ledger lines alone — rule 5's "a percentage that cannot be
 * re-derived from committed raw data is a memory".
 */
export function summarize(lines) {
  const entries = lines
    .map((line) => (typeof line === "string" ? parseJson(line) : line))
    .filter(Boolean);
  const run = entries.find((e) => e.kind === "run") ?? null;
  const end = entries.find((e) => e.kind === "run_end") ?? null;
  const attempts = entries.filter((e) => e.kind === "attempt");
  const byShape = Object.fromEntries(SHAPES.map((s) => [s, 0]));
  const byVerdict = Object.fromEntries(VERDICTS.map((v) => [v, 0]));
  const unpaidReasons = {};
  const refusedStatus = {};
  let spentUsd = 0;
  let delivered = 0;
  const domains = new Set();
  for (const a of attempts) {
    if (a.shape in byShape) byShape[a.shape] += 1;
    if (a.verdict in byVerdict) byVerdict[a.verdict] += 1;
    if (a.verdict === "unpaid_by_rule") {
      unpaidReasons[a.reason ?? "unstated"] =
        (unpaidReasons[a.reason ?? "unstated"] ?? 0) + 1;
    }
    if (a.verdict === "payment_refused") {
      refusedStatus[a.paid_status ?? "?"] =
        (refusedStatus[a.paid_status ?? "?"] ?? 0) + 1;
    }
    if (a.verdict === "settled") {
      spentUsd += Number(a.amount_usd ?? 0);
      if (a.deliverable === "body") delivered += 1;
    }
    if (a.domain) domains.add(a.domain);
  }
  const presented = byVerdict.settled + byVerdict.payment_refused;
  return {
    run,
    end,
    attempts: attempts.length,
    domains: domains.size,
    by_shape: byShape,
    by_verdict: byVerdict,
    unpaid_reasons: unpaidReasons,
    refused_status: refusedStatus,
    payments_presented: presented,
    settled: byVerdict.settled,
    settled_with_body: delivered,
    spent_usd: Number(spentUsd.toFixed(6)),
  };
}

export function renderReport(summary, { ledgerPath = "ledger.jsonl" } = {}) {
  const s = summary;
  const started = s.run?.started ?? "unknown";
  const ended = s.end?.ended ?? "unknown (run_end line missing)";
  const lines = [];
  lines.push(`# Walkabout report — ${started.slice(0, 10)}`);
  lines.push("");
  lines.push(
    `Every number below re-derives from \`${ledgerPath}\` with \`node scripts/walkabout.mjs report\`. Nothing here is typed.`,
  );
  lines.push("");
  lines.push("## Taxonomy, stated first");
  lines.push("");
  lines.push(
    "A 402 is **spec_conformant** when its challenge carries `x402Version` and an `accepts[]` array (header or body); **other_structured** when a 402 carried JSON of another shape; **empty** when a 402 carried nothing readable; **non_402** when the door answered anything else unpaid. Verdicts are the Launch Check's: **settled** (money moved, 2xx), **payment_refused** (signed payment presented, door refused), **no_payment_gate** (answered without asking), **malformed_challenge** (402 without payable terms), **unpaid_by_rule** (terms read, this store withheld by its own rules — a statement about us), **unreachable**.",
  );
  lines.push("");
  lines.push("## The run");
  lines.push("");
  lines.push(`| Field | Value |`);
  lines.push(`|---|---|`);
  lines.push(`| started | ${started} |`);
  lines.push(`| ended | ${ended} |`);
  lines.push(`| wallet | ${s.run?.wallet ?? "unknown"} |`);
  lines.push(
    `| caps | $${s.run?.caps?.perItemUsd ?? "?"} per item, $${s.run?.caps?.runUsd ?? "?"} per run, ${s.run?.caps?.perDomain ?? "?"} per domain |`,
  );
  lines.push(`| approval | ${s.run?.approval ?? "unstated"} |`);
  lines.push(`| attempts | ${s.attempts} |`);
  lines.push(`| domains | ${s.domains} |`);
  lines.push(`| payments presented | ${s.payments_presented} |`);
  lines.push(
    `| settled | ${s.settled} (${pct(s.settled, s.payments_presented)} of presented) |`,
  );
  lines.push(`| settled with a body | ${s.settled_with_body} |`);
  lines.push(`| spent (ledger) | $${s.spent_usd.toFixed(4)} |`);
  lines.push("");
  lines.push("## 402 shapes");
  lines.push("");
  lines.push(`| Shape | Count | Share of attempts |`);
  lines.push(`|---|---|---|`);
  for (const shape of SHAPES) {
    lines.push(`| ${shape} | ${s.by_shape[shape]} | ${pct(s.by_shape[shape], s.attempts)} |`);
  }
  lines.push("");
  lines.push("## Verdicts");
  lines.push("");
  lines.push(`| Verdict | Count |`);
  lines.push(`|---|---|`);
  for (const verdict of VERDICTS) {
    lines.push(`| ${verdict} | ${s.by_verdict[verdict]} |`);
  }
  if (Object.keys(s.unpaid_reasons).length > 0) {
    lines.push("");
    lines.push("### unpaid_by_rule, by reason (about this store's rules, not the doors)");
    lines.push("");
    for (const [reason, count] of Object.entries(s.unpaid_reasons).sort((a, b) => b[1] - a[1])) {
      lines.push(`- \`${reason}\` × ${count}`);
    }
  }
  if (Object.keys(s.refused_status).length > 0) {
    lines.push("");
    lines.push("### payment_refused, by status the door returned to a signed payment");
    lines.push("");
    for (const [status, count] of Object.entries(s.refused_status).sort((a, b) => b[1] - a[1])) {
      lines.push(`- ${status} × ${count}`);
    }
  }
  lines.push("");
  lines.push("## Reconciliation");
  lines.push("");
  lines.push(
    s.reconciliation
      ? `Chain transfers from the wallet between blocks ${s.run?.start_block ?? "?"} and ${s.end?.end_block ?? "?"}: ${s.reconciliation.chain_count} for $${s.reconciliation.chain_usd.toFixed(4)}. Ledger settled: ${s.reconciliation.ledger_count} for $${s.reconciliation.ledger_usd.toFixed(4)}. Matched: ${s.reconciliation.matched}. On chain only: ${s.reconciliation.chain_only}. Ledger only: ${s.reconciliation.ledger_only}. Gap: $${s.reconciliation.gap_usd.toFixed(4)}.`
      : "Not yet run. `node scripts/walkabout.mjs reconcile <ledger>` reads the wallet's USDC transfers over the run's block range and states the gap in dollars, even when it is zero.",
  );
  lines.push("");
  lines.push("## What this is not");
  lines.push("");
  lines.push(
    "Dated observations of what each door did with one real payment at one moment, from one declared wallet. Not a score on any operator, not a ranking, not a statement about any other moment or any other buyer (rule 43).",
  );
  lines.push("");
  return lines.join("\n");
}

/**
 * Rule 5's other half: the chain is the record the ledger cannot
 * edit. Match every settled ledger row to a USDC transfer out of the
 * wallet by (payTo, atomic amount), greedily and once each; what is
 * left on either side is the gap, in dollars.
 */
export function reconcile(ledgerEntries, transfers) {
  const settled = ledgerEntries.filter(
    (e) => e.kind === "attempt" && e.verdict === "settled",
  );
  const pool = transfers.map((t) => ({
    to: String(t.to).toLowerCase(),
    value: String(BigInt(t.value)),
    txHash: t.txHash ?? null,
    used: false,
  }));
  let matched = 0;
  const ledgerOnly = [];
  for (const row of settled) {
    const want = pool.find(
      (t) =>
        !t.used &&
        t.to === String(row.pay_to).toLowerCase() &&
        t.value === String(BigInt(row.amount_atomic ?? "0")),
    );
    if (want) {
      want.used = true;
      matched += 1;
    } else {
      ledgerOnly.push({ url: row.url, pay_to: row.pay_to, amount_atomic: row.amount_atomic });
    }
  }
  const chainOnly = pool.filter((t) => !t.used);
  const usd = (atomic) => Number(BigInt(atomic)) / 1e6;
  const ledgerUsd = settled.reduce((n, r) => n + usd(r.amount_atomic ?? "0"), 0);
  const chainUsd = pool.reduce((n, t) => n + usd(t.value), 0);
  return {
    ledger_count: settled.length,
    chain_count: pool.length,
    matched,
    ledger_only: ledgerOnly.length,
    chain_only: chainOnly.length,
    ledger_only_rows: ledgerOnly,
    chain_only_rows: chainOnly.map(({ to, value, txHash }) => ({ to, value, txHash })),
    ledger_usd: Number(ledgerUsd.toFixed(6)),
    chain_usd: Number(chainUsd.toFixed(6)),
    gap_usd: Number(Math.abs(chainUsd - ledgerUsd).toFixed(6)),
  };
}

/** Decode a USDC Transfer log into {to, value, txHash}. */
export function transferFromLog(log) {
  const to = `0x${String(log.topics?.[2] ?? "").slice(-40)}`;
  const value = BigInt(log.data ?? "0x0").toString();
  return { to, value, txHash: log.transactionHash ?? null };
}
