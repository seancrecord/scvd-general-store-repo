import { canonicalAddress } from "@/lib/addresses";
import { houseWallets } from "@/lib/channel";
import { bulkGetJson } from "@/lib/kv-bulk";
import { KV_KEYS } from "@/lib/kv-keys";
import { listKeys } from "@/lib/kv-list";
import type { CertificateRecord, Env, PayerRecord } from "@/types";
import { kvGet, kvGetJson, kvPut } from "@/lib/kv-retry";
import { railOf, rebookSettleFromCertificate } from "@/lib/metrics";

/**
 * THE PAYER-CASE REPAIR: the books' first Solana buyer arrived and
 * the payer rows lowercased their base58 address into a string no
 * chain explorer resolves. The certificates never had that bug —
 * they store the payer exactly as the facilitator returned it — so
 * this walks the certs, learns each address's true case, and
 * rewrites any payer row stored under a corrupted key. Idempotent;
 * running it twice finds nothing the second time. EVM rows are
 * untouched (lowercase IS their canonical form).
 */

const SCAN_CAP = 5000;

export interface PayerRepairResult {
  scanned: number;
  repaired: string[];
  /** Lowercased rows with no cert carrying the true case: unfixable
   * from our own books, listed so nobody thinks they were missed. */
  unrecoverable: string[];
}

export async function repairPayerCase(env: Env): Promise<PayerRepairResult> {
  const certKeys = await listKeys(env.PATRONS, {
    prefix: KV_KEYS.certPrefix,
    cap: SCAN_CAP,
  });
  const certs = await bulkGetJson<CertificateRecord>(
    env.PATRONS,
    certKeys.names,
  );
  const trueCaseByLower = new Map<string, string>();
  for (const record of certs.values()) {
    const payer = record?.certificate?.payer;
    if (payer) trueCaseByLower.set(payer.toLowerCase(), payer);
  }

  const payerKeys = await listKeys(env.COUNTERS, {
    prefix: KV_KEYS.payerPrefix,
    cap: SCAN_CAP,
  });
  const rows = await bulkGetJson<PayerRecord>(env.COUNTERS, payerKeys.names);
  const result: PayerRepairResult = {
    scanned: payerKeys.names.length,
    repaired: [],
    unrecoverable: [],
  };
  for (const [key, row] of rows) {
    if (!row) continue;
    const stored = row.address;
    if (stored.startsWith("0x")) continue; // EVM: lowercase is canonical.
    const trueCase = trueCaseByLower.get(stored.toLowerCase());
    if (!trueCase) {
      // Only report rows that are actually suspect: all-lowercase
      // base58 with no cert to consult. A mixed-case row is already
      // fine.
      if (stored === stored.toLowerCase()) result.unrecoverable.push(stored);
      continue;
    }
    if (trueCase === stored) continue; // Already right.
    const canonicalKey = KV_KEYS.payer(canonicalAddress(trueCase));
    const existing = await kvGetJson<PayerRecord>(env.COUNTERS, 
      canonicalKey,
      "json",
    );
    const merged: PayerRecord = existing
      ? {
          ...existing,
          address: trueCase,
          purchases: existing.purchases + row.purchases,
          first_seen:
            row.first_seen < existing.first_seen
              ? row.first_seen
              : existing.first_seen,
          last_seen:
            row.last_seen > existing.last_seen
              ? row.last_seen
              : existing.last_seen,
        }
      : { ...row, address: trueCase };
    await kvPut(env.COUNTERS, canonicalKey, JSON.stringify(merged));
    if (key !== canonicalKey) await env.COUNTERS.delete(key);
    result.repaired.push(trueCase);
  }
  return result;
}

export interface PayerSettleBackfill {
  certificates_read: number;
  /** Settle records written this pass; a second pass writes none. */
  records_written: number;
  /** Payer rows raised to the record count where the row was short. */
  rows_corrected: string[];
  /**
   * Payer rows written for wallets that had certificates and no row
   * at all (2026-09-05): first and last seen taken from the
   * certificates' own dates, purchases from the records.
   */
  rows_created: string[];
  /**
   * Settles booked onto the month counters this pass, as
   * `<wallet>:<transaction>`. Only a certificate-proven settle whose
   * bookkeeping demonstrably never ran is rebooked; see below.
   */
  counters_rebooked: string[];
  /**
   * Of the settles rebooked, those whose certificate is dated before
   * the rail-meter seam, as `<wallet>:<transaction>`: the settle and
   * its money are booked, the rail COUNT is left to the certificate
   * walk, which already places every certificate from before the
   * seam. Absent on responses from before 2026-09-05's fix.
   */
  rail_left_to_certificates: string[];
}

interface SettleRecordValue {
  item?: string;
  at?: string;
  transaction?: string;
  source?: string;
  /**
   * Stamped by the backfill when a rebooked settle's certificate
   * predates the rail-meter seam: the rail count was left to the
   * certificate walk and no till counter was bumped, so the rail-seam
   * repair has nothing to reverse for it and refuses.
   */
  rail_counted_by?: "certificates";
}

/**
 * THE BACKFILL FROM CERTIFICATES (the keeper's ruling, 2026-09-04;
 * the books repair, 2026-09-05):
 * the per-settle records (KV_KEYS.payerSettle) exist from the day
 * they shipped, and every settle before that is only on the payer
 * row, which is the counter that loses increments. Certificates carry
 * the payer and the settlement transaction for every /api/buy sale,
 * so they seed a record for each — idempotent, one put per cert, no
 * reads — and a row that is short against its records is raised to
 * them. The penny pages mint no certificate; their settles stay on
 * the row, which is why the reconciliation takes the larger of the
 * two rather than the records alone.
 *
 * THE ROW THAT NEVER EXISTED. The first press of this repair raised
 * nothing, because the wallet it was pressed for had no row to raise:
 * two Solana penny settles on 2026-08-05 minted their certificates and
 * recordSettlement — which writes the row AND the counters in one
 * wave — never ran. A wallet with certificates and no row is that
 * case, and it is the one case the certificate proves the counters
 * were never bumped either. So for such a wallet this creates the row
 * from the certificates and books each settle onto the month the
 * certificate carries. It does NOT rebook a wallet whose row merely
 * reads short: the row is the lossy side, the counter may well have
 * gone through, and a settle counted twice is a worse book than one
 * counted once on a floor. Nor does it rebook a settle whose record
 * the till itself wrote (source absent): that record is written in
 * the same wave as the counters, so its presence says the wave ran.
 */
export async function backfillPayerSettlesFromCertificates(
  env: Env,
): Promise<PayerSettleBackfill> {
  const certKeys = await listKeys(env.PATRONS, {
    prefix: KV_KEYS.certPrefix,
    cap: SCAN_CAP,
  });
  const certs = await bulkGetJson<CertificateRecord>(env.PATRONS, certKeys.names);
  const existing = new Set(
    (await listKeys(env.COUNTERS, { prefix: KV_KEYS.payerSettlePrefix(), cap: SCAN_CAP })).names,
  );
  const result: PayerSettleBackfill = {
    certificates_read: certKeys.names.length,
    records_written: 0,
    rows_corrected: [],
    rows_created: [],
    counters_rebooked: [],
    rail_left_to_certificates: [],
  };
  // Per wallet, the certificates that carry a settle, oldest first.
  const certsByWallet = new Map<string, Array<{ cert: CertificateRecord["certificate"]; key: string; wasRecorded: boolean }>>();
  for (const record of certs.values()) {
    const cert = record?.certificate;
    const payer = cert?.payer;
    const transaction = cert?.settlement_tx;
    if (!cert || !payer || !transaction) continue;
    const wallet = canonicalAddress(payer);
    const key = KV_KEYS.payerSettle(payer, transaction);
    const wasRecorded = existing.has(key);
    const list = certsByWallet.get(wallet) ?? [];
    list.push({ cert, key, wasRecorded });
    certsByWallet.set(wallet, list);
    if (wasRecorded) continue;
    await kvPut(
      env.COUNTERS,
      key,
      JSON.stringify({ item: cert.item, at: cert.date, transaction, source: "certificate" }),
    );
    existing.add(key);
    result.records_written += 1;
  }
  for (const list of certsByWallet.values()) {
    list.sort((a, b) => (a.cert.date < b.cert.date ? -1 : a.cert.date > b.cert.date ? 1 : 0));
  }
  const wallets = new Set(certsByWallet.keys());
  for (const name of existing) {
    const wallet = name.slice(KV_KEYS.payerSettlePrefix().length).split(":")[0] ?? "";
    if (wallet) wallets.add(wallet);
  }
  for (const wallet of wallets) {
    const records = [...existing].filter((name) =>
      name.startsWith(KV_KEYS.payerSettlePrefix(wallet)),
    ).length;
    const key = KV_KEYS.payer(wallet);
    const row = await kvGetJson<PayerRecord>(env.COUNTERS, key, "json");
    if (row) {
      if (row.purchases < records) {
        await kvPut(env.COUNTERS, key, JSON.stringify({ ...row, purchases: records }));
        result.rows_corrected.push(wallet);
      }
      continue;
    }
    const proven = certsByWallet.get(wallet) ?? [];
    if (proven.length === 0) continue; // Records with no cert to date a row from: the reconciliation still counts them.
    // The counters, for each settle the certificate proves and the
    // till demonstrably never booked. A record the till wrote itself
    // (no source) is the wave that also bumped the counters.
    const recorded = await bulkGetJson<SettleRecordValue>(
      env.COUNTERS,
      proven.filter((entry) => entry.wasRecorded).map((entry) => entry.key),
    );
    for (const entry of proven) {
      const value = entry.wasRecorded ? recorded.get(entry.key) : null;
      if (entry.wasRecorded && value && value.source !== "certificate") continue;
      const outcome = await rebookSettleFromCertificate(env, entry.cert);
      const label = `${wallet}:${entry.cert.settlement_tx ?? ""}`;
      result.counters_rebooked.push(label);
      if (outcome.rail_counted_by === "certificates") {
        result.rail_left_to_certificates.push(label);
        // The record says so, so the rail-seam repair can tell this
        // settle from one the first press bumped a counter for.
        await kvPut(
          env.COUNTERS,
          entry.key,
          JSON.stringify({
            item: entry.cert.item,
            at: entry.cert.date,
            transaction: entry.cert.settlement_tx,
            source: "certificate",
            rail_counted_by: "certificates",
          } satisfies SettleRecordValue),
        );
      }
    }
    const first = proven[0]!.cert.date;
    const last = proven[proven.length - 1]!.cert.date;
    const created: PayerRecord = {
      address: wallet,
      first_seen: first,
      last_seen: last,
      purchases: records,
    };
    await kvPut(env.COUNTERS, key, JSON.stringify(created));
    result.rows_created.push(wallet);
  }
  return result;
}

export interface RailSeamReversal {
  transaction: string;
  wallet: string;
  rail: string;
  month: string;
  /** The counter decremented, and what it read after. */
  counter: string;
  now_reads: number;
}

export interface RailSeamRepair {
  /** The seam the till's rail record starts at; null when none exists. */
  meter_start: string | null;
  reversed: RailSeamReversal[];
  /** Transactions a previous press already reversed: nothing moved. */
  already_reversed: string[];
  refused: Array<{ transaction: string; reason: string }>;
}

/** The most one press may reverse; a longer list is a typo, not a repair. */
const RAIL_SEAM_MAX = 50;

/**
 * THE RAIL-SEAM REPAIR (2026-09-05): reverse a rail bump the first
 * press of the backfill made for a certificate dated before the seam.
 *
 * The backfill's first press, on 2026-09-05, rebooked two Solana
 * settles from 2026-08-05 and bumped the till's August Solana rail
 * counter for both. Both certificates are dated before
 * KV_KEYS.railMeterStart, so the certificate walk already counted them
 * — the front of the store read five Solana sales where the books
 * hold three. rebookSettleFromCertificate no longer bumps a rail
 * before the seam; this puts the two bumps already made back.
 *
 * WHY IT TAKES THE TRANSACTIONS AS INPUT rather than finding them. A
 * settle rebooked by the first press is indistinguishable, in the
 * books as they stand, from a settle the till booked before the
 * per-settle records existed: both have a certificate, a payer row,
 * and a certificate-sourced record. The keeper holds the list — the
 * press returned it as counters_rebooked — and this checks every
 * entry against the certificate on the shelf before it moves a
 * counter: the transaction must name a certificate that carries a
 * payer and a rail, dated before the seam, whose settle record the
 * backfill wrote (source "certificate"; a record the till wrote itself
 * is the wave that also bumped the counters, and that bump stands).
 * A marker per transaction makes a second press a no-op, and a
 * counter already at zero is refused rather than driven negative.
 * Each entry IS its transaction, the same bar RAILS_ENTERED_BY_HAND
 * holds.
 */
export async function reverseRailBookedBeforeSeam(
  env: Env,
  transactions: readonly string[],
): Promise<RailSeamRepair> {
  const meterStart = (await kvGet(env.COUNTERS, KV_KEYS.railMeterStart)) ?? null;
  const result: RailSeamRepair = {
    meter_start: meterStart,
    reversed: [],
    already_reversed: [],
    refused: [],
  };
  const wanted = [...new Set(transactions.map((tx) => tx.trim()).filter((tx) => tx.length > 0))]
    .slice(0, RAIL_SEAM_MAX);
  if (wanted.length === 0) return result;
  if (!meterStart) {
    for (const transaction of wanted) {
      result.refused.push({
        transaction,
        reason: "no seam: the till has never recorded a rail, so the certificate walk is the only rail record and no rebook has bumped a till counter",
      });
    }
    return result;
  }
  const certKeys = await listKeys(env.PATRONS, { prefix: KV_KEYS.certPrefix, cap: SCAN_CAP });
  const certs = await bulkGetJson<CertificateRecord>(env.PATRONS, certKeys.names);
  const byTransaction = new Map<string, CertificateRecord["certificate"]>();
  for (const record of certs.values()) {
    const cert = record?.certificate;
    if (cert?.settlement_tx) byTransaction.set(cert.settlement_tx.toLowerCase(), cert);
  }
  for (const transaction of wanted) {
    const cert = byTransaction.get(transaction.toLowerCase());
    if (!cert || !cert.payer) {
      result.refused.push({
        transaction,
        reason: certKeys.truncated
          ? "no certificate on the shelf names this settlement transaction with a payer (the certificate scan hit its cap; press again later)"
          : "no certificate on the shelf names this settlement transaction with a payer",
      });
      continue;
    }
    const rail = railOf(cert.network);
    if (!rail) {
      result.refused.push({ transaction, reason: "the certificate names no rail, so no rail counter was ever bumped for it" });
      continue;
    }
    if (cert.date >= meterStart) {
      result.refused.push({
        transaction,
        reason: `the certificate is dated ${cert.date}, at or after the seam ${meterStart}: the till is the rail record there and its bump stands`,
      });
      continue;
    }
    const record = await kvGetJson<SettleRecordValue>(env.COUNTERS, KV_KEYS.payerSettle(cert.payer, cert.settlement_tx ?? transaction), "json");
    if (!record || record.source !== "certificate") {
      result.refused.push({
        transaction,
        reason: record
          ? "the till wrote this settle's record itself, in the wave that bumped the counters: that bump is the till's, not a rebook"
          : "no settle record under this wallet and transaction: the backfill never rebooked it",
      });
      continue;
    }
    if (record.rail_counted_by === "certificates") {
      result.refused.push({
        transaction,
        reason: "the rebook left this rail to the certificate walk and bumped no till counter: nothing to reverse",
      });
      continue;
    }
    const marker = KV_KEYS.railSeamReversal(transaction);
    if (await kvGet(env.COUNTERS, marker)) {
      result.already_reversed.push(transaction);
      continue;
    }
    const wallet = canonicalAddress(cert.payer);
    const house = houseWallets(env).includes(cert.payer.toLowerCase());
    const month = cert.date.slice(0, 7);
    const counter = KV_KEYS.metric(month, `rail${house ? "h" : ""}`, rail);
    const current = parseInt((await kvGet(env.COUNTERS, counter)) ?? "0", 10);
    if (!Number.isFinite(current) || current < 1) {
      result.refused.push({ transaction, reason: `${counter} already reads ${current}; a counter is never driven below zero` });
      continue;
    }
    await kvPut(env.COUNTERS, counter, String(current - 1));
    await kvPut(
      env.COUNTERS,
      marker,
      JSON.stringify({ transaction, wallet, rail, month, counter, at: new Date().toISOString() }),
    );
    result.reversed.push({ transaction, wallet, rail, month, counter, now_reads: current - 1 });
  }
  return result;
}
