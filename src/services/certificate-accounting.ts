import { BASE_NETWORK } from "@/lib/payment-networks";
import { monthsSinceOpening } from "@/lib/metrics";
import { KV_KEYS } from "@/lib/kv-keys";
import { kvGet } from "@/lib/kv-retry";
import { inspectPurchase } from "@/services/purchase-inspection";
import type { Certificate, Env } from "@/types";

/**
 * THE NATIVE SALES THAT NAME A SETTLEMENT TRANSACTION, for a whole walk
 * at once (whole store, 2026-09-18). Every Base certificate on the shelf
 * may now be a native sale, so the books sweep, the legacy repairs and
 * the third witness ask the ledger once per month for all of them rather
 * than once per certificate. Admission and delivery can cross a month
 * boundary, so every monthly ledger is asked. A ledger that cannot
 * answer throws; a read that failed must never look like an absent sale.
 */
export interface NativeSaleIndex {
  /** Sale ids by lowercased transaction; absent means no native sale. */
  readonly ids: ReadonlyMap<string, string[]>;
}

export async function nativeSaleIndex(env: Env, transactions: Iterable<string>): Promise<NativeSaleIndex> {
  if (!env.COUNTER_LEDGER) throw new Error("Native ledger unavailable");
  const wanted = [...new Set([...transactions].map(tx => tx.toLowerCase()))];
  const ids = new Map<string, string[]>();
  if (wanted.length === 0) return { ids };
  for (const month of monthsSinceOpening()) {
    const ledger = env.COUNTER_LEDGER.get(env.COUNTER_LEDGER.idFromName(`${month}/mpp-sales`));
    for (const [tx, found] of Object.entries(await ledger.readMppSaleIdsForTransactions(wanted))) {
      ids.set(tx, [...(ids.get(tx) ?? []), ...found]);
    }
  }
  return { ids };
}

async function nativeSaleIds(env: Env, transaction: string, index?: NativeSaleIndex): Promise<string[]> {
  if (index) return index.ids.get(transaction.toLowerCase()) ?? [];
  return (await nativeSaleIndex(env, [transaction])).ids.get(transaction.toLowerCase()) ?? [];
}

/**
 * What a walker already knows, so the classifier need not read it again:
 * the native index for its certificates, and whether a legacy per-settle
 * record exists (the walkers hold that set; a point read is the fallback).
 */
export interface AccountingContext {
  index?: NativeSaleIndex;
  legacyRecorded?: (payer: string, transaction: string) => boolean;
}

/**
 * One context for a whole walk: the native index over every certificate
 * that could be native, and the walker's own legacy-record set. A ledger
 * that cannot be indexed leaves the index out, so each certificate's own
 * read fails the same way it always did: undetermined, never x402.
 */
export async function accountingContextFor(
  env: Env,
  certificates: Iterable<Certificate | undefined>,
  legacyRecorded?: AccountingContext["legacyRecorded"],
): Promise<AccountingContext> {
  const transactions: string[] = [];
  for (const cert of certificates) if (cert && couldBeNative(cert)) transactions.push(cert.settlement_tx!);
  try {
    return { index: await nativeSaleIndex(env, transactions), legacyRecorded };
  } catch {
    return { legacyRecorded };
  }
}

/** A certificate can only be a native sale where native checkout settles: Base. */
export function couldBeNative(cert: Pick<Certificate, "network" | "payer" | "settlement_tx">): boolean {
  return cert.network === BASE_NETWORK && !!cert.payer && !!cert.settlement_tx;
}

/** Certificates predate protocol fields. The retained transaction coordinator
 * identifies the rail; the individual native sale and purchase prove accounting.
 * No status/recovery call, aggregate-count inference, or repair occurs here.
 *
 * THREE WITNESSES, IN ORDER (2026-09-17). The retained settle headers name
 * the protocol outright for every purchase that kept them. They are absent
 * on a rescued x402 settle — the ambiguous-settle rescue relays no
 * facilitator header, by design (lib/payment-gate.ts) — and on any purchase
 * whose coordinator record was never written. Without them, the ledgers
 * themselves answer: a native sale naming this transaction makes it MPP; a
 * legacy per-settle record with no native sale makes it x402. Only a settle
 * neither ledger holds stays undetermined, which is exactly the case the
 * books sweep should keep paging on. A native ledger that cannot be read
 * is never allowed to fall through to the legacy answer.
 *
 * SINCE THE WHOLE STORE (2026-09-18) any Base certificate may be native,
 * not only the pilot's one product; certificates on the other rails
 * cannot be, and are x402 without a read. */
export async function certificateProtocol(env: Env, cert: Certificate, context: AccountingContext = {}): Promise<"x402" | "mpp" | "unavailable"> {
  if (cert.network !== BASE_NETWORK) return "x402";
  if (!cert.payer || !cert.settlement_tx) return "unavailable";
  let retained: "x402" | "mpp" | null = null;
  try {
    if (env.PAID_RECOVERIES) {
      const store = env.PAID_RECOVERIES.get(env.PAID_RECOVERIES.idFromName(`${cert.network}:${cert.settlement_tx}`));
      retained = await store.readSettlementProtocol({ path: `/api/buy/${cert.item}`, payer: cert.payer,
        network: cert.network, transaction: cert.settlement_tx });
    }
  } catch { retained = null; }
  if (retained) return retained;
  try {
    if ((await nativeSaleIds(env, cert.settlement_tx, context.index)).length) return "mpp";
    const legacy = context.legacyRecorded
      ? context.legacyRecorded(cert.payer, cert.settlement_tx)
      : !!(await kvGet(env.COUNTERS, KV_KEYS.payerSettle(cert.payer, cert.settlement_tx)));
    return legacy ? "x402" : "unavailable";
  } catch { return "unavailable"; }
}

export async function inspectNativeCertificate(env: Env, cert: Certificate, context: AccountingContext = {}): Promise<"matched" | "missing" | "mismatch" | "unavailable"> {
  try {
    if (!cert.settlement_tx) return "unavailable";
    const ids = await nativeSaleIds(env, cert.settlement_tx, context.index);
    if (ids.length > 1) return "mismatch";
    if (!ids.length) return "missing";
    const result = await inspectPurchase(env, ids[0]!);
    if (result.status === 503) return "unavailable";
    const purchase = result.body.purchase;
    if (!purchase || purchase.protocol !== "mpp" || purchase.ledger.state !== "matched" ||
      purchase.payment_state !== "settled" || purchase.network !== cert.network ||
      purchase.path !== `/api/buy/${cert.item}` || purchase.payer.toLowerCase() !== cert.payer?.toLowerCase() ||
      purchase.transaction?.toLowerCase() !== cert.settlement_tx.toLowerCase() ||
      purchase.currency !== cert.asset || purchase.decimals === null ||
      typeof cert.paid_usdc !== "number" || !Number.isSafeInteger(cert.paid_usdc * 10 ** purchase.decimals) ||
      purchase.amount_atomic !== String(cert.paid_usdc * 10 ** purchase.decimals)) return "mismatch";
    return "matched";
  } catch { return "unavailable"; }
}
