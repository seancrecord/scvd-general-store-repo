import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import {
  AGENT_REGISTRATION_PATH,
  ERC8004_REGISTRATION_TYPE,
  SCVD_AGENT_ID,
  SCVD_AGENT_REGISTRY,
} from "@/services/agent-registration";
import { STORE_METADATA, STORE_SERVICE_NAME } from "@/store/metadata";
import { registryDescription } from "@/store/identity-lead";
import { NEVER_A_RANKING_SENTENCE } from "@/store/copy/doctrine";
import { MENU_ITEMS } from "@/store";

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

  it("claims x402 support and active status", async () => {
    const doc = await fetchRegistration();
    expect(doc.x402Support).toBe(true);
    expect(doc.active).toBe(true);
  });

  it("claims no trust model it has not wired", async () => {
    const doc = await fetchRegistration();
    /*
     * supportedTrust is OPTIONAL, and absent means "discovery, not
     * trust" by the ERC's own sentence. That is where this store
     * stands until a trust model is actually connected. This case
     * exists so adding one is a deliberate edit with a failing test
     * in front of it, not something that drifts in beside a nicer
     * word.
     */
    expect(doc.supportedTrust).toBeUndefined();
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
