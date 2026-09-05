/**
 * SETTLEMENT RECORDS (2026-09-05, the doors Worker). The two reads and
 * one write the payment gate makes about a settlement — which
 * certificate a transaction bought, and that a delivery on it went
 * out — moved here from services/chain-reconciliation.ts, unchanged.
 * That file also walks the chains, and the doors Worker, which imports
 * the gate, must not carry a chain walker. chain-reconciliation.ts
 * re-exports everything here; the reconciliations read the same keys.
 */
import { listKeys } from "@/lib/kv-list";
import { bulkGetJson } from "@/lib/kv-bulk";
import { kvGet, kvPut } from "@/lib/kv-retry";
import { KV_KEYS } from "@/lib/kv-keys";
import type { CertificateRecord, Env } from "@/types";

/** Ceiling on the certificate scan that builds the known-tx set. */
export const CERT_SCAN_CAP = 2000;

/**
 * THE PENNY SHELF'S COUNTERPART OF THE CERTIFICATE (the reconciliation
 * false positive, fixed 2026-08-10). The penny pages — Almanac,
 * Gazette issues, the Zodiac archive — deliver markdown and mint
 * nothing, so the walk's "is there an artifact for this money" found
 * none and paged every penny sale as possibly-undelivered. The next
 * Almanac sale would have been an undelivered_sale alarm about a page
 * that was served.
 *
 * WRITTEN AT DELIVERY, NEVER AT SETTLE — this is the whole design.
 * The gate calls this only after a 2xx went out with the goods in it,
 * the same seam that closes the delivery intent. A row written at
 * settle time would blind the walk to exactly the case it exists for:
 * money taken, delivery died. Written this way, a penny sale whose
 * response never made it out still pages, which is correct.
 *
 * Never fails the sale: a paid customer does not get an error because
 * a bookkeeping row would not write. The cost of a lost write is one
 * false alarm the keeper can dismiss — the noisy direction, which is
 * the safe one.
 *
 * TTL-bounded: the walk reads each block once, at most RECONCILE_MAX_SPAN
 * (~55h on Base) after it was mined — and the Solana walk, cursorless
 * on a signature, can reach further back after a long outage. Ninety
 * days covers any plausible catch-up with more than an order of
 * margin, and keeps the scan from growing with the store's lifetime.
 */
export const SETTLED_DELIVERY_TTL_SECONDS = 90 * 86400;

export async function recordDeliveredSettlement(
  env: Env,
  transaction: string | undefined,
): Promise<void> {
  const tx = transaction?.trim().toLowerCase();
  if (!tx) return;
  await kvPut(env.COUNTERS, 
    KV_KEYS.settledDelivery(tx),
    new Date().toISOString(),
    { expirationTtl: SETTLED_DELIVERY_TTL_SECONDS },
  ).catch(() => undefined);
}

/**
 * The certificate (if any) that names a settlement — the paid
 * retry's second question. An open delivery intent plus an EXISTING
 * certificate means the crash landed between mint and response: the
 * goods are real, the buyer just never saw them, and re-running the
 * handler would mint a second artifact against one payment (the
 * double-count rule 13 exists to make impossible). Same bulk scan as
 * knownSettlementHashes; the exceptional lane can afford it.
 */
export async function certIdForSettlement(
  env: Env,
  transaction: string,
): Promise<CertLookup> {
  const wanted = transaction.toLowerCase();

  // The keyed row, written at mint since 2026-08-25. One lookup, and
  // it cannot go blind.
  const indexed = await kvGet(env.PATRONS, KV_KEYS.settlementCert(wanted));
  if (indexed) return { certId: indexed, certain: true };

  /*
   * The scan is the FALLBACK, for certificates minted before the
   * reverse index existed — and it now reports whether it saw the
   * whole set. Discarding `truncated` was the defect: past the cap it
   * answered "no certificate" for a settlement that had one, and the
   * caller answers a false null by minting a second one.
   */
  const listed = await listKeys(env.PATRONS, {
    prefix: KV_KEYS.certPrefix,
    cap: CERT_SCAN_CAP,
  });
  const values = await bulkGetJson<CertificateRecord>(
    env.PATRONS,
    listed.names,
  );
  for (const record of values.values()) {
    if (!record) continue;
    const tx = record.certificate?.settlement_tx;
    if (typeof tx === "string" && tx.toLowerCase() === wanted) {
      return { certId: record.certificate.cert_id, certain: true };
    }
  }
  // Nothing found. Whether that means "no certificate" or "I could not
  // see far enough" is the whole difference, so say which.
  return { certId: null, certain: !listed.truncated };
}

/**
 * What a settlement lookup can honestly say.
 *
 * `certain: false` means the answer is "I could not see everything",
 * which is NOT the same as "there is no certificate" — and a caller
 * that treats them alike mints twice against one payment.
 */
export interface CertLookup {
  certId: string | null;
  certain: boolean;
}
