import { readGatewaySales, isGatewayFinal } from '@/services/gateway-sales';
import { ARC_USDC } from '@/lib/arc-gateway';
import { atomicToUsdc } from '@/lib/payments';
import { isHouseWallet } from "@/lib/channel";
import { bulkGetJson } from "@/lib/kv-bulk";
import { KV_KEYS } from "@/lib/kv-keys";
import { listKeys } from "@/lib/kv-list";
import { listRefunds } from "@/services/refunds";
import type { CertificateRecord, Env } from "@/types";

/**
 * THE TAX DRAWER (CV's spec, 2026-08-04; the keeper's ask): one CSV
 * off the store's own ledger, so tax time is an export rather than a
 * reconstruction, and an accountant — or an auditor — can verify
 * every row against the chain without trusting our books.
 *
 * DESIGN DECISIONS, stated because a tax document must not be coy:
 *
 * - CERTIFICATES ARE THE SPINE. Every PAID purchase mints one
 *   carrying date, amount, tip, asset, network, payer, and the
 *   settlement tx — the row writes itself. Free-shelf artifacts
 *   (no paid_usdc) are excluded: no money, no taxable event.
 * - REFUNDS ARE THEIR OWN ROWS, not a join. RefundRecord carries no
 *   cert_id, and a guessed join in a tax document is worse than two
 *   honest rows: sales are `row_type=sale`, refunds are
 *   `row_type=refund` with a NEGATIVE amount and their own tx hash —
 *   the offsetting-events shape crypto tax tools expect.
 * - HOUSE ROWS ARE FLAGGED, NEVER OMITTED. Whether a self-purchase
 *   is income is the accountant's call, not an export's silent
 *   assumption; the flag is computed from the same wallet register
 *   the public books use.
 * - THE COVERAGE GAP IS NAMED. Penny pages (Almanac, Gazette,
 *   zodiac archive) settle real money but mint no certificate, so
 *   they are NOT itemized here — the chain record on the receive
 *   wallets is the completeness backstop, and the admin page says so
 *   next to the download link. An export that looked total while
 *   silently missing a shelf would be the worst document this store
 *   could produce.
 */

/** Far above the current cert count; the export says when it binds. */
const CERT_SCAN_CAP = 5000;

export interface TaxRow {
  date: string;
  row_type: "sale" | "refund";
  cert_id: string;
  item: string;
  patron_number: string;
  amount_usdc: number;
  tip_usdc: number;
  asset: string;
  network: string;
  payer: string;
  settlement_tx: string;
  house_flagged: "house" | "organic" | "unknown";
  refund_status: string;
  purchase_id?: string;
  payment_protocol?: string;
}

export async function taxRows(
  env: Env,
): Promise<{ rows: TaxRow[]; truncated: boolean }> {
  const listed = await listKeys(env.PATRONS, {
    prefix: KV_KEYS.certPrefix,
    cap: CERT_SCAN_CAP,
  });
  const values = await bulkGetJson<CertificateRecord>(env.PATRONS, listed.names);
  const rows: TaxRow[] = [];
  for (const record of values.values()) {
    const cert = record?.certificate;
    if (!cert || typeof cert.paid_usdc !== "number" || cert.paid_usdc <= 0) {
      continue; // Free shelf: no money, no taxable event.
    }
    const payer = cert.payer ?? "";
    rows.push({
      date: cert.date,
      row_type: "sale",
      cert_id: cert.cert_id,
      item: cert.item,
      patron_number: String(cert.patron_number ?? ""),
      amount_usdc: cert.paid_usdc,
      tip_usdc: cert.tip_usdc ?? 0,
      asset: cert.asset ?? "USDC",
      network: cert.network ?? "",
      payer,
      settlement_tx: cert.settlement_tx ?? "",
      // No payer returned by the facilitator = honestly unknown,
      // never guessed either way.
      house_flagged: payer
        ? isHouseWallet(env, payer)
          ? "house"
          : "organic"
        : "unknown",
      refund_status: "",
    });
  }
  // Gateway certificates sign acceptance, not paid revenue. Export one row
  // from each confirmed authorization, including pages with no certificate.
  const gateway = await readGatewaySales(env);
  const gatewayCerts = new Map([...values.values()].flatMap(record =>
    record?.certificate.gateway_payment ? [[record.certificate.gateway_payment.reference, record.certificate] as const] : []));
  for (const sale of gateway.rows) {
    if (!isGatewayFinal(sale.payment)) continue;
    const cert = gatewayCerts.get(sale.payment.reference);
    rows.push({ date: sale.created_at, row_type: "sale", cert_id: cert?.cert_id ?? "", item: sale.item ?? sale.path,
      patron_number: String(cert?.patron_number ?? ""), amount_usdc: atomicToUsdc(sale.amount_atomic), tip_usdc: atomicToUsdc(sale.tip_atomic),
      asset: ARC_USDC, network: sale.network, payer: sale.payer, settlement_tx: sale.payment.batch_transaction ?? "",
      house_flagged: sale.house ? "house" : "organic", refund_status: "", purchase_id: sale.purchase_id, payment_protocol: "x402-gateway" });
  }
  const refunds = await listRefunds(env);
  for (const refund of refunds) {
    rows.push({
      date: refund.paid_at ?? refund.created_at,
      row_type: "refund",
      cert_id: "",
      item: refund.item,
      patron_number: "",
      // Negative on purpose: the offsetting event, the shape every
      // crypto tax tool reads without instructions.
      amount_usdc: -refund.amount_usdc,
      tip_usdc: 0,
      asset: "USDC",
      network: "",
      payer: refund.payer ?? "",
      settlement_tx: refund.tx_hash ?? "",
      house_flagged: refund.payer
        ? isHouseWallet(env, refund.payer)
          ? "house"
          : "organic"
        : "unknown",
      refund_status: refund.status,
    });
  }
  rows.sort((a, b) => a.date.localeCompare(b.date));
  return { rows, truncated: listed.truncated || gateway.truncated || gateway.unreadable > 0 };
}

const COLUMNS: (keyof TaxRow)[] = [
  "date",
  "row_type",
  "cert_id",
  "item",
  "patron_number",
  "amount_usdc",
  "tip_usdc",
  "asset",
  "network",
  "payer",
  "settlement_tx",
  "house_flagged",
  "refund_status",
  "purchase_id",
  "payment_protocol",
];

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Pure CSV, no comment lines: tax tools choke on cleverness. */
export function taxCsv(rows: TaxRow[]): string {
  const lines = [COLUMNS.join(",")];
  for (const row of rows) {
    lines.push(COLUMNS.map((column) => csvCell(row[column] ?? "")).join(","));
  }
  return `${lines.join("\n")}\n`;
}
