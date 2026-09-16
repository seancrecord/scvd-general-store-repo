import { SCVD_AGENT_ID, SCVD_AGENT_REGISTRY } from "@/store/agent-identity";

/**
 * THE ONE REPUTATION THIS STORE CAN HAVE THAT IS NOT ITS OWN WORD.
 *
 * Everything this shop publishes about itself is signed by its own
 * key, which proves the bytes were not mangled and proves nothing
 * about whether we were honest — the store says so on /attestation in
 * those words, because a dishonest issuer signs its lie and confirms
 * it twice. The ERC-8004 Reputation Registry is the one channel where
 * that ceiling lifts: the CLIENT writes, on chain, from their own
 * address, and we cannot edit it, delete it, or reorder it.
 *
 * AND WE CANNOT WRITE IT EITHER, which is the property worth having.
 * The ERC: "The feedback submitter MUST NOT be the agent owner or an
 * approved operator for agentId." The store's wallet owns agent
 * 86957, so every row in that registry is necessarily somebody else's
 * — a guarantee enforced by the contract rather than by our promise
 * not to. It is the reason this is worth inviting at all, and the
 * reason a house purchase gets no invite: the call would revert.
 *
 * WHAT THIS IS NOT. Not a ranking, not a rating we compute, and not a
 * number this store will ever put on its own storefront as a score.
 * We invite the writing and we point at the reading; the arithmetic
 * belongs to whoever is doing the scoring, with their denominator
 * beside it. That boundary is the same one /scorers draws for our own
 * evidence, pointed the other way for once.
 */

/**
 * The ERC-8004 Reputation Registry on Base mainnet, EIP-55
 * checksummed.
 *
 * VERIFIED, not copied from a page: `getIdentityRegistry()` on this
 * contract returns 0x8004A169…a432, which is the Identity Registry
 * holding agent 86957. That round trip is what establishes these two
 * contracts are the pair they claim to be, and it is re-runnable by
 * anyone (the call is published in the block below).
 */
export const REPUTATION_REGISTRY = "0x8004BAa17C55a88189AE136b182e5fdA19dE9b63";

/**
 * THE REAL SIGNATURE, AND WHY IT IS SPELLED OUT IN FULL.
 *
 * A `feedback_invite` block is already circulating in the x402 field
 * — this store's own August walk captured one — and it publishes
 * `giveFeedback(agentId, score, uri)`. That function does not exist.
 * The ERC defines eight parameters, and the three-argument form
 * selector (0x655914ab) matches nothing on the deployed contract.
 * Anyone who followed that invite wrote a call that could not land.
 *
 * So this is the whole signature, verified against the live contract:
 * the sibling read `getSummary(uint256,address[],string,string)`
 * answers `clientAddresses required` rather than reverting blind,
 * which is a deployed function refusing bad arguments — the evidence
 * that this ABI is the deployed one and not a guess from the paper.
 *
 * Publishing a call we had not checked would be precisely the
 * unaudited claim this store sells a desk for catching in other
 * people's metadata. It would also be worse than saying nothing: a
 * buyer who tried it would spend gas learning we were careless.
 */
export const GIVE_FEEDBACK_SIGNATURE =
  "giveFeedback(uint256 agentId, int128 value, uint8 valueDecimals, string tag1, string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash)";

/** The reads, for anyone checking what the registry already holds. */
export const FEEDBACK_READS = {
  clients: "getClients(uint256 agentId) — every address that has left feedback",
  summary:
    "getSummary(uint256 agentId, address[] clientAddresses, string tag1, string tag2) — aggregate over the clients you name. It requires an explicit client list and refuses an empty one, which is the registry declining to compute a number over a denominator you did not choose.",
  all: "readAllFeedback(uint256 agentId, address[] clientAddresses, string tag1, string tag2, bool includeRevoked)",
} as const;

/**
 * THE VALUE CONVENTION WE SUGGEST, and it is a suggestion.
 *
 * The ERC leaves tags to developers and lists `starred` (0-100) first
 * in its own table. Naming one convention makes the rows comparable;
 * refusing to name one would leave every client inventing a scale and
 * nothing aggregatable at the end. `value` is a fixed-point int128
 * and `valueDecimals` says where the point sits — 87 with 0 decimals
 * is 87/100, not 87%.
 */
export const FEEDBACK_CONVENTION = {
  tag1: "starred",
  scale: "0-100, with valueDecimals 0",
  note: "Suggested so rows stay comparable, never required. The registry accepts any tag and any scale; a client who wants to record uptime or response time instead should use the ERC's own table rather than this line.",
} as const;

/** What the store will not do with what it invites. */
export const FEEDBACK_LIMIT =
  "This store cannot write, edit, delete or reorder any of it — the contract forbids the agent owner from submitting, and we own this agent. We also do not compute a score from it, publish one, or filter the rows we would rather not have: where the store shows this feedback at all, it shows every client the registry returns, including the ones against us. A registry row is one client's opinion with a payment behind it, which is more than a testimonial and less than an audit.";

interface InviteInput {
  base: string;
  /** The settlement hash from the payment that just cleared. */
  settlementTx: string;
  /** CAIP-2 network the payment settled on. */
  network: string;
  /** The buyer's address, as the rail spells it. */
  payer?: string;
  /**
   * NO `toAddress`, DELIBERATELY. The ERC's proofOfPayment block has
   * a slot for it, and filling it would mean mapping rail to
   * receiving address here — the exact shape of the 2026-09-12
   * correction, where the same wallet was spelled two ways across
   * thirty doors because two workers held it separately. The buyer
   * does not need us to tell them who they paid: it is in the
   * settlement they are already holding, on a chain we do not
   * control. A field we cannot derive from one source is a field
   * this block is better without.
   */
}

/**
 * Derive the plain chain id the ERC's proofOfPayment block asks for,
 * but only where one exists. A CAIP-2 name like
 * `solana:5eykt4Us…` has no numeric chain id, and inventing one to
 * fill a field would be a lie told for the sake of a schema.
 */
function numericChainId(network: string): string | undefined {
  const [namespace, reference] = network.split(":");
  return namespace === "eip155" ? reference : undefined;
}

/**
 * The invite, offered at the one moment the buyer holds what it
 * needs.
 *
 * SAME REASONING AS `attest_this_purchase` one field over: the
 * blocker on any post-purchase action is that the required input
 * reads as work. A buyer leaving this response is holding the
 * settlement hash, the agent id, and the registry address — so the
 * response hands over all three, already assembled, and the
 * remaining work is one transaction they may or may not want to send.
 *
 * FREE, AND NOT OURS. Unlike the attestation beside it, this sells
 * nothing: the gas is theirs, the opinion is theirs, and the store
 * gets no artifact out of it. What the store gets is a record it
 * could not have written.
 */
export function feedbackInvite(input: InviteInput): Record<string, unknown> {
  const chainId = numericChainId(input.network);
  return {
    what: "Leave on-chain feedback about this purchase, in the ERC-8004 Reputation Registry. Free to us, gas to you, and we cannot touch what you write.",
    agent_id: SCVD_AGENT_ID,
    agent_registry: SCVD_AGENT_REGISTRY,
    reputation_registry: REPUTATION_REGISTRY,
    /**
     * The registry lives on Base whatever rail the purchase settled
     * on. Said plainly because a buyer who just paid in USDC on
     * Solana would otherwise discover it at the point of signing.
     */
    feedback_chain: "eip155:8453",
    call: GIVE_FEEDBACK_SIGNATURE,
    suggested: FEEDBACK_CONVENTION,
    /**
     * The ERC's own x402 field, which exists for exactly this: the
     * settlement that paid for the goods, carried in the off-chain
     * file so a reader can check that the client actually bought
     * something before weighing what they said about it.
     */
    proof_of_payment: {
      txHash: input.settlementTx,
      network: input.network,
      ...(chainId ? { chainId } : {}),
      ...(input.payer ? { fromAddress: input.payer } : {}),
      how: "Put this block in the off-chain JSON you point feedbackURI at, under `proofOfPayment`, and pass its keccak256 as feedbackHash. Both are OPTIONAL — feedback with neither is still valid, just harder for a third party to weigh. `toAddress` is left for you to fill from the settlement itself; we would rather you read it off the chain than take our word for which address received it.",
    },
    endpoint_field: `${input.base}/api/buy/`,
    limit: FEEDBACK_LIMIT,
    why_you_might_not: "No reason to spend gas praising a $0.001 purchase, and this store would rather say so than pretend otherwise. The rows worth writing are the ones where something went wrong, or where a purchase carried real weight and you want the next buyer to know.",
  };
}

/**
 * The standing version, for surfaces with no purchase in hand.
 *
 * A reader arriving at the trust document or the atlas has no
 * settlement hash, so the invite drops its proof-of-payment half and
 * becomes what it should be there: the address of the record, the
 * calls that read it, and the statement that we cannot write it.
 * Reading comes first here — a diligence pass wants to KNOW what
 * clients said, not to be asked for an opinion it has not formed.
 */
export function feedbackChannel(base: string): Record<string, unknown> {
  return {
    what: "Client-written reputation for this store, in the ERC-8004 Reputation Registry on Base. Written by buyers from their own addresses; unwritable by us.",
    reputation_registry: REPUTATION_REGISTRY,
    agent_id: SCVD_AGENT_ID,
    agent_registry: SCVD_AGENT_REGISTRY,
    chain: "eip155:8453",
    read_it: {
      rpc: "https://mainnet.base.org",
      method: "eth_call",
      to: REPUTATION_REGISTRY,
      functions: FEEDBACK_READS,
      note: "No key, no account, and no cooperation from this store. Start with getClients — it returns the addresses that have written, which is also the denominator any summary needs.",
    },
    write_it: {
      call: GIVE_FEEDBACK_SIGNATURE,
      suggested: FEEDBACK_CONVENTION,
      who: "Any address that is not this agent's owner or operator. A buyer should use the address they paid from, or the wallet named in their own agent's on-chain agentWallet, so their row can be tied to a settlement.",
      proof_of_payment:
        "The ERC's off-chain file carries a `proofOfPayment` block — fromAddress, toAddress, chainId, txHash. A purchase response from this store hands you that block pre-filled; see the feedback_invite field on any fulfilment.",
    },
    limit: FEEDBACK_LIMIT,
    /**
     * The doctrine, stated where a scorer will read it. This store
     * spends its life telling other people not to publish a verdict
     * without its derivation and denominator; it would be a poor
     * joke to start quoting an average about itself.
     */
    we_publish_no_score:
      "This store will not compute or display a rating from these rows, about itself or anybody else. Never a ranking, and never a verdict without its derivation and denominator beside it — that rule does not get an exception when the number would be flattering.",
    for_scorers: `${base}/scorers`,
  };
}
