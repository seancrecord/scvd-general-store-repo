import { canonicalAddress } from "@/lib/addresses";
import { bulkGetJson } from "@/lib/kv-bulk";
import { KV_KEYS } from "@/lib/kv-keys";
import { listKeys } from "@/lib/kv-list";
import type { SettleReconciliation } from "@/lib/metrics";
import type { CertificateRecord, Env, PayerRecord } from "@/types";

/**
 * THE THIRD WITNESS (2026-09-04). The books check compares settle
 * COUNTERS against PAYER ROWS and, when they disagree by one, says
 * "this is the one to chase" and stops — because both are aggregates
 * and neither names a wallet. The certificates do: every mint since
 * payer recording began carries the paying address. Reading them
 * beside the other two turns an unexplained count into a named cause:
 *
 *   certificates carrying a payer == counters − founding
 *     the settle minted its certificate; the payer row write was lost
 *     (a KV failure in the fold, since fixed to write before delete).
 *     Rebuild the row from the certificates.
 *   certificates carrying a payer == payer rows
 *     no certificate carries this settle's payer: the sale settled and
 *     the mint never ran, or predates payer recording. The delivery
 *     audit is the next page.
 *
 * And per wallet: a payer row whose purchases disagree with that
 * wallet's certificate count is the row to look at, by address.
 */
const CERT_SCAN_CAP = 5000;
const PAYER_SCAN_CAP = 5000;

export interface WalletDisagreement {
  address: string;
  payer_row_purchases: number;
  certificates: number;
}

export interface CertificatesAgainstSettles {
  certificates_total: number;
  certificates_with_payer: number;
  certificates_truncated: boolean;
  payer_rows: number;
  payer_rows_purchases: number;
  /** Wallets where the row and the certificates do not agree. */
  wallets_disagreeing: WalletDisagreement[];
  /** Wallets with certificates but no payer row at all. */
  wallets_without_row: number;
  reading: string;
}

export async function certificatesAgainstSettles(
  env: Env,
  settles: SettleReconciliation | null,
): Promise<CertificatesAgainstSettles> {
  const [certKeys, payerKeys] = await Promise.all([
    listKeys(env.PATRONS, { prefix: KV_KEYS.certPrefix, cap: CERT_SCAN_CAP }),
    listKeys(env.COUNTERS, { prefix: KV_KEYS.payerPrefix, cap: PAYER_SCAN_CAP }),
  ]);
  const [certs, rows] = await Promise.all([
    bulkGetJson<CertificateRecord>(env.PATRONS, certKeys.names),
    bulkGetJson<PayerRecord>(env.COUNTERS, payerKeys.names),
  ]);

  const certsByWallet = new Map<string, number>();
  let total = 0;
  let withPayer = 0;
  for (const record of certs.values()) {
    const cert = record?.certificate;
    if (!cert) continue;
    total += 1;
    if (!cert.payer) continue;
    withPayer += 1;
    const wallet = canonicalAddress(cert.payer);
    certsByWallet.set(wallet, (certsByWallet.get(wallet) ?? 0) + 1);
  }

  const rowsByWallet = new Map<string, number>();
  let rowPurchases = 0;
  for (const row of rows.values()) {
    if (!row) continue;
    const wallet = canonicalAddress(row.address);
    rowsByWallet.set(wallet, (rowsByWallet.get(wallet) ?? 0) + row.purchases);
    rowPurchases += row.purchases;
  }

  const disagreeing: WalletDisagreement[] = [];
  let withoutRow = 0;
  for (const [wallet, count] of certsByWallet) {
    const onRow = rowsByWallet.get(wallet);
    if (onRow === undefined) {
      withoutRow += 1;
      disagreeing.push({ address: wallet, payer_row_purchases: 0, certificates: count });
    } else if (onRow !== count) {
      disagreeing.push({ address: wallet, payer_row_purchases: onRow, certificates: count });
    }
  }
  disagreeing.sort((a, b) => Math.abs(b.certificates - b.payer_row_purchases) - Math.abs(a.certificates - a.payer_row_purchases));

  return {
    certificates_total: total,
    certificates_with_payer: withPayer,
    certificates_truncated: certKeys.truncated,
    payer_rows: rowsByWallet.size,
    payer_rows_purchases: rowPurchases,
    wallets_disagreeing: disagreeing,
    wallets_without_row: withoutRow,
    reading: readCertificates(settles, withPayer, rowPurchases, disagreeing),
  };
}

function readCertificates(
  settles: SettleReconciliation | null,
  withPayer: number,
  rowPurchases: number,
  disagreeing: WalletDisagreement[],
): string {
  if (!settles) {
    return "The counters did not load, so the certificates can only be read against the payer rows: " +
      (withPayer === rowPurchases ? "they agree." : `${withPayer} certificates carry a payer against ${rowPurchases} purchases on the rows.`);
  }
  if (settles.unexplained === 0) {
    return "Nothing to explain: the counters and the payer rows agree, and the certificates are a third reading of the same figure.";
  }
  const counted = settles.counter_settles - settles.founding - settles.unattributed;
  const named = disagreeing.length > 0
    ? ` The wallet${disagreeing.length === 1 ? "" : "s"} to look at: ${disagreeing.slice(0, 3).map((w) => `${w.address} (row ${w.payer_row_purchases}, certificates ${w.certificates})`).join("; ")}.`
    : " No single wallet's row disagrees with its certificates, so the gap is not in any one row.";
  if (withPayer === counted) {
    return `The certificates side with the COUNTERS: ${withPayer} carry a payer, exactly the settles the counters know. So the settle minted its certificate and the payer row write was lost — the fold used to delete the old row before writing the merged one, and a KV failure between the two loses a purchase for good (fixed 2026-09-04 to write first). The row can be rebuilt from the certificates.${named}`;
  }
  if (withPayer === rowPurchases) {
    return `The certificates side with the PAYER ROWS: ${withPayer} carry a payer, matching the rows, and neither knows the settle the counters do. So a settle bumped the counter and no certificate carrying a payer was minted for it — either the mint never ran (the delivery audit at /admin/deliveries is the next page) or the settle predates payer recording.${named}`;
  }
  return `The certificates agree with neither side: ${withPayer} carry a payer, against ${counted} on the counters and ${rowPurchases} on the rows. Three instruments, three numbers — read the per-wallet table before trusting any of them.${named}`;
}
