import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import {
  FEEDBACK_LIMIT,
  GIVE_FEEDBACK_SIGNATURE,
  REPUTATION_REGISTRY,
  feedbackChannel,
  feedbackInvite,
} from "@/store/agent-feedback";
import { SCVD_AGENT_ID } from "@/store/agent-identity";
import { storeIdentity } from "@/lib/identity";

const BASE = "https://scvd.store";

/**
 * THE FEEDBACK CHANNEL (2026-09-16).
 *
 * The store signs everything it says about itself, which proves the
 * bytes were not mangled and proves nothing about whether it was
 * honest. The ERC-8004 Reputation Registry is the one channel where
 * that ceiling lifts, because the contract forbids the agent owner
 * from writing and this store owns the agent.
 *
 * The failure this file is built against is a specific one. A
 * `feedback_invite` block already circulating in the x402 field —
 * captured in this store's own August walk — publishes
 * `giveFeedback(agentId, score, uri)`, a three-argument function that
 * does not exist on the deployed contract. Anyone who followed it
 * spent gas on a call that could not land. Publishing an unverified
 * call would be the exact defect this store sells a desk for
 * catching, so the signature is pinned here character for character.
 */
describe("the ERC-8004 feedback channel", () => {
  it("publishes the deployed eight-argument signature, not the three-argument myth", () => {
    /*
     * Verified against the live contract on 2026-09-16: the sibling
     * read getSummary(uint256,address[],string,string) answers
     * "clientAddresses required" rather than reverting blind, which
     * is a deployed function refusing bad arguments rather than a
     * selector that matches nothing.
     */
    expect(GIVE_FEEDBACK_SIGNATURE).toContain("int128 value");
    expect(GIVE_FEEDBACK_SIGNATURE).toContain("uint8 valueDecimals");
    expect(GIVE_FEEDBACK_SIGNATURE).toContain("bytes32 feedbackHash");
    /* The myth, named so it cannot creep back in by copy-paste. */
    expect(GIVE_FEEDBACK_SIGNATURE).not.toBe("giveFeedback(agentId, score, uri)");
    expect(GIVE_FEEDBACK_SIGNATURE).not.toMatch(/giveFeedback\([^)]*\bscore\b/);
    /* Eight parameters, counted rather than eyeballed. */
    const params = GIVE_FEEDBACK_SIGNATURE.slice(
      GIVE_FEEDBACK_SIGNATURE.indexOf("(") + 1,
      GIVE_FEEDBACK_SIGNATURE.lastIndexOf(")"),
    ).split(",");
    expect(params).toHaveLength(8);
  });

  it("names the reputation registry, checksummed", () => {
    /*
     * Lowercase finds no match against an explorer's rendering, the
     * same trap the identity registry address carries.
     */
    expect(REPUTATION_REGISTRY).toBe("0x8004BAa17C55a88189AE136b182e5fdA19dE9b63");
    expect(REPUTATION_REGISTRY).not.toBe(REPUTATION_REGISTRY.toLowerCase());
  });

  it("carries the proof-of-payment block the ERC defines for x402", () => {
    const invite = feedbackInvite({
      base: BASE,
      settlementTx: "0xabc123",
      network: "eip155:8453",
      payer: "0x1111111111111111111111111111111111111111",
    }) as Record<string, any>;
    expect(invite.proof_of_payment.txHash).toBe("0xabc123");
    expect(invite.proof_of_payment.fromAddress).toBe(
      "0x1111111111111111111111111111111111111111",
    );
    /* eip155:8453 → the plain chain id the ERC's file asks for. */
    expect(invite.proof_of_payment.chainId).toBe("8453");
    expect(invite.agent_id).toBe(SCVD_AGENT_ID);
  });

  it("invents no chain id for a rail that has none", () => {
    /*
     * A Solana CAIP-2 name has no numeric chain id. Filling the ERC's
     * field anyway to satisfy a schema would be a lie told for tidiness,
     * so the key is absent and `network` carries the truth.
     */
    const invite = feedbackInvite({
      base: BASE,
      settlementTx: "5xyz",
      network: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
    }) as Record<string, any>;
    expect(invite.proof_of_payment.chainId).toBeUndefined();
    expect(invite.proof_of_payment.network).toBe(
      "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
    );
  });

  it("says the feedback chain is Base whatever rail the purchase used", () => {
    /*
     * The registry is on Base even when the money moved on Solana. A
     * buyer discovering that at the point of signing is a buyer we
     * wasted.
     */
    const invite = feedbackInvite({
      base: BASE,
      settlementTx: "5xyz",
      network: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
    }) as Record<string, any>;
    expect(invite.feedback_chain).toBe("eip155:8453");
  });

  it("promises no score, and says we cannot write the rows", () => {
    /*
     * The whole value of this channel is that the store is locked out
     * of it. If either sentence goes, the block becomes a testimonial
     * page and should not ship.
     */
    expect(FEEDBACK_LIMIT).toContain("cannot write");
    expect(FEEDBACK_LIMIT).toContain("including the ones against us");
    const channel = feedbackChannel(BASE) as Record<string, any>;
    expect(channel.we_publish_no_score).toContain("Never a ranking");
    /* Reading is offered before writing: a diligence pass wants facts. */
    const keys = Object.keys(channel);
    expect(keys.indexOf("read_it")).toBeLessThan(keys.indexOf("write_it"));
  });

  it("rides every artifact through the store identity breadcrumb", () => {
    /*
     * storeIdentity is assembled at serve time and stored nowhere, so
     * this reaches certificates minted months ago sitting in
     * strangers' context windows — the one lever that works without
     * the holder's cooperation.
     */
    const identity = storeIdentity(BASE);
    expect(identity.feedback).toContain(REPUTATION_REGISTRY);
    expect(identity.feedback).toContain(String(SCVD_AGENT_ID));
    expect(identity.feedback).toContain("rejects the agent owner");
  });

  it("keeps the four graded words out of the breadcrumb", () => {
    /*
     * THE FAILURE THIS GUARDS, caught two files away the first time.
     *
     * storeIdentity rides the discovery inventory artifact, and
     * test/discovery-inventory holds that artifact to containing no
     * score, rating, rank or confidence anywhere in its bytes — the
     * instrument reports what it observed and never grades it. The
     * first draft of the feedback line ended "publishes no score",
     * which is a refusal of a score and tripped the guard anyway,
     * because a substring check cannot tell a denial from a claim.
     *
     * Pinned here so the next edit of this sentence fails in the file
     * that owns it rather than in an artifact spec whose subject is
     * somebody else's catalogs.
     */
    expect(storeIdentity(BASE).feedback).not.toMatch(
      /score|confidence|rating|rank/i,
    );
  });

  it("reaches scorers and the identity surfaces", async () => {
    /*
     * A channel nothing routes to is a channel nobody writes in. The
     * three documents that matter: the scorers page (where somebody
     * deciding what to think of us already is), and the two machine
     * surfaces a diligence pass and an indexer fetch.
     */
    const scorers = (await (
      await SELF.fetch(`${BASE}/scorers`, {
        headers: { Accept: "application/json" },
      })
    ).json()) as Record<string, any>;
    expect(scorers.scoring_this_store?.reputation_registry).toBe(
      REPUTATION_REGISTRY,
    );

    for (const path of ["/.well-known/trust.json", "/.well-known/x402.json"]) {
      const body = (await (await SELF.fetch(`${BASE}${path}`)).json()) as Record<
        string,
        any
      >;
      expect(
        body.chain_identity?.client_feedback?.reputation_registry,
        `${path} lost the feedback channel`,
      ).toBe(REPUTATION_REGISTRY);
    }
  });
});
