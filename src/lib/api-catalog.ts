import {
  PREFLIGHT_VERSION,
  PREFLIGHT_VERSION_NEXT,
} from "@/services/preflight";
import { CONFORMANCE_VERSION } from "@/services/conformance";
import { API_VERSIONS, isRetiring } from "@/store/api-lifecycle";
import { STORE_SERVICE_NAME } from "@/store";
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
}): LinkContext {
  const entry: LinkContext = { anchor: options.anchor };
  entry["title"] = options.title;
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
  return {
    linkset: [
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
      ...versionedEntries(base),
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
    ],
  };
}

/** The paths this catalog names, for the surfaces that link to it. */
export const CATALOG_ANCHOR_PATHS: readonly string[] = [
  "/",
  "/mcp",
  `/api/preflight/${PREFLIGHT_VERSION}`,
  `/api/preflight/${PREFLIGHT_VERSION_NEXT}`,
  `/api/conformance/${CONFORMANCE_VERSION}`,
];
