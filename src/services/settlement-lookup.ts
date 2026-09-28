import { nativeSaleIndex } from "@/services/certificate-accounting";
import { getOpenDeliveryIntent, type DeliveryIntent } from "@/services/delivery-audit";
import { certIdForSettlement, SETTLED_DELIVERY_TTL_SECONDS } from "@/services/settlement-records";
import { isHouseWallet } from "@/lib/channel";
import { KV_KEYS } from "@/lib/kv-keys";
import { kvGet, kvGetJson } from "@/lib/kv-retry";
import { listKeys } from "@/lib/kv-list";
import { bulkGetJson } from "@/lib/kv-bulk";
import type { CertificateRecord, Env } from "@/types";

/**
 * WHAT THE BOOKS HOLD FOR ONE SETTLEMENT (2026-09-28).
 *
 * The bank walk paged an "undelivered sale" on a hash, the delivery desk
 * was empty, and the keeper had no page to put the hash into: the
 * certificate index, the delivered-settlement row, the delivery intent,
 * the legacy till and the native ledger each knew their own half, on
 * five different keys. This reads all of them for one transaction and
 * says, in one place, whether the store booked goods against it.
 *
 * A reading, never a verdict about the chain: it does not read Base,
 * and it does not say whether money moved. It says what OUR records
 * hold, and where a record could not be read it says so instead of
 * answering "nothing" (rule 52). Each row below names the record it
 * came from, so the keeper can check it on the key.
 */
export const LEGACY_SETTLE_SCAN_CAP = 5000;

export interface SettlementLookup {
  transaction: string;
  /** The certificate that names this settlement, by the keyed index or the scan. */
  certificate: {
    cert_id: string | null;
    /** false: the scan hit its cap, so "none" is "could not see far enough". */
    certain: boolean;
    item?: string;
    date?: string;
    payer?: string;
    network?: string;
    paid_usdc?: number;
  };
  /** The 2xx seam's row (services/settlement-records.ts): the ISO time goods went out, if within TTL. */
  delivered_settlement: { recorded_at: string | null; ttl_days: number };
  delivery_intent: { open: DeliveryIntent | null; resolved: unknown | null };
  /** Legacy x402 till rows naming this transaction (KV payer_settle:<wallet>:<tx>). */
  legacy_settle_records: {
    rows: Array<{ payer: string; item?: string; at?: string; house: boolean }>;
    /** The key list hit its cap: a row past it is unseen, not absent. */
    truncated: boolean;
  };
  /** Native (MPP) sale ids in the monthly ledgers, or null when a ledger could not be read. */
  native_sale_ids: string[] | null;
  /** Plain words, derived from the rows above and nothing else. */
  reading: string;
}

export async function lookupSettlement(env: Env, transaction: string): Promise<SettlementLookup> {
  const tx = transaction.trim();
  const wanted = tx.toLowerCase();
  const [cert, delivered, intent, resolvedRaw, settleKeys, native] = await Promise.all([
    certIdForSettlement(env, tx),
    kvGet(env.COUNTERS, KV_KEYS.settledDelivery(wanted)),
    getOpenDeliveryIntent(env, tx),
    kvGet(env.ORDERS, `delivery_resolved:${tx}`),
    listKeys(env.COUNTERS, { prefix: KV_KEYS.payerSettlePrefix(), cap: LEGACY_SETTLE_SCAN_CAP }),
    nativeSaleIndex(env, [tx]).then((index) => index.ids.get(wanted) ?? []).catch(() => null),
  ]);

  const certificate: SettlementLookup["certificate"] = { cert_id: cert.certId, certain: cert.certain };
  if (cert.certId) {
    const record = await kvGetJson<CertificateRecord>(env.PATRONS, KV_KEYS.cert(cert.certId), "json");
    const c = record?.certificate;
    if (c) {
      certificate.item = c.item;
      certificate.date = c.date;
      if (c.payer) certificate.payer = c.payer;
      if (c.network) certificate.network = c.network;
      if (typeof c.paid_usdc === "number") certificate.paid_usdc = c.paid_usdc;
    }
  }

  // The transaction is the key's suffix; the wallet is between the prefix and it.
  const prefix = KV_KEYS.payerSettlePrefix();
  const legacyNames = settleKeys.names.filter((name) => name.toLowerCase().endsWith(`:${wanted}`));
  const legacyValues = await bulkGetJson<{ item?: string; at?: string }>(env.COUNTERS, legacyNames);
  const legacyRows = legacyNames.map((name) => {
    const payer = name.slice(prefix.length, name.length - wanted.length - 1);
    const value = legacyValues.get(name);
    return {
      payer,
      ...(value?.item ? { item: value.item } : {}),
      ...(value?.at ? { at: value.at } : {}),
      house: isHouseWallet(env, payer),
    };
  });

  let resolved: unknown = null;
  if (resolvedRaw) {
    try { resolved = JSON.parse(resolvedRaw); } catch { resolved = resolvedRaw; }
  }

  const lookup: SettlementLookup = {
    transaction: tx,
    certificate,
    delivered_settlement: { recorded_at: delivered ?? null, ttl_days: SETTLED_DELIVERY_TTL_SECONDS / 86400 },
    delivery_intent: { open: intent?.intent ?? null, resolved },
    legacy_settle_records: { rows: legacyRows, truncated: settleKeys.truncated },
    native_sale_ids: native,
    reading: "",
  };
  lookup.reading = readSettlement(lookup);
  return lookup;
}

function readSettlement(l: SettlementLookup): string {
  const parts: string[] = [];
  if (l.certificate.cert_id) {
    parts.push(`Certificate ${l.certificate.cert_id}${l.certificate.item ? ` (${l.certificate.item})` : ""} names this settlement${l.certificate.payer ? `, payer ${l.certificate.payer}` : ""}: the store minted goods against it.`);
  } else if (!l.certificate.certain) {
    parts.push("No certificate found, but the certificate scan hit its cap, so this is \"could not see far enough\", not \"none\".");
  } else {
    parts.push("No certificate names this settlement. The penny pages mint none, so on its own that is not a missing delivery.");
  }
  if (l.delivered_settlement.recorded_at) {
    parts.push(`The delivered-settlement row says goods went out at ${l.delivered_settlement.recorded_at}.`);
  } else {
    parts.push(`No delivered-settlement row; the row lives ${l.delivered_settlement.ttl_days} days, so past that its absence says nothing.`);
  }
  if (l.delivery_intent.open) {
    parts.push("A delivery intent is OPEN: money taken, goods not recorded as sent. It is on /admin/deliveries.");
  } else if (l.delivery_intent.resolved) {
    parts.push("A delivery intent was resolved by hand; the resolution row is attached.");
  }
  if (l.legacy_settle_records.rows.length) {
    parts.push(`The legacy till booked it under ${l.legacy_settle_records.rows.map((r) => `${r.payer}${r.house ? " (house)" : ""}`).join(", ")}.`);
  } else if (l.legacy_settle_records.truncated) {
    parts.push("The legacy till's key list hit its cap, so a till row may exist unseen.");
  } else {
    parts.push("The legacy till has no row for it.");
  }
  if (l.native_sale_ids === null) {
    parts.push("The native (MPP) ledger could not be read, so nothing here says whether it was an MPP sale.");
  } else if (l.native_sale_ids.length) {
    parts.push(`The native ledger holds it as MPP sale ${l.native_sale_ids.join(", ")}; inspect it at /admin/purchases/<id>.`);
  } else {
    parts.push("The native ledger has no MPP sale for it.");
  }
  const booked = Boolean(l.certificate.cert_id || l.delivered_settlement.recorded_at || l.legacy_settle_records.rows.length || (l.native_sale_ids?.length ?? 0));
  const blind = !l.certificate.certain || l.legacy_settle_records.truncated || l.native_sale_ids === null;
  parts.push(booked
    ? "READ: the books know this settlement."
    : blind
      ? "READ: no record found, but at least one record could not be fully read — do not treat this as an unbooked sale yet."
      : "READ: no record anywhere in the books names this settlement. If the chain holds money on this hash, that is the bank walk's orphan and it is real.");
  return parts.join(" ");
}
