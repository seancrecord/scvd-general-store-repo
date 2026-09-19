import { buyInputSchema } from '@/lib/bazaar-discovery';
import { CLIENT_CAP_LABEL, CLIENT_CAP_READABLE, CLIENT_CAP_USD, readAgainstCap } from '@/lib/client-spend-cap';
import { acceptedNetworks, type PaymentNetworkConfig } from '@/lib/payment-networks';
import { checkoutMethod, type PurchaseCapabilityConfig } from '@/lib/purchase-capabilities';
import { priceTiersUsdc } from '@/lib/payments';
import { escapeHtml } from '@/lib/sanitize';
import type { MenuItem } from '@/types';

/** Buyer facts from the same item, input schema, network flags and SDK as checkout. */
export function purchaseChecklist(item: MenuItem, config?: PaymentNetworkConfig) {
  const tiers = priceTiersUsdc(item);
  const cap = readAgainstCap(tiers);
  return {
    protocol: 'x402', currency: 'USDC', price_tiers_usdc: tiers,
    networks: config ? acceptedNetworks(config) : null,
    network_source: 'PAYMENT-REQUIRED is authoritative; configured rails do not prove settlement or availability.',
    required_params: [...(buyInputSchema(item).required ?? [])],
    fulfillment: item.fulfillment,
    ...(item.sla_hours === undefined ? {} : { sla_hours: item.sla_hours }),
    ...(item.term_days === undefined ? {} : { term_days: item.term_days }),
    default_client: {
      package: '@x402/core',
      scope: 'Spending ceiling only; wallet/network support, stock and input eligibility are separate.',
      ceiling_usdc: CLIENT_CAP_READABLE ? CLIENT_CAP_USD : null,
      compatible: cap ? !cap.blocked : null,
      tiers_above_ceiling: cap?.tiersAboveCap ?? null,
      // Dollar syntax is the SDK's top-level USD cap, not atomic USDC.
      maxAmountPerPayment: `$${Math.min(...tiers)}`,
    },
  };
}

export function purchaseChecklistHtml(item: MenuItem, config?: PurchaseCapabilityConfig): string {
  const checklist = purchaseChecklist(item, config);
  const cap = checklist.default_client;
  const compatibility = cap.compatible === null ? 'Unknown; check your client settings.'
    : cap.compatible ? `The lowest price fits the installed @x402/core default ${CLIENT_CAP_LABEL} ceiling.`
    : `The lowest price exceeds the installed @x402/core default ${CLIENT_CAP_LABEL} ceiling. Your operator must approve a higher limit before signing.`;
  const example = cap.compatible === false
    ? `<pre><code>${escapeHtml(`client.setSpendControls({ maxAmountPerPayment: "${cap.maxAmountPerPayment}" });`)}</code></pre>` : '';
  return `<div data-purchase-checklist>
    <p class="menu-meta"><strong>Checkout:</strong> ${escapeHtml(checkoutMethod(config))}. The quote supplies the terms to sign.</p>
    <p class="menu-meta"><strong>Required inputs:</strong> ${escapeHtml(checklist.required_params.join(', ') || 'none')}.</p>
    <p class="menu-meta"><strong>Client budget:</strong> ${escapeHtml(compatibility)}${cap.compatible && cap.tiers_above_ceiling ? ` ${cap.tiers_above_ceiling} optional tiers need a higher limit.` : ''}</p>
    ${example}
  </div>`;
}
