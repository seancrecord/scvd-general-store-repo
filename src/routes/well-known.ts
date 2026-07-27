import { Hono } from "hono";
import {
  factBlockText,
  listingSpec,
  SPEC_SCHEMA_PATH,
} from "@/lib/listing-spec";
import { buyInputSchema } from "@/lib/bazaar-discovery";
import { PENNY_PAGE_USDC, priceTiersUsdc } from "@/lib/payments";
import { listIssues } from "@/services/gazette";
import {
  MENU_ITEMS,
  STORE_METADATA,
  STORE_SERVICE_NAME,
  STORE_TAGS,
} from "@/store";
import { ALMANAC_ENTRIES } from "@/store/almanac";
import { SCHEDULING_SIGNALS } from "@/store/spec";
import type { Env, HonoEnv } from "@/types";

/**
 * Origin-hosted x402 discovery. The core x402 spec doesn't define a
 * well-known document yet (it's an open foundation proposal), so this
 * follows the de-facto indexer contract: a minimal list at
 * /.well-known/x402 and a richer catalog at /.well-known/x402.json —
 * scanners fetch one or the other, so we serve both.
 */
export const wellKnownRoutes = new Hono<HonoEnv>();

async function paidResourceUrls(env: Env): Promise<string[]> {
  const base = env.STORE_BASE_URL;
  const urls = MENU_ITEMS.map((item) => `${base}/api/buy/${item.id}`);
  for (const entry of ALMANAC_ENTRIES) {
    urls.push(`${base}/almanac/${entry.slug}`);
  }
  const issues = await listIssues(env).catch(() => []);
  for (const issue of issues) {
    urls.push(`${base}/gazette/issue-${issue.issue_number}`);
  }
  return urls;
}

wellKnownRoutes.get("/.well-known/x402", async (c) => {
  return c.json({
    version: 1,
    resources: await paidResourceUrls(c.env),
  });
});

wellKnownRoutes.get("/.well-known/x402.json", async (c) => {
  const base = c.env.STORE_BASE_URL;
  // C1: the fact block tops every catalog entry; S1: the uniform spec
  // rides each resource (indexers that don't know the field ignore it).
  const menuResources = MENU_ITEMS.map((item) => ({
    resourceUrl: `${base}/api/buy/${item.id}`,
    method: "GET",
    x402Version: 2,
    description: `${factBlockText(item)} ${item.name}, ${item.description}`,
    mimeType: "application/json",
    price_usdc_options: priceTiersUsdc(item),
    pricing: item.pricing,
    fulfillment: item.fulfillment,
    // The same schema Bazaar, the MCP tools, and the listing spec all
    // read, published under the name an indexer looks for. Our own
    // `spec.inputs` says it too, but only to a reader who knows our
    // vocabulary; this one is the standard field. Investigated
    // 2026-07-27: a catalog scoring us on "input schema" was finding
    // nothing here to score.
    inputSchema: { type: "object", ...buyInputSchema(item) },
    spec: listingSpec(item, base),
  }));
  const almanacResources = ALMANAC_ENTRIES.map((entry) => ({
    resourceUrl: `${base}/almanac/${entry.slug}`,
    method: "GET",
    x402Version: 2,
    description: `Keeper's Almanac, "${entry.title}" (${entry.date}).`,
    mimeType: "text/markdown",
    price_usdc_options: [PENNY_PAGE_USDC],
    pricing: "fixed",
    fulfillment: "instant",
  }));
  const issues = await listIssues(c.env).catch(() => []);
  const gazetteResources = issues.map((issue) => ({
    resourceUrl: `${base}/gazette/issue-${issue.issue_number}`,
    method: "GET",
    x402Version: 2,
    description: `The Gazette. Issue no. ${issue.issue_number}: ${issue.title}`,
    mimeType: "text/markdown",
    price_usdc_options: [PENNY_PAGE_USDC],
    pricing: "fixed",
    fulfillment: "instant",
  }));
  return c.json({
    x402Version: 2,
    name: STORE_METADATA.name,
    // Without this, an importer wanting a description falls through to
    // whichever resource it reached first and calls that the store.
    description: STORE_METADATA.description,
    // The short name and the tags a catalog can actually keep; the
    // full name is 37 characters against the 32-character cap the
    // x402 SDK enforces, so it is refused rather than trimmed.
    serviceName: STORE_SERVICE_NAME,
    tags: [...STORE_TAGS],
    iconUrl: `${base}/favicon.svg`,
    network: "eip155:8453",
    // S3 mirror: the scheduling-signals layer, when to reach for the store.
    when_to_use: SCHEDULING_SIGNALS,
    resources: [...menuResources, ...almanacResources, ...gazetteResources],
    openapi: `${base}/openapi.json`,
    catalog: `${base}/menu.json`,
    stats: `${base}/stats`,
    practice_counter: `${base}/try`,
    listing_spec_schema: `${base}${SPEC_SCHEMA_PATH}`,
    signing_key: `${base}/.well-known/scvd-signing-key`,
    mcp: {
      endpoint: `${base}/mcp`,
      transport: "streamable-http",
      note: "tools/list is free; buy_* tools settle x402 in-band via _meta['x402/payment'].",
    },
  });
});
