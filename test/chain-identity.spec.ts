import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import {
  IDENTITY_VIEWERS,
  chainIdentity,
  identitySurfaces,
} from "@/store/chain-identity";
import { SCVD_AGENT_ID, SCVD_AGENT_REGISTRY } from "@/store/agent-identity";
import { EXTERNAL_RECORDS } from "@/store/trust-signals";

const BASE = "https://scvd.store";

/**
 * THE IDENTITY BLOCK (2026-09-15).
 *
 * The store holds an ERC-8004 identity, and until this shipped the
 * only surface naming it was the registration file the chain points
 * at — reachable only by a reader who already had the agent id. An
 * agent doing diligence arrived at the origin and could not learn
 * from any document that a chain record existed.
 *
 * What these cases guard is the part that would make the block worse
 * than nothing: a dead link or a wrong address in the one section
 * that says who we are, an identity surface that 404s, or the
 * quiet reclassification of a block explorer into the trust list.
 */
describe("the on-chain identity block", () => {
  it("names the agent and registry the chain actually holds", () => {
    const identity = chainIdentity(BASE);
    /*
     * These two strings are what a verifier compares against the
     * Identity Registry. They come from store/agent-identity, which
     * is also what the registration file's `registrations` block
     * carries — one source, so the two surfaces cannot disagree.
     */
    expect(identity.agent_id).toBe(SCVD_AGENT_ID);
    expect(identity.agent_registry).toBe(SCVD_AGENT_REGISTRY);

    const chain = identity.chain as Record<string, string>;
    expect(chain.caip2).toBe("eip155:8453");
    /*
     * EIP-55 checksummed, not lowercase. A reader string-comparing
     * this against an explorer's rendering finds no match otherwise.
     */
    expect(chain.identity_registry).toBe(
      "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432",
    );
  });

  it("publishes calldata derived from the agent id, not typed", () => {
    const identity = chainIdentity(BASE);
    const verify = identity.verify_without_asking_us as Record<string, any>;
    /*
     * 86957 is 0x153ad. Getting this wrong is the failure that looks
     * exactly like "the agent does not exist" — a reverting call and
     * an ERC721NonexistentToken error — so it is built from the id
     * rather than pasted, and pinned here against the id.
     */
    const padded = SCVD_AGENT_ID.toString(16).padStart(64, "0");
    expect(verify.reads.agent_uri.data).toBe(`0xc87b56dd${padded}`);
    expect(verify.reads.owner.data).toBe(`0x6352211e${padded}`);
    expect(verify.reads.agent_uri.data).toContain("153ad");
    expect(verify.to).toBe("0x8004A169FB4a3325136EB29fA0ceB6D2e539a432");
  });

  it("asserts no on-chain state that a transaction could make stale", () => {
    /*
     * THE RULE THIS KEEPS. The agentURI is one transaction from
     * changing, so a cached sentence about what the registry
     * currently resolves to is a claim with a shelf life — precisely
     * what this store sells a desk for catching in other people's
     * metadata. The block publishes the address, the id and the call;
     * the chain answers the rest.
     */
    const serialised = JSON.stringify(chainIdentity(BASE));
    expect(serialised).not.toContain("Unconfigured");
    expect(serialised).not.toContain("currently resolves");
    /* The limit is stated, not implied. */
    expect(identityLimit()).toContain("proves nothing about the quality");
  });

  function identityLimit(): string {
    return chainIdentity(BASE).limit as string;
  }

  it("keeps explorers out of the independent-records list", () => {
    /*
     * EXTERNAL_RECORDS promises records that somebody INDEXED us. A
     * block explorer reading a public contract is not an index and
     * not an endorsement, and folding one in would be the store
     * arguing with its own definitions — the same reasoning that
     * keeps KEEPER_SOCIAL out of that array.
     */
    const recordUrls = EXTERNAL_RECORDS.map((row) => row.url);
    for (const viewer of IDENTITY_VIEWERS) {
      expect(recordUrls).not.toContain(viewer.url);
    }
    /* And every viewer says what it is rather than implying a verdict. */
    for (const viewer of IDENTITY_VIEWERS) {
      expect(viewer.what_it_shows.length).toBeGreaterThan(80);
      expect(viewer.confirmed).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(viewer.url.startsWith("https://")).toBe(true);
    }
  });

  it("points every viewer at this agent, not just the collection", () => {
    const urls = IDENTITY_VIEWERS.map((v) => v.url);
    /*
     * A link to the registry contract with no token id lands a reader
     * on 80,000 other agents. Both rows have to name 86957.
     */
    for (const url of urls) {
      expect(url).toContain(String(SCVD_AGENT_ID));
    }
  });
});

/**
 * The routing half: one store, several vocabularies. Each path
 * existed before this block and was reachable only by guessing the
 * convention; a dead link in the section that says who we are would
 * be the strongest argument against the rest of it.
 */
describe("the identity surfaces", () => {
  const PATH_KEYS = [
    "erc_8004",
    "did_web",
    "a2a_agent_card",
    "mcp_server_card",
    "oasf_record",
    "x402_discovery",
    "signing_key",
    "wallets",
  ] as const;

  /**
   * The quiet list is a ruling, not an oversight, and this names the
   * two it covers so a later edit adding them back fails here first
   * rather than in the guard two files away. Both have written
   * reasons in test/no-orphan-capability: RFC 9116's fixed path is
   * its own discovery mechanism, and owners.json is one crawler's
   * ownership check rather than a vocabulary an agent chooses.
   */
  const DELIBERATELY_ABSENT = [
    "/.well-known/security.txt",
    "/.well-known/owners.json",
  ];

  it("serves every identity document it names", async () => {
    const surfaces = identitySurfaces(BASE) as Record<string, string>;
    for (const key of PATH_KEYS) {
      const url: string | undefined = surfaces[key];
      expect(url, `${key} is missing from identity_surfaces`).toBeTruthy();
      if (!url) continue;
      expect(url.startsWith(`${BASE}/`), `${key} is not on this origin`).toBe(
        true,
      );
      const response = await SELF.fetch(url);
      expect(response.status, `${key} answered ${response.status}`).toBe(200);
    }
  });

  it("rides the trust document and the x402 catalog", async () => {
    /*
     * The two documents a diligence pass and an indexer actually
     * fetch. The block existing is worth nothing if neither reaches
     * it — that was the original failure, one file nobody could find.
     */
    for (const path of ["/.well-known/trust.json", "/.well-known/x402.json"]) {
      const body = (await (await SELF.fetch(`${BASE}${path}`)).json()) as Record<
        string,
        any
      >;
      expect(body.chain_identity?.agent_id, `${path} lost chain_identity`).toBe(
        SCVD_AGENT_ID,
      );
      expect(
        body.identity_surfaces?.erc_8004,
        `${path} lost identity_surfaces`,
      ).toBe(`${BASE}/.well-known/agent-registration.json`);
    }
  });

  it("reaches the arriving agent through the atlas", async () => {
    const atlas = (await (await SELF.fetch(`${BASE}/atlas.json`)).json()) as
      Record<string, any>;
    expect(atlas.identity?.agent_id).toBe(SCVD_AGENT_ID);
    expect(atlas.identity?.surfaces?.did_web).toBe(
      `${BASE}/.well-known/did.json`,
    );
  });

  it("leaves the deliberately quiet paths quiet", () => {
    /*
     * Adding either would reverse a written ruling as a side effect of
     * a different change — how a documented decision quietly stops
     * being one. The quiet-list guard in no-orphan-capability caught
     * this when the block first shipped with both in it.
     */
    const serialised = JSON.stringify(identitySurfaces(BASE));
    for (const path of DELIBERATELY_ABSENT) {
      expect(serialised, `${path} is on the quiet list`).not.toContain(path);
    }
  });

  it("names the join rather than asking to be believed", () => {
    const surfaces = identitySurfaces(BASE) as Record<string, string>;
    /*
     * An identity split across six documents is six chances to
     * disagree, and a reader who fetches one has no way to notice.
     * The cross_check tells them how to prove the agreement — which
     * is this store's whole argument, pointed at itself.
     */
    expect(surfaces.cross_check).toContain("payTo");
    expect(surfaces.cross_check).toContain("owner");
  });
});
