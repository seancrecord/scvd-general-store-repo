import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

/**
 * THE CARD THAT COST 37 POINTS BY ANSWERING.
 *
 * On 2026-08-30 this store began serving its server card at
 * /.well-known/mcp/server-card.json — a third spelling, added because
 * a scan had 404'd there and reported the store as having no MCP
 * server card at all. The card was true, current, and missing one
 * thing: it declared `capabilities.tools: true` and then named no
 * tools.
 *
 * Smithery reads that path and takes the card INSTEAD OF calling
 * tools/list. Its scan log, verbatim:
 *
 *   Using .well-known/mcp/server-card.json: (6 resources)
 *
 * Six resources, zero tools, and a capability score of 0/40 — reported
 * as "Descriptions 0/0", a denominator rather than a judgement. The
 * store's score went 97 to 60 on a commit that changed no tool and no
 * description. Nothing was broken; a document simply answered with
 * less than the server has, and the reader believed it, which is what
 * a card is for.
 *
 * The two drafts are the trap. SEP-2127, which this card is written
 * to, puts name and version flat and says nothing about listing
 * capabilities. SEP-1649, which Smithery reads, nests them under
 * `serverInfo` and types `tools`/`resources`/`prompts` from the MCP
 * SDK. `resources` is spelled identically in both — which is exactly
 * why the failure was silent: the card answered in a shape that was
 * partly legible, so it read as a complete answer rather than a
 * mismatched one.
 *
 * What this file pins is the general rule, not the vendor: a discovery
 * document that enumerates a capability must enumerate ALL of it, and
 * must not become a second source of truth for what the server serves.
 */

const BASE = "https://scvd.store";

/** Every path the one card answers at. A fix at one is a fix at all. */
const CARD_PATHS = [
  "/.well-known/mcp",
  "/.well-known/mcp.json",
  "/.well-known/mcp/server-card.json",
] as const;

async function card(
  path: (typeof CARD_PATHS)[number] = "/.well-known/mcp/server-card.json",
): Promise<Record<string, unknown>> {
  const response = await SELF.fetch(`${BASE}${path}`);
  expect(response.status, path).toBe(200);
  return (await response.json()) as Record<string, unknown>;
}

async function rpc(method: string, params?: unknown) {
  const response = await SELF.fetch(`${BASE}/mcp`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method,
      ...(params ? { params } : {}),
    }),
  });
  return (await response.json()) as { result?: Record<string, unknown> };
}

describe("the server card names the tools it claims to have", () => {
  it("carries a tools array, not just a tools capability", async () => {
    // The whole finding, in one assertion.
    const body = await card();
    const tools = body["tools"];
    expect(Array.isArray(tools)).toBe(true);
    expect((tools as unknown[]).length).toBeGreaterThan(0);
  });

  it("names exactly the tools tools/list serves, in the same order", async () => {
    /*
     * The card must not become a second catalog. Both sides are read
     * live and compared to EACH OTHER, never to a literal (rule 46):
     * a tool added tomorrow appears in both or this fails.
     */
    const listed = await rpc("tools/list");
    const served = (listed.result?.["tools"] ?? []) as Array<{ name: string }>;
    const carded = ((await card())["tools"] ?? []) as Array<{ name: string }>;
    expect(carded.map((tool) => tool.name)).toEqual(
      served.map((tool) => tool.name),
    );
  });

  it("declares no capability it then leaves unlisted", async () => {
    /*
     * The rule the 08-30 card broke, stated so it binds resources and
     * prompts too rather than only the field that happened to fail.
     */
    const body = await card();
    const capabilities = body["capabilities"] as Record<string, boolean>;
    for (const key of ["tools", "resources", "prompts"] as const) {
      const listed = (body[key] ?? []) as unknown[];
      expect(Array.isArray(listed), `card.${key} must be an array`).toBe(true);
      expect(listed.length > 0, `capabilities.${key} vs card.${key}`).toBe(
        capabilities[key],
      );
    }
  });
});

describe("the card's tools are shaped the way a card reader types them", () => {
  it("carries only fields the MCP Tool defines", async () => {
    /*
     * At /mcp the rule-57 error catalogue, the security block, `reads`
     * and the per-item listing specs ride along harmlessly — an MCP
     * client ignores a key it does not know. A card reader types these
     * entries from the SDK, so the card gets the spec's Tool and
     * nothing else. 164 KB of catalog, 51 KB of card.
     */
    const SPEC_KEYS = new Set([
      "name",
      "title",
      "description",
      "inputSchema",
      "outputSchema",
      "annotations",
    ]);
    const carded = ((await card())["tools"] ?? []) as Array<
      Record<string, unknown>
    >;
    for (const tool of carded) {
      for (const key of Object.keys(tool)) {
        expect(SPEC_KEYS.has(key), `${tool["name"]} carries ${key}`).toBe(true);
      }
    }
  });

  it("gives every tool the fields a scanner scores", async () => {
    const carded = ((await card())["tools"] ?? []) as Array<
      Record<string, unknown>
    >;
    for (const tool of carded) {
      const name = String(tool["name"]);
      expect(name, "name").toBeTruthy();
      // Promoted to a top-level field in MCP 2025-06-18; every one of
      // these tools already carried it as annotations.title.
      expect(typeof tool["title"], `${name} title`).toBe("string");
      expect(String(tool["description"] ?? "").length, `${name} description`)
        .toBeGreaterThan(0);
      expect(tool["inputSchema"], `${name} inputSchema`).toBeTruthy();
      expect(tool["outputSchema"], `${name} outputSchema`).toBeTruthy();
      expect(tool["annotations"], `${name} annotations`).toBeTruthy();

      // Parameter descriptions are scored separately from the tool's
      // own, and are the half a catalog forgets.
      const properties = ((tool["inputSchema"] as Record<string, unknown>)[
        "properties"
      ] ?? {}) as Record<string, { description?: string }>;
      for (const [parameter, schema] of Object.entries(properties)) {
        expect(
          String(schema.description ?? "").length,
          `${name}.${parameter} description`,
        ).toBeGreaterThan(0);
      }
    }
  });

  it("says the same thing at all three of its URLs", async () => {
    // One card, three spellings; a fix that lands at one path and not
    // the others is the 404-as-absence failure wearing a new hat.
    const bodies = await Promise.all(CARD_PATHS.map((path) => card(path)));
    const canonical = JSON.stringify(bodies[0]);
    for (const body of bodies) expect(JSON.stringify(body)).toBe(canonical);
  });
});

describe("the card answers in both drafts' spellings", () => {
  it("carries serverInfo, which SEP-1649 marks required", async () => {
    const body = await card();
    const serverInfo = body["serverInfo"] as Record<string, unknown>;
    expect(serverInfo).toBeTruthy();
    expect(typeof serverInfo["name"]).toBe("string");
    expect(typeof serverInfo["version"]).toBe("string");
  });

  it("cannot say two things about its own name and version", async () => {
    /*
     * Two spellings of one identity is two chances to drift. Compared
     * to the handshake as well, which is where a client actually
     * learns them — the same comparison the C2 version test makes.
     */
    const body = await card();
    const serverInfo = body["serverInfo"] as Record<string, unknown>;
    const handshake = await rpc("initialize", {
      protocolVersion: "2025-06-18",
    });
    const declared = handshake.result?.["serverInfo"] as Record<string, unknown>;

    expect(serverInfo["name"]).toBe(body["name"]);
    expect(serverInfo["version"]).toBe(body["version"]);
    expect(serverInfo["name"]).toBe(declared["name"]);
    expect(serverInfo["version"]).toBe(declared["version"]);
  });
});
