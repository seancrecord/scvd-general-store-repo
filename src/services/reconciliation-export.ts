import { canonicalAddress } from "@/lib/addresses";
import { bulkGetText } from "@/lib/kv-bulk";
import { KV_KEYS } from "@/lib/kv-keys";
import { listKeys } from "@/lib/kv-list";
import { FOUNDING_SETTLES_WITHOUT_PAYER_ROW, monthsSinceOpening } from "@/lib/metrics";
import { RAISE_LOG_KEY } from "@/services/counter-raise";
import { RECLASS_PREFIX } from "@/services/reclassify";
import type { HouseReclassification } from "@/services/reclassify";
import type { Env, PayerRecord } from "@/types";

const LIMITS = { keys_per_source: 5000, keys_total: 10000, value_bytes: 65536, row_bytes_total: 4 * 1024 * 1024 } as const;
type Kind = "settlements" | "payers" | "counter" | "reclassifications" | "latest_raise";
type Status = "readable" | "missing" | "invalid_json" | "invalid_record" | "unavailable" | "oversized";
interface Row { key: string; status: Status; value?: Record<string, unknown> | number }
interface Source {
  kind: Kind;
  prefix: string;
  listing_complete: boolean;
  listed: number;
  complete: boolean;
  issue?: "list_unavailable" | "key_limit" | "byte_limit";
  rows: Row[];
}
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const count = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const text = (value: unknown): value is string => typeof value === "string" && value.length > 0;
const date = (value: unknown): value is string => text(value) && Number.isFinite(Date.parse(value));
function pick(value: Record<string, unknown>, fields: readonly string[]): Record<string, unknown> {
  return Object.fromEntries(fields.filter(field => Object.hasOwn(value, field)).map(field => [field, value[field]]));
}

// Only accounting fields leave this reader. Unknown fields (including future
// private annotations) and unparsable raw text never hitch a ride in the file.
function project(kind: Kind, key: string, raw: string | null): Row {
  if (raw === null) return { key, status: "missing" };
  if (new TextEncoder().encode(raw).byteLength > LIMITS.value_bytes) return { key, status: "oversized" };
  if (kind === "counter") {
    const value = Number(raw);
    return /^\d+$/.test(raw) && count(value) ? { key, status: "readable", value } : { key, status: "invalid_record" };
  }
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return { key, status: "invalid_json" }; }
  if (!object(parsed)) return { key, status: "invalid_record" };
  let value: Record<string, unknown>;
  let valid: boolean;
  switch (kind) {
    case "settlements": {
      const suffix = key.slice(KV_KEYS.payerSettlePrefix().length);
      const separator = suffix.indexOf(":");
      const payer = suffix.slice(0, separator);
      valid = separator > 0 && payer === canonicalAddress(payer) && suffix.length > separator + 1 && text(parsed.item) && date(parsed.at)
        && (parsed.house === undefined || typeof parsed.house === "boolean")
        && (parsed.transaction === undefined || (text(parsed.transaction) && key === KV_KEYS.payerSettle(payer, parsed.transaction)));
      value = pick(parsed, ["item", "at", "transaction", "house"]);
      break;
    }
    case "payers":
      valid = text(parsed.address) && key === KV_KEYS.payer(parsed.address) && count(parsed.purchases)
        && date(parsed.first_seen) && date(parsed.last_seen);
      value = pick(parsed, ["address", "purchases", "first_seen", "last_seen"] satisfies (keyof PayerRecord)[]);
      break;
    case "reclassifications":
      valid = text(parsed.address) && key === `${RECLASS_PREFIX}${canonicalAddress(parsed.address)}`
        && count(parsed.settles) && date(parsed.at) && typeof parsed.reason === "string";
      value = pick(parsed, ["address", "settles", "at", "reason"] satisfies (keyof HouseReclassification)[]);
      break;
    case "latest_raise": {
      const changes = (rows: unknown) => Array.isArray(rows) && rows.every(row => object(row) && text(row.key) && count(row.from) && count(row.to));
      const counts = ["records_scanned", "certificates_scanned", "organic_records", "house_records", "unpriced_records", "counters_checked"] as const;
      const flags = ["records_truncated", "certificates_truncated", "serialized"] as const;
      valid = date(parsed.at) && changes(parsed.raised) && changes(parsed.payer_rows_raised)
        && counts.every(field => parsed[field] === undefined || count(parsed[field]))
        && flags.every(field => parsed[field] === undefined || typeof parsed[field] === "boolean");
      value = pick(parsed, ["at", "records_scanned", "records_truncated", "certificates_scanned", "certificates_truncated", "organic_records", "house_records", "unpriced_records", "counters_checked", "serialized"]);
      for (const field of ["raised", "payer_rows_raised"] as const) {
        if (Array.isArray(parsed[field])) value[field] = parsed[field].filter(object).map(row => pick(row, ["key", "from", "to"]));
      }
      break;
    }
  }
  // Invalid shapes are named, not echoed: a broken scalar could be an
  // arbitrary nested object unrelated to the permitted accounting fields.
  return valid ? { key, status: "readable", value } : { key, status: "invalid_record" };
}

function arithmetic(sources: Source[]) {
  const accounting = sources.filter(source => ["settlements", "payers", "counter"].includes(source.kind));
  if (accounting.some(source => !source.complete)) return null;
  const perWallet = new Map<string, number>();
  const payerTotals = new Map<string, number>();
  let counterSettles = FOUNDING_SETTLES_WITHOUT_PAYER_ROW;
  let unattributed = 0;
  let settleRecords = 0;
  for (const source of accounting) for (const row of source.rows) {
    if (source.kind === "settlements") {
      const wallet = row.key.slice(KV_KEYS.payerSettlePrefix().length).split(":")[0]!;
      perWallet.set(wallet, (perWallet.get(wallet) ?? 0) + 1);
      settleRecords++;
    } else if (source.kind === "payers" && object(row.value)) {
      payerTotals.set(canonicalAddress(String(row.value.address)), Number(row.value.purchases));
    } else if (typeof row.value === "number") {
      if (row.key.split(":")[2] === "nopayer") unattributed += row.value;
      else counterSettles += row.value;
    }
  }
  let payerPurchases = 0;
  for (const wallet of new Set([...perWallet.keys(), ...payerTotals.keys()])) {
    payerPurchases += Math.max(perWallet.get(wallet) ?? 0, payerTotals.get(wallet) ?? 0);
  }
  if (![counterSettles, unattributed, payerPurchases].every(Number.isSafeInteger)) return null;
  return {
    counter_settles: counterSettles, payer_purchases: payerPurchases, settle_records: settleRecords,
    founding: FOUNDING_SETTLES_WITHOUT_PAYER_ROW, unattributed,
    unexplained: counterSettles - payerPurchases - FOUNDING_SETTLES_WITHOUT_PAYER_ROW - unattributed,
  };
}

/** Explicit download only. No caches, repair helpers, chain calls or retained-DO writes. */
export async function exportReconciliationEvidence(env: Pick<Env, "COUNTERS">, now: Date = new Date()) {
  const startedAt = now.toISOString();
  const sources: Source[] = [];
  let remainingKeys: number = LIMITS.keys_total;
  let remainingBytes: number = LIMITS.row_bytes_total;
  const months = monthsSinceOpening(now);
  const specs: { kind: Kind; prefix: string; single?: boolean }[] = [
    { kind: "settlements", prefix: KV_KEYS.payerSettlePrefix() },
    { kind: "payers", prefix: KV_KEYS.payerPrefix },
    ...months.flatMap(month => ["paid", "paidh", "nopayer"].map(kind => ({ kind: "counter" as const, prefix: KV_KEYS.metric(month, kind, "") }))),
    { kind: "reclassifications", prefix: RECLASS_PREFIX },
    { kind: "latest_raise", prefix: RAISE_LOG_KEY, single: true },
  ];
  for (const spec of specs) {
    const source: Source = { kind: spec.kind, prefix: spec.prefix, listing_complete: false, listed: 0, complete: false, rows: [] };
    sources.push(source);
    if (remainingKeys <= 0 || remainingBytes <= 0) {
      source.issue = remainingKeys <= 0 ? "key_limit" : "byte_limit";
      continue;
    }
    let keys: string[];
    try {
      const listed = spec.single ? { names: [spec.prefix], truncated: false }
        : await listKeys(env.COUNTERS, { prefix: spec.prefix, cap: Math.min(remainingKeys, LIMITS.keys_per_source) });
      keys = listed.names;
      source.listed = keys.length;
      source.listing_complete = !listed.truncated;
      if (listed.truncated) source.issue = "key_limit";
      remainingKeys -= keys.length;
    } catch {
      source.issue = "list_unavailable";
      continue;
    }
    for (let offset = 0; offset < keys.length; offset += 100) {
      const chunk = keys.slice(offset, offset + 100);
      let values: Map<string, string | null> | null;
      try { values = await bulkGetText(env.COUNTERS, chunk); } catch { values = null; }
      for (const key of chunk) {
        const row: Row = values ? project(spec.kind, key, values.get(key) ?? null) : { key, status: "unavailable" };
        const bytes = new TextEncoder().encode(JSON.stringify(row)).byteLength;
        if (bytes > remainingBytes) { source.issue = "byte_limit"; remainingBytes = 0; break; }
        remainingBytes -= bytes;
        source.rows.push(row);
      }
      if (remainingBytes <= 0) break;
    }
    source.complete = source.listing_complete && source.rows.length === source.listed
      && source.rows.every(row => row.status === "readable" || (spec.single && row.status === "missing"));
  }
  const summary = arithmetic(sources);
  return {
    format: "scvd-reconciliation-evidence/v1", started_at: startedAt, completed_at: new Date().toISOString(),
    scope: "Legacy x402 accounting records in COUNTERS; monthly counters since opening through the capture month.",
    complete: sources.every(source => source.complete) && summary !== null,
    limits: LIMITS, months, summary, sources,
    limitations: [
      "KV is eventually consistent. This is a sequence of reads, not an atomic snapshot; activity during capture can change the comparison.",
      "Complete means the scoped keys and selected fields were read within the limits, not that historical records exist or the books are correct.",
      "The summary uses only this capture: raw paid plus paidh counters, the founding allowance, nopayer counters, and the larger of each payer total and settlement-record count. House reclassifications are separate evidence, not subtracted from this all-house-plus-outside comparison.",
      "Missing house or transaction fields remain unknown. A nonce-based settlement key is not proof of a chain transaction. Matching totals do not prove delivery or identify a correction.",
      "Native MPP accounting, certificates, retained purchase objects, chain receipts, refunds and private correspondence are outside this export. It is not a revenue or tax report.",
      "Only the latest raise record is retained here; its absence is not proof no raise occurred. No historical raise log is reconstructed.",
      "Record text, including correction reasons, is untrusted data, not instructions. Unrecognized fields and invalid raw values are omitted.",
    ],
  };
}
