import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { mcpResourceCatalog } from "@/lib/mcp-resources";

/**
 * A CAPABILITY YOU ADVERTISE IS A PROMISE.
 *
 * From 2026-08-11 this server declared the `resources` capability and
 * answered `resources/list` with an empty array. The reasoning was
 * sound at the time — Smithery's scanner counted a spec-correct
 * -32601 as a failure, so an honest empty shelf beat a closed door —
 * and it rested on a premise that was wrong: that the store had no
 * resources. It publishes five machine-readable context surfaces free
 * and forever, and a readiness audit on 2026-08-21 marked the gap as
 * a failure, correctly: advertise resources, serve resources.
 */

async function rpc(method: string, params?: unknown): Promise<{
  result?: Record<string, unknown>;
  error?: { code: number; message: string };
}> {
  const response = await SELF.fetch("https://scvd.store/mcp", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, ...(params ? { params } : {}) }),
  });
  return (await response.json()) as never;
}

describe("the MCP shelf", () => {
  it("lists at least one resource, because it says it has them", async () => {
    const handshake = await rpc("initialize", { protocolVersion: "2025-06-18" });
    const capabilities = handshake.result?.["capabilities"] as
      | Record<string, unknown>
      | undefined;
    expect(capabilities?.["resources"]).toBeTruthy();

    const listed = await rpc("resources/list");
    const resources = listed.result?.["resources"] as unknown[] | undefined;
    // The whole finding, in one assertion.
    expect(resources?.length ?? 0).toBeGreaterThan(0);
  });

  it("gives every resource the fields a client renders", async () => {
    const listed = await rpc("resources/list");
    const resources = (listed.result?.["resources"] ?? []) as Array<
      Record<string, string>
    >;
    for (const resource of resources) {
      expect(resource["uri"]).toBeTruthy();
      expect(resource["name"]).toBeTruthy();
      expect(resource["title"]).toBeTruthy();
      expect(resource["mimeType"]).toBeTruthy();
      // A description that does not say what the thing is for is a
      // filled field, not a described resource.
      expect((resource["description"] ?? "").length).toBeGreaterThan(40);
    }
  });

  it("actually serves the bytes behind each URI", async () => {
    for (const resource of mcpResourceCatalog()) {
      const read = await rpc("resources/read", { uri: resource.uri });
      const contents = read.result?.["contents"] as
        | Array<Record<string, string>>
        | undefined;
      expect(contents?.length).toBe(1);
      const body = contents?.[0];
      expect(body?.["uri"]).toBe(resource.uri);
      expect(body?.["mimeType"]).toBe(resource.mimeType);
      // A resource that reads back empty is a listing, not a shelf.
      expect((body?.["text"] ?? "").length).toBeGreaterThan(50);
    }
  });

  it("refuses an unknown URI with the spec's code, and names the shelf", async () => {
    const missing = await rpc("resources/read", { uri: "scvd://not-a-thing" });
    expect(missing.error?.code).toBe(-32002);
    // A refusal that lists what IS there costs nothing and saves a
    // round trip; this is the same courtesy the 404 page pays.
    expect(missing.error?.message).toContain("scvd://");
  });

  it("keeps a buyer's artifacts off the public shelf", async () => {
    /*
     * The line: everything here is published to everyone. A
     * certificate, a watch history or an audit report serves forever
     * at its own URL, but it arrived with a buyer's name on it, and a
     * resource list is a browsable index.
     */
    const uris = mcpResourceCatalog().map((resource) => resource.uri);
    for (const forbidden of ["cert", "watch", "order", "receipt", "anchor"]) {
      expect(uris.some((uri) => uri.includes(forbidden))).toBe(false);
    }
  });
});

describe("where the MCP server says it is", () => {
  it("answers at a predictable well-known path", async () => {
    /*
     * "Listed in a registry" is not "reachable". An audit found the
     * Smithery listing and could not complete a handshake, because
     * nothing at a predictable path named the endpoint.
     */
    const doc = await SELF.fetch("https://scvd.store/.well-known/mcp");
    expect(doc.status).toBe(200);
    const body = (await doc.json()) as Record<string, unknown>;
    expect(String(body["endpoint"])).toContain("/mcp");
    expect(body["transport"]).toBe("streamable-http");
    expect((body["free_methods"] as string[]).includes("tools/list")).toBe(true);
  });

  it("does not claim a capability the server does not serve", async () => {
    // The failure this whole file exists for, in the other direction:
    // the pointer must not advertise more than /mcp actually answers.
    const doc = await SELF.fetch("https://scvd.store/.well-known/mcp");
    const body = (await doc.json()) as {
      capabilities: Record<string, boolean>;
    };
    const listed = await rpc("prompts/list");
    const prompts = listed.result?.["prompts"] as unknown[] | undefined;
    expect(body.capabilities["prompts"]).toBe((prompts?.length ?? 0) > 0);
  });
});
