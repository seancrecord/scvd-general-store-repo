import { API_VERSIONS, isRetiring } from "@/store/api-lifecycle";
import { catalogLastUpdated } from "@/lib/freshness";
import { mcpToolCatalog } from "@/lib/mcp-tools";
import { CAPABILITY_QUERY, USE_WHEN } from "@/store/spec";
import { MENU_ITEMS, STORE_SERVICE_NAME, STORE_TAGS } from "@/store";
import { PUBLISHED_DATASETS } from "@/store/datasets";
import { ROOMS } from "@/store/rooms";
import { FEEDS } from "@/routes/feeds";
import { EVIDENCE_TASKS } from "@/services/a2a-evidence";
import { VERIFIER_SERVER_NAME, VERIFIER_TITLE, VERIFIER_TOOLS } from "@/routes/mcp-verifier";

/**
 * AGENTIC RESOURCE DISCOVERY (ARD) — /.well-known/ard.json, and the
 * predecessor path a scanner still asks for.
 *
 * WHAT THIS IS, because the name a scanner reports is not the name the
 * specification uses. An outside readiness pass scored this store 0/1
 * on a REQUIRED `/.well-known/ai-catalog.json`. That is not an
 * RFC 9727 api-catalog (which this store already serves, at
 * /.well-known/api-catalog, and which is a different document for a
 * different question). It is the manifest defined by the Agentic
 * Resource Discovery specification — v0.91, status "Proposal",
 * authored by Google, Microsoft and Hugging Face, Apache-2.0, with an
 * authoritative JSON Schema in the spec repository. A real published
 * standard, not one scanner's convention.
 *
 * AND THE PATH THE SCANNER WANTS IS THE OLD ONE. ARD §5.1 is explicit,
 * and worth quoting because it inverts the finding:
 *
 *   "A consumer resolving a domain's entries MUST fetch
 *    /.well-known/ard.json ... ARD's predecessor specified the path
 *    /.well-known/ai-catalog.json ... a consumer MAY additionally
 *    consult these"
 *
 *   "Publishers publish entries at /.well-known/ard.json ... There is
 *    no need to serve the predecessor path or relation as well ... a
 *    publisher on the predecessor path SHOULD move to ard.json."
 *
 * So the canonical document is ard.json and this store serves that.
 * The predecessor path is served too, byte-identical, for the same
 * reason /.well-known/mcp.json sits beside /.well-known/mcp and three
 * paths carry the A2A card: a reader that knows one fixed path and
 * gets a 404 cannot tell us apart from an origin with nothing to
 * publish. Serving both is conformant — the spec says a publisher
 * need not serve the predecessor, never that it must not — and it
 * costs one route.
 *
 * DERIVED FROM WHAT THE STORE ALREADY DECLARES. Every entry's URL is a
 * surface the api-catalog, the MCP manifest or the A2A card already
 * names; since 2026-09-04 (roadmap C3) that is every record the
 * store publishes — both MCP doors, the evidence agent's card, the
 * HTTP contract and the function-calling tools document, every
 * dataset in PUBLISHED_DATASETS, every feed in FEEDS, the skills —
 * so an agent platform that reads one document learns all of them.
 * The versioned instruments come from API_VERSIONS, the same
 * rows the deprecation policy prints and the routes read before
 * emitting Sunset headers; representative queries come from
 * CAPABILITY_QUERY and USE_WHEN, which exist precisely to hold "the
 * job this does, in the words an agent would search with". Nothing
 * here is a second copy of a fact, so this document cannot disagree
 * with /.well-known/api-catalog about what this origin serves.
 *
 * WHAT IS DELIBERATELY NOT CLAIMED. No entry carries a rating, a
 * score, an endorsement or a certification, because none exists — the
 * same rule the JSON-LD on the item pages follows. `trustManifest`
 * carries only `identity`, the did:web this store already publishes
 * and already signs with, which is exactly the publisher-authority
 * binding §4.5.1 asks for and no more.
 */

/** The revision these entries are written against. */
export const ARD_SPEC_VERSION = "v0.91";

/** Where a conformant consumer MUST look (ARD §5.1). */
export const ARD_WELL_KNOWN_PATH = "/.well-known/ard.json";

/**
 * ARD's predecessor path, served as an alias. Named as a predecessor
 * rather than as an equal so nobody later mistakes it for the
 * canonical one and drops the real path.
 */
export const ARD_PREDECESSOR_PATH = "/.well-known/ai-catalog.json";

/**
 * The link relation §5.1 makes normative for consumers, emitted beside
 * the document so a reader that arrived at any other page can find it
 * without knowing the well-known path at all.
 */
export const ARD_LINK_REL = "ard";

/**
 * Artifact types, as IANA media types (ARD §3.3). These four are the
 * strings the specification itself uses; none is invented here, and
 * the spec's own note says the two card types are de-facto community
 * standards still tracking towards formal registration.
 */
const TYPE_MCP_SERVER = "application/mcp-server-card+json";
const TYPE_A2A_AGENT = "application/a2a-agent-card+json";
const TYPE_SKILL = "application/ai-skill+md";
/** Not from ARD: the de-facto OpenAPI type the api-catalog already uses. */
const TYPE_OPENAPI = "application/openapi+json;version=3.1";
const TYPE_DATASET = "application/ld+json;profile=dataset";
const TYPE_FEED = "application/atom+xml";
const TYPE_TOOLS = "application/json;profile=function-calling-tools";

export interface ArdEntry {
  /** Present only on in-page copies — see ardInPageEntries. */
  "@context"?: string;
  identifier: string;
  displayName: string;
  type: string;
  url: string;
  description?: string;
  representativeQueries?: string[];
  capabilities?: string[];
  tags?: string[];
  version?: string;
  updatedAt?: string;
  trustManifest?: { identity: string };
}

export interface ArdManifest {
  /**
   * NOT A SPEC FIELD, AND SAID SO (scanner finding, 2026-08-28). A
   * scanner reported the manifest "invalid: missing specVersion" —
   * checked against the spec's own ard-entry.schema.json, `entries`
   * is the ONLY required member and specVersion appears nowhere in
   * ARD at all. But the schema sets additionalProperties: true and
   * §5.1 calls extra members "transport-defined", so declaring the
   * revision we publish against is legal, true, and free. The value
   * is the spec document's own version header.
   */
  specVersion: string;
  updatedAt: string;
  trustManifest: { identity: string };
  entries: ArdEntry[];
}

/**
 * The domain-anchored URN of Appendix C: `urn:air:<publisher>:
 * <namespace>:<name>`, where publisher is an FQDN. The publisher is
 * read from the base URL rather than typed, because §4.5.1 binds it to
 * the trust domain in `trustManifest.identity` — a registry rejects an
 * entry whose identifier claims a domain its attestation cannot back,
 * and the two must come from the same place to stay aligned.
 */
function urn(host: string, namespace: string, name: string): string {
  return `urn:air:${host}:${namespace}:${name}`;
}

/**
 * The queries an agent would actually type, taken from the two
 * constants that already hold them.
 *
 * CAPABILITY_QUERY is one line per item, written as the job that item
 * does in an agent's own words; USE_WHEN is the reverse index of
 * situations. Both are already served on /what, /llms.txt and
 * menu.json, so an ARD registry indexing this store learns the same
 * phrasings a reader of those pages does.
 *
 * SHOULD contain 2-5 (ARD §4.2), so this takes the first five and
 * says so rather than emitting everything and hoping.
 */
function shelfQueries(): string[] {
  const fromItems = MENU_ITEMS.map((item) => CAPABILITY_QUERY[item.id]).filter(
    (query): query is string => typeof query === "string" && query.length > 0,
  );
  const fromSituations = USE_WHEN.map((entry) => entry.when);
  return [...fromItems, ...fromSituations].slice(0, 5);
}

export function ardManifest(base: string): ArdManifest {
  const host = new URL(base).host;
  /*
   * The did:web this store already publishes at /.well-known/did.json
   * and already signs its offers and receipts with. Its trust domain
   * is the same host the identifiers are anchored to, which is the
   * whole of what §4.5.1 requires.
   */
  const identity = `did:web:${host}`;
  const trustManifest = { identity };
  const updatedAt = catalogLastUpdated();

  const entries: ArdEntry[] = [
    {
      identifier: urn(host, "server", "general-store"),
      displayName: `${STORE_SERVICE_NAME} — MCP server`,
      type: TYPE_MCP_SERVER,
      url: `${base}/.well-known/mcp`,
      description:
        "The store as a Model Context Protocol server over streamable HTTP. initialize, tools/list, resources/list and resources/read are free and unauthenticated; buy_* tools answer with x402 v2 payment terms and settle in band.",
      /*
       * The tool names the server actually serves, read from the same
       * catalog tools/list returns. A capability token naming a tool
       * that does not exist is worse than none: it is the one field a
       * registry filters on before it fetches anything.
       */
      capabilities: mcpToolCatalog(base).map((tool) => tool.name),
      representativeQueries: shelfQueries(),
      tags: [...STORE_TAGS],
      updatedAt,
      trustManifest,
    },
    {
      identifier: urn(host, "agent", "evidence"),
      displayName: "SCVD Evidence Agent — A2A agent card",
      type: TYPE_A2A_AGENT,
      url: `${base}/.well-known/a2a.json`,
      description:
        `A specialist another agent delegates to when it needs evidence about an x402 door: ${EVIDENCE_TASKS.length} read-only tasks over A2A message/send at /a2a — endpoint preflight, receipt verification, readiness lookup — each answered with one bounded artifact naming what it does not establish. Free; nothing paid; never a ranking. Also served at /.well-known/agent-card.json and /.well-known/agent.json.`,
      capabilities: [...EVIDENCE_TASKS],
      representativeQueries: ["is this x402 endpoint payable before I pay it", "does this x402 receipt verify against the issuer's key", "what does the signed corpus hold about this host"],
      tags: [...STORE_TAGS],
      updatedAt,
      trustManifest,
    },
    {
      identifier: urn(host, "server", "x402-verifier"),
      displayName: `${VERIFIER_TITLE} — MCP server`,
      type: TYPE_MCP_SERVER,
      url: `${base}/mcp/verifier`,
      description:
        `A second MCP door (${VERIFIER_SERVER_NAME}) serving only read-only x402 verification tools under task-shaped names, on the same handlers as the store's full door, with no paid tool reachable. For a client that should never see a shelf.`,
      capabilities: VERIFIER_TOOLS.map((tool) => tool.name),
      representativeQueries: ["preflight an x402 endpoint", "verify an x402 receipt", "look up an endpoint's readiness history", "what does this x402 defect class mean"],
      tags: [...STORE_TAGS],
      updatedAt,
      trustManifest,
    },
    {
      identifier: urn(host, "api", "function-calling-tools"),
      displayName: `${STORE_SERVICE_NAME} — the free instruments as function-calling tools`,
      type: TYPE_TOOLS,
      url: `${base}/openapi-tools.json`,
      description:
        "The free, read-only instruments in the common function-calling shape, one worked call each, derived from the same catalog the MCP door serves. No paid door appears.",
      updatedAt,
      trustManifest,
    },
    ...PUBLISHED_DATASETS.map((dataset) => ({
      identifier: urn(host, "dataset", dataset.path.replace(/^\//, "").replace(/\.json$/, "").replace(/[^a-z0-9]+/gi, "-")),
      displayName: `${dataset.name} — dataset`,
      type: TYPE_DATASET,
      url: `${base}${dataset.path}`,
      description: `${dataset.description} ${dataset.caution}`,
      updatedAt,
      trustManifest,
    })),
    ...FEEDS.map((feed) => ({
      identifier: urn(host, "feed", feed.path.replace(/^\/feeds\//, "").replace(/\.xml$/, "")),
      displayName: `${feed.name} — Atom feed`,
      type: TYPE_FEED,
      url: `${base}${feed.path}`,
      description: `${feed.what} ${feed.cadence}.`,
      updatedAt,
      trustManifest,
    })),
    {
      identifier: urn(host, "api", "http"),
      displayName: `${STORE_SERVICE_NAME} — HTTP API`,
      type: TYPE_OPENAPI,
      url: `${base}/openapi.json`,
      description:
        "Every endpoint this origin serves, as an OpenAPI 3.1 contract: the free instruments (preflight, the conformance desk, verification, the Web Bot Auth check) and the paid shelf, each paid operation carrying its x402 terms.",
      /*
       * The versioned instruments a caller can reach today, from the
       * same rows the deprecation policy prints. A version on its way
       * out is not advertised here as though it were current.
       */
      capabilities: API_VERSIONS.filter((row) => !isRetiring(row)).map(
        (row) => `${row.api} ${row.version}`,
      ),
      representativeQueries: shelfQueries(),
      tags: [...STORE_TAGS],
      updatedAt,
      trustManifest,
    },
    {
      identifier: urn(host, "skill", "general-store"),
      displayName: `${STORE_SERVICE_NAME} — the store skill`,
      type: TYPE_SKILL,
      url: `${base}/skill.md`,
      description:
        "How to transact here, written for an agent: the shelf, the x402 purchase flow, the retry-safety mechanisms, and what the store refuses to do.",
      representativeQueries: shelfQueries(),
      updatedAt,
      trustManifest,
    },
    {
      identifier: urn(host, "skill", "execution-contract"),
      displayName: "Execution contract",
      type: TYPE_SKILL,
      url: `${base}/skills/execution-contract.md`,
      description:
        "The store's published execution-contract skill: what an agent may rely on when it spends money here, and what it may not.",
      updatedAt,
      trustManifest,
    },
  ];

  // The envelope was being computed and dropped — trustManifest and
  // updatedAt existed right here and never left the function. See the
  // interface for why specVersion joins them.
  return { specVersion: ARD_SPEC_VERSION, updatedAt, trustManifest, entries };
}

/**
 * The ARD base context (§4.1). An entry carried as in-page markup
 * SHOULD name it, because generic JSON-LD tooling reading a page has
 * not been told these are ARD entries and cannot apply the base
 * context on its own. An entry inside the well-known manifest does not
 * need it — a consumer that fetched ard.json already knows.
 */
export const ARD_CONTEXT_URL = "https://agenticresourcediscovery.org/context/v1";

/**
 * ARD's predecessor link relation (§5.1), emitted beside `ard` for the
 * same reason the predecessor PATH is served: a consumer built against
 * the older revision honours only this one.
 */
export const ARD_PREDECESSOR_LINK_REL = "ai-catalog";

/**
 * THE HTML LINK TAG (§5.1, mechanism four), for the head of every
 * page this store renders.
 *
 * The well-known path is the mechanism a consumer MUST try; this is
 * the one it MUST honour when it finds it. They are not redundant —
 * a crawler that arrived at some deep page has an HTML document in
 * hand and no reason to go probing well-known paths, and this is the
 * line that tells it there is a manifest at all.
 *
 * Inert in every sense that matters: a <link> in the head renders
 * nothing, so a reader with scripting off, or with images off, or
 * reading the page as text, sees exactly what they saw before.
 */
export function ardLinkTags(base: string): string {
  return [
    `<link rel="${ARD_LINK_REL}" href="${base}${ARD_WELL_KNOWN_PATH}">`,
    `<link rel="${ARD_PREDECESSOR_LINK_REL}" href="${base}${ARD_PREDECESSOR_PATH}">`,
  ].join("\n  ");
}

/**
 * THE ENTRIES AS IN-PAGE MARKUP (§5.1, mechanism two).
 *
 * Same entries, same function, one addition: each node names the ARD
 * base context, because a JSON-LD reader that found these by ordinary
 * web crawling has not been told what they are. The manifest's copies
 * stay terse for the same reason in reverse.
 */
export function ardInPageEntries(base: string): ArdEntry[] {
  /*
   * THE STOREFRONT DOES NOT NAME A ROOM THE KEEPER HELD OFF IT
   * (2026-09-04). These copies ride in the storefront's JSON-LD, and
   * the day every dataset joined the manifest (roadmap C3) the front
   * page named /registry through them, which his standing test
   * caught: a room flagged off the front must be absent from the
   * links and from the structured data both. The well-known manifest
   * keeps every entry; the in-page copies leave out the held rooms.
   */
  const heldOffTheFront = new Set(
    ROOMS.filter((room) => room.on_storefront === false).map((room) => `${base}${room.path}`),
  );
  return ardManifest(base)
    .entries.filter((entry) => !heldOffTheFront.has(entry.url))
    .map((entry) => ({
      "@context": ARD_CONTEXT_URL,
      ...entry,
    })) as ArdEntry[];
}
