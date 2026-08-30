import { SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { installFacilitatorMock } from "./helpers/facilitator-mock";
import {
  AUTH_DOC_PATH,
  PROTECTED_RESOURCE_PATH,
  agentAuthBlock,
} from "@/store/agent-auth";

const BASE = "https://scvd.store";

/**
 * THE AUTH DOCUMENTS, AND THE ONE WAY THEY CAN LIE.
 *
 * Everything on /auth.md and /.well-known/oauth-protected-resource is
 * a claim about doors — "this one is free", "that one takes a
 * payment", "here is where the terms are". A claim about a door is
 * checkable by knocking on it, so this file knocks. A metadata
 * document naming a URL that 404s is worse than no document: it sends
 * a diligence pass away with a broken map and our name on it.
 */
describe("the agent-auth surfaces", () => {
  beforeAll(() => {
    installFacilitatorMock();
  });

  /**
   * THE HINT ON THE CHALLENGE ITSELF, which is the only one of these
   * surfaces a client reaches without having chosen to look. A buyer
   * who read nothing still gets handed the path to everything else.
   */
  it("points a 402 at the metadata document with a standard header", async () => {
    const response = await SELF.fetch(`${BASE}/api/buy/hello`);
    expect(response.status).toBe(402);
    const hint = response.headers.get("WWW-Authenticate") ?? "";
    expect(hint).toContain(`${BASE}${PROTECTED_RESOURCE_PATH}`);
    // One parameter, deliberately: the challenge header block is
    // spent against Node's 16KB cliff. See lib/payment-gate.ts.
    expect(hint.split(",")).toHaveLength(1);
  });

  it("serves auth.md as markdown with frontmatter a parser can read", async () => {
    const response = await SELF.fetch(`${BASE}${AUTH_DOC_PATH}`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/markdown");
    const body = await response.text();
    expect(body.startsWith("---\n")).toBe(true);
    const frontmatter = body.slice(4, body.indexOf("\n---\n", 4));
    // The fields a scanner reads to decide whether it can get in.
    for (const key of [
      "title:",
      "description:",
      "auth_type:",
      "registration_required:",
      "protected_resource_metadata:",
    ]) {
      expect(frontmatter, `frontmatter is missing ${key}`).toContain(key);
    }
    // The structure a reader needs: how to get in, what goes wrong.
    expect(body).toContain("# Authentication");
    expect(body).toContain("## Errors you may meet on the way in");
    expect(body).toContain("## Rate limits");
    expect(body).toContain("Idempotency-Key");
  });

  it("serves RFC 9728 metadata that claims no issuer it does not have", async () => {
    const response = await SELF.fetch(`${BASE}${PROTECTED_RESOURCE_PATH}`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.resource).toBe(BASE);
    expect(body.resource_documentation).toBe(`${BASE}${AUTH_DOC_PATH}`);
    /*
     * The load-bearing absence. `authorization_servers` is optional in
     * RFC 9728 and this store has no OAuth issuer, so the field must
     * stay off the document entirely — an empty array would read as
     * "an issuer list we failed to fill in", and a fabricated URL
     * would be the exact defect this store sells the detection of.
     */
    expect(body).not.toHaveProperty("authorization_servers");
    expect(body.bearer_methods_supported).toEqual([]);
    expect(body).toHaveProperty("agent_auth");
  });

  it("answers on every URL the agent_auth block names", async () => {
    const block = agentAuthBlock(BASE);
    const named = [
      block.documentation_url,
      block.protected_resource_metadata,
      block.payment_protocol.terms,
      block.contact,
      ...block.tiers.flatMap((tier) => tier.example_urls),
    ].filter((url): url is string => typeof url === "string");

    const dead: string[] = [];
    for (const url of new Set(named)) {
      // A templated door is a shape, not an address; knocking on the
      // literal braces would test nothing.
      if (url.includes("{")) continue;
      const response = await SELF.fetch(url, { method: "GET" });
      /*
       * A REFUSAL IS AN ANSWER, where the block promised that refusal.
       * 402 is a paid door quoting its price; 401 is the keeper's desk
       * behaving exactly as the "it is not for you" tier says it will;
       * 405 is a POST-only intake door that exists and said so. What
       * this guard is actually hunting is 404 — a URL published in our
       * own metadata with nothing behind it.
       */
      if (![200, 401, 402, 405].includes(response.status)) {
        dead.push(`${url} → ${response.status}`);
      }
    }
    expect(
      dead.join("\n"),
      "the agent_auth block names these URLs and they do not answer",
    ).toBe("");
  });
});
