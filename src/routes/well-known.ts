import { Hono } from "hono";
import { NOT_AFFILIATED } from "@/store/copy/position";
import {
  factBlockText,
  listingSpec,
  SPEC_SCHEMA_PATH,
} from "@/lib/listing-spec";
import { buyInputSchema } from "@/lib/bazaar-discovery";
import { freshness } from "@/lib/freshness";
import {
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
      settlement: `Every certificate for a paid purchase binds settlement_tx, the on-chain transaction. Check it on any Base explorer without asking us.`,
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
    resources: await paidResourceUrls(c.env),
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
    // `network` keeps its learned single-string shape; `networks` is
    // the honest list once the second rail's door is open.
    network: "eip155:8453",
    networks: acceptedNetworks(c.env),
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
      creator: { "@type": "Organization", name: STORE_SERVICE_NAME, url: base },
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

/**
 * THE A2A AGENT CARD (the keeper's call, 2026-08-07: "one file, makes
 * us legible to agent frameworks that read A2A cards — probably table
 * stakes within six months").
 *
 * Served at three doors because the spec moved and readers lag it:
 * /.well-known/agent-card.json is A2A 0.3's canonical path,
 * /.well-known/agent.json was the earlier spec's and is what older
 * frameworks still fetch, and /.well-known/a2a.json is the name the
 * keeper asked for and the discoverable one when a human types it.
 * Same document at all three — the x402/x402.json precedent: scanners
 * fetch one or the other, so serve both and let none of them miss.
 *
 * THE HONESTY PROBLEM, solved in the transport field: this store does
 * NOT speak the A2A task protocol — no message/send, no tasks/get, no
 * SSE streams. A card that named "JSONRPC" at a URL would be inviting
 * A2A calls the till cannot answer, which is a false claim in machine
 * form. So preferredTransport says "MCP", which is TRUE, and which a
 * strict A2A client correctly reads as "a transport I don't speak" —
 * the accurate outcome — while the metadata harvesters this card
 * exists for (name, description, provider, skills) read everything
 * they came for. The deviation is named in the card itself rather
 * than left for a client to discover by erroring.
 *
 * Skills are DERIVED from MENU_ITEMS at render, so this card can no
 * more drift from the shelf than the storefront can — the next item
 * added to the menu is on the card the same request, and a card that
 * hand-listed its skills would be menu.json's stale twin within a
 * month.
 */
function a2aCard(base: string) {
  return {
    protocolVersion: "0.3.0",
    name: STORE_SERVICE_NAME,
    description: `${WHAT_IT_IS} This card is a discovery document: the store's machine doors are MCP (POST ${base}/mcp, tools/list free) and plain x402 HTTP starting at ${base}/llms.txt. It does not speak the A2A message protocol today; if your framework needs a true A2A endpoint, say so at ${base}/api/letter — demand decides what gets built here.`,
    url: `${base}/mcp`,
    preferredTransport: "MCP",
    additionalInterfaces: [
      { url: `${base}/mcp`, transport: "MCP" },
      { url: `${base}/llms.txt`, transport: "HTTP+x402" },
    ],
    provider: {
      organization: OPERATOR.legal_entity,
      url: base,
    },
    version: freshness().as_of,
    documentationUrl: `${base}/llms.txt`,
    capabilities: {
      streaming: false,
      pushNotifications: false,
      stateTransitionHistory: false,
    },
    defaultInputModes: ["application/json"],
    defaultOutputModes: ["application/json"],
    skills: [
      ...MENU_ITEMS.map((item) => ({
        id: item.id,
        name: item.name,
        description: `${item.description} $${item.price_usdc} in USDC over x402 (Base or Solana), delivered first and settled after; GET ${base}/api/buy/${item.id}. Every purchase returns a signed artifact verifiable at ${base}/api/verify/{id}.`,
        tags: ["x402", "usdc", item.fulfillment],
        inputModes: ["application/json"],
        outputModes: ["application/json"],
      })),
      {
        id: "verify",
        name: "Verify any artifact we ever signed",
        description: `Free, no account, forever: GET ${base}/api/verify/{id} returns the exact signed bytes and the ed25519 key. Key history at ${base}/.well-known/scvd-signing-key.`,
        tags: ["free", "verification", "ed25519"],
        inputModes: ["application/json"],
        outputModes: ["application/json"],
      },
    ],
    supportsAuthenticatedExtendedCard: false,
    security: [],
    securitySchemes: {},
    // Ours, not the spec's, and named as such: the one field a strict
    // reader should skip and a curious one should read first.
    x_scvd_note:
      "Payment is x402 v2 in USDC, delivered first and settled after — a delivery that fails takes no money — with no account and no API key; the 402 response itself carries the terms. The card's skills are derived live from the same menu every other surface reads.",
  };
}

for (const path of [
  "/.well-known/a2a.json",
  "/.well-known/agent-card.json",
  "/.well-known/agent.json",
]) {
  wellKnownRoutes.get(path, (c) => c.json(a2aCard(c.env.STORE_BASE_URL)));
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
wellKnownRoutes.get("/.well-known/x402list.txt", (c) =>
  c.text(
    [
      "# x402-list.com domain-ownership token, 2026-08-18 listing update.",
      "# One-time, expires 72h from issue, removed after verification.",
      "x402list-verify-8At8JpSsqS3rsFVNbLqNgVfwqHGKWaQ8H63rOPIzDTs",
    ].join("\n"),
    200,
    { "content-type": "text/plain; charset=utf-8" },
  ),
);
