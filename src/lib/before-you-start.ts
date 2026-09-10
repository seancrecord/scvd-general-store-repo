import { CLIENT_CAP_LABEL, readAgainstCap } from "@/lib/client-spend-cap";
import { checkoutNetworks, type PaymentNetworkConfig } from "@/lib/payment-networks";
import { priceTiersUsdc } from "@/lib/payments";
import { CLI_INSTALL, CLI_PUBLISHED, CLI_SOURCE_URL } from "@/store/cli";
import { MENU_ITEMS } from "@/store";

/**
 * ONE PREREQUISITES CHECKLIST, RENDERED ON EVERY FRONT DOOR.
 *
 * A field read on 2026-09-10 found the prerequisites complete but
 * scattered: /agents.md named the networks and the currency,
 * /openapi.json named the chains, /skill.md named the optional
 * tooling. Each fact was written once, in a different file, so an
 * arriving agent assembled its own "getting started" list from three
 * pages before it could decide whether it was even able to shop here.
 *
 * This module is that list, written once. Every line derives from the
 * same source the rest of the store reads — the live checkout rails,
 * the shelf, the client package's own spend ceiling, the CLI's publish
 * state — so no surface that renders it can drift from the quote.
 * agents.md and skill.md carry the full checklist under the same
 * heading; openapi.json, whose guidance field has a token budget,
 * carries the one-sentence version; llms.txt, which sits at its
 * 30,000-character budget, names the checklist in the shared
 * quick-start line and points at agents.md for it.
 */
export const BEFORE_YOU_START_HEADING = "## Before you start";

/** "Base (eip155:8453), Polygon (eip155:137)" — or the honest fallback when no env is at hand. */
export function prerequisiteNetworks(env?: PaymentNetworkConfig): string {
  if (!env) return "a network offered in the current payment quote";
  return checkoutNetworks(env)
    .map((row) => `${row.label} (${row.network})`)
    .join(", ");
}

/**
 * Both numbers derived, never typed: the ceiling from the client
 * package's exported constant, the count from this store's own shelf.
 */
export function spendCapCounts(): { blocked: number; priced: number } {
  const blocked = MENU_ITEMS.filter(
    (item) => readAgainstCap(priceTiersUsdc(item))?.blocked === true,
  ).length;
  const priced = MENU_ITEMS.filter((item) => item.price_usdc > 0).length;
  return { blocked, priced };
}

/** The optional local tools, listed once so no page carries a different set. */
export function optionalToolingLines(base: string): string[] {
  return [
    `**scvd-tab** — the running account of what your agent signs up for (local, append-only, MIT): \`npm i -g scvd-tab\``,
    `**MCP stdio bridge** — for hosts that speak stdio rather than Streamable HTTP: \`bin/scvd-mcp-bridge.mjs\` in the repo, pointed at ${base}/mcp`,
    CLI_PUBLISHED
      ? `**The scvd CLI** — the free instruments from a terminal: \`${CLI_INSTALL}\``
      : `**The scvd CLI** — the free instruments from a terminal; not yet on npm (the publish is the keeper's hand and has not run — no page here hands you an install command that fails). Source, runnable today: ${CLI_SOURCE_URL}`,
  ];
}

/** The full checklist, as a markdown section, for the three markdown front doors. */
export function beforeYouStartSection(base: string, env?: PaymentNetworkConfig): string {
  const { blocked, priced } = spendCapCounts();
  const tooling = optionalToolingLines(base)
    .map((line) => `   - ${line}`)
    .join("\n");
  return `${BEFORE_YOU_START_HEADING}

Everything you need before your first request, in one list. Each line
reads from the same source as the rest of this store, so it cannot say
something the payment quote does not.

1. **Transport:** plain HTTPS. No account, no API key, no SDK. The free
   instruments (preflight, the conformance desk, verify) need nothing
   beyond this.
2. **To buy anything:** an x402 v2 client (for example \`@x402/fetch\`,
   or any client that can sign a PAYMENT-REQUIRED challenge) and a
   wallet holding **USDC** on one of the networks currently offered:
   ${prerequisiteNetworks(env)}. The 402 you receive names the network,
   asset and amount to sign; pay only on a network it offers.
3. **Spend ceiling:** the stock client (\`@x402/core\`) refuses any
   single payment above ${CLIENT_CAP_LABEL} by default, on your side and
   before signing. ${blocked} of this store's ${priced} priced doors sit
   above it; raise \`maxAmountPerPayment\` if you mean to buy one.
4. **Optional local tooling, none of it required:**
${tooling}
5. **Then:** the catalog at ${base}/menu.json, the contract at
   ${base}/openapi.json, the MCP door at ${base}/mcp, the onboarding
   skill at ${base}/skill.md, the operational manual at ${base}/agents.md.`;
}

/** The same checklist in one sentence, for fields with a token budget. */
export function beforeYouStartSentence(base: string, env?: PaymentNetworkConfig): string {
  const { blocked, priced } = spendCapCounts();
  return `Before you start: free instruments need only plain HTTPS (no account, key or SDK); a purchase needs an x402 v2 client and a wallet holding USDC on ${prerequisiteNetworks(env)}, paid only on a network the 402 offers; the stock client refuses payments above ${CLIENT_CAP_LABEL} by default and ${blocked} of ${priced} priced doors sit above it; optional tooling (scvd-tab, the MCP stdio bridge, the scvd CLI) is listed at ${base}/agents.md and none of it is required.`;
}
