import { Hono } from "hono";
import {
  factBlockText,
  listingSpec,
  SPEC_SCHEMA_PATH,
} from "@/lib/listing-spec";
import { buyInputSchema } from "@/lib/bazaar-discovery";
import { freshness } from "@/lib/freshness";
import { PENNY_PAGE_USDC, priceTiersUsdc } from "@/lib/payments";
import { listIssues } from "@/services/gazette";
import {
  MENU_ITEMS,
  STORE_METADATA,
  STORE_SERVICE_NAME,
  STORE_TAGS,
} from "@/store";
import { listAlmanacEntries } from "@/services/almanac-store";
import { SCHEDULING_SIGNALS } from "@/store/spec";
import {
  DATA_HANDLING,
  EXTERNAL_RECORDS,
  NOT_CLAIMED,
  OPERATOR,
  RECORDS_NOT_LISTED,
  TRUST_ANSWERS,
  TRUST_LIMIT,
  TRUST_STANDFIRST,
  WHAT_IT_IS,
} from "@/store/trust-signals";
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
  // Both sources: a page written from the office is as real as a page
  // compiled in, and discovery is where "real" is decided by outsiders.
  for (const entry of await listAlmanacEntries(env)) {
    urls.push(`${base}/almanac/${entry.slug}`);
  }
  const issues = await listIssues(env).catch(() => []);
  for (const issue of issues) {
    urls.push(`${base}/gazette/issue-${issue.issue_number}`);
  }
  return urls;
}

/**
 * THE TRUST DOCUMENT, AT THE URL A CHECKLIST LOOKS FOR.
 *
 * Machine eyes only, by the keeper's instruction and it is the right
 * call: not in ROOMS, not in the nav, not linked from the storefront,
 * never shown to a human. The public rooms already say all of this in
 * a voice worth reading, and a conventional trust page in
 * conventional language would be a duller second copy of pages that
 * already exist.
 *
 * It exists because an automated diligence pass does not browse. Three
 * outside models were asked to evaluate this store cold; the one that
 * searches the live web reported it could find no company identity, no
 * contact route, no terms and no independent reputation footprint —
 * accurately, because none of that was at a URL its checklist knew to
 * try, even though every fact was published somewhere better written.
 *
 * NOT NEW CLAIMS. Routing. Every line points at a page that says the
 * same thing at length, and the absences are listed first-person
 * because a trust document listing only strengths is the document a
 * scam would write.
 */
wellKnownRoutes.get("/.well-known/trust.json", (c) => {
  const base = c.env.STORE_BASE_URL;
  return c.json({
    standfirst: TRUST_STANDFIRST,
    what_it_is: WHAT_IT_IS,
    audience:
      "Automated diligence. There is no human-facing version of this page and that is deliberate: the rooms say all of it better. Start at /what.",
    operator: OPERATOR,
    /**
     * Absolute, so a reader following this document never has to
     * resolve a relative path against a base it had to guess.
     */
    where_it_is_written_out: Object.fromEntries(
      Object.entries(TRUST_ANSWERS).map(([question, path]) => [
        question,
        `${base}${path}`,
      ]),
    ),
    /**
     * Records, not endorsements, and each entry says which it is.
     * Empty is an honest state; an invented URL in the one document
     * claiming legitimacy would be the strongest argument against it.
     */
    external_records: EXTERNAL_RECORDS,
    external_records_omitted: RECORDS_NOT_LISTED,
    data_handling: DATA_HANDLING,
    not_claimed: NOT_CLAIMED,
    /**
     * The two facts on this whole page that are not our word, stated
     * as the only two that matter.
     */
    independently_checkable: {
      signatures: `${base}/api/verify/{id} — free, no account, forever. Every artifact carries the exact signed bytes and the public key; check with your own ed25519 library. Key history at ${base}/.well-known/scvd-signing-key.`,
      settlement: `Every certificate for a paid purchase binds settlement_tx, the on-chain transaction. Check it on any Base explorer without asking us.`,
    },
    limit: TRUST_LIMIT,
  });
});

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
  const almanacResources = (await listAlmanacEntries(c.env)).map((entry) => ({
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
    // THE NAMING LAW, tier 2: display name, one string everywhere.
    // The full name is tier 3 and retired from all metadata.
    name: STORE_SERVICE_NAME,
    // Without this, an importer wanting a description falls through to
    // whichever resource it reached first and calls that the store.
    description: STORE_METADATA.description,
    // The short name and the tags a catalog can actually keep; the
    // full name is 37 characters against the 32-character cap the
    // x402 SDK enforces, so it is refused rather than trimmed.
    ...freshness(),
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
    /**
     * Beside the key, deliberately. An indexer that takes signing_key
     * from this document is exactly the reader who should be told what
     * a signature from that key does and does not prove, and until this
     * line existed the answer lived on a page nothing linked to.
     */
    attestation: `${base}/attestation`,
    /**
     * Beside the key and the attestation, for the same reason both are
     * here: an indexer that takes our signing key is the reader who
     * should also know what our receipts commit to and what a buyer
     * owns once they have one. An operator deciding whether to honour
     * an artifact from this store needs both at discovery time, not
     * after somebody has already paid.
     */
    rights: `${base}/rights`,
    trust: `${base}/.well-known/trust.json`,
    pulse: `${base}/pulse.json`,
    corrections: `${base}/corrections`,
    mcp: {
      endpoint: `${base}/mcp`,
      transport: "streamable-http",
      note: "tools/list is free; buy_* tools settle x402 in-band via _meta['x402/payment'].",
    },
  });
});
