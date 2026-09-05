import { canonicalAddress } from "@/lib/addresses";
import { bulkGetJson } from "@/lib/kv-bulk";
import { KV_KEYS } from "@/lib/kv-keys";
import { listKeys } from "@/lib/kv-list";
import type { CertificateRecord, Env, PayerRecord } from "@/types";
import { kvGetJson, kvPut } from "@/lib/kv-retry";

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
}

/**
 * THE BACKFILL FROM CERTIFICATES (the keeper's ruling, 2026-09-04):
 * the per-settle records (KV_KEYS.payerSettle) exist from the day
 * they shipped, and every settle before that is only on the payer
 * row, which is the counter that loses increments. Certificates carry
 * the payer and the settlement transaction for every /api/buy sale,
 * so they seed a record for each — idempotent, one put per cert, no
 * reads — and a row that is short against its records is raised to
 * them. The penny pages mint no certificate; their settles stay on
 * the row, which is why the reconciliation takes the larger of the
 * two rather than the records alone.
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
  };
  const perWallet = new Map<string, number>();
  for (const record of certs.values()) {
    const cert = record?.certificate;
    const payer = cert?.payer;
    const transaction = cert?.settlement_tx;
    if (!payer || !transaction) continue;
    const wallet = canonicalAddress(payer);
    perWallet.set(wallet, (perWallet.get(wallet) ?? 0) + 1);
    const key = KV_KEYS.payerSettle(payer, transaction);
    if (existing.has(key)) continue;
    await kvPut(
      env.COUNTERS,
      key,
      JSON.stringify({ item: cert.item, at: cert.date, transaction, source: "certificate" }),
    );
    existing.add(key);
    result.records_written += 1;
  }
  for (const name of existing) {
    const wallet = name.slice(KV_KEYS.payerSettlePrefix().length).split(":")[0] ?? "";
    if (!perWallet.has(wallet)) perWallet.set(wallet, 0);
  }
  for (const wallet of perWallet.keys()) {
    const records = [...existing].filter((name) =>
      name.startsWith(KV_KEYS.payerSettlePrefix(wallet)),
    ).length;
    const key = KV_KEYS.payer(wallet);
    const row = await kvGetJson<PayerRecord>(env.COUNTERS, key, "json");
    if (row && row.purchases < records) {
      await kvPut(env.COUNTERS, key, JSON.stringify({ ...row, purchases: records }));
      result.rows_corrected.push(wallet);
    }
  }
  return result;
}
