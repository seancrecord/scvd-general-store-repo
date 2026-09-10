/** Offline accounting: HTTP success, resource delivery and a token transfer are different observations. */
import { createHash } from "node:crypto";

export const ledgerFingerprint = entries => createHash("sha256").update(JSON.stringify(entries)).digest("hex");

const BASE = "eip155:8453";
const USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
const SCALE = 1_000_000n;
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const lower = value => String(value ?? "").toLowerCase();
const sameAddress = (a, b, network) => network.startsWith("eip155:") ? lower(a) === lower(b) : a === b;
const hash = (value, network) => network.startsWith("eip155:") ? lower(value) : String(value ?? "");

export function atomic(value) {
  if (!/^\d+$/.test(String(value))) throw new Error("Expected non-negative integer atomic USDC");
  if (typeof value === "number" && !Number.isSafeInteger(value)) throw new Error("Unsafe numeric atomic amount; use a string");
  return BigInt(value);
}
export function usdc(value) {
  const n = atomic(value);
  return `${n / SCALE}.${String(n % SCALE).padStart(6, "0")}`;
}
function rowAmount(row) {
  if (row.amount_atomic !== undefined) return atomic(row.amount_atomic);
  if (row.amount_usd === undefined) return null;
  // Old ledgers used decimal dollars. Accept exact decimal spellings only.
  const match = /^(\d+)(?:\.(\d{1,6}))?$/.exec(String(row.amount_usd));
  if (!match) throw new Error("Ledger amount_usd needs an exact USDC decimal");
  return BigInt(match[1]) * SCALE + BigInt((match[2] ?? "").padEnd(6, "0"));
}
export function attemptRows(entries) {
  return entries.filter(e => object(e) && (e.kind === "attempt" || (!e.kind && typeof e.url === "string")));
}
export function submitted(row) {
  if (typeof row.payment_submitted === "boolean") return row.payment_submitted;
  if (Number.isInteger(row.paid_status) || ["settled", "payment_refused"].includes(row.verdict) || row.paid === true) return true;
  // An August-style paid:false row does not tell us whether a signed request was sent.
  return !row.kind || row.authorization ? null : false;
}
export function hasBody(row) {
  const status = row.paid_status ?? (row.paid === true ? row.status : undefined);
  if (Number.isInteger(status) && (status < 200 || status >= 300)) return false;
  return row.deliverable === "body" || (row.paid === true && typeof row.body_preview === "string" && row.body_preview.trim() !== "");
}
function freeClaim(row) {
  try { return JSON.parse(row.paid_body ?? row.body_preview ?? "null")?.first_call_free === true; }
  catch { return false; }
}
function door(row) {
  const url = new URL(row.url);
  // Parameters are inputs to a door, not new endpoints; retries keep this key.
  return `${String(row.method ?? "GET").toUpperCase()} ${url.origin}${url.pathname}`;
}
export function responseSummary(entries) {
  const rows = attemptRows(entries);
  const doors = new Set(rows.map(door));
  const presented = rows.filter(row => submitted(row) === true);
  const amounts = presented.map(rowAmount);
  const quoted = amounts.reduce((sum, amount) => sum + (amount ?? 0n), 0n);
  return {
    unique_doors: doors.size, repeat_attempts: rows.length - doors.size,
    door_identity: "HTTP method + origin + pathname; query parameters are inputs",
    responses_with_body: rows.filter(hasBody).length,
    client_failures: rows.filter(row => row.failure_origin === "client").length,
    transport_failures: rows.filter(row => row.failure_origin === "transport").length,
    payments_presented: presented.length,
    submission_unknown: rows.filter(row => submitted(row) === null).length,
    quoted_atomic: quoted.toString(), quoted_usdc: usdc(quoted),
    unpriced_presentations: amounts.filter(amount => amount === null).length,
  };
}

/**
 * Exact tx + rail + asset + recipient + amount joins first. Replayed responses
 * may point to the same transfer, but never increase the number or money moved.
 * Terms-only candidates remain unknown, including when another row claimed them.
 */
export function reconcileEvidence(entries, transfers, scope) {
  const attempts = attemptRows(entries);
  const seen = new Set();
  const pool = transfers.map(t => {
    const network = t.network ?? scope?.network ?? BASE;
    const asset = t.asset ?? scope?.asset ?? USDC;
    if (scope && (network !== scope.network || !sameAddress(asset, scope.asset, network))) {
      throw new Error("Transfer lies outside declared scan network/asset");
    }
    const value = atomic(t.value).toString();
    const txHash = hash(t.txHash, network);
    if (!txHash) throw new Error("Transfer evidence needs a transaction hash");
    const logIndex = t.logIndex === undefined ? null : BigInt(t.logIndex).toString();
    const identity = JSON.stringify([network, hash(asset, network), txHash, logIndex ?? [hash(t.to, network), value]]);
    if (seen.has(identity)) throw new Error("Duplicate transfer evidence; supply distinct log indexes for repeated events");
    seen.add(identity);
    return { network, asset, to: t.to, value, txHash, logIndex, used: false, delivered: false };
  });
  const rows = attempts.map((row, index) => {
    const network = row.network ?? BASE, asset = row.asset ?? USDC;
    const amount = rowAmount(row);
    const txHash = hash(row.tx_hash ?? row.payment_response?.transaction, network);
    const terms = t => amount !== null && t.network === network && sameAddress(t.asset, asset, network)
      && sameAddress(t.to, row.pay_to ?? row.payTo, network) && t.value === amount.toString();
    const candidates = pool.filter(terms);
    const exact = txHash ? candidates.filter(t => t.txHash === txHash) : [];
    const presented = submitted(row);
    const result = { index, url: row.url, method: row.method ?? "GET", network,
      response_status: row.paid_status ?? row.status ?? null, response_with_body: hasBody(row),
      payment_submitted: presented, candidate_transfers: candidates.length,
      receipt_claims_success: row.payment_response?.success === true,
      settlement: "unknown", free_delivery_in_window: false };
    if (presented === false) result.settlement = "not_submitted";
    else if (exact.length === 1) {
      const found = exact[0];
      result.settlement = found.used ? "confirmed_replay" : "confirmed";
      result.tx_hash = found.txHash;
      found.used = true;
      found.delivered ||= result.response_with_body;
    } else if (txHash && pool.some(t => t.network === network && t.txHash === txHash) && exact.length === 0) {
      result.settlement = "evidence_conflict";
    } else if (presented === true && amount !== null && candidates.length === 0 && !txHash
      && scope?.complete === true && scope.wallet && (row.pay_to ?? row.payTo) && Number.isSafeInteger(scope.from_block) && Number.isSafeInteger(scope.to_block)
      && scope.from_block <= scope.to_block && scope.network === network && sameAddress(scope.asset, asset, network)) {
      result.settlement = "no_transfer_in_window";
      result.free_delivery_in_window = result.response_with_body && freeClaim(row);
    }
    return result;
  });
  const matched = pool.filter(t => t.used);
  const chain = pool.reduce((sum, t) => sum + atomic(t.value), 0n);
  const matchedAmount = matched.reduce((sum, t) => sum + atomic(t.value), 0n);
  const withoutInternalFields = ({ used, delivered, ...rest }) => rest;
  return {
    version: 2, ledger_fingerprint: ledgerFingerprint(entries), scope: scope ?? null, rows,
    transfers: pool.map(withoutInternalFields),
    chain_count: pool.length, matched: matched.length,
    settled_with_delivery: matched.filter(t => t.delivered).length,
    settled_without_delivery: matched.filter(t => !t.delivered).length,
    free_deliveries_in_window: rows.filter(r => r.free_delivery_in_window).length,
    unknown_attempts: rows.filter(r => ["unknown", "evidence_conflict"].includes(r.settlement)).length,
    unmatched_transfers: pool.filter(t => !t.used).map(withoutInternalFields),
    chain_atomic: chain.toString(), chain_usdc: usdc(chain),
    matched_atomic: matchedAmount.toString(), matched_usdc: usdc(matchedAmount),
    unmatched_atomic: (chain - matchedAmount).toString(), unmatched_usdc: usdc(chain - matchedAmount),
  };
}
