import {
  PREFLIGHT_VERSION,
  PREFLIGHT_VERSION_NEXT,
} from "@/services/preflight";
import { CONFORMANCE_VERSION } from "@/services/conformance";
import { API_VERSIONS, isRetiring } from "@/store/api-lifecycle";
import { STORE_SERVICE_NAME } from "@/store";
import { PUBLISHED_DATASETS } from "@/store/datasets";
import { FEEDS } from "@/routes/feeds";
import { EVIDENCE_TASKS } from "@/services/a2a-evidence";
import { VERIFIER_SERVER_NAME, VERIFIER_TITLE, VERIFIER_TOOLS } from "@/routes/mcp-verifier";
import {
  CLI_PACKAGE,
  CLI_PUBLISHED,
  CLI_REGISTRY_URL,
  CLI_SOURCE_URL,
} from "@/store/cli";

/**
 * /.well-known/api-catalog — RFC 9727, the well-known URI whose whole
 * job is answering "does this origin have an API, and where is it
 * documented?" without anybody guessing a path.
 *
 * WHY IT IS WORTH HAVING WHEN /developers ALREADY EXISTS. A readiness
 * audit searched for this store's developer resources BY NAME and
 * found nothing relevant. The fix in August was an index at the paths
 * a person guesses — /developers, /docs, /api — and that closes the
 * case for a human typing a URL. It does nothing for a machine that
 * never guesses: a scanner either knows a fixed path or it knows
 * nothing. RFC 9727 is that fixed path, and RFC 9264's linkset is the
 * document format it wants.
 *
 * DERIVED, NOT TYPED. The versioned entries come from API_VERSIONS,
 * the same rows the deprecation policy prints and the routes read
 * before emitting Sunset headers — so a battery retired in one place
 * cannot be advertised as current here.
 *
 * THE MEDIA TYPE IS PART OF THE SPEC, not decoration: RFC 9264
 * registers application/linkset+json, and a client that content-sniffs
 * for it and finds application/json has, correctly, not found a
 * linkset.
 */
export const LINKSET_MEDIA_TYPE = "application/linkset+json";

/**
 * RFC 9727 §4: a catalog SHOULD be served with the profile parameter
 * naming the RFC, so a client can tell an API catalog from any other
 * linkset without parsing the body first. We served the bare media
 * type until 2026-08-31, which is correct as far as it goes and stops
 * one step short of the thing that makes the document self-describing.
 */
export const API_CATALOG_MEDIA_TYPE = `${LINKSET_MEDIA_TYPE}; profile="https://www.rfc-editor.org/info/rfc9727"`;

/** The feeds index, a published dataset whose row also lists each feed. */
const FEEDS_INDEX_PATH = "/feeds";

/** RFC 9727's fixed path. The catalog anchors its own index here. */
export const API_CATALOG_PATH = "/.well-known/api-catalog";

interface LinkTarget {
  href: string;
  type?: string;
  title?: string;
}

interface LinkContext {
  anchor: string;
  [relation: string]: string | LinkTarget[];
}

/**
 * One API's row in the catalog.
 *
 * `service-desc` is the machine contract (RFC 8631), `service-doc` the
 * human documentation, `service-meta` the metadata document, `status`
 * the liveness surface. Those four relations are what RFC 9727 §3.1
 * names, and using anything else where one of them fits would make the
 * catalog unreadable by the readers it exists for.
 */
function apiEntry(options: {
  anchor: string;
  title: string;
  desc?: LinkTarget[];
  doc?: LinkTarget[];
  meta?: LinkTarget[];
  status?: LinkTarget[];
  sunset?: LinkTarget[];
  successor?: LinkTarget[];
  /** RFC 4287 §4.2.7.2's relation for a feed of the same resource. */
  alternate?: LinkTarget[];
}): LinkContext {
  const entry: LinkContext = { anchor: options.anchor };
  entry["title"] = options.title;
  if (options.alternate) entry["alternate"] = options.alternate;
  if (options.desc) entry["service-desc"] = options.desc;
  if (options.doc) entry["service-doc"] = options.doc;
  if (options.meta) entry["service-meta"] = options.meta;
  if (options.status) entry["status"] = options.status;
  if (options.sunset) entry["sunset"] = options.sunset;
  if (options.successor) entry["successor-version"] = options.successor;
  return entry;
}

/**
 * THE VERSIONED INSTRUMENTS, ONE ROW EACH, WITH THEIR LIFECYCLE.
 *
 * A catalog that lists a version without saying whether it is on the
 * way out is the shape of the problem the deprecation policy exists to
 * fix. `sunset` and `successor-version` ride here for exactly the rows
 * that carry them — which is none today, and the code that decides is
 * the code the headers use.
 */
function versionedEntries(base: string): LinkContext[] {
  return API_VERSIONS.map((row) =>
    apiEntry({
      anchor: `${base}${row.path}`,
      title: `${row.api} (${row.version}, ${row.status})`,
      desc: [
        {
          href: `${base}/openapi.json`,
          type: "application/openapi+json;version=3.1",
          title: `${STORE_SERVICE_NAME} OpenAPI 3.1 contract`,
        },
      ],
      doc: [
        {
          href: `${base}/developers`,
          type: "text/html",
          title: `${STORE_SERVICE_NAME} developer documentation`,
        },
        {
          href: `${base}/deprecation`,
          type: "text/html",
          title: "API versioning and deprecation policy",
        },
      ],
      ...(isRetiring(row)
        ? {
            sunset: [
              {
                href: `${base}/deprecation`,
                type: "text/html",
                title: "API versioning and deprecation policy",
              },
            ],
          }
        : {}),
      ...(row.successor
        ? {
            successor: [
              { href: `${base}${row.successor}`, title: "The current version" },
            ],
          }
        : {}),
    }),
  );
}

export function apiCatalog(base: string): { linkset: LinkContext[] } {
  const contexts: LinkContext[] = [
      /**
       * THE WHOLE STORE, ANCHORED AT THE ORIGIN. A catalog whose only
       * entries are sub-APIs makes a reader work out that there is a
       * top-level one; this row says so first.
       */
      apiEntry({
        anchor: `${base}/`,
        title: `${STORE_SERVICE_NAME} — HTTP API`,
        desc: [
          {
            href: `${base}/openapi.json`,
            type: "application/openapi+json;version=3.1",
            title: "OpenAPI 3.1 contract, every endpoint",
          },
          {
            href: `${base}/openapi-tools.json`,
            type: "application/json",
            title: "The free instruments as function-calling tools, one worked call each",
          },
        ],
        doc: [
          {
            href: `${base}/developers`,
            type: "text/html",
            title: "Developer documentation",
          },
          {
            href: `${base}/llms.txt`,
            type: "text/plain",
            title: "The agent briefing",
          },
          {
            href: `${base}/agents.md`,
            type: "text/markdown",
            title: "The operational manual — the x402 purchase flow, step by step",
          },
        ],
        meta: [
          {
            href: `${base}/.well-known/x402.json`,
            type: "application/json",
            title: "x402 discovery document: rails, assets, prices",
          },
          {
            href: `${base}/.well-known/agent-instructions`,
            type: "application/json",
            title: "When to reach for this store, and when not to",
          },
        ],
        status: [
          {
            href: `${base}/.well-known/liveness.json`,
            type: "application/json",
            title: "Liveness: what answered, and when it was last checked",
          },
        ],
      }),
      /**
       * MCP IS AN API TOO, and a catalog that omits it hands an agent
       * host the one surface it can actually speak while telling it
       * about the one it cannot.
       */
      apiEntry({
        anchor: `${base}/mcp`,
        title: `${STORE_SERVICE_NAME} — MCP server (Streamable HTTP)`,
        desc: [
          {
            href: `${base}/.well-known/mcp`,
            type: "application/json",
            title: "MCP server manifest: endpoint, transport, free methods, resources",
          },
        ],
        doc: [
          {
            href: `${base}/developers`,
            type: "text/html",
            title: "Developer documentation",
          },
        ],
      }),
      /**
       * THE A2A CARD IS AN API SURFACE TOO, and this catalog omitted
       * it until 2026-08-27 — found by the ARD manifest's cross-check,
       * which requires every resource it publishes to be a resource
       * this catalog already knows about, and found the agent card
       * missing from here rather than extra over there.
       *
       * It is the same argument the MCP row above makes, one protocol
       * over: an agent host that speaks A2A and reads this catalog was
       * being told about the two surfaces it cannot use and not about
       * the one it can.
       */
      apiEntry({
        anchor: `${base}/api/trade/contract`,
        title: `${STORE_SERVICE_NAME} — trade counter (marketplace reseller accounts)`,
        desc: [
          {
            href: `${base}/api/trade/contract`,
            type: "application/json",
            title:
              "The trade contract: the signed order door, the signing dialects, the pricing rule with every price derived, every account's row, every refusal by name",
          },
          {
            href: `${base}/openapi.json`,
            type: "application/openapi+json;version=3.1",
            title: "OpenAPI 3.1 contract, the trade doors included",
          },
        ],
        doc: [{ href: `${base}/trade`, type: "text/html", title: "The Trade Counter" }],
        status: [{ href: `${base}/health`, type: "application/json", title: "Liveness, one line" }],
      }),
      apiEntry({
        anchor: `${base}/.well-known/a2a.json`,
        title: "SCVD Evidence Agent — A2A agent card",
        desc: [
          {
            href: `${base}/.well-known/a2a.json`,
            type: "application/json",
            title: `A2A agent card: ${EVIDENCE_TASKS.length} read-only evidence tasks over message/send at /a2a, nothing paid`,
          },
        ],
        doc: [
          {
            href: `${base}/developers`,
            type: "text/html",
            title: "Developer documentation",
          },
        ],
      }),
      /**
       * THE VERIFIER DOOR (2026-09-04, roadmap C3): the second MCP
       * server, listed as its own API because a host that should
       * never see a shelf is told here which door to open.
       */
      apiEntry({
        anchor: `${base}/mcp/verifier`,
        title: `${VERIFIER_TITLE} — MCP server (${VERIFIER_SERVER_NAME}, read-only tools only)`,
        desc: [
          {
            href: `${base}/mcp/verifier`,
            type: "application/json",
            title: `The door's own document: ${VERIFIER_TOOLS.length} read-only tools by name, the handshake, and the full door beside it`,
          },
        ],
        doc: [
          {
            href: `${base}/mcp.md`,
            type: "text/markdown",
            title: "Which MCP door to use",
          },
        ],
      }),
      ...versionedEntries(base),
      /**
       * THE DATASETS AND THE FEEDS (2026-09-04, roadmap C3). A store
       * whose argument is its evidence listed its APIs here and none
       * of its findings; the ARD manifest names every record, and its
       * cross-check requires this catalog to know each URL first. One
       * row per published dataset, anchored where it lives (JSON on
       * the same URL by Accept, a self-describing envelope held by the
       * machine-readability guard); the feeds index is one of those
       * datasets, and its row carries each feed as an `alternate` in
       * Atom. Both derived from the rosters the guards already walk,
       * so a dataset or a feed added tomorrow is in a row tomorrow.
       */
      ...PUBLISHED_DATASETS.map((dataset) =>
        apiEntry({
          anchor: `${base}${dataset.path}`,
          title: `${dataset.name} — dataset (${dataset.cadence})`,
          desc: [
            {
              href: `${base}${dataset.path}`,
              type: "application/json",
              title: dataset.description,
            },
          ],
          doc: [
            {
              href: `${base}/.well-known/x402.json`,
              type: "application/json",
              title: "The datasets, catalogued with what each must not be read as",
            },
          ],
          ...(dataset.path === FEEDS_INDEX_PATH
            ? {
                alternate: FEEDS.map((feed) => ({
                  href: `${base}${feed.path}`,
                  type: "application/atom+xml",
                  title: `${feed.name}: ${feed.what}`,
                })),
              }
            : {}),
        }),
      ),
      /**
       * The command line, listed as an API surface because that is
       * what it is to anything deciding how to talk to this store.
       *
       * ANCHORED AT THE SOURCE, NOT AT npm, until the publish runs.
       * A linkset is consumed by machines that follow every href they
       * find; an anchor pointing at a registry page that 404s is a
       * dead link inside a document whose entire job is telling other
       * software where things are. `CLI_PUBLISHED` moves it, in one
       * place, on the day it becomes true.
       */
      apiEntry({
        anchor: CLI_PUBLISHED ? CLI_REGISTRY_URL : CLI_SOURCE_URL,
        title: `${STORE_SERVICE_NAME} — official CLI (${CLI_PACKAGE}${
          CLI_PUBLISHED ? ", on npm" : ", source only until the publish runs"
        })`,
        doc: [
          {
            href: `${base}/developers`,
            type: "text/html",
            title: "Developer documentation, including the CLI's commands",
          },
        ],
      }),
  ];

  /**
   * THE CATALOG'S OWN CONTEXT, AND THE RELATION THAT MAKES IT A
   * CATALOG (RFC 9727 §3, added 2026-08-30).
   *
   * Every context above describes ONE api — its service-desc, its
   * service-doc, its lifecycle — which is RFC 8631 doing its job.
   * What was missing is the sentence those contexts are evidence for:
   * that this document, at this URL, is the index OF them. RFC 9727
   * spells that with `item` links anchored at the catalog itself, and
   * a consumer following the spec reads this context first and the
   * per-api ones as the things it points at.
   *
   * Without it the linkset was a pile of descriptions with no stated
   * relationship between them. A scan reported "linkset[0] has no item
   * entries" and it was reading the document correctly — this was a
   * real gap in our RFC 9727 conformance, not a checklist quibble.
   *
   * DERIVED from the same contexts rather than listed by hand, so an
   * api added tomorrow is an item tomorrow and the index cannot come
   * to disagree with what it indexes.
   *
   * FIRST IN THE ARRAY on purpose: a reader taking only linkset[0]
   * gets the index rather than whichever api happened to be built
   * first.
   */
  const index: LinkContext = {
    anchor: `${base}${API_CATALOG_PATH}`,
    title: `${STORE_SERVICE_NAME} — API catalog`,
    item: contexts.map((context) => {
      const title = context["title"];
      return {
        href: String(context["anchor"]),
        ...(typeof title === "string" ? { title } : {}),
      };
    }),
  };

  return { linkset: [index, ...contexts] };
}

/** The paths this catalog names, for the surfaces that link to it. */
export const CATALOG_ANCHOR_PATHS: readonly string[] = [
  "/",
  "/mcp",
  `/api/preflight/${PREFLIGHT_VERSION}`,
  `/api/preflight/${PREFLIGHT_VERSION_NEXT}`,
  `/api/conformance/${CONFORMANCE_VERSION}`,
];
