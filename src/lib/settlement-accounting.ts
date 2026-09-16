/**
 * The contract of the existing till counters, including their history.
 * Both callers of recordSettlement are x402 checkout paths and its amounts
 * are USDC. A future checkout needs its own source adapter before joining
 * the rollup; never infer a payment protocol from its settlement network.
 */
export const SETTLEMENT_ACCOUNTING = { protocol: "x402", currency: "USDC" } as const;

export interface PurchaseGroup {
  name: string;
  purchases: number;
}

export interface PaymentSource {
  protocol: string;
  currency: string;
  organic: number;
  house: number;
}

export interface PaymentRollup {
  organic_purchases: number;
  by_protocol: PurchaseGroup[];
  by_currency: PurchaseGroup[];
  /** Null means the network read was unavailable or did not reconcile. */
  by_network: PurchaseGroup[] | null;
  method: string;
}

export const PAYMENT_ROLLUP_METHOD =
  "The same purchases, grouped three ways: payment protocol, settlement network, and currency. Each group divides the organic purchase total; do not add the groups together. House purchases are excluded. These are purchase counts, not revenue or unique buyers. Network gaps remain unrecorded; endpoint observations and trade-counter deliveries are outside these settlement counts.";

/** Sources must cover disjoint purchases; a currency is never an amount to add. */
export function paymentRollup(sources: readonly PaymentSource[], networks: PurchaseGroup[] | null): PaymentRollup {
  const group = (field: "protocol" | "currency"): PurchaseGroup[] => {
    const counts = new Map<string, number>();
    for (const source of sources) counts.set(source[field], (counts.get(source[field]) ?? 0) + source.organic);
    return [...counts].map(([name, purchases]) => ({ name, purchases }));
  };
  const total = sources.reduce((sum, source) => sum + source.organic, 0);
  return {
    organic_purchases: total,
    by_protocol: group("protocol"),
    by_currency: group("currency"),
    by_network: networks && networks.reduce((sum, row) => sum + row.purchases, 0) === total ? networks : null,
    method: PAYMENT_ROLLUP_METHOD,
  };
}

export function purchaseHeadline(payments: PaymentRollup): string {
  const total = `${payments.organic_purchases} organic ${payments.organic_purchases === 1 ? "purchase" : "purchases"}`;
  if (payments.by_protocol.length === 1) return `${total} via ${payments.by_protocol[0]!.name}.`;
  return `${total} — ${payments.by_protocol.map(row => `${row.purchases} via ${row.name}`).join(", ")}.`;
}
