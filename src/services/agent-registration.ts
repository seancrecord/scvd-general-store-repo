import { LATEST_PROTOCOL } from "@/routes/mcp";
import { A2A_PROTOCOL_VERSION } from "@/lib/a2a-validation.js";
import { STORE_CONTACT_EMAIL, STORE_SERVICE_NAME } from "@/store/metadata";
import { registryDescription } from "@/store/identity-lead";

/**
 * THE ERC-8004 REGISTRATION FILE — the document an agent registry
 * reads to find out what agent #86957 actually is.
 *
 * WHAT WAS BROKEN (2026-09-14). The store minted agent 86957 on the
 * Base Identity Registry and set its agentURI to the bare origin,
 * `https://scvd.store`. That origin content-negotiates: a browser
 * gets the storefront HTML, and anything sending
 * `Accept: application/json` gets /atlas.json — a schema.org
 * Collection. Both are real documents and neither is a registration
 * file, so every ERC-8004 explorer read the agent as "Unconfigured".
 * The registration was never wrong on-chain; it pointed at a URL that
 * answers a different question.
 *
 * WHY THIS PATH. `/.well-known/agent-registration.json` is not a
 * convention borrowed from our other well-knowns — the ERC names it.
 * Under "Endpoint Domain Verification" the spec has an agent prove it
 * controls an endpoint's domain by serving a file at exactly this
 * path containing a `registrations` list that matches the chain. The
 * spec then says the check is unnecessary when the endpoint-domain is
 * the same domain that serves the primary registration file. Serving
 * the FULL file here and pointing agentURI at it collapses both jobs
 * into one document: it is the registration file, and it is its own
 * domain proof for every scvd.store endpoint named inside it.
 *
 * DERIVED, NOT RETYPED. Every field below comes from the constant
 * that already governs it — the naming law's one display string, the
 * registry-budget identity, the live protocol versions. A registration
 * file is copy that travels: an explorer caches it and it becomes the
 * store's identity in somebody else's index. The first draft of this
 * document carried a hand-written name and a hand-written description,
 * which is precisely the drift STORE_METADATA's own comment warns
 * about.
 *
 * THE DESCRIPTION IS A SHORT FORM, NOT A SECOND OPINION, and the
 * difference is the whole rule. What metadata.ts forbids is a surface
 * inventing its own account of the store; what it already does four
 * times over is say the SAME account at the length its reader can
 * take — ~160 characters for a search snippet, sixty words for a
 * social card, a paragraph for a document fetcher. A registry card is
 * a fifth such reader. So this uses registryDescription(), which is
 * one more length of one identity, and introduces no fact that is not
 * published at length somewhere else.
 */

/** The `type` discriminator. Registries match on this exact string. */
export const ERC8004_REGISTRATION_TYPE =
  "https://eips.ethereum.org/EIPS/eip-8004#registration-v1";

/** Where the file is served, and where agentURI must point. */
export const AGENT_REGISTRATION_PATH = "/.well-known/agent-registration.json";

/**
 * The store's agent, as minted. The registry string is
 * `{namespace}:{chainId}:{identityRegistry}` per the ERC — the
 * ERC-8004 Identity Registry on Base mainnet, EIP-55 checksummed
 * because a registry that string-compares a lowercase address
 * against its own checksummed one finds no match.
 */
export const SCVD_AGENT_ID = 86957;
export const SCVD_AGENT_REGISTRY =
  "eip155:8453:0x8004A169FB4a3325136EB29fA0ceB6D2e539a432";

interface RegistrationService {
  name: string;
  endpoint: string;
  version?: string;
}

/**
 * The registration file for this origin.
 *
 * ON `supportedTrust`, AND WHY IT IS ABSENT. The field is OPTIONAL,
 * and the ERC is explicit about what leaving it out means: "If absent
 * or empty, this ERC is used only for discovery, not for trust."
 * That is the honest reading of where this store stands today. The
 * three values on offer — reputation, crypto-economic,
 * tee-attestation — each assert that this agent participates in a
 * trust mechanism the store has not wired to anything. Declaring one
 * because it sounds good is an unaudited claim published at machine
 * scale, which is the failure this store sells a desk for catching in
 * other people's metadata. Discovery is what we want from the
 * registry today; the field is one line to add on the day a trust
 * model is actually connected, and it is the keeper's call to add it.
 *
 * ON `x402Support`. True, and checkable rather than asserted: every
 * door under /api/buy/* answers a real 402 with live accepts, and the
 * x402 service entry below points at the catalog that enumerates
 * them.
 */
export function agentRegistrationFile(base: string): Record<string, unknown> {
  const host = new URL(base).host;

  /**
   * The endpoints, in the order a reader needs them: the room a human
   * lands in, then the two agent protocols we actually speak, then
   * the machine catalogs, then the identities. Every one is on this
   * origin, which is what makes the domain-verification half of this
   * file self-satisfying.
   */
  const services: RegistrationService[] = [
    { name: "web", endpoint: `${base}/` },
    {
      name: "MCP",
      endpoint: `${base}/mcp`,
      version: LATEST_PROTOCOL,
    },
    {
      name: "A2A",
      endpoint: `${base}/.well-known/agent-card.json`,
      version: A2A_PROTOCOL_VERSION,
    },
    /**
     * The x402 discovery catalog. Named "x402" rather than the
     * draft's "x402-discovery" because the ERC's own examples use the
     * protocol's name as the service name and an indexer grouping by
     * service name should find us in the x402 bucket.
     */
    { name: "x402", endpoint: `${base}/.well-known/x402.json`, version: "2" },
    { name: "openapi", endpoint: `${base}/openapi.json` },
    /**
     * The atlas is not a protocol, but it is the single best answer
     * to "I arrived here, what is free and what do I call" — the one
     * document written for an agent that has just discovered us,
     * which is exactly the reader arriving through this file.
     */
    { name: "atlas", endpoint: `${base}/atlas.json` },
    /**
     * did:web, the identity the x402 Signed Offers & Receipts
     * extension resolves to find our signing key. A reader that takes
     * this registration file should be able to reach the key that
     * signs our artifacts without guessing the convention.
     */
    { name: "DID", endpoint: `did:web:${host}`, version: "v1" },
    { name: "email", endpoint: STORE_CONTACT_EMAIL },
  ];

  return {
    type: ERC8004_REGISTRATION_TYPE,
    /**
     * THE NAMING LAW, tier 2: the display name, one string
     * everywhere. The full name is 37 characters and is retired from
     * all metadata; this is the name the store answers to in every
     * other catalog, and a registration file is the last place that
     * should invent a new one.
     */
    name: STORE_SERVICE_NAME,
    /**
     * THE REGISTRY BUDGET, not the canon (2026-09-15). This carried
     * STORE_METADATA.description until the keeper read it on a card:
     * 900 characters written for a reader that fetches the whole
     * document, rendered by an explorer that collapses after three
     * lines and cuts mid-clause. Same identity, a length that fits
     * the surface — see registryDescription() for the budget and the
     * order of its clauses. Still derived, still one string: edit it
     * there, never here.
     */
    description: registryDescription(),
    /**
     * `image` is a SHOULD for ERC-721 app compatibility — the
     * registry is an NFT, so wallets and explorers will render this.
     * The favicon is the only mark the store has and it is an SVG,
     * which every current explorer renders.
     */
    image: `${base}/favicon.svg`,
    services,
    x402Support: true,
    active: true,
    /**
     * The half that makes this file a proof rather than a claim: a
     * reader holding the on-chain agent compares these two values
     * against the chain, and a mismatch means the domain does not
     * belong to the agent. All fields in a registration entry are
     * mandatory per the ERC.
     */
    registrations: [
      { agentId: SCVD_AGENT_ID, agentRegistry: SCVD_AGENT_REGISTRY },
    ],
  };
}
