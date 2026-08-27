import { agentsMd } from "@/routes/agents-md";
import { storeGuideText } from "@/routes/llms";
import { renderMenuMarkdown } from "@/services/menu-markdown";
import { buildFreshSet } from "@/services/fresh-set";
import { MENU_ITEMS } from "@/store";
import { PREFLIGHT_VERSION } from "@/services/preflight";
import { whenToBuyMarkdown } from "@/lib/when-to-buy";
import { AUDIT_CRITERIA_VERSION } from "@/services/service-audit";
import type { Env } from "@/types";

/**
 * THE SHELVES, WHICH TURNED OUT NOT TO BE EMPTY AFTER ALL.
 *
 * Since 2026-08-11 this server declared the `resources` capability and
 * answered `resources/list` with `[]`, on the reasoning that tools were
 * the whole catalog and an honest empty shelf beat a -32601. That was
 * true about the tools and wrong about the store. A readiness audit
 * put it plainly on 2026-08-21: a server that ADVERTISES resources and
 * lists none has made a promise it does not keep, and the fix is
 * either to stop advertising or to stock the shelf.
 *
 * Stocking it is the honest direction, because the premise was the
 * error. This store's entire product is machine-readable evidence
 * served free and forever — the guide, the manual, the catalog, the
 * criteria the audits run against, and the week's routing data. Every
 * one of those is a RESOURCE in the exact sense the protocol means:
 * context a client reads, not an action it takes. They were reachable
 * over HTTPS and invisible to an MCP client, which had to call a tool
 * to be told a URL it then could not fetch through this transport.
 *
 * WHAT IS DELIBERATELY NOT HERE: anything a purchase minted. A
 * certificate, a watch history and an audit report all serve forever
 * at their own URLs, but they belong to whoever bought them, and a
 * resource list is a browsable index. The shelf carries what the store
 * publishes to everyone, and nothing that arrived with a buyer's name
 * on it.
 */

export interface McpResource {
  uri: string;
  name: string;
  title: string;
  description: string;
  mimeType: string;
}

/** The store's own scheme, so a URI is never mistaken for a fetchable page. */
const SCHEME = "scvd";

interface ResourceDefinition extends McpResource {
  /** Produces the body. Async because two of these read live state. */
  read: (env: Env, base: string) => Promise<string> | string;
}

function definitions(): ResourceDefinition[] {
  return [
    {
      uri: `${SCHEME}://guide`,
      name: "store_guide",
      title: "The front door (llms.txt)",
      description:
        "What this store is, what it sells, what it refuses to claim, and how to transact — the full prose briefing an agent reads before deciding whether to spend anything here. The same bytes as GET /llms.txt.",
      mimeType: "text/markdown",
      read: (_env, base) => storeGuideText(base),
    },
    {
      uri: `${SCHEME}://manual`,
      name: "transaction_manual",
      title: "The operational manual (agents.md)",
      description:
        "The step-by-step x402 purchase flow: how a 402 arrives, which fields to sign, how to retry with payment, and what comes back. For an agent executing rather than evaluating. The same bytes as GET /agents.md.",
      mimeType: "text/markdown",
      read: (_env, base) => agentsMd(base),
    },
    {
      uri: `${SCHEME}://catalog`,
      name: "catalog",
      title: "The catalog, with prices and input contracts",
      description:
        "Every item on the shelf: id, price in USDC, what it delivers, whether it is instant or human-fulfilled, and the exact query parameters it requires. The same catalog as GET /menu.json.",
      mimeType: "text/markdown",
      read: (_env, base) => renderMenuMarkdown(MENU_ITEMS, base),
    },
    {
      uri: `${SCHEME}://criteria`,
      name: "preflight_criteria",
      title: "The published conformance criteria",
      description:
        `The named battery every free preflight and every paid audit runs against an x402 endpoint, version ${AUDIT_CRITERIA_VERSION} — each check, what it means, and what a failure does and does not prove. Published so a verdict can be re-derived by anyone rather than taken on trust.`,
      mimeType: "text/markdown",
      read: (_env, base) => criteriaMarkdown(base),
    },
    {
      /*
       * THE ROUTING SURFACE (2026-08-27). Every resource above says
       * what the store is, how to pay it, what is on the shelf or
       * what a check measures. None of them answers the question a
       * model holds at the instant it picks a tool — *I am in this
       * situation, which of your things do I want* — and that is
       * where selection actually fails, silently, because a model
       * that cannot route guesses or leaves rather than asking.
       *
       * Derived from MENU_ITEMS and SHELF_CLUSTERS at read, so a
       * route can never name an item the shelf no longer carries.
       */
      uri: `${SCHEME}://when`,
      name: "which_instrument",
      title: "Which instrument for which job",
      description:
        "A routing table from a caller's situation to the thing that answers it: about to pay an unknown door, handed a signed offer you cannot place, needing a settlement corroborated, needing to catch a door that breaks midweek, needing memory that outlives your context. Leads with the free instrument wherever one answers the job, names what this store declines to do at all, and prints its own gaps — including the two free instruments that are not reachable as MCP tools.",
      mimeType: "text/markdown",
      read: (_env, base) => whenToBuyMarkdown(base),
    },
    {
      uri: `${SCHEME}://fresh-set`,
      name: "fresh_set",
      title: "This week's working x402 doors",
      description:
        "The public x402 endpoints that answered a spec-conformant payment challenge in the latest weekly census, each with the rails it takes, the cheapest USDC ask its own 402 offered, and a link to its signed observation history. Routing data: which doors are worth sending an agent at this week. Dated observations, never scores; failing hosts are counted and never named.",
      mimeType: "application/json",
      read: async (env, base) => {
        const set = await buildFreshSet(env).catch(() => null);
        if (!set) {
          /*
           * An empty census is a real state (the round has not run
           * yet), and it is not an error. Saying so beats throwing.
           */
          return JSON.stringify(
            {
              rows: [],
              note: `No census round has been published yet. The live surface is ${base}/fresh-set.`,
            },
            null,
            2,
          );
        }
        return JSON.stringify(set, null, 2);
      },
    },
  ];
}

/** What `resources/list` answers with — the metadata, never the bodies. */
export function mcpResourceCatalog(): McpResource[] {
  return definitions().map(({ read: _read, ...resource }) => resource);
}

/** The body behind one URI, or null when the shelf does not carry it. */
export async function readMcpResource(
  env: Env,
  base: string,
  uri: string,
): Promise<{ resource: McpResource; text: string } | null> {
  const found = definitions().find((entry) => entry.uri === uri);
  if (!found) return null;
  const { read, ...resource } = found;
  return { resource, text: await read(env, base) };
}

/**
 * The criteria, rendered. Kept beside the resource rather than in the
 * route because the route serves a page and this serves context; both
 * read the same published version constant, so they cannot disagree
 * about which battery is current.
 */
function criteriaMarkdown(base: string): string {
  return `# The published conformance criteria

Version \`${AUDIT_CRITERIA_VERSION}\`.

Every check the free preflight runs, and every check a paid audit
signs, comes from this battery and no other. It is published so that
a verdict this store signs can be re-derived by anyone who disagrees
with it.

- The machine-readable criteria: ${base}/api/preflight/${PREFLIGHT_VERSION}
- Run it free against any endpoint: \`POST ${base}/api/preflight/${PREFLIGHT_VERSION}\` with \`{"url": "..."}\`
- What each artifact class is signed over: ${base}/attestation

What a passing verdict does NOT claim: anything about the endpoint
after the moment it was observed, and anything outside the named
checks. An observation ages from the second it is signed.
`;
}
