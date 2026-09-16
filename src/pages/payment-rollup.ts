import { escapeHtml } from "@/lib/sanitize";
import { purchaseHeadline, type PaymentRollup, type PaymentSource, type PurchaseGroup } from "@/lib/settlement-accounting";

/** Shared by the public rollup and the keeper's take; no payment identities. */
export function paymentRollupHtml(payments: PaymentRollup, sources?: readonly PaymentSource[]): string {
  const table = (title: string, rows: PurchaseGroup[] | null): string => `<h3>${title}</h3>${rows === null
    ? '<p>Network breakdown unavailable: the records could not be read or did not reconcile.</p>'
    : `<table border="1" cellpadding="6"><thead><tr><th scope="col">${title.replace("Purchases by ", "")}</th><th scope="col">Organic purchases</th></tr></thead><tbody>${rows.map(row => `<tr><th scope="row">${escapeHtml(row.name)}</th><td>${row.purchases}</td></tr>`).join("")}</tbody></table>`}`;
  return `<section id="payments"><h2>Payment breakdown</h2>
    <p><strong>${escapeHtml(purchaseHeadline(payments))}</strong></p>
    ${table("Purchases by protocol", payments.by_protocol)}
    ${table("Purchases by network", payments.by_network)}
    ${table("Purchases by currency", payments.by_currency)}
    <p class="menu-meta">${escapeHtml(payments.method)}</p>
    ${sources ? `<h3>House purchases by protocol and currency</h3><table border="1" cellpadding="6"><tr><th>Protocol</th><th>Currency</th><th>House purchases</th></tr>${sources.map(row => `<tr><td>${escapeHtml(row.protocol)}</td><td>${escapeHtml(row.currency)}</td><td>${row.house}</td></tr>`).join("")}</table><p>Delivery, recovery and refunds are separate from these settlement counts. <a href="/admin/deliveries">Delivery audit</a> · <a href="/admin/reconciliation">Reconciliation</a></p>` : ""}
  </section>`;
}
