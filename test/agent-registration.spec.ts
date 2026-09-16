import { SELF, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import {
  AGENT_REGISTRATION_PATH,
  ERC8004_REGISTRATION_TYPE,
  SCVD_AGENT_ID,
  SCVD_AGENT_REGISTRY,
  agentRegistrationFile,
} from "@/services/agent-registration";
import {
  OASF_DOMAINS,
  OASF_RECORD_PATH,
  OASF_SKILLS,
  OASF_TAXONOMY_TAG,
} from "@/lib/oasf-record";
import { STORE_METADATA, STORE_SERVICE_NAME } from "@/store/metadata";
import { registryDescription } from "@/store/identity-lead";
import { GIVE_FEEDBACK_SIGNATURE, REPUTATION_REGISTRY } from "@/store/agent-feedback";
import { NEVER_A_RANKING_SENTENCE } from "@/store/copy/doctrine";
import { MENU_ITEMS } from "@/store";
import { checkoutWallets, type PaymentNetworkConfig } from "@/lib/payment-networks";
import { mcpToolCatalog } from "@/lib/mcp-tools";

const BASE = "https://scvd.store";

/**
 * THE REGISTRATION FILE (2026-09-14).
 *
 * Agent 86957's agentURI pointed at the bare origin, which
 * content-negotiates to the storefront or to /atlas.json — a
 * schema.org Collection with no `type` and no `registrations`. Every
 * ERC-8004 explorer read that as "Unconfigured", correctly: it is a
 * real document answering a different question.
 *
 * What this file holds is the half of the fix that lives in the
 * repository. The other half is one transaction — setAgentURI(86957,
 * <this url>) from the owner wallet — and no test here can assert it,
 * so these cases pin the things that would make that transaction
 * point at a lie: the discriminator a registry matches on, the
 * registrations block a verifier compares against the chain, and the
 * rule that this document never invents a name or a description of
 * its own.
 */
describe("ERC-8004 registration file", () => {
  async function fetchRegistration() {
    const response = await SELF.fetch(`${BASE}${AGENT_REGISTRATION_PATH}`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    return (await response.json()) as Record<string, any>;
  }

  it("serves the spec's exact type discriminator", async () => {
    const doc = await fetchRegistration();
    /*
     * Registries match on this string. A near-miss — a trailing
     * slash, v1 vs registration-v1 — reads as no type at all.
     */
    expect(doc.type).toBe(ERC8004_REGISTRATION_TYPE);
    expect(doc.type).toBe(
      "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
    );
  });

  it("carries every mandatory registration field, matching the chain", async () => {
    const doc = await fetchRegistration();
    /*
     * "Agents SHOULD have at least one registration... and all fields
     * in the registration are mandatory." A verifier compares both
     * values against the Identity Registry; either one missing or
     * drifted means the domain does not prove out.
     */
    expect(Array.isArray(doc.registrations)).toBe(true);
    expect(doc.registrations).toHaveLength(1);
    expect(doc.registrations[0]).toEqual({
      agentId: SCVD_AGENT_ID,
      agentRegistry: SCVD_AGENT_REGISTRY,
    });
    /*
     * agentId is a number on-chain and a number here. Serialised as a
     * string it fails a strict comparison against ownerOf/tokenURI
     * lookups keyed on the integer.
     */
    expect(typeof doc.registrations[0].agentId).toBe("number");
    expect(doc.registrations[0].agentId).toBe(86957);
  });

  it("names the Base identity registry in CAIP form, checksummed", async () => {
    const doc = await fetchRegistration();
    const registry: string = doc.registrations[0].agentRegistry;
    const [namespace, chainId, address] = registry.split(":");
    expect(namespace).toBe("eip155");
    expect(chainId).toBe("8453");
    /*
     * EIP-55 checksum, not lowercase: a registry that string-compares
     * this against its own checksummed address finds no match, and
     * the agent stays unconfigured for a reason nobody can see.
     */
    expect(address).toBe("0x8004A169FB4a3325136EB29fA0ceB6D2e539a432");
  });

  it("takes its name and description from the store constants", async () => {
    const doc = await fetchRegistration();
    /*
     * THE NAMING LAW and the registry-budget identity. This document
     * is copy that travels — an explorer caches it and it becomes the
     * store's identity in somebody else's index. Anything hand-written
     * here is the drift STORE_METADATA's own comment warns about, and
     * it would be invisible from inside the repository.
     */
    expect(doc.name).toBe(STORE_SERVICE_NAME);
    expect(doc.description).toBe(registryDescription());
  });

  it("keeps the description inside a registry card's budget", async () => {
    const doc = await fetchRegistration();
    const description: string = doc.description;
    /*
     * THE FAILURE THIS GUARDS. The field shipped carrying the canon —
     * 900 characters written for a reader that fetches the whole
     * document — and an explorer rendered it as a paragraph cut
     * mid-clause. The ceiling is the fix made permanent: copy drifts
     * long, and on this surface it drifts long where nobody working
     * in the repository can see it.
     */
    expect(description.length).toBeLessThanOrEqual(450);
    /*
     * A floor too. "Tighten it" has an obvious failure mode in the
     * other direction, and a registry card with three words on it
     * tells an agent deciding whether to look further nothing at all.
     */
    expect(description.length).toBeGreaterThan(200);
    /* Less than half the canon, which is the point of it existing. */
    expect(description.length).toBeLessThan(STORE_METADATA.description.length / 2);
  });

  it("says the same thing as every other surface, in the same order", async () => {
    const doc = await fetchRegistration();
    const description: string = doc.description;
    /*
     * The ordering canary's rule, on one more surface: what this store
     * IS before what it sells. A registry files us beside scoring
     * products, so the refusal travels with the identity or the
     * distinction is lost exactly where it costs most.
     */
    expect(description.indexOf("evidence observatory")).toBeGreaterThanOrEqual(0);
    expect(description.indexOf("evidence observatory")).toBeLessThan(
      description.indexOf("general store"),
    );
    expect(description).toContain(NEVER_A_RANKING_SENTENCE);
    /*
     * The price floor is DERIVED, never typed. Three files once said
     * "half a cent" while the cheapest door was $0.004 — and this
     * string outlives our ability to correct it, because an explorer
     * caches it into somebody else's index.
     */
    const floor = Math.min(...MENU_ITEMS.map((item) => item.price_usdc));
    expect(description).toContain(`$${floor.toFixed(3)}`);
    expect(description).not.toContain("half a cent");
  });

  it("declares live, reachable services on this origin", async () => {
    const doc = await fetchRegistration();
    const services = doc.services as { name: string; endpoint: string }[];
    expect(Array.isArray(services)).toBe(true);

    const byName = new Map(services.map((s) => [s.name, s.endpoint]));
    expect(byName.get("MCP")).toBe(`${BASE}/mcp`);
    expect(byName.get("A2A")).toBe(`${BASE}/.well-known/agent-card.json`);
    expect(byName.get("x402")).toBe(`${BASE}/.well-known/x402.json`);

    /*
     * The domain-verification half only works because every HTTPS
     * endpoint named here is on the origin serving this file. An
     * endpoint on someone else's host would need its own
     * agent-registration.json over there, which we cannot publish.
     */
    for (const service of services) {
      if (service.endpoint.startsWith("https://")) {
        expect(new URL(service.endpoint).origin).toBe(BASE);
      }
    }
  });

  /**
   * THE TWO IDENTITY SYSTEMS POINT AT EACH OTHER, AND SAY THE SAME
   * THING. The OASF record annotates the ERC-8004 agent; this entry
   * annotates the OASF record back. The taxonomy rows are the
   * record's own constants rather than a second list, because two
   * lists of skills that can disagree is the defect this store sells
   * a desk for finding in other people's metadata.
   */
  it("carries the store's OASF taxonomy, read off the record itself", async () => {
    const doc = await fetchRegistration();
    const services = doc.services as {
      name: string;
      endpoint: string;
      version?: string;
      skills?: string[];
      domains?: string[];
    }[];
    const oasf = services.find((service) => service.name === "OASF");
    expect(oasf, "the registration file names no OASF entry").toBeDefined();
    expect(oasf!.endpoint).toBe(`${BASE}${OASF_RECORD_PATH}`);
    expect(oasf!.version).toBe(OASF_TAXONOMY_TAG);
    expect(oasf!.skills).toEqual(OASF_SKILLS.map((skill) => skill.name));
    expect(oasf!.domains).toEqual(OASF_DOMAINS.map((domain) => domain.name));

    // And the endpoint is a door, not a spelling: it serves the record.
    const response = await SELF.fetch(oasf!.endpoint);
    expect(response.status, "the OASF endpoint must serve").toBe(200);
    const record = (await response.json()) as { skills: { name: string }[] };
    expect(record.skills.map((skill) => skill.name)).toEqual(oasf!.skills);
  });

  /**
   * THE DOOR SAYS WHAT IS BEHIND IT. The guide's MCP entry carries
   * `mcpTools`; without it a reader of this file learns the store
   * speaks MCP and nothing about what it can be asked to do. Held to
   * the catalogue /mcp answers tools/list from, so the two cannot
   * disagree.
   */
  it("names every MCP tool the server serves", async () => {
    const doc = await fetchRegistration();
    const mcp = (doc.services as { name: string; mcpTools?: string[] }[]).find((s) => s.name === "MCP");
    const live = mcpToolCatalog(BASE).map((tool) => tool.name);
    expect(mcp?.mcpTools, "the MCP entry names no tools").toBeDefined();
    expect([...mcp!.mcpTools!].sort()).toEqual([...live].sort());
  });

  /**
   * WHERE THE STORE TAKES MONEY, held to the checkout's own table. A
   * rail advertised here that the checkout does not accept would be a
   * door that cannot be paid; a rail accepted and not advertised is
   * the store underselling itself to anyone who reads before knocking.
   */
  it("advertises exactly the rails the checkout accepts, as CAIP-10 accounts", () => {
    /*
     * A FIXTURE, NOT THE TEST ENV. The payout addresses are Worker
     * secrets and the test env has none, so reading the served
     * document here would assert "no rails" and pass for the wrong
     * reason. Two rails configured and two left unset is the case
     * worth pinning: the gate must advertise the first pair and stay
     * silent about the second.
     */
    const evm = "0xDD350976B8cfFc65938C0464d39A2C78BE079bd0";
    const fixture = {
      PAY_TO_ADDRESS: evm,
      POLYGON_PAY_TO: evm,
      SOLANA_PAY_TO: "1".repeat(32),
      ARBITRUM_PAY_TO: undefined,
      WORLD_PAY_TO: undefined,
    } as unknown as PaymentNetworkConfig;

    const doc = agentRegistrationFile(BASE, fixture);
    const wallets = (doc.services as { name: string; endpoint: string }[])
      .filter((service) => service.name === "agentWallet")
      .map((service) => service.endpoint);

    expect(wallets).toEqual(checkoutWallets(fixture).map((w) => `${w.network}:${w.address}`));
    expect(wallets).toContain(`eip155:8453:${evm}`);
    expect(wallets).toContain(`eip155:137:${evm}`);
    expect(wallets.some((w) => w.startsWith("solana:"))).toBe(true);

    // An unconfigured rail is never advertised: a door that cannot be paid.
    expect(wallets.some((w) => w.startsWith("eip155:42161:"))).toBe(false);
    expect(wallets.some((w) => w.startsWith("eip155:480:"))).toBe(false);

    for (const account of wallets) {
      // <namespace>:<reference>:<address> — never a bare address.
      expect(account.split(":").length, `${account} is not a CAIP-10 account`).toBe(3);
    }
  });

  it("advertises, in the served document, exactly what this env accepts", async () => {
    const doc = await fetchRegistration();
    const wallets = (doc.services as { name: string; endpoint: string }[])
      .filter((service) => service.name === "agentWallet")
      .map((service) => service.endpoint);
    expect(wallets).toEqual(checkoutWallets(env as unknown as PaymentNetworkConfig).map((w) => `${w.network}:${w.address}`));
  });

  it("claims x402 support and active status", async () => {
    const doc = await fetchRegistration();
    expect(doc.x402Support).toBe(true);
    expect(doc.active).toBe(true);
  });

  it("claims no trust model it has not wired", async () => {
    const doc = await fetchRegistration();
    /*
     * THE FIELD WAS ABSENT UNTIL 2026-09-16, and this case is what
     * made adding it a deliberate edit rather than a drift. It stays
     * a whitelist for the same reason: the two values NOT here are
     * the ones a nicer word would have slipped in.
     *
     * crypto-economic means stake at risk — no bond, no slashing
     * condition, nothing an aggrieved client could seize, and this
     * store is explicitly not an escrow or a guarantor.
     * tee-attestation means attested hardware; the work runs in a
     * Worker and on a keeper's hands. Both would be legible to a
     * machine and false, which is the worst kind: nobody catches it
     * by reading.
     */
    expect(doc.supportedTrust).toEqual(["reputation"]);
    expect(doc.supportedTrust).not.toContain("crypto-economic");
    expect(doc.supportedTrust).not.toContain("tee-attestation");
  });

  it("only claims reputation because the channel behind it exists", async () => {
    const doc = await fetchRegistration();
    /*
     * A declared trust model that leads nowhere is worse than an
     * absent one: it is legible, checkable, and wrong. So the claim
     * is tied to the thing that makes it true — the feedback channel
     * published on the store's own surfaces, carrying the registry
     * address and the verified call. If that channel is ever removed
     * the declaration has to go with it, and this fails first.
     */
    expect(doc.supportedTrust).toContain("reputation");

    const trust = (await (
      await SELF.fetch(`${BASE}/.well-known/trust.json`)
    ).json()) as Record<string, any>;
    const channel = trust.chain_identity?.client_feedback;
    expect(channel, "reputation is declared with no channel behind it").toBeTruthy();
    expect(channel.reputation_registry).toBe(REPUTATION_REGISTRY);
    expect(channel.write_it.call).toBe(GIVE_FEEDBACK_SIGNATURE);
  });

  it("is reachable from the x402 discovery catalog", async () => {
    /*
     * A document nothing points at is a document nobody finds. The
     * agentURI will point here from the chain; the catalog points
     * here from the origin.
     */
    const response = await SELF.fetch(`${BASE}/.well-known/x402.json`);
    const catalog = (await response.json()) as Record<string, unknown>;
    expect(catalog.agent_registration).toBe(`${BASE}${AGENT_REGISTRATION_PATH}`);
  });
});
