import { canonicalAddress } from "@/lib/addresses";
import { bulkGetJson } from "@/lib/kv-bulk";
import { KV_KEYS } from "@/lib/kv-keys";
import { listKeys } from "@/lib/kv-list";
import type { CertificateRecord, Env, PayerRecord } from "@/types";

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
    const existing = await env.COUNTERS.get<PayerRecord>(
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
    await env.COUNTERS.put(canonicalKey, JSON.stringify(merged));
    if (key !== canonicalKey) await env.COUNTERS.delete(key);
    result.repaired.push(trueCase);
  }
  return result;
}
