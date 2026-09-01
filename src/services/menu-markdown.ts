import { artifactClassForItem } from "@/store/attestation-spec";
import { priceTiersUsdc } from "@/lib/payments";
import { STORE_METADATA } from "@/store/metadata";
import { getMenuItem } from "@/store/menu";
import type { MenuItem } from "@/types";

/**
 * Markdown renderings of the menu and single items, served from the
 * catalog routes when the Accept header prefers text/markdown.
 */

export function wantsMarkdown(acceptHeader: string | undefined): boolean {
  return (acceptHeader ?? "").includes("text/markdown");
}

/**
 * EXPORTED SINCE 2026-08-26, when the item pages grew an HTML dialect
 * (house rule 53). A paper page that phrased a price in its own words
 * would be a second source of truth for the one fact on the page a
 * buyer acts on — and it got it wrong on the first try, printing a
 * pay-what-it-deserves minimum as though it were a fixed price.
 */
export function priceLine(item: MenuItem): string {
  return `${amountPhrase(item)}, ${cadenceLine(item)}`;
}

/**
 * THE AMOUNT ON ITS OWN, split out 2026-08-30 when the MCP tool
 * catalog was brought onto this function. A cluster tool lists up to
 * seventeen items in one description, and the store-wide
 * NEVER_AUTO_RENEWS sentence repeated seventeen times would crowd out
 * the facts a planning model is reading the description FOR. So the
 * pieces are separable and the cluster says the store-wide half once,
 * at the bottom, for all of them.
 *
 * Splitting rather than forking is the whole point: priceLine below
 * still composes these two, so the phrasing has exactly one home and
 * a channel that wants half of it takes half of THIS, not a copy.
 */
export function amountPhrase(item: MenuItem): string {
  return item.pricing === "fixed"
    ? `$${item.price_usdc} fixed`
    : `$${item.price_usdc} minimum, pay what it deserves (tiers: ${priceTiersUsdc(
        item,
      )
        .map((tier) => `$${tier}`)
        .join(" / ")})`;
}

/**
 * THE HALF OF THE PRICE THAT WAS NEVER SAID (house rule 57.3,
 * 2026-08-29). "How much" was on every surface; "for how long" was on
 * none of them in a form a caller could read. Four items on this
 * shelf sell a stretch of time and every one of them said so only
 * inside its English description, so an agent holding menu.json could
 * see $5 and had no way to learn it bought a week.
 *
 * It joins priceLine rather than living beside it because priceLine
 * is already the one place the price is phrased — MCP tool listings,
 * the catalog, the markdown menu and the item pages all read it — and
 * a second function would be a second thing to remember to call.
 */
export function cadenceLine(item: MenuItem): string {
  return `${cadencePhrase(item)}; ${NEVER_AUTO_RENEWS}`;
}

/** What the payment buys, without the store-wide sentence after it. */
export function cadencePhrase(item: MenuItem): string {
  return item.cadence === "term"
    ? `covering a ${item.term_days}-day term, one payment`
    : ONE_OFF;
}

/** What a one-off purchase is, in the words the store uses for it. */
export const ONE_OFF = "one-off";

/**
 * THE FLAT ANSWER TO "IS THIS RECURRING", and it is a statement about
 * the architecture rather than a promise about our intentions: this
 * store holds no card, keeps no mandate that can charge again, and
 * has no mechanism by which a second payment could happen without a
 * buyer deciding to make it. A term item expires. That is all it does.
 */
export const NEVER_AUTO_RENEWS =
  "nothing here charges again by itself, ever \u2014 there is no mechanism that could";

/** Exported for the same reason and on the same day as priceLine. */
export function fulfillmentLine(item: MenuItem): string {
  if (item.stocked) {
    return "from the keeper's stocked shelf, instant while stocked; sold out honestly at zero";
  }
  return item.fulfillment === "instant"
    ? "delivered instantly"
    : `fulfilled by a human within ${item.sla_hours ?? 168} hours`;
}

export function renderItemMarkdown(item: MenuItem, base: string): string {
  const constraints = item.constraints?.length
    ? `\nHouse rules: ${item.constraints.join("; ").toLowerCase()}.\n`
    : "";
  const stock =
    item.weekly_inventory !== undefined
      ? `\nStock: ${item.weekly_inventory} per week; a waitlist opens when the shelf empties.\n`
      : "";
  return `# ${item.name}
${item.subtitle ? `\n_${item.subtitle}_\n` : ""}
${item.description}

- **id:** \`${item.id}\`
- **price:** ${priceLine(item)}
- **fulfillment:** ${fulfillmentLine(item)}
- **buy:** \`GET ${base}/api/buy/${item.id}\` (x402 v2; USDC on Base, Polygon, or Solana)
${item.sample_url ? `- **sample:** ${base}${item.sample_url}\n` : ""}${
    artifactClassForItem(item.id)
      ? `- **does not prove:** ${artifactClassForItem(item.id)!.does_not_prove}\n`
      : ""
  }${stock}${constraints}
> ${item.note_402}
`;
}

export function renderMenuMarkdown(
  items: readonly MenuItem[],
  base: string,
): string {
  const rows = items
    .map(
      (item) =>
        `| \`${item.id}\` | ${item.name} | ${priceLine(item)} | ${fulfillmentLine(item)} |`,
    )
    .join("\n");
  return `# ${STORE_METADATA.name}, the menu

| id | item | price | fulfillment |
|---|---|---|---|
${rows}

One item up close: \`GET ${base}/menu/{item_id}\` (this same document knows JSON too, plain Accept gets JSON).
Buying: \`GET ${base}/api/buy/{item_id}\` over x402 v2. Full onboarding at ${base}/skill.md; contract at ${base}/openapi.json.
`;
}

/**
 * A PAID RUNG, PRICED AND DATED FROM THE SHELF (57.3).
 *
 * Read off the menu item rather than typed, so a ladder can never
 * quote a price the shelf has moved — the corrections desk's most
 * frequent customer. `priceLine` is the same function the catalog,
 * the MCP tool list and the item pages use, and since 2026-08-29 it
 * carries the cadence in the same breath as the amount.
 */
export function ladderRung(
  base: string,
  itemId: string,
  why: string,
): Record<string, unknown> | null {
  const item = getMenuItem(itemId);
  if (!item) return null;
  return {
    id: item.id,
    name: item.name,
    why,
    price: priceLine(item),
    price_usdc: item.price_usdc,
    cadence: item.cadence,
    ...(item.term_days !== undefined ? { term_days: item.term_days } : {}),
    buy_url: `${base}/api/buy/${item.id}`,
  };
}
