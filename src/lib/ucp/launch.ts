import { acceptedNetworks, type PaymentNetworkConfig } from "@/lib/payment-networks";
import { coreCommerceItems } from "@/store/commerce";
import type { Env, MenuItem } from "@/types";

/**
 * THE ONE SWITCH BEHIND UCP CHECKOUT, and the invariant it carries.
 *
 * Two things must never disagree: whether the business profile
 * advertises `dev.ucp.shopping.checkout`, and whether Complete moves
 * money. A profile that advertises a checkout the door refuses is the
 * overclaim UCP negotiation exists to catch; a door that settles a
 * payment no profile offered is a sale nobody could have discovered
 * honestly. So both read this file, and nothing else decides either.
 *
 * DARK BY DEFAULT, LIKE THE MPP SEAM. The three values are Worker
 * SECRETS (`wrangler secret put`, or the dashboard's secret type),
 * not vars in wrangler.jsonc: a secret survives every deploy and can
 * be changed without one, and a plaintext var git does not own is a
 * var the next deploy wipes, which the MPP notes there record. Absent
 * is closed, so merging the code launches nothing; the keeper turns
 * it on for one rail and one product first, proves the whole loop
 * against production, and widens from there. The profile says which
 * state the deployment is in, so the switch is public even though its
 * storage is not.
 *
 *   UCP_CHECKOUT_ENABLED  "true" opens the door. Anything else: closed.
 *   UCP_CHECKOUT_RAILS    Comma-separated CAIP-2 ids. Unset = every rail
 *                         the till settles on; set = only those, and
 *                         only where a receiving wallet exists.
 *   UCP_CHECKOUT_ITEMS    Comma-separated shelf ids. Unset = the whole
 *                         UCP catalog; set = only those.
 *
 * OPEN means all of: the switch is on, the durable stores the checkout
 * and the purchase record live in are bound, at least one rail
 * remains, and at least one item remains. An allow-list that names
 * nothing the store has is a closed door, not an open one with an
 * empty shelf.
 */

export type UcpLaunchConfig = PaymentNetworkConfig &
  Partial<
    Pick<Env, "UCP_CHECKOUT_ENABLED" | "UCP_CHECKOUT_RAILS" | "UCP_CHECKOUT_ITEMS" | "PAID_RECOVERIES">
  >;

/** A comma-separated var, or undefined when the var is absent. Empty string = an empty list. */
function names(value: string | undefined): string[] | undefined {
  if (value === undefined) return undefined;
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

/** The switch alone, before any of the conditions that make it usable. */
export function ucpCheckoutSwitchOn(env: UcpLaunchConfig): boolean {
  return env.UCP_CHECKOUT_ENABLED === "true";
}

/** The rails a UCP checkout may be quoted on: enabled at the till, and allowed here. */
export function ucpCheckoutRails(env: UcpLaunchConfig): string[] {
  const allowed = names(env.UCP_CHECKOUT_RAILS);
  const accepted = acceptedNetworks(env);
  return allowed === undefined ? accepted : accepted.filter((network) => allowed.includes(network));
}

/** The items a UCP checkout may be opened for: in the UCP catalog, and allowed here. */
export function ucpCheckoutItems(env: UcpLaunchConfig): MenuItem[] {
  const allowed = names(env.UCP_CHECKOUT_ITEMS);
  const catalog = coreCommerceItems();
  return allowed === undefined ? catalog : catalog.filter((item) => allowed.includes(item.id));
}

export interface UcpLaunchStatus {
  open: boolean;
  switch_on: boolean;
  rails: string[];
  items: string[];
  /** Present exactly when closed: the one condition that closed it, in words. */
  closed_because?: string;
}

export function ucpLaunchStatus(env: UcpLaunchConfig): UcpLaunchStatus {
  const switchOn = ucpCheckoutSwitchOn(env);
  const rails = switchOn ? ucpCheckoutRails(env) : [];
  const items = switchOn ? ucpCheckoutItems(env).map((item) => item.id) : [];
  const closedBecause = !switchOn
    ? "UCP checkout is not switched on for this deployment."
    : !env.PAID_RECOVERIES
      ? "The durable checkout and purchase stores are not bound in this Worker."
      : rails.length === 0
        ? "No settlement rail is enabled for UCP checkout here."
        : items.length === 0
          ? "No shelf item is enabled for UCP checkout here."
          : undefined;
  return {
    open: closedBecause === undefined,
    switch_on: switchOn,
    rails,
    items,
    ...(closedBecause ? { closed_because: closedBecause } : {}),
  };
}

/** THE invariant's one input: the profile and the Complete door both ask this and nothing else. */
export function ucpCheckoutOpen(env: UcpLaunchConfig): boolean {
  return ucpLaunchStatus(env).open;
}

export function ucpItemSellable(env: UcpLaunchConfig, itemId: string): boolean {
  return ucpCheckoutOpen(env) && ucpCheckoutItems(env).some((item) => item.id === itemId);
}

export function ucpRailSellable(env: UcpLaunchConfig, network: string): boolean {
  return ucpCheckoutOpen(env) && ucpCheckoutRails(env).includes(network);
}

/**
 * THE GUIDE PARAGRAPH, one text per state, so /llms-full.txt and
 * agents.md say what the profile says and never a third thing. The
 * templated URLs travel in backticks because the markdown guard
 * requires every `{placeholder}` in the guide to be code, not a link.
 */
export function ucpGuideParagraph(base: string, env?: UcpLaunchConfig): string {
  const head = `UCP business profile: ${base}/.well-known/ucp — the shelf as a UCP
catalog, searchable at ${base}/ucp/v1/catalog/search, resolvable in
batches at ${base}/ucp/v1/catalog/lookup, and readable one product at
a time at ${base}/ucp/v1/catalog/product.`;
  const tail = `Four sub-cent items are missing from that catalog and nowhere else;
${base}/ucp says which and why.`;
  const status = env ? ucpLaunchStatus(env) : undefined;
  if (!status?.open) {
    return `${head} Checkout and order
are built and switched off on this deployment, so the profile
advertises no checkout capability and a platform that speaks UCP can
read what is here and then has to pay the way everyone else does —
x402 at \`${base}/api/buy/{item_id}\`, or MCP.
${tail}`;
  }
  const catalogCount = coreCommerceItems().length;
  const items =
    status.items.length === catalogCount
      ? "every item in that catalog"
      : `${status.items.length} of the ${catalogCount} catalog items while the launch is qualified item by item (the profile lists them)`;
  return `${head} Checkout and order
are advertised and served: POST a checkout at
${base}/ucp/v1/checkout-sessions, pay the quoted x402 terms at its
/complete, and read the order at \`${base}/ucp/v1/orders/{order_id}\`.
An identical Complete sent again returns the same order and never
charges again. Open on ${status.rails.join(", ")} for ${items}.
${tail}`;
}
