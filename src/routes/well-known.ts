import { mcpResourceCatalog } from "@/lib/mcp-resources";
import { evidenceAgentCard } from "@/services/a2a-evidence";
import { MISUSE_CLAUSE, TWO_SEATS_DATED, TWO_SEATS_SENTENCE } from "@/store/copy/doctrine";
import { organizationRef } from "@/lib/jsonld";
import { mcpToolCatalog, specShapedTool } from "@/lib/mcp-tools";
import { apiCatalog, API_CATALOG_MEDIA_TYPE } from "@/lib/api-catalog";
import {
  ARD_LINK_REL,
  ARD_PREDECESSOR_PATH,
  ARD_WELL_KNOWN_PATH,
  ardManifest,
} from "@/lib/ard-catalog";
import {
  DEFAULT_PROTOCOL,
  LATEST_PROTOCOL,
  handleMcpPost,
  MCP_SERVER_VERSION,
  PROTOCOL_VERSIONS,
} from "@/routes/mcp";
import { USE_WHEN } from "@/store/spec";
import { STORE_CONTACT_EMAIL } from "@/store";
import { Hono } from "hono";
import { NOT_AFFILIATED } from "@/store/copy/position";
import {
  factBlockText,
  listingSpec,
  SPEC_SCHEMA_PATH,
} from "@/lib/listing-spec";
import { buyInputSchema } from "@/lib/bazaar-discovery";
import { agentAuthBlock } from "@/store/agent-auth";
import { freshness } from "@/lib/freshness";
import {
  manifestAccepts,
  PENNY_PAGE_USDC,
  acceptedNetworks,
  priceTiersUsdc,
} from "@/lib/payments";
import { listIssues } from "@/services/gazette";
import {
  MENU_ITEMS,
  STORE_METADATA,
  STORE_SERVICE_NAME,
  STORE_TAGS,
} from "@/store";
import { listAlmanacEntries } from "@/services/almanac-store";
import { SCHEDULING_SIGNALS } from "@/store/spec";
import { REFUND_POLICY } from "@/store/refund-policy";
import { STANDARDS_POSTURE } from "@/store/standards";
import { WALLET_SAFETY } from "@/store/wallet-safety";
import conformanceVectors from "../../conformance/offer-receipt-vectors.json";
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
import { PUBLISHED_DATASETS } from "@/store/datasets";
import {
  OPENAI_APPS_CHALLENGE,
  x402listTokenFile,
} from "@/store/site-verification";

/**
 * Origin-hosted x402 discovery. The core x402 spec doesn't define a
 * well-known document yet (it's an open foundation proposal), so this
 * follows the de-facto indexer contract: a minimal list at
 * /.well-known/x402 and a richer catalog at /.well-known/x402.json —
 * scanners fetch one or the other, so we serve both.
 */
export const wellKnownRoutes = new Hono<HonoEnv>();


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
    // The Foundation exists now; a diligence reader will ask. See
    // NOT_AFFILIATED's note for why this is load-bearing, not modesty.
    independence: NOT_AFFILIATED,
    audience:
      "Automated diligence. There is no human-facing version of this page and that is deliberate: the rooms say all of it better. Start at /what.",
    operator: OPERATOR,
    /**
     * Front and center by the keeper's instruction: the strongest
     * legitimacy fact this store has is that verifying it requires no
     * cooperation from it. It was true in the code and absent from
     * every surface a diligence pass reads.
     */
    standards: STANDARDS_POSTURE,
    /**
     * Beside standards because it is the same argument from the
     * buyer's side: the store designed for agents behaving badly in
     * production — the retry loop, the lost session — not just the
     * happy path a demo needs.
     */
    wallet_safety: WALLET_SAFETY,
    /**
     * HOW A READER GETS IN, IN THE DOCUMENT THEY ALREADY HAVE OPEN.
     *
     * "Is there an account? a key? an approval queue?" is the question
     * immediately after "is this real", and a diligence pass that had
     * to fetch a second document to learn the answer would often
     * simply not. The same block the RFC 9728 document carries, from
     * the same constants, so this can no more disagree with
     * /.well-known/oauth-protected-resource than either can disagree
     * with /auth.md.
     */
    agent_auth: agentAuthBlock(base),
    /**
     * Absolute, so a reader following this document never has to
     * resolve a relative path against a base it had to guess.
     */
    /*
     * THE SEATS (2026-09-04): record and reproducible dispute
     * artifact, and never interpretation. Stated where diligence
     * readers look first, in the same words as /criteria.
     */
    seats: {
      dated: TWO_SEATS_DATED,
      record: true,
      dispute_artifact: true,
      interpretation: false,
      sentence: TWO_SEATS_SENTENCE,
      misuse: MISUSE_CLAUSE,
      how_to_consume: `${base}/scorers`,
    },
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
    /**
     * The dead-man beacon: computed and signed per request, carrying
     * infrastructure liveness and the keeper's last provable counter
     * visit as SEPARATE facts. The consumption contract (what to fail
     * closed on) rides the document itself.
     */
    liveness: `${base}/.well-known/liveness.json`,
    /**
     * Track record as a record rather than a request for trust: every
     * human-labor order's promised window vs. actual delivery, and
     * every refund with its tx hash, computed live from the same
     * records fulfillment runs on. The written refund commitment
     * rides the log and /rights.
     */
    fulfillment_log: `${base}/fulfillment-log`,
    refund_policy: REFUND_POLICY,
    independently_checkable: {
      signatures: `${base}/api/verify/{id} — free, no account, forever. Every artifact carries the exact signed bytes and the public key; check with your own ed25519 library. Key history at ${base}/.well-known/scvd-signing-key.`,
      settlement: `Every certificate for a paid purchase binds settlement_tx, the on-chain transaction. Check it on any Base, Polygon, or Solana explorer — whichever rail settled — without asking us.`,
      /**
       * The answer to the obvious objection to the line above: the key
       * history is OUR page, and our page is editable. This one is not
       * a stronger promise from us, it is a commitment made somewhere
       * we cannot reach — which is the only kind worth listing under a
       * heading that says "independently".
       */
      key_history_over_time: `${base}/.well-known/anchor-log.json — an append-only hash chain over the signing-key state, digests submitted to OpenTimestamps and anchored into Bitcoin. Re-hash any snapshot yourself and check the links; one confirmed anchor vouches for the whole history behind it. It proves WHEN, never WHO SHOULD HAVE.`,
      /*
       * ONE HOST OVER TIME IS DELIBERATELY NOT ON THIS LIST, and the
       * whitelist guard in trust-signals.spec is what stopped it from
       * quietly getting on.
       *
       * /corpus/host/{host}.json replays a single host out of the
       * chain, and it is genuinely useful — but it is DERIVED AT READ
       * by our own code. What a stranger can check without us is the
       * corpus ENTRIES, and those are already named right here. A
       * derived view of an anchored record does not inherit the
       * anchoring; the view names each entry's digest so a reader can
       * go check the real thing, which is the honest arrangement.
       */
      the_ecosystem_record: `${base}/corpus.json — the public x402 ecosystem as this store's weekly round observed it, one signed snapshot per round, hash-chained and OTS-stamped, verification steps on the document. It proves the record was not rewritten after the fact; it never scores an operator, ours included. Per host: ${base}/corpus/host/{host}.json, a read-time view over these same entries — it cites the digest of each one so you can check them rather than the view.`,
    },
    limit: TRUST_LIMIT,
  });
});

/**
 * THE MINIMAL DOCUMENT, WHICH WAS TOO MINIMAL TO BE FILED WELL.
 *
 * Until 2026-07-31 this served `{ version, resources }` and nothing
 * else — a bare array of URLs with no name, no description and no
 * tags, while every one of those lived next door in x402.json. An
 * indexer reading THIS one had nothing to file us under.
 *
 * The evidence, and it is evidence rather than proof: x402scan's card
 * for this store reads "x402-compatible service at
 * https://scvd.store/api/buy/hello", categorised `other`. That is a
 * template with a URL substituted into it, which is exactly what a
 * directory produces when the source document gave it no words. The
 * store spent a week making sure its rich surfaces were rich and
 * never checked what the THIN one said about us.
 *
 * ADDITIVE ONLY, and that constraint is the whole design. `version`
 * and `resources` keep their exact shape and position, because this
 * document follows a de-facto contract that scanners parse without
 * negotiating — a reader that ignores unknown keys is unaffected, and
 * a reader that wanted only the URL list still gets exactly the URL
 * list. Nothing is removed and nothing is renamed.
 *
 * IT IS A HYPOTHESIS ABOUT ANOTHER SERVICE'S PARSER, recorded as one.
 * We do not know what x402scan reads or how it decides a category,
 * and this store's own environment cannot reach it to look. What we
 * do know is that we were handing a document with no words in it to
 * something that produces descriptions, which is a defect whatever
 * fixes the listing.
 */
wellKnownRoutes.get("/.well-known/x402", async (c) => {
  const base = c.env.STORE_BASE_URL;
  return c.json({
    version: 1,
    resources: await structuredPaidResources(c.env),
    name: STORE_SERVICE_NAME,
    description: STORE_METADATA.description,
    tags: [...STORE_TAGS],
    // ADDITIVE ONLY (see the header comment): `network` keeps its
    // original single-string shape for readers that learned it;
    // `networks` carries every rail the till currently accepts.
    network: "eip155:8453",
    networks: acceptedNetworks(c.env),
    /**
     * The richer document, named from the thinner one. An indexer that
     * started here should not have to guess that a second, fuller
     * catalog exists beside it.
     */
    catalog: `${base}/.well-known/x402.json`,
    signing_key: `${base}/.well-known/scvd-signing-key`,
    trust: `${base}/.well-known/trust.json`,
    did: `${base}/.well-known/did.json`,
    liveness: `${base}/.well-known/liveness.json`,
    anchor_log: `${base}/.well-known/anchor-log.json`,
    a2a: `${base}/.well-known/a2a.json`,
  });
});

/**
 * ONE BUILDER, BOTH SURFACES (2026-08-26, after a verified outside
 * diagnosis). /.well-known/x402 served `resources` as bare URL strings
 * while the catalog beside it served structured objects — same tools,
 * two incompatible shapes, and neither carried accepts. Crawlers parse
 * the well-known path first, found nothing structured, and indexed the
 * store as a known origin that never resolves as routable tools. Both
 * routes now render this list, and the accepts derive from railAccepts
 * — the till's own terms — so the manifest cannot drift from the
 * money path. The shape change is deliberate and breaking for readers
 * that learned the bare-string list; the additive-only law yields here
 * because the old shape was the reason nothing could route to us.
 */
async function structuredPaidResources(env: Env) {
  const base = env.STORE_BASE_URL;
  /*
   * `resource`, `type` and `lastUpdated` are the standard
   * discovered-resource record's field names (the Bazaar list shape);
   * `resourceUrl` stays beside `resource` for every reader that
   * learned our earlier spelling. lastUpdated is the catalog's own
   * as_of — the newest hand-checked date — not a fabricated
   * per-entry timestamp.
   */
  const lastUpdated = freshness().as_of;
  // C1: the fact block tops every catalog entry; S1: the uniform spec
  // rides each resource (indexers that don't know the field ignore it).
  const menuResources = MENU_ITEMS.map((item) => ({
    accepts: manifestAccepts(env, priceTiersUsdc(item)),
    resource: `${base}/api/buy/${item.id}`,
    type: "http",
    lastUpdated,
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
  const almanacResources = (await listAlmanacEntries(env)).map((entry) => ({
    accepts: manifestAccepts(env, [PENNY_PAGE_USDC]),
    resource: `${base}/almanac/${entry.slug}`,
    type: "http",
    lastUpdated,
    resourceUrl: `${base}/almanac/${entry.slug}`,
    method: "GET",
    x402Version: 2,
    description: `Keeper's Almanac, "${entry.title}" (${entry.date}).`,
    mimeType: "text/markdown",
    price_usdc_options: [PENNY_PAGE_USDC],
    pricing: "fixed",
    fulfillment: "instant",
  }));
  const issues = await listIssues(env).catch(() => []);
  const gazetteResources = issues.map((issue) => ({
    accepts: manifestAccepts(env, [PENNY_PAGE_USDC]),
    resource: `${base}/gazette/issue-${issue.issue_number}`,
    type: "http",
    lastUpdated,
    resourceUrl: `${base}/gazette/issue-${issue.issue_number}`,
    method: "GET",
    x402Version: 2,
    description: `The Gazette. Issue no. ${issue.issue_number}: ${issue.title}`,
    mimeType: "text/markdown",
    price_usdc_options: [PENNY_PAGE_USDC],
    pricing: "fixed",
    fulfillment: "instant",
  }));
  return [...menuResources, ...almanacResources, ...gazetteResources];
}

wellKnownRoutes.get("/.well-known/x402.json", async (c) => {
  const base = c.env.STORE_BASE_URL;
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
    // `network` keeps its learned single-string shape; `networks` is
    // the honest list once the second rail's door is open.
    network: "eip155:8453",
    networks: acceptedNetworks(c.env),
    // S3 mirror: the scheduling-signals layer, when to reach for the store.
    when_to_use: SCHEDULING_SIGNALS,
    resources: await structuredPaidResources(c.env),
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
    /**
     * did:web, the identity the x402 Signed Offers & Receipts
     * extension resolves to find a signer's key. Named beside the
     * signing key because a reader taking one should be able to reach
     * the other without guessing the convention.
     */
    did: `${base}/.well-known/did.json`,
    /**
     * For implementers who land here first: the offer-receipt test
     * vectors, and the standards block in trust.json that explains
     * how to verify this store with no scvd.store code involved.
     */
    /**
     * The two differentiators, beside the key for the same reason
     * everything else here is: a reader taking our catalog is exactly
     * the reader who should know the free desk checks ANY issuer's
     * signed offers and receipts, and that the weekly signed record
     * of the neighbourhood is free to read.
     */
    conformance: `${base}/api/conformance/v1`,
    conformance_landing: `${base}/conformance`,
    corpus: `${base}/corpus.json`,
    corpus_landing: `${base}/corpus`,
    /**
     * Ecosystem research reports (2026-08-19): signed, free, every
     * number re-derivable from raw evidence committed in the public
     * repository. The first is the August field run — the whole
     * walkable Bazaar paid with the store's own wallet.
     */
    /**
     * WITHDRAWN 2026-08-20 and still served, notice first: a machine
     * that already has this URL must be able to learn it was pulled.
     */
    reports: `${base}/api/report/x402-ecosystem-2026-08`,
    reports_note:
      "The August 2026 field run was withdrawn on 2026-08-20, one day after publication: its largest failure class was attributed to sellers and its own ledger supports that for about 3% of it. The URL still answers, withdrawal notice first, original text unedited. Do not quote its failure rates.",
    /**
     * The two doors where money moves OUTWARD (2026-08-20): paid
     * mystery shopping, and the regulars' rebate. Both free to read,
     * both paying in signed EIP-3009 authorizations the holder
     * redeems themselves — discovery documents should carry the
     * surfaces an agent would never think to look for.
     */
    bounty_board: `${base}/api/bounties`,
    store_credit: `${base}/api/credit/{wallet}`,
    conformance_vectors: `${base}/.well-known/conformance/offer-receipt-vectors.json`,
    /**
     * The dead-man beacon, same reason as the key and the attestation:
     * an operator deciding whether to honour our receipts is exactly
     * the reader who needs a signal to fail closed on when this store
     * stops answering.
     */
    liveness: `${base}/.well-known/liveness.json`,
    /**
     * Beside the key history for the reason the key history needs it:
     * a self-hosted registry is editable after the fact, and this is
     * the externally timestamped chain that bounds how far back it
     * could quietly have been rewritten.
     */
    anchor_log: `${base}/.well-known/anchor-log.json`,
    pulse: `${base}/pulse.json`,
    /**
     * The public weekly tally of the neighbourhood itself (2026-08-19):
     * how many listed x402 doors work, how many serve verifiable
     * offers, what the market charges. Aggregates only, no names,
     * published by the keeper's hand from the same census that mints
     * the corpus. JSON at the same URL via Accept.
     */
    registry: `${base}/registry`,
    /**
     * THE DATASET CATALOGUE (2026-08-29, the keeper's question about
     * whether an agent can actually find any of this).
     *
     * An agent could find the SHOP the moment it arrived — menu.json,
     * this document, the OpenAPI contract all announce what is for
     * sale. It could find the EVIDENCE only by luck: /registry and
     * /corpus.json happened to be named above, /inflows, /fresh-set
     * and /defects.json were named nowhere a machine looks, and
     * nothing anywhere said "these are the datasets, here is what
     * each one is and what it must not be read as".
     *
     * A store whose whole argument is its evidence had a
     * machine-readable catalogue of its products and none of its
     * findings. Each entry carries its own caution, because a reader
     * choosing which dataset to pull should learn what it is NOT
     * before it spends a request finding out.
     */
    datasets: PUBLISHED_DATASETS.map((dataset) => ({
      name: dataset.name,
      url: `${base}${dataset.path}`,
      description: dataset.description,
      caution: dataset.caution,
      cadence: dataset.cadence,
      format: "JSON on the same URL via Accept: application/json; HTML otherwise",
    })),
    /* The goal-first map of the whole store. Experimental; see
     * src/store/atlas.ts for why it exists and how we will know
     * whether it was worth serving. */
    atlas: `${base}/atlas.json`,
    corrections: `${base}/corrections`,
    mcp: {
      endpoint: `${base}/mcp`,
      transport: "streamable-http",
      note: "tools/list is free; buy_* tools settle x402 in-band via _meta['x402/payment'].",
    },
  });
});

/**
 * THE CONFORMANCE VECTORS, SERVED — because "test your verifier
 * against us" only works if an implementer can fetch the vectors from
 * the store itself rather than hunting a repo. Bundled at build time
 * from conformance/offer-receipt-vectors.json, the same committed file
 * the test suite verifies independently, so this route cannot drift
 * from what the tests prove.
 */
wellKnownRoutes.get(
  "/.well-known/conformance/offer-receipt-vectors.json",
  (c) => {
    const base = c.env.STORE_BASE_URL;
    return c.json({
      /*
       * A DATASET, because that is what a regenerable set of
       * known-good and known-bad fixtures is — and because the people
       * who most need to find these are implementers asking a model
       * "what can I test my x402 verifier against." `Dataset` is the
       * vocabulary that question gets answered in.
       *
       * The spread comes FIRST and no `description` is set here: the
       * file already carries one, and the compiler caught the second
       * copy before it shipped. One description serving both readers
       * is the same rule the four store descriptions follow — a second
       * copy is a copy free to drift.
       */
      ...conformanceVectors,
      "@context": "https://schema.org",
      "@type": "Dataset",
      name: "x402 offer-receipt conformance vectors",
      url: `${base}/.well-known/conformance/offer-receipt-vectors.json`,
      creator: organizationRef(base),
      isAccessibleForFree: true,
      conditionsOfAccess: "Free to fetch. No account, no key.",
      distribution: {
        "@type": "DataDownload",
        encodingFormat: "application/json",
        contentUrl: `${base}/.well-known/conformance/offer-receipt-vectors.json`,
      },
      live_counterpart: `${base}/api/buy/hello — a real 402 whose PAYMENT-REQUIRED header carries live signed offers under extensions['offer-receipt'], signed by the production key at ${base}/.well-known/did.json (never the test key in these vectors).`,
      verifier_guidance:
        "Allow a few seconds of clock-skew leeway when comparing validUntil against your own clock — issuance is strict, consumption should be tolerant, and NTP drift on your side against a 300-second window makes small leeway harmless.",
      regenerate:
        "node scripts/generate-conformance-vectors.mjs in the repository reproduces this file byte for byte.",
    });
  },
);

for (const path of [
  "/.well-known/a2a.json",
  "/.well-known/agent-card.json",
  "/.well-known/agent.json",
]) {
  /*
   * THE EVIDENCE AGENT'S CARD (2026-09-03, roadmap A2) replaced the
   * discovery-document card that said "does not speak the A2A message
   * protocol today": it does now, at /a2a, with three read-only tasks
   * in task language. See services/a2a-evidence.ts.
   */
  wellKnownRoutes.get(path, (c) => c.json(evidenceAgentCard(c.env.STORE_BASE_URL)));
}

/**
 * RFC 9116 security.txt — the URL a responsible-disclosure checklist
 * tries first, verified missing on 2026-08-01 (the request fell
 * through to a redirect). Contact is the store's own mailbox rather
 * than an email address: it exists, it is read, and it exposes
 * nothing the keeper has kept private. Expires is computed, not
 * hand-typed, per the derive-or-refuse rule; the RFC wants under a
 * year and this serves exactly half of one, rolling.
 */
/**
 * GET /.well-known/mcp — where the MCP server actually is.
 *
 * The store has run a Streamable HTTP MCP server at /mcp since the
 * skill shipped, and it is listed in Smithery. A readiness audit on
 * 2026-08-21 found the listing and then could not complete a
 * handshake, because nothing at a predictable path said where the
 * endpoint lives — a scanner that does not already know the path has
 * no way to find it, and "listed in a registry" is not the same as
 * "reachable".
 *
 * Descriptive only: this is a pointer, not a second transport. The
 * protocol still happens at /mcp, over POST, exactly as before.
 */
/**
 * TWO PATHS, ONE MANIFEST (2026-08-26).
 *
 * The audit that asked for this document went on reporting "no live
 * MCP protocol handshake" after it shipped, and the handshake was
 * never the problem: POST /mcp answers `initialize` in production,
 * with or without an Accept header, and has since the server opened.
 * What a scanner does with `/.well-known/mcp` is guess — and half of
 * them guess `.json`, because every other well-known document they
 * read carries the extension. That guess returned a 404, and a 404 at
 * the discovery path is indistinguishable from a store with no MCP
 * server at all.
 *
 * So both paths serve the same object. This is the same reasoning
 * /.well-known/a2a.json, /agent-card.json and /agent.json already
 * shipped under, for the same reason.
 */
function mcpManifest(base: string) {
  return {
    /**
     * SEP-2127's schema identifier. The draft names this exact URI as
     * the card's $schema and requires the field; the URI itself 404s
     * today (verified 2026-08-27 — the SEP is Draft status and the
     * schema is not yet published), which is fine for an identifier
     * and will simply start resolving the day they publish it.
     */
    $schema:
      "https://static.modelcontextprotocol.io/schemas/v1/server-card.schema.json",
    /**
     * ⚑ KEEPER: SEP-2127 (Draft) constrains `name` to reverse-DNS
     * with exactly one slash (e.g. "store.scvd/general-store") and
     * would reject this tier-1 identifier as it stands. The naming
     * law governs here, the SEP is a draft, and renaming is a keeper
     * decision — flagged per the C2 instruction ("stop and report
     * rather than rename"), not changed.
     */
    name: "scvd-general-store",
    title: STORE_SERVICE_NAME,
    // Same constant the initialize handler answers with — never a
    // second copy (C2; the scvd-tab 0.2.0/0.3.0 lesson).
    version: MCP_SERVER_VERSION,
    /**
     * THE SAME IDENTITY IN THE OTHER DRAFT'S SPELLING (2026-09-01).
     *
     * There are two live drafts of this document and they disagree
     * about where the server's name and version go. SEP-2127 puts them
     * flat, which is what this card has always done. SEP-1649 nests
     * them under `serverInfo` and marks it REQUIRED — and SEP-1649 is
     * the one Smithery's scanner reads. A card missing the field it
     * calls required is a card that scans as half a server.
     *
     * Both spellings, one source: these are the same two constants the
     * flat fields above use, so the card cannot say two things.
     */
    serverInfo: {
      name: "scvd-general-store",
      version: MCP_SERVER_VERSION,
    },
    /**
     * The card's face (scanner, 2026-08-28: name and description but
     * no icon — the anonymous grey square in a host's picker).
     * SEP-2127 lists icons as optional; the src is the favicon the
     * site already serves, so there is no second asset to go stale,
     * and the test fetches it rather than assuming it answers.
     */
    icons: [
      {
        src: `${base}/favicon.svg`,
        mimeType: "image/svg+xml",
        sizes: ["any"],
      },
    ],
    description:
      "Independent signed observation of x402 endpoints, artifacts and settlements, plus a general store for AI agents. Tools are free to list; purchases are x402 v2 in USDC.",
    // The one field a client actually needs.
    endpoint: `${base}/mcp`,
    /**
     * `url` beside `endpoint`, because the two names are both in the
     * wild and a client reading for one and finding only the other
     * has, as far as it can tell, found a manifest with no server in
     * it. Same string, no second source of truth.
     */
    url: `${base}/mcp`,
    transport: "streamable-http",
    /** The methods the transport actually accepts, spelled out. */
    methods: ["POST"],
    /**
     * WHAT A SCANNER NEEDS TO COMPLETE A HANDSHAKE WITHOUT GUESSING.
     * The protocol versions this server will negotiate, the exact
     * body that starts one, and the plain fact that nothing is
     * required to make the call — no key, no account, no header.
     */
    protocol_versions: [...PROTOCOL_VERSIONS],
    authentication: {
      required: false,
      note: "No key, no account, no header. tools/list, resources/list and resources/read are free; buy_* tools answer with x402 v2 payment terms in error.data and settle per call.",
    },
    /**
     * THE MODERN WAY IN (2026-07-28): no handshake, the version and
     * the caller's identity ride `_meta` on every request, and
     * `server/discover` answers what `initialize` used to. Printed
     * beside the legacy handshake, not instead of it, because both
     * eras of client are on the porch and this card is read by both.
     */
    discover: {
      method: "POST",
      url: `${base}/mcp`,
      headers: {
        "Content-Type": "application/json",
        "MCP-Protocol-Version": LATEST_PROTOCOL,
        "Mcp-Method": "server/discover",
      },
      body: {
        jsonrpc: "2.0",
        id: 1,
        method: "server/discover",
        params: {
          _meta: {
            "io.modelcontextprotocol/protocolVersion": LATEST_PROTOCOL,
            "io.modelcontextprotocol/clientCapabilities": {},
            "io.modelcontextprotocol/clientInfo": {
              name: "your-client",
              version: "1.0.0",
            },
          },
        },
      },
    },
    handshake: {
      method: "POST",
      url: `${base}/mcp`,
      headers: { "Content-Type": "application/json" },
      body: {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: DEFAULT_PROTOCOL,
          capabilities: {},
          clientInfo: { name: "your-client", version: "1.0.0" },
        },
      },
    },
    /** The methods that answer without payment, so a scanner knows what to probe. */
    free_methods: [
      "server/discover",
      "initialize",
      "ping",
      "tools/list",
      "resources/list",
      "resources/read",
      "prompts/list",
    ],
    capabilities: {
      tools: true,
      // Stocked since 2026-08-21 — see lib/mcp-resources.ts.
      resources: true,
      prompts: false,
    },
    /**
     * THE SHELVES THE CARD FORGOT TO MENTION (2026-09-01).
     *
     * This card listed six resources and declared `capabilities.tools:
     * true` — and then named no tools. A reader that takes the card as
     * the catalog, rather than as a pointer to one, therefore found a
     * server with six resources and nothing to call. Smithery is such
     * a reader: its scan log says "Using .well-known/mcp/server-
     * card.json: (6 resources)" and it never calls tools/list at all.
     *
     * WHICH MAKES THE 08-30 PATH ALIAS THE CAUSE. Serving this object
     * at /.well-known/mcp/server-card.json closed a 404 that read as
     * absence — and handed a card with no tools in it to the one
     * scanner that had been reading them off the live server. The
     * store's capability score went 97 to 60 on a commit that touched
     * no tool. A discovery surface that answers is worse than one that
     * 404s if it answers with less than the server has.
     *
     * Generated from `mcpToolCatalog`, the same function /mcp serves
     * tools/list from, so there is no second list to drift. Projected
     * through `specShapedTool` — see the reasoning there for why the
     * card, alone among the surfaces, gets spec fields and nothing
     * else.
     */
    tools: mcpToolCatalog(base).map(specShapedTool),
    resources: mcpResourceCatalog().map((resource) => ({
      uri: resource.uri,
      name: resource.name,
      title: resource.title,
      mimeType: resource.mimeType,
    })),
    /**
     * Declared empty, not omitted: `capabilities.prompts` is false and
     * prompts/list answers with an empty array, so the card says the
     * same thing in the third place a reader might look.
     */
    prompts: [],
    documentation: `${base}/developers`,
    openapi: `${base}/openapi.json`,
  };
}

/**
 * TWO METHODS, TOO (2026-08-26).
 *
 * GET is the manifest, unchanged and byte-for-byte what it was. POST
 * completes an actual MCP handshake, because that is what clients do
 * here whether or not the document tells them to: a scanner POSTed
 * `initialize` at this path, took the 405, and reported the store as
 * having "no live protocol handshake" — against a server that has
 * answered `initialize` at /mcp since it opened.
 *
 * The full reasoning, including why this is direct handling rather
 * than a 307, is on `handleMcpPost` in routes/mcp.ts. The short
 * version: the client this exists for is the one that ignored a
 * 405 body, and that client cannot be trusted to follow a redirect
 * with its body intact either.
 *
 * `handleMcpPost` is imported, not reimplemented. There is one MCP
 * server behind three URLs, so it is not possible for these paths to
 * negotiate a different protocol version than /mcp does.
 */
/*
 * THE THIRD SPELLING, ADDED 2026-08-30 FOR THE SAME REASON AS THE
 * SECOND. A discoverability scan looked for the card at
 * /.well-known/mcp/server-card.json — the path the SEP's own filename
 * suggests — and reported this store as having no MCP server card,
 * which is the identical false negative the `.json` alias was added to
 * close. One object, three URLs, one server behind all of them; the
 * cost of a guess being wrong is a 404 that reads as absence, and the
 * cost of covering the guess is this line.
 */
for (const path of [
  "/.well-known/mcp",
  "/.well-known/mcp.json",
  "/.well-known/mcp/server-card.json",
] as const) {
  wellKnownRoutes.get(path, (c) => c.json(mcpManifest(c.env.STORE_BASE_URL)));
  wellKnownRoutes.post(path, handleMcpPost);
}

/**
 * GET /.well-known/ard.json — Agentic Resource Discovery (2026-08-27).
 *
 * The reasoning, the spec quotes and the derivation are all in
 * lib/ard-catalog.ts. In one line: this is a DIFFERENT document from
 * /.well-known/api-catalog, which answers "does this origin have an
 * API and where is it documented" for RFC 9727; this one answers
 * "what agentic resources does this origin publish" for a discovery
 * registry, and lists the MCP server, the A2A card, the HTTP API and
 * the two skills.
 *
 * BOTH PATHS, AND THE OLD ONE IS THE OLD ONE. ARD §5.1 makes
 * /.well-known/ard.json the path a consumer MUST fetch and names
 * /.well-known/ai-catalog.json as its predecessor, which a consumer
 * MAY additionally consult. The predecessor is served here as an
 * alias rather than skipped because a scanner that knows only the old
 * path and gets a 404 cannot tell this origin from one publishing
 * nothing — the same reason /.well-known/mcp.json exists beside
 * /.well-known/mcp. Serving it is not a conformance problem: the spec
 * says a publisher has no NEED to, never that it must not.
 */
for (const path of [ARD_WELL_KNOWN_PATH, ARD_PREDECESSOR_PATH] as const) {
  wellKnownRoutes.get(path, (c) => {
    const base = c.env.STORE_BASE_URL;
    /*
     * The link relation §5.1 makes normative for consumers, on the
     * document itself, always pointing at the CANONICAL path — so a
     * reader that arrived at the predecessor is told where the real
     * one is rather than left on it.
     */
    c.header("Link", `<${base}${ARD_WELL_KNOWN_PATH}>; rel="${ARD_LINK_REL}"`);
    return c.json(ardManifest(base));
  });
}

/**
 * GET /.well-known/api-catalog — RFC 9727.
 *
 * The reasoning is in lib/api-catalog.ts. In one line: /developers
 * answers a person who guesses a URL, and a machine never guesses.
 * This is the fixed path a machine is allowed to know.
 */
wellKnownRoutes.get("/.well-known/api-catalog", (c) =>
  c.body(JSON.stringify(apiCatalog(c.env.STORE_BASE_URL), null, 2), 200, {
    "Content-Type": `${API_CATALOG_MEDIA_TYPE}; charset=utf-8`,
  }),
);

/**
 * GET /.well-known/agent-instructions — WHEN to reach for this store,
 * at a path an agent can guess.
 *
 * The guidance itself is not new and it is not written here: USE_WHEN
 * has carried it since the spec shipped, and /llms.txt renders it
 * under "When you'd use this store" — job-shaped triggers, the items
 * that serve them, and the exact call to make. A readiness audit on
 * 2026-08-21 reported "no agent instruction file with when-to-use
 * guidance found", which was wrong about the store and right about
 * the address: guidance a crawler has to read 200 lines of prose to
 * reach is guidance most crawlers will not reach.
 *
 * Derived from the same array, so this file cannot describe a store
 * the briefing does not. Marketing copy is deliberately absent — the
 * audit's own note is that generic positioning does not read as
 * guidance, and it is right.
 */
wellKnownRoutes.get("/.well-known/agent-instructions", (c) => {
  const base = c.env.STORE_BASE_URL;
  return c.json({
    name: STORE_SERVICE_NAME,
    what_this_is:
      "When to call this store, and with what. Each entry is a situation an agent can actually be in, the items that answer it, and the request to make.",
    when_to_use: USE_WHEN.map((entry) => ({
      situation: entry.when,
      items: entry.items,
      example_request: entry.example,
    })),
    when_not_to_use:
      "If none of those situations is yours, you do not need this store today. Nothing here is a subscription and nothing renews itself.",
    how_to_call: {
      free: "Plain HTTPS. No account, no key, no signup exists.",
      paid: "GET the item URL, receive HTTP 402 with x402 v2 terms in the PAYMENT-REQUIRED header (base64 JSON), sign one of the offered accepts, retry with the signed payment. One payment per request; settlement is wallet-to-wallet.",
      rails: ["eip155:8453", "eip155:137", "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"],
    },
    full_briefing: `${base}/llms.txt`,
    transaction_manual: `${base}/agents.md`,
    contract: `${base}/openapi.json`,
    documentation: `${base}/developers`,
    catalog: `${base}/menu.json`,
  });
});

/**
 * GET /.well-known/glama.json — the connector ownership claim.
 *
 * Glama carries this store twice: an auto-crawled entry under the
 * REPOSITORY, and a connector page under the registry name
 * store.scvd/general-store. The repo entry is claimed by the root
 * glama.json naming a GitHub maintainer, which this store already
 * ships. The CONNECTOR is claimed a different way — an HTTP challenge
 * that wants Glama's own opaque token served as JSON from the
 * connector's own origin, which is this worker.
 *
 * THE SHAPE IS THEIRS, READ OFF THEIR OWN INSTRUCTION rather than
 * guessed: `$schema` naming the connector schema, and `claim` carrying
 * the glama_claim_ token. The last time something here was written to
 * a spec nobody had read against the reader that consumes it, the
 * answer was a card that declared tools and named none, and it cost
 * 37 points for two days. So: their field names, their token, and no
 * invention beyond that.
 *
 * 404 WHEN UNSET, AND THAT IS THE FEATURE. An unclaimed store serves
 * nothing here, exactly as before this route existed. A claim document
 * carrying an empty or placeholder claim would be a document that
 * fails its own check while looking like it passed — the same class of
 * failure as a card that answers with less than the server has. The
 * token arrives by `wrangler secret put GLAMA_CLAIM`; no redeploy of
 * this file, and nothing to revert if the claim is ever withdrawn.
 *
 * NOT A SECOND SOURCE OF TRUTH ABOUT ANYTHING ELSE. It carries the
 * claim and nothing more: no maintainer list, no tool count, no
 * description. Those live where they already live, and a claim
 * document is not the place to start a third copy of them.
 */
wellKnownRoutes.get("/.well-known/glama.json", (c) => {
  const claim = c.env.GLAMA_CLAIM?.trim();
  if (!claim) return c.notFound();
  return c.json({
    $schema: "https://glama.ai/mcp/schemas/connector.json",
    claim,
  });
});

/**
 * WHO OWNS THIS SERVER, IN THE FORM ONE INDEX ASKED FOR (2026-09-02).
 *
 * VerifyMCP (verifymcp.io) lists both of this repo's registry entries
 * and marks a server "claimed" when the host serving its endpoint
 * publishes an owners.json naming the publisher — checked
 * continuously, so the claim reflects today rather than the day it
 * was filed. Host level, at the root, because every server on this
 * hostname is ours. The address is the one the store already
 * publishes as its contact (STORE_CONTACT_EMAIL); a claim document
 * that named a second address would be a second thing to keep true.
 *
 * Same category as the glama.json claim below it: a proof of control
 * that is useless to anyone who does not already control scvd.store.
 */
wellKnownRoutes.get("/.well-known/owners.json", (c) =>
  c.json({
    $schema: "https://verifymcp.io/schemas/owners.json",
    owners: [STORE_CONTACT_EMAIL],
  }),
);

wellKnownRoutes.get("/.well-known/security.txt", (c) => {
  const base = c.env.STORE_BASE_URL;
  const expires = new Date(Date.now() + 182 * 24 * 3600 * 1000).toISOString();
  return c.text(
    [
      `Contact: ${base}/api/letter`,
      `Expires: ${expires}`,
      `Canonical: ${base}/.well-known/security.txt`,
      `Policy: ${base}/.well-known/trust.json`,
      "Preferred-Languages: en",
      "",
      "# One operator, one ed25519 key; scope and limits at /attestation.",
      "# Found something? The mailbox above is free and read by a human.",
      "# What we got wrong before is on the record at /corrections.",
    ].join("\n"),
    200,
    { "content-type": "text/plain; charset=utf-8" },
  );
});

// x402-list.com domain ownership: proven 2026-08-02 (original
// verification) and 2026-08-11 (listing update), token removed both
// times once it had done its job — a verification nonce that outlives
// its verification is just litter. THIRD round, 2026-08-18: listing
// update adding the six trust-tier endpoints to the monitor and the
// position description. Token expires 72h from issue; REMOVE THIS
// ROUTE once x402-list confirms, same as the last two times.
//
// FOURTH round, 2026-08-24. Request bdf3ad99-18ce-40c9-ac34-6d2978340670.
// The listing update that carries the new identity (evidence
// observatory), the corrected shelf floor, and six verification
// instruments the monitor never had — launch_check among them, which
// is the door their own reliability panel argues for when it says a
// service can 402 correctly and still fail after payment.
//
// THE ROUTE OUTLIVED ITS OWN INSTRUCTION THREE TIMES. Each round said
// remove after confirmation and each round it stayed, so the note is
// FIFTH round, 2026-08-26. Request 873110de-8d0b-4322-8e22-22cc2f211bfb.
// Adds the eleven doors the monitor never had — spot_check ($0.001,
// the shelf floor) among them. The 2026-08-24 token below it replaces
// had expired unverified; the chore ledger above still stands unpaid.
//
// now the fourth copy of an undone chore. Two things this round that
// the last three did not have: the request id above, which lets the
// verification be re-run from their API if the page is lost, and the
// admission that "remove after verification" is a promise this file
// has broken every time it was made. The token that was live until
// today was issued 2026-08-18 and had been expired since roughly the
// 21st — serving a dead nonce at a well-known path for three days is
// litter of exactly the kind the first comment warned about.
// AgentIndex (agents.traderszone.net) domain-ownership token, issued
// 2026-09-01 on a claim the keeper submitted by hand. Their index found
// this store on its own, by walking the Appendix C catalog, and froze
// its crawl on the 07-23/24 copy — it still lists jar_of_tuesday, which
// is where a third of that door's 1196 failed lookups plausibly came
// from. The claim is the only way to make them re-read. Same category
// as the token below: a proof-of-control nonce, useless to anyone who
// does not already control scvd.store. REMOVE once they confirm — and
// the note above about how many times that promise has been broken
// applies to this line too.
wellKnownRoutes.get("/.well-known/agentindex-verify.txt", (c) =>
  c.text("agentindex-verify=aix-9ky116a9nowvdn7c9rifu2d4\n", 200, {
    "content-type": "text/plain; charset=utf-8",
  }),
);

/**
 * THE FIFTH ROUND (2026-09-02), and the last one that needs a hand to
 * end it. The 08-26 token above was still being served today, a week
 * past its 72 hours — the fourth time "removed after verification"
 * was written here and not done. The tokens now live in
 * store/site-verification.ts with their own last day, and this route
 * renders only the live ones; when none is live the file says so.
 * Adding a token is one entry; removing one is nothing.
 */
/**
 * OpenAI plugin directory domain challenge (2026-09-02). The token
 * and the reasoning live in store/site-verification.ts; this route
 * serves exactly the token or a 404, never a body OpenAI's checker
 * could misread as one.
 */
wellKnownRoutes.get("/.well-known/openai-apps-challenge", (c) => {
  if (!OPENAI_APPS_CHALLENGE) {
    return c.text("No OpenAI plugin verification in progress.\n", 404, {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
    });
  }
  return c.text(OPENAI_APPS_CHALLENGE, 200, {
    "content-type": "text/plain; charset=utf-8",
    "cache-control": "no-store",
  });
});

wellKnownRoutes.get("/.well-known/x402list.txt", (c) =>
  c.text(x402listTokenFile(new Date()), 200, {
    "content-type": "text/plain; charset=utf-8",
    "cache-control": "no-store",
  }),
);
