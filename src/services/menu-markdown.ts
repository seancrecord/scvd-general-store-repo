import { priceTiersUsdc } from "@/lib/payments";
import { STORE_METADATA } from "@/store/metadata";
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
  return item.pricing === "fixed"
    ? `$${item.price_usdc} fixed`
    : `$${item.price_usdc} minimum, pay what it deserves (tiers: ${priceTiersUsdc(
        item,
      )
        .map((tier) => `$${tier}`)
        .join(" / ")})`;
}

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

${item.description}

- **id:** \`${item.id}\`
- **price:** ${priceLine(item)}
- **fulfillment:** ${fulfillmentLine(item)}
- **buy:** \`GET ${base}/api/buy/${item.id}\` (x402 v2; USDC on Base, Polygon, or Solana)
${item.sample_url ? `- **sample:** ${base}${item.sample_url}\n` : ""}${stock}${constraints}
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
