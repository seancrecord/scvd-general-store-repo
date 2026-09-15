import MCP_MANIFEST from "../../mcp.json";
import PLUGIN from "../../plugin.json";
import SERVER from "../../server.json";
import { mcpToolCatalog } from "@/lib/mcp-tools";
import { FREE_INSTRUMENTS } from "@/lib/instrument-roster";
import { SCVD_AGENT_ID, SCVD_AGENT_REGISTRY } from "@/store/agent-identity";
import { STORE_CONTACT_EMAIL } from "@/store/metadata";

/**
 * THE STORE'S OASF RECORD — the AGNTCY Directory's idea of who we are.
 *
 * Directory (agntcy/dir) is not another human-facing listing. It is a
 * federated registry whose discovery primitive is a TAXONOMY, not
 * prose: routing announcements advertise a content-addressed record
 * plus its skills and domains, and a consumer matches on those names
 * and ids. So the paragraph below is for a reader, and the six
 * taxonomy rows are for the matcher. Padding the rows with everything
 * adjacent to what we do would make us findable under questions we
 * cannot answer, which is the same defect as an unaudited claim.
 *
 * ONE RECORD, ONE NAME, FOR AS LONG AS THE STORE EXISTS. The name is a
 * URL on our own domain because Directory's verifiable-name model
 * binds a record to control of that domain: sign the record with a key
 * published in scvd.store's JWKS and the record can be addressed as
 * `scvd.store/agents/general-store` rather than only by CID. Nothing
 * here does that signing — see registry/agntcy/README.md for the step
 * that needs the keeper's hand and a key that does not yet exist.
 *
 * WHAT IS DERIVED AND WHAT IS NOT. The version, the connections, the
 * tool list, the source locator and the authors are all read from the
 * manifests and the catalogue this repo already keeps, because
 * AT_SCALE rule 1 says a value that lives somewhere else is not
 * retyped. The one class of value that lives UPSTREAM — the OASF
 * taxonomy ids — cannot be derived at build time without a network
 * call, so it takes rule 1's other arm: `npm run oasf:taxonomy:check`
 * refetches every row from agntcy/oasf at the pinned tag, recomputes
 * each id from the uid of each level, and refuses any drift.
 */

/** The OASF schema release this record is authored against. */
export const OASF_SCHEMA_VERSION = "1.1.0";

/**
 * The tag in agntcy/oasf that OASF_DOMAINS and OASF_SKILLS were read
 * from, and that `npm run oasf:taxonomy:check` reads them from again.
 * Moving this without running that check is how the ids go stale: a
 * Directory server validates a record's skills against the taxonomy
 * for the record's OWN declared schema_version, so an id that is
 * correct under 1.1.0 and pasted into a 0.8.0 record is rejected — or,
 * worse, silently matches an unrelated class that happens to sit at
 * the same numeric slot.
 */
export const OASF_TAXONOMY_TAG = "v1.1.0";

/** The record's stable, domain-verifiable name. Never regenerated. */
export const OASF_RECORD_NAME = "https://scvd.store/agents/general-store";

/** That name as a path, for every surface that builds URLs from its own base. */
export const OASF_RECORD_PATH = new URL(OASF_RECORD_NAME).pathname;

/**
 * The record's creation timestamp, fixed rather than `now()`. A record
 * is content-addressed: a timestamp that moves on every cut gives a
 * new CID for an unchanged record, and every routing announcement and
 * signature made against the old one is orphaned for no reason.
 */
export const OASF_RECORD_CREATED_AT = "2026-09-14T00:00:00Z";

/** One row of the OASF taxonomy, as this store declares it. */
export interface OasfClass {
  /** The full hierarchical name a consumer matches on, exact or by prefix. */
  name: string;
  /** The id OASF derives by concatenating the uid of each level. */
  id: number;
  /** Why the store claims this row. Read by a human; never by a matcher. */
  why: string;
}

/**
 * THE DOMAINS — fields of application, two of them.
 *
 * `finance_and_business/fintech` (206) also fits and is deliberately
 * not here: it is the broader parent of what we do, and a consumer who
 * matched us on it would learn less than one who matched on payments.
 */
export const OASF_DOMAINS: readonly OasfClass[] = [
  {
    name: "finance_and_business/payments",
    id: 207,
    why: "OASF defines this as payment processing, gateways and transaction infrastructure. x402 is exactly that, and this is the most precise row the taxonomy has for it.",
  },
  {
    name: "technology/blockchain",
    id: 109,
    why: "Settlement is observed on-chain, and the rails an order can be paid on are chains.",
  },
] as const;

/**
 * THE SKILLS — four, and the two that were left out on purpose.
 *
 * `governance_compliance/compliance_assessment` (1801) reads "assess
 * compliance against regulations/standards", and check_conformance
 * does assess an issuer's artifacts against published criteria. It is
 * still omitted: in a directory of agents, a governance row is read as
 * a regulatory function, and this store audits protocol conformance,
 * not anybody's legal standing. `cybersecurity/application_security/
 * api_security_testing` is omitted for the same reason — its OASF
 * description is authorization gaps and injection testing, and a
 * payment-challenge probe is not that. Claiming a nearby class is the
 * same move as an instrument reporting what it did not observe.
 */
export const OASF_SKILLS: readonly OasfClass[] = [
  {
    name: "business_professional/investment_trading/payments_integration",
    id: 120304,
    why: "The closest official payment skill: integrating payment gateways and billing. Preflight, the conformance desk and the paid doors are all this.",
  },
  {
    name: "science_specialized/blockchain_web3/onchain_data_analysis",
    id: 140505,
    why: "Settlement attestations read the chain and say what was and was not there.",
  },
  {
    name: "research_knowledge_productivity/web_search/fact_verification",
    id: 130203,
    why: "OASF: verify claims against sources. That is the whole instrument — a claim, a dated observation, and the gap between them named.",
  },
  {
    name: "tool_use_automation/api_schema_understanding",
    id: 1702,
    why: "A preflight reads an endpoint's 402 challenge and its accepts as a structure, not as prose.",
  },
] as const;

/**
 * THE PARAGRAPH A SELECTING AGENT READS. Shelf copy for this channel,
 * the same way the MCP tool descriptions are shelf copy for theirs:
 * it leads with the evidence function rather than with the shop,
 * because a record's job here is to tell an agent why it belongs in a
 * workflow. It names what the evidence is NOT, because that is the
 * part every directory drops first.
 */
export const OASF_DESCRIPTION =
  "SCVD General Store is an x402 payment-verification and signed-evidence service for autonomous agents. It preflights payment-protected endpoints before spend, checks any issuer's signed x402 offers and receipts against published criteria, observes settlement on-chain, and returns dated ed25519-signed evidence that a third party can verify offline. Every artifact expires and names what was not observed. It is not an escrow, a guarantee, or a ranking. Free instruments — preflight and the conformance desk — answer before any money moves; the paid instruments produce durable third-party evidence. Reachable over MCP at a remote Streamable HTTP endpoint and through an installable stdio bridge.";

/**
 * The MCP tools the store's own roster counts as free instruments —
 * read off lib/instrument-roster, never listed again here. Typed by
 * hand this said three tools, one of which (check_a2a_card) the
 * roster does not carry: the exact drift AT_SCALE rule 1 exists for,
 * shipped inside the annotation that was supposed to answer "what can
 * I try without paying".
 */
export function oasfFreeInstrumentTools(): string[] {
  const prefix = "mcp:tool:";
  return FREE_INSTRUMENTS.map((entry) => entry.prefix)
    .filter((surface) => surface.startsWith(prefix) && surface.length > prefix.length)
    .map((surface) => surface.slice(prefix.length))
    .sort();
}

/**
 * Annotations: cross-links and protocol facts the taxonomy cannot
 * carry. OASF types these as string→string, so a list is a joined
 * string rather than an array; the join is the only formatting here.
 *
 * THE ERC-8004 CROSS-LINK, COMPOSED RATHER THAN COPIED. The value is
 * the registry string the ERC defines — `{namespace}:{chainId}:
 * {identityRegistry}` — with the token id after it, both read off
 * store/agent-identity where the store already keeps them.
 * Written out by hand it would be a 40-character checksummed address
 * in a second place, and an address that is wrong in one copy is the
 * kind of error nobody finds by reading.
 *
 * WHAT IT CLAIMS AND WHAT IT DOES NOT. It says this record and agent
 * 86957 are the same party, which `ownerOf(86957)` settles against
 * Base without asking us. It does not say the registration is fully
 * configured: as of 2026-09-14 the on-chain `tokenURI` still points at
 * the bare origin rather than the registration file, and explorers
 * reading the agent as "Unconfigured" are right to (docs/
 * ERC8004_AGENT_86957.md). A cross-link is not a status claim, and
 * this one would be false if it were dressed as one.
 */
export const OASF_ANNOTATIONS: Readonly<Record<string, string>> = {
  "scvd.payment.protocol": "x402",
  "scvd.service.role": "observer,verifier,merchant",
  "scvd.evidence.model": "signed,dated,expiring,offline-verifiable",
  "scvd.evidence.not": "escrow,guarantee,ranking",
  "scvd.free.instruments": oasfFreeInstrumentTools().join(","),
  "scvd.oasf.taxonomy_source": `https://github.com/agntcy/oasf/tree/${OASF_TAXONOMY_TAG}`,
  "scvd.erc8004.identity": `${SCVD_AGENT_REGISTRY}/${SCVD_AGENT_ID}`,
};

/**
 * The store's Agent Skill, published so that Directory's `dirctl
 * install` lands the operational knowledge beside the connector. The
 * name and sentence are held to skills/scvd-x402-verification/SKILL.md
 * by test/oasf-record.spec.ts rather than read from it at build time:
 * the Workers bundle and the vitest pool disagree about `.md` imports
 * (AGENTS.md), and a manifest is not worth that argument.
 */
export const OASF_AGENT_SKILL = {
  name: "scvd-x402-verification",
  file: "skills/scvd-x402-verification/SKILL.md",
  description:
    "Check an x402 endpoint before paying it, and check the receipt after. Free instruments first; a paid signed observation only when durable third-party evidence is actually needed.",
} as const;

/**
 * mcp.json's servers, widened. The manifest's two entries have
 * different shapes (one remote, one stdio) and TypeScript infers a
 * union that cannot be indexed; this says what the file is once,
 * rather than branching on it at every use.
 */
const MCP_SERVERS = MCP_MANIFEST.mcpServers as Record<
  string,
  { type: string; url?: string; command?: string; args?: readonly string[] }
>;

export interface OasfMcpConnection {
  type: string;
  url?: string;
  command?: string;
  args?: string[];
}

/**
 * BOTH TRANSPORTS, AND WHY THE BRIDGE IS NOT LEGACY BAGGAGE.
 * `dirctl install` derives its MCP entry through OASF-SDK's Copilot
 * translator, whose OASF 1.x path skips every connection that is not
 * stdio. A record carrying only the remote endpoint can therefore be
 * valid, pushable and exportable, and still install as nothing. The
 * remote door is the better interface; `scvd-tab` is what makes the
 * record installable at all, so it moves with the record.
 */
export function oasfMcpConnections(): OasfMcpConnection[] {
  return Object.values(MCP_SERVERS).map((server) => ({
    type: server.type,
    ...(server.url ? { url: server.url } : {}),
    ...(server.command ? { command: server.command } : {}),
    ...(server.args ? { args: [...server.args] } : {}),
  }));
}

/** The server name Directory shows: the remote entry's key in mcp.json. */
export function oasfMcpServerName(): string {
  const remote = Object.entries(MCP_SERVERS).find(([, s]) => s.url);
  if (!remote) throw new Error("mcp.json declares no remote MCP server");
  return remote[0];
}

/** OASF's mcp_server_tool scopes, from the catalogue's own MCP hints. */
function toolScopes(annotations: {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}): string[] {
  const scopes: string[] = [];
  if (annotations.readOnlyHint) scopes.push("read_only");
  if (annotations.destructiveHint) scopes.push("destructive");
  if (annotations.idempotentHint) scopes.push("idempotent");
  if (annotations.openWorldHint) scopes.push("external");
  return scopes;
}

export interface OasfMcpTool {
  name: string;
  title?: string;
  description?: string;
  scopes?: string[];
}

/**
 * THE SHORT FORM, FOR A DIRECTORY (2026-09-14).
 *
 * The catalogue's MCP descriptions are long on purpose — they name the
 * audience, the limits, and what the tool is NOT, because a client is
 * reading them mid-handshake with a decision to make. A record pushed
 * to a directory is the other room: an indexer reads it once, cold,
 * and `buy_observation` alone carries 13kB of that handshake prose.
 *
 * So the short form is the one the catalogue already has. The free
 * tools carry `summary`, written for the browser registry for exactly
 * this reason. The paid shelves do not, but every one of their
 * descriptions opens `Purpose: <one sentence>` — the keeper's own
 * one-line statement of what the shelf is — so that sentence is
 * lifted rather than a second one invented. Nothing is truncated:
 * test/oasf-record.spec.ts holds the result to a budget, so a shelf
 * whose lead sentence grows past it fails the build instead of
 * quietly shipping a paragraph.
 */
export const OASF_TOOL_DESCRIPTION_FLOOR = 60;

export function oasfToolDescription(tool: { summary?: string; description?: string }): string | undefined {
  if (tool.summary) return tool.summary;
  if (!tool.description) return undefined;
  const body = tool.description.replace(/^Purpose:\s*/, "");
  let short = "";
  for (const sentence of body.split(/\.\s+(?=[A-Z])/)) {
    short = short ? `${short} ${sentence}` : sentence;
    if (!short.endsWith(".")) short = `${short}.`;
    /**
     * One sentence is usually the whole answer, but "Ring the store
     * bell." is a name, not a description. Taking sentences until
     * there is something to read keeps the errands informative
     * without giving the shelves a second paragraph they do not need.
     */
    if (short.length >= OASF_TOOL_DESCRIPTION_FLOOR) break;
  }
  return short.charAt(0).toUpperCase() + short.slice(1);
}

/**
 * The tools, straight off the live catalogue — the same call /mcp
 * answers tools/list from, so a tool added to the server cannot be
 * missing here.
 */
export function oasfMcpTools(base: string): OasfMcpTool[] {
  return mcpToolCatalog(base).map((tool) => {
    const scopes = toolScopes(tool.annotations ?? {});
    const description = oasfToolDescription(tool);
    return {
      name: tool.name,
      ...(tool.annotations?.title ? { title: tool.annotations.title } : {}),
      ...(description ? { description } : {}),
      ...(scopes.length ? { scopes } : {}),
    };
  });
}

export interface OasfRecord {
  schema_version: string;
  name: string;
  version: string;
  description: string;
  authors: string[];
  created_at: string;
  annotations: Record<string, string>;
  domains: { name: string; id: number }[];
  skills: { name: string; id: number }[];
  locators: { type: string; urls: string[] }[];
  modules: { name: string; data: Record<string, unknown> }[];
}

/**
 * The record itself.
 *
 * `version` is server.json's, deliberately: that number is already the
 * one every listing manifest moves together (plugin.json, the Claude
 * Code plugin, the Gemini extension), and a record whose version moved
 * on its own would be a seventh thing to remember. A Directory record
 * is immutable by CID regardless — this is the semantic version beside
 * it, not the address.
 *
 * NO A2A MODULE, though check_a2a_card exists. An integration module
 * describes how to reach THIS record's subject. We inspect other
 * people's agent cards; we do not serve an A2A endpoint that a
 * consumer of this module could call, and declaring one would be a
 * promise the store cannot keep.
 */
export function oasfRecord(base: string): OasfRecord {
  return {
    schema_version: OASF_SCHEMA_VERSION,
    name: OASF_RECORD_NAME,
    version: SERVER.version,
    description: OASF_DESCRIPTION,
    /**
     * OASF's grammar for an author is `author-name <author-email>`.
     * The address is the one the store already publishes as its
     * contact, not a new one: a directory entry naming a second
     * address would be a second thing to keep true.
     */
    authors: [`${PLUGIN.author.name} <${STORE_CONTACT_EMAIL}>`],
    created_at: OASF_RECORD_CREATED_AT,
    annotations: { ...OASF_ANNOTATIONS },
    domains: OASF_DOMAINS.map(({ name, id }) => ({ name, id })),
    skills: OASF_SKILLS.map(({ name, id }) => ({ name, id })),
    locators: [{ type: "source_code", urls: [PLUGIN.repository] }],
    modules: [
      {
        name: "integration/mcp",
        data: {
          name: oasfMcpServerName(),
          description: SERVER.description,
          connections: oasfMcpConnections(),
          tools: oasfMcpTools(base),
        },
      },
      {
        name: "core/language_model/agentskills",
        data: {
          skill_manifest: {
            name: OASF_AGENT_SKILL.name,
            description: OASF_AGENT_SKILL.description,
            version: SERVER.version,
            license: PLUGIN.license,
          },
          source_locator: { type: "source_code", urls: [PLUGIN.repository] },
          skill_file: OASF_AGENT_SKILL.file,
        },
      },
    ],
  };
}
