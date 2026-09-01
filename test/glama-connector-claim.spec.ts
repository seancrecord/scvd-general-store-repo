import { SELF, env } from "cloudflare:test";
import { afterEach, describe, expect, it } from "vitest";
import type { Env } from "@/types";

/**
 * THE CONNECTOR CLAIM, AND WHY IT IS ALLOWED TO BE ABSENT.
 *
 * Glama carries this store twice. The auto-crawled entry under the
 * REPOSITORY is claimed by the root glama.json naming a GitHub
 * maintainer, which shipped long ago. The CONNECTOR page, under the
 * registry name store.scvd/general-store, is claimed by an HTTP
 * challenge instead: Glama's own opaque token, served as JSON from the
 * connector's own origin.
 *
 * Two things this file pins, and they pull in opposite directions on
 * purpose.
 *
 * FIRST, THE SHAPE IS THEIRS. `$schema` naming the connector schema
 * and `claim` carrying the token, read off Glama's own instruction
 * rather than inferred from the repo-level glama.json, which is a
 * different document for a different listing with a different required
 * field. Writing a document to a spec nobody had read against the
 * reader that consumes it is exactly what put a card on this origin
 * declaring tools and naming none, and it cost 37 points for two days.
 *
 * SECOND, UNCLAIMED MUST 404. A claim document carrying an empty
 * string, a placeholder, or the literal `glama_claim_...` from the
 * example would fail Glama's check while looking to us like it
 * passed — a surface that answers with less than it promises, which is
 * the same defect in a smaller hat. Absent is honest; hollow is not.
 */

const BASE = "https://scvd.store";
const testEnv = env as unknown as Env;

/** A shape-correct token. Not a real one; nothing here claims anything. */
const TOKEN = "glama_claim_test_0000000000000000";

afterEach(() => {
  delete testEnv.GLAMA_CLAIM;
});

describe("the Glama connector claim", () => {
  it("404s while the store has nothing to claim", async () => {
    // The default posture, and the one the store shipped in. An
    // unclaimed origin publishes no claim.
    delete testEnv.GLAMA_CLAIM;
    const response = await SELF.fetch(`${BASE}/.well-known/glama.json`);
    expect(response.status).toBe(404);
  });

  it("serves the token in Glama's own field names once set", async () => {
    testEnv.GLAMA_CLAIM = TOKEN;
    const response = await SELF.fetch(`${BASE}/.well-known/glama.json`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type") ?? "").toContain(
      "application/json",
    );
    const body = (await response.json()) as Record<string, unknown>;
    expect(body["$schema"]).toBe("https://glama.ai/mcp/schemas/connector.json");
    expect(body["claim"]).toBe(TOKEN);
  });

  it("carries the claim and nothing else", async () => {
    /*
     * A claim document is not the place to start a third copy of the
     * maintainer list, the tool count or the description. Every one of
     * those already has a home, and a second home is a drift waiting
     * for a quiet week.
     */
    testEnv.GLAMA_CLAIM = TOKEN;
    const body = (await (
      await SELF.fetch(`${BASE}/.well-known/glama.json`)
    ).json()) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(["$schema", "claim"]);
  });

  it("treats a whitespace-only token as no token at all", async () => {
    // The failure mode a secret set to "" or " " would otherwise
    // produce: a 200 carrying a claim of nothing, which reads as
    // claimed to us and fails for them.
    testEnv.GLAMA_CLAIM = "   ";
    const response = await SELF.fetch(`${BASE}/.well-known/glama.json`);
    expect(response.status).toBe(404);
  });

  it("trims a token a careless paste left padded", async () => {
    testEnv.GLAMA_CLAIM = `  ${TOKEN}\n`;
    const body = (await (
      await SELF.fetch(`${BASE}/.well-known/glama.json`)
    ).json()) as Record<string, unknown>;
    expect(body["claim"]).toBe(TOKEN);
  });

  it("stays on the origin Glama will fetch it from", async () => {
    /*
     * The challenge requires the file on the CONNECTOR's origin. The
     * connector's URL is the MCP door, so the claim and the door have
     * to be the same host — asserted against the store's own base
     * rather than a literal, so a base change moves both together.
     */
    testEnv.GLAMA_CLAIM = TOKEN;
    const claim = new URL(`${testEnv.STORE_BASE_URL}/.well-known/glama.json`);
    const door = new URL(`${testEnv.STORE_BASE_URL}/mcp`);
    expect(claim.origin).toBe(door.origin);
    expect((await SELF.fetch(claim.href)).status).toBe(200);
  });
});
