import { SCVD_AGENT_ID, SCVD_AGENT_REGISTRY } from "@/store/agent-identity";
import { OASF_RECORD_PATH } from "@/lib/oasf-record";
import { feedbackChannel } from "@/store/agent-feedback";

/**
 * THE STORE'S IDENTITY, IN EVERY VOCABULARY A READER MIGHT ARRIVE
 * SPEAKING — and the on-chain half, which is the only one that is not
 * our word.
 *
 * WHY THIS FILE EXISTS (2026-09-15, the keeper's call). The store now
 * holds an ERC-8004 identity — agent 86957 on Base — and until today
 * the only surface that said so was the registration file the chain
 * points at. That is backwards for the reader who has NOT got the
 * agent id yet: an agent doing diligence arrives at the origin, and
 * had no way to learn from any of our documents that a chain record
 * of us exists at all. The identity was published in exactly one
 * place, reachable only by whoever already knew where to look.
 *
 * THE SAME SHAPE THE TRUST DOCUMENT WAS BUILT FOR. Three outside
 * models were asked to evaluate this store cold and one reported no
 * independent footprint, accurately, because the facts were not at a
 * URL its checklist knew to try. This is that lesson applied to
 * identity: an agent looking for who we are should find every
 * vocabulary at once, from whichever document it happened to fetch.
 *
 * IDENTITY IS NOT REPUTATION, and the two must not be run together.
 * Everything here answers "who is this and how would you check"; not
 * one line of it is a claim that anybody vouches for us. The viewers
 * below are third-party RENDERERS of a public registry, which is a
 * different thing again from the directory listings in
 * EXTERNAL_RECORDS — those are records that somebody indexed us, and
 * that array's docblock promises independent records. A block
 * explorer reading a contract is neither an index nor an endorsement,
 * so it is kept out of that array for the same reason KEEPER_SOCIAL
 * is: a store that quietly reclassifies things into its own trust
 * list is arguing with its own definitions.
 */

export interface IdentityViewer {
  /** Where the rendering lives. Checked, never assumed. */
  url: string;
  /** Who keeps it. */
  viewer: string;
  /** ISO date this URL was actually opened and read from here. */
  confirmed: string;
  /**
   * WHAT THE PAGE ACTUALLY SHOWS, read rather than assumed — the same
   * discipline ExternalRecord.what_it_proves enforces, pointed at a
   * different kind of page. A viewer renders whatever the contract
   * says at the moment it is loaded, so this describes the rendering,
   * never a verdict, and never a state that could go stale between
   * this deploy and the read.
   */
  what_it_shows: string;
}

/**
 * Third-party renderings of the same on-chain record.
 *
 * BOTH OPENED FROM HERE on the confirmed date, unlike the directory
 * rows in EXTERNAL_RECORDS, which this sandbox's egress cannot reach
 * and which the keeper confirmed by hand. These two answered 200 and
 * their content was read.
 */
export const IDENTITY_VIEWERS: readonly IdentityViewer[] = [
  {
    url: `https://erc-8004.quicknode.com/agents/base-mainnet/${SCVD_AGENT_ID}`,
    viewer: "QuickNode — ERC-8004 explorer",
    confirmed: "2026-09-15",
    what_it_shows:
      "The registration file this store serves, rendered as an agent card: the name, the description, the service endpoints and the owner address, read live from the Identity Registry on Base. It shows what agentURI resolves to at the moment you load it — which is the point of it, and the reason nothing here asserts what it will say. An explorer is a renderer, not a verdict: it reports what the chain and this origin told it, and it vouches for neither.",
  },
  {
    url: `https://basescan.org/token/${SCVD_AGENT_REGISTRY.split(":")[2]}?a=${SCVD_AGENT_ID}`,
    viewer: "BaseScan — Base mainnet block explorer",
    confirmed: "2026-09-15",
    what_it_shows:
      "The raw ERC-721 token behind the identity: agent 86957 in the AgentIdentity (AGENT) collection, its owner, and its transfer history. Nothing about this store's goods or conduct — a token page proves the identity exists on chain and who holds it, and stops there.",
  },
];

/**
 * THE RE-DERIVATION, because the viewers above are conveniences and
 * this is the instrument.
 *
 * Neither explorer is load-bearing: both read the same contract
 * anybody can read, with no key and no account, and a reader who
 * trusts our summary of what an explorer shows has learned nothing a
 * dishonest store could not have written. The calldata is built from
 * the agent id rather than typed, so it cannot drift from it.
 */
function tokenUriCalldata(agentId: number): string {
  /* tokenURI(uint256) — the ERC-721 selector the ERC reuses as agentURI. */
  return `0xc87b56dd${agentId.toString(16).padStart(64, "0")}`;
}

function ownerOfCalldata(agentId: number): string {
  /* ownerOf(uint256). */
  return `0x6352211e${agentId.toString(16).padStart(64, "0")}`;
}

/**
 * The on-chain identity, stated as facts plus the call that checks
 * them.
 *
 * NO STATE IS ASSERTED. An earlier draft of this block was going to
 * name what the registry currently resolves to, and that would have
 * been a fact with a shelf life: the agentURI is one transaction away
 * from changing, and a cached sentence about it is exactly the stale
 * claim this store sells a desk for catching. What is published is
 * the address, the id, and the call. The chain answers the rest, to
 * whoever asks it.
 */
export function chainIdentity(base: string): Record<string, unknown> {
  const [namespace, chainId, contract] = SCVD_AGENT_REGISTRY.split(":");
  return {
    standard: "ERC-8004",
    what_it_is:
      "A portable, on-chain handle for this store, held as an ERC-721 token in the ERC-8004 Identity Registry. It is the one identity here that does not depend on this origin staying up or on anybody believing us: the registry is public, the owner is an address, and the whole record can be read without our cooperation.",
    agent_id: SCVD_AGENT_ID,
    /** CAIP form, the string the ERC's registrations block carries. */
    agent_registry: SCVD_AGENT_REGISTRY,
    chain: {
      caip2: `${namespace}:${chainId}`,
      name: "Base mainnet",
      identity_registry: contract,
    },
    /** The document the registry's agentURI is meant to resolve to. */
    registration_file: `${base}/.well-known/agent-registration.json`,
    /**
     * The check, in full, because "verifiable" is a word and this is
     * the thing it refers to. Any JSON-RPC endpoint for Base answers
     * these; the public one is named so the reader does not need an
     * account to run them.
     */
    verify_without_asking_us: {
      rpc: "https://mainnet.base.org",
      method: "eth_call",
      to: contract,
      reads: {
        agent_uri: {
          data: tokenUriCalldata(SCVD_AGENT_ID),
          returns:
            "The agentURI the registry holds for this agent, ABI-encoded as a string. This is the record; the registration file it names is served by us, and the chain is the part that is not.",
        },
        owner: {
          data: ownerOfCalldata(SCVD_AGENT_ID),
          returns:
            "The address holding the agent, ABI-encoded. Compare it against the payTo in any live 402 from this store to see that the identity and the wallet buyers pay are the same party.",
        },
      },
      note: "No key, no account, no cooperation from this store. A reverting call means the token id is wrong before it means anything else.",
    },
    viewers: IDENTITY_VIEWERS,
    /**
     * THE HALF OF THE IDENTITY WE CANNOT WRITE (2026-09-16).
     *
     * An identity says who we are; this says what our clients said,
     * from their own addresses, in a contract that forbids the agent
     * owner from submitting. It sits inside the identity block rather
     * than beside it because a reader asking "is this a real party"
     * and a reader asking "what happened to people who paid them" are
     * the same reader one question apart — and the second answer is
     * the one that is not our word.
     *
     * Reading comes before writing in that block, deliberately. A
     * diligence pass wants to know what is already recorded; being
     * asked for an opinion it has not formed is the wrong first move.
     */
    client_feedback: feedbackChannel(base),
    /**
     * The boundary, in the same voice the rest of the store uses for
     * its refusals. An identity is not a reputation, and this store
     * would rather say so than let a registry entry be read as one.
     */
    limit:
      "An on-chain identity proves that an address registered this agent and controls it. It proves nothing about the quality of anything this store sells, and nothing about whether a purchase will settle. Registries make an agent findable and nameable; they do not make it good, and no entry here should be read as a third party vouching for us.",
  };
}

/**
 * EVERY IDENTITY DOCUMENT THIS STORE PUBLISHES, IN ONE PLACE.
 *
 * An agent doing diligence speaks one of several vocabularies and
 * rarely knows which one we answer. Each of these already existed and
 * each was reachable only by a reader who guessed the right
 * convention; the list is the routing, not a new claim. Every path
 * here is a live 200 — a dead link in the block that says who we are
 * would be the strongest argument against the rest of it.
 */
export function identitySurfaces(base: string): Record<string, unknown> {
  return {
    how_to_read:
      "One store, several vocabularies. Each row is the same identity expressed the way a particular ecosystem expects to find it; none of them disagree, and cross_check says how to prove that rather than take it on faith.",
    erc_8004: `${base}/.well-known/agent-registration.json`,
    did_web: `${base}/.well-known/did.json`,
    a2a_agent_card: `${base}/.well-known/agent-card.json`,
    mcp_server_card: `${base}/.well-known/mcp.json`,
    oasf_record: `${base}${OASF_RECORD_PATH}`,
    x402_discovery: `${base}/.well-known/x402.json`,
    /** The key every artifact this store signs is checked against. */
    signing_key: `${base}/.well-known/scvd-signing-key`,
    /** Every wallet this store controls, ours to be held to. */
    wallets: `${base}/house-ledger.json`,
    /**
     * TWO THINGS DELIBERATELY NOT LISTED, and the omission is a
     * ruling somebody already made rather than an oversight.
     *
     * /.well-known/security.txt and /.well-known/owners.json both sit
     * on the DELIBERATELY_QUIET list in test/no-orphan-capability,
     * each with a written reason: RFC 9116's fixed path IS the
     * discovery mechanism, so naming it adds nothing a reader looking
     * for it does not already know; and owners.json is an ownership
     * claim one directory's crawler reads on its own schedule, not a
     * vocabulary an agent chooses. Adding them here would have
     * reversed both rulings as a side effect of a different change,
     * which is how a documented decision quietly stops being one. The
     * quiet-list guard caught exactly that and is why this note
     * exists. Contact is published where a diligence reader already
     * looks: trust.json's operator block and openapi's info.contact.
     */
    /**
     * The point of publishing them together rather than as a longer
     * list of links: an identity split across six documents is six
     * chances to disagree, and a reader who can only fetch one has no
     * way to notice. This names the join.
     */
    cross_check:
      "The did:web document, the A2A card and the ERC-8004 registration all name this origin, and the ERC-8004 registration's `registrations` block names the chain record. Read the agent's owner from the registry and compare it against the payTo in a live 402 from any door: identity, registration and the wallet buyers actually pay resolve to one address, or this store has a problem worth reporting to the Mailbox.",
  };
}
