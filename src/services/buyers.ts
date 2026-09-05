import { canonicalAddress } from "@/lib/addresses";
import { isHouseWallet } from "@/lib/channel";
import { readDeclines, type DeclineRow } from "@/lib/declines";
import { bulkGetJson } from "@/lib/kv-bulk";
import { KV_KEYS } from "@/lib/kv-keys";
import { listKeys } from "@/lib/kv-list";
import type { CertificateRecord, Env, PayerRecord } from "@/types";

/**
 * THE BUYERS (2026-09-04). After the walkers were subtracted, the
 * question left was never "why don't 48,000 asks convert" — it was
 * "who are the two dozen who did, and what do they have in common."
 * That is a question about the certificates, which are the only
 * durable per-purchase record and the only one that names the wallet.
 * The census cannot answer it: it reads event rows newest-first to a
 * cap, which on a busy day is eight hours.
 *
 * So: every certificate carrying a payer, grouped by wallet. What each
 * bought and in what order; whether any second purchase was the
 * settlement attestation the first purchase's response offered them
 * with the hash pre-filled (the designed handoff); and each wallet's
 * payer row beside its certificate count, so a row that disagrees with
 * its certificates is named here by address. Declines ride alongside
 * from the desk — a wallet opened and turned away is a buyer too — but
 * those rows carry no address, only a client string, and age out at
 * ninety days; the page says so.
 *
 * House wallets are excluded. Family doesn't make the paper.
 */
const CERT_SCAN_CAP = 5000;
const PAYER_SCAN_CAP = 5000;

/** The second purchase the first purchase's response points at. */
export const HANDOFF_ITEMS: readonly string[] = [
  "settlement_attestation",
  "settlement_reconciliation",
  "attestation_bundle",
];

export interface Purchase {
  cert_id: string;
  item: string;
  date: string;
  paid_usdc?: number;
}

export interface Buyer {
  address: string;
  purchases: Purchase[];
  first: string;
  last: string;
  paid_usdc: number;
  /** Bought something, then came back for the attestation of it. */
  followed_handoff: boolean;
  repeat: boolean;
  /** The payer row's count beside the certificates', when it disagrees. */
  payer_row_purchases?: number;
}

export interface TurnedAway {
  user_agent: string;
  declines: number;
  items: Record<string, number>;
  reasons: Record<string, number>;
  last: string;
}

export interface BuyersReport {
  buyers: Buyer[];
  certificates_scanned: number;
  certificates_without_payer: number;
  certificates_truncated: boolean;
  house_purchases_excluded: number;
  turned_away: TurnedAway[];
  declines_scanned: number;
  declines_capped: boolean;
  items_bought: Record<string, number>;
  summary: {
    distinct_buyers: number;
    repeat_buyers: number;
    followed_handoff: number;
    purchases: number;
    rows_disagreeing: number;
  };
}

export async function readBuyers(env: Env): Promise<BuyersReport> {
  const [certKeys, payerKeys, declines] = await Promise.all([
    listKeys(env.PATRONS, { prefix: KV_KEYS.certPrefix, cap: CERT_SCAN_CAP }),
    listKeys(env.COUNTERS, { prefix: KV_KEYS.payerPrefix, cap: PAYER_SCAN_CAP }),
    readDeclines(env),
  ]);
  const [certs, rows] = await Promise.all([
    bulkGetJson<CertificateRecord>(env.PATRONS, certKeys.names),
    bulkGetJson<PayerRecord>(env.COUNTERS, payerKeys.names),
  ]);

  const byWallet = new Map<string, Purchase[]>();
  let scanned = 0;
  let withoutPayer = 0;
  let houseExcluded = 0;
  const itemsBought: Record<string, number> = {};
  for (const record of certs.values()) {
    const cert = record?.certificate;
    if (!cert) continue;
    scanned += 1;
    if (!cert.payer) {
      withoutPayer += 1;
      continue;
    }
    if (isHouseWallet(env, cert.payer)) {
      houseExcluded += 1;
      continue;
    }
    const wallet = canonicalAddress(cert.payer);
    const list = byWallet.get(wallet) ?? [];
    list.push({
      cert_id: cert.cert_id,
      item: cert.item,
      date: cert.date,
      ...(typeof cert.paid_usdc === "number" ? { paid_usdc: cert.paid_usdc } : {}),
    });
    byWallet.set(wallet, list);
    itemsBought[cert.item] = (itemsBought[cert.item] ?? 0) + 1;
  }

  const rowPurchases = new Map<string, number>();
  for (const row of rows.values()) {
    if (!row) continue;
    const wallet = canonicalAddress(row.address);
    rowPurchases.set(wallet, (rowPurchases.get(wallet) ?? 0) + row.purchases);
  }

  const buyers: Buyer[] = [];
  for (const [address, purchases] of byWallet) {
    purchases.sort((a, b) => (a.date < b.date ? -1 : 1));
    const first = purchases[0];
    const later = purchases.slice(1);
    const onRow = rowPurchases.get(address);
    buyers.push({
      address,
      purchases,
      first: first?.date ?? "",
      last: purchases[purchases.length - 1]?.date ?? "",
      paid_usdc: purchases.reduce((sum, p) => sum + (p.paid_usdc ?? 0), 0),
      followed_handoff:
        later.some((p) => HANDOFF_ITEMS.includes(p.item)) &&
        !HANDOFF_ITEMS.includes(first?.item ?? ""),
      repeat: purchases.length > 1,
      ...(onRow !== undefined && onRow !== purchases.length
        ? { payer_row_purchases: onRow }
        : onRow === undefined
          ? { payer_row_purchases: 0 }
          : {}),
    });
  }
  buyers.sort((a, b) => b.purchases.length - a.purchases.length || (a.last < b.last ? 1 : -1));

  const turned = new Map<string, TurnedAway>();
  for (const row of declines.declines as DeclineRow[]) {
    if (row.house) continue;
    const ua = row.user_agent ?? "(no user-agent)";
    const entry = turned.get(ua) ?? { user_agent: ua, declines: 0, items: {}, reasons: {}, last: row.at };
    entry.declines += 1;
    entry.items[row.item] = (entry.items[row.item] ?? 0) + 1;
    entry.reasons[row.reason] = (entry.reasons[row.reason] ?? 0) + 1;
    if (row.at > entry.last) entry.last = row.at;
    turned.set(ua, entry);
  }

  return {
    buyers,
    certificates_scanned: scanned,
    certificates_without_payer: withoutPayer,
    certificates_truncated: certKeys.truncated,
    house_purchases_excluded: houseExcluded,
    turned_away: [...turned.values()].sort((a, b) => b.declines - a.declines),
    declines_scanned: declines.rows_scanned,
    declines_capped: declines.capped,
    items_bought: itemsBought,
    summary: {
      distinct_buyers: buyers.length,
      repeat_buyers: buyers.filter((b) => b.repeat).length,
      followed_handoff: buyers.filter((b) => b.followed_handoff).length,
      purchases: buyers.reduce((sum, b) => sum + b.purchases.length, 0),
      rows_disagreeing: buyers.filter((b) => b.payer_row_purchases !== undefined).length,
    },
  };
}
