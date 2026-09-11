import { isHouseWallet } from "@/lib/channel";
import { canonicalAddress } from "@/lib/addresses";
import { counterLedger } from "@/lib/counter-ledger";
import { bulkGetJson, bulkGetText } from "@/lib/kv-bulk";
import { KV_KEYS } from "@/lib/kv-keys";
import { listKeys } from "@/lib/kv-list";
import { kvGet, kvPut } from "@/lib/kv-retry";
import { railOf } from "@/lib/metrics";
import { MENU_ITEMS } from "@/store/menu";
import type { CertificateRecord, Env, PayerRecord } from "@/types";

/**
 * THE RAISE (2026-09-11): every counter lifted to what the records say.
 *
 * "It's not a correction, it's the number going up to where it's
 * supposed to be. We track this." — the keeper, the afternoon one
 * wallet bought 66 times and the storefront counted 83 where the
 * certificates said 94 plus the penny pages.
 *
 * We do track it. The per-settle records (KV_KEYS.payerSettle) are
 * one key per settlement, written once, and cannot lose one; the
 * certificates carry the amount and the rail. The tallies were the
 * only lossy witness, and they were the ones the storefront read.
 * This walks the lossless witnesses, computes what every tally
 * should hold, and lifts any that are short — never lowers one,
 * never touches a tally the records cannot speak for.
 *
 * WHAT IT RAISES, per month, organic only:
 *   paid:<item>      — settle count per item (the organic number).
 *   dpaid:<dd>       — settles per day.
 *   rev:total        — money, in micro-USDC, where the amount is known
 *                      (a certificate, or a fixed shelf price).
 *   rail:<rail>      — settles per rail, for records dated on or
 *                      after the rail meter's seam, where the
 *                      certificate names the network.
 *   revrail:<rail>   — the money per rail, same condition.
 *   payer:<wallet>   — the wallet's purchase count.
 *
 * WHAT IT LEAVES ALONE, and why. House counters: house is not proof,
 * and the reclassification ledger already moves settles between the
 * two at read, so raising `paidh` for a wallet listed since would
 * count that family twice. Wallets on the reclassification ledger
 * are skipped for the same reason. Records before the seam carry no
 * rail (the certificate walk counts those). A record with no
 * certificate and no fixed price counts as a settle and books no
 * money; the result names how many.
 *
 * IDEMPOTENT: a second pass finds nothing short. It rides the hourly
 * round, so a counter that ever falls behind its records is lifted
 * within the hour with nobody cross-referencing anything; with the
 * ledger serializing every bump it should find nothing, and the
 * result saying so is the evidence that the fix holds.
 */
const SCAN_CAP = 5000;
export const RAISE_LOG_KEY = "counter_raise:latest";
const USDC_MICRO = 1_000_000;

interface SettleRecord {
  item: string;
  at: string;
  transaction?: string;
}

export interface CounterRaise {
  key: string;
  from: number;
  to: number;
}

export interface CounterRaiseResult {
  at: string;
  records_scanned: number;
  records_truncated: boolean;
  certificates_scanned: number;
  certificates_truncated: boolean;
  /** Records counted as organic settles (house and reclassified wallets excluded). */
  organic_records: number;
  /** Organic records whose amount nothing could name; counted, not priced. */
  unpriced_records: number;
  counters_checked: number;
  raised: CounterRaise[];
  payer_rows_raised: CounterRaise[];
  serialized: boolean;
}

function priceOf(item: string): number | null {
  const listed = MENU_ITEMS.find((entry) => entry.id === item);
  if (listed && listed.pricing === "fixed") return listed.price_usdc;
  return null;
}

export async function raiseCountersToRecords(env: Env): Promise<CounterRaiseResult> {
  const [recordKeys, certKeys, reclass] = await Promise.all([
    listKeys(env.COUNTERS, { prefix: KV_KEYS.payerSettlePrefix(), cap: SCAN_CAP }),
    listKeys(env.PATRONS, { prefix: KV_KEYS.certPrefix, cap: SCAN_CAP }),
    import("@/services/reclassify").then(({ listReclassifications }) => listReclassifications(env)),
  ]);
  const [records, certs, meterStart] = await Promise.all([
    bulkGetJson<SettleRecord>(env.COUNTERS, recordKeys.names),
    bulkGetJson<CertificateRecord>(env.PATRONS, certKeys.names),
    kvGet(env.COUNTERS, KV_KEYS.railMeterStart),
  ]);
  const skipWallets = new Set(reclass.map((row) => canonicalAddress(row.address)));

  const certByTx = new Map<string, CertificateRecord["certificate"]>();
  for (const record of certs.values()) {
    const cert = record?.certificate;
    if (cert?.settlement_tx) certByTx.set(cert.settlement_tx.toLowerCase(), cert);
  }

  const expected = new Map<string, number>();
  const raise = (key: string, by: number) => expected.set(key, (expected.get(key) ?? 0) + by);
  const perWallet = new Map<string, { count: number; first: string }>();
  let organicRecords = 0;
  let unpriced = 0;
  const prefixLength = KV_KEYS.payerSettlePrefix().length;
  for (const [name, record] of records) {
    if (!record?.item || !record.at) continue;
    const wallet = name.slice(prefixLength).split(":")[0] ?? "";
    if (!wallet || isHouseWallet(env, wallet) || skipWallets.has(canonicalAddress(wallet))) continue;
    organicRecords += 1;
    const month = record.at.slice(0, 7);
    const day = record.at.slice(8, 10);
    raise(KV_KEYS.metric(month, "paid", record.item), 1);
    raise(KV_KEYS.metric(month, "dpaid", day), 1);
    const cert = record.transaction ? certByTx.get(record.transaction.toLowerCase()) : undefined;
    const amount = cert && typeof cert.paid_usdc === "number" ? cert.paid_usdc : priceOf(record.item);
    if (amount === null) {
      unpriced += 1;
    } else {
      const micro = Math.round(amount * USDC_MICRO);
      raise(KV_KEYS.metric(month, "rev", "total"), micro);
      const rail = railOf(cert?.network);
      if (rail && meterStart && record.at >= meterStart) {
        raise(KV_KEYS.metric(month, "rail", rail), 1);
        raise(KV_KEYS.metric(month, "revrail", rail), micro);
      }
    }
    const seen = perWallet.get(canonicalAddress(wallet)) ?? { count: 0, first: record.at };
    seen.count += 1;
    if (record.at < seen.first) seen.first = record.at;
    perWallet.set(canonicalAddress(wallet), seen);
  }

  const result: CounterRaiseResult = {
    at: new Date().toISOString(),
    records_scanned: recordKeys.names.length,
    records_truncated: recordKeys.truncated,
    certificates_scanned: certKeys.names.length,
    certificates_truncated: certKeys.truncated,
    organic_records: organicRecords,
    unpriced_records: unpriced,
    counters_checked: expected.size,
    raised: [],
    payer_rows_raised: [],
    serialized: Boolean(env.COUNTER_LEDGER),
  };

  // A truncated record scan cannot say what a counter should hold: a
  // partial expectation would only ever be low, and raising to it is
  // harmless, but the result says so rather than looking complete.
  const currentText = env.COUNTER_LEDGER
    ? new Map<string, string | null>()
    : await bulkGetText(env.COUNTERS, [...expected.keys()]);
  for (const [key, floor] of expected) {
    const ledger = counterLedger(env, key);
    let current: number;
    if (ledger) {
      current = await ledger.read(key);
    } else {
      const raw = currentText.get(key);
      current = raw ? parseInt(raw, 10) || 0 : 0;
    }
    if (current >= floor) continue;
    if (ledger) await ledger.raiseTo(key, floor);
    else await kvPut(env.COUNTERS, key, String(floor));
    result.raised.push({ key, from: current, to: floor });
  }

  const rowKeys = [...perWallet.keys()].map((wallet) => KV_KEYS.payer(wallet));
  const rows = env.COUNTER_LEDGER
    ? new Map<string, PayerRecord | null>()
    : await bulkGetJson<PayerRecord>(env.COUNTERS, rowKeys);
  for (const [wallet, seen] of perWallet) {
    const key = KV_KEYS.payer(wallet);
    const ledger = counterLedger(env, key);
    // The ledger's copy is the truth; the KV mirror can trail it by a second.
    const row = ledger ? await ledger.readPayerRow(key) : (rows.get(key) ?? null);
    const current = row?.purchases ?? 0;
    if (current >= seen.count) continue;
    if (ledger) {
      await ledger.raisePayerRow(key, wallet, seen.count, seen.first);
    } else {
      const next: PayerRecord = row
        ? { ...row, purchases: seen.count }
        : { address: wallet, first_seen: seen.first, last_seen: seen.first, purchases: seen.count };
      await kvPut(env.COUNTERS, key, JSON.stringify(next));
    }
    result.payer_rows_raised.push({ key, from: current, to: seen.count });
  }

  await kvPut(env.COUNTERS, RAISE_LOG_KEY, JSON.stringify(result));
  return result;
}

export async function readLastRaise(env: Env): Promise<CounterRaiseResult | null> {
  const raw = await kvGet(env.COUNTERS, RAISE_LOG_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as CounterRaiseResult;
  } catch {
    return null;
  }
}
