import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { isRecord } from "@/types";

const BASE = "https://scvd.store";

/**
 * THE EMPTY SHELVES, added 2026-08-11 after Smithery's scanner probed
 * resources/list and prompts/list, took the spec-correct -32601 for a
 * failure, and printed two warnings on the store's page: "Failed to
 * list resources... Failed to list prompts".
 *
 * The -32601 was not wrong — a server that does not declare a
 * capability may refuse its methods — but every directory scanner
 * probes them anyway, and "no such door" reads as breakage where
 * "nothing here" reads as an answer. So the capabilities are now
 * DECLARED AND EMPTY: the list methods answer honestly with nothing,
 * and the read/get methods still refuse, because with zero resources
 * and zero prompts every URI and name a caller sends is one we do
 * not have. Tools stay the whole catalog.
 *
 * CORRECTION, 2026-08-21. "Tools stay the whole catalog" is the part
 * that did not survive contact with a second auditor. A readiness
 * audit read the same handshake and called the resources capability a
 * FAILURE rather than a warning, on reasoning the 2026-08-11 note
 * never addressed: a server that advertises resources and lists none
 * has made a promise it does not keep, and the honest options are to
 * stop advertising or to stock the shelf.
 *
 * Stocking it was right, because the PREMISE was the error. This
 * store publishes five machine-readable context surfaces free and
 * forever — the guide, the manual, the catalog, the criteria, the
 * week's routing data — and every one is a resource in the exact
 * sense the protocol means. They were reachable over HTTPS and
 * invisible to an MCP client.
 *
 * So one assertion below inverts, and the original reasoning still
 * holds everywhere else it applies: prompts are still declared and
 * empty, templates are still empty, an unknown URI is still -32002,
 * and an unknown METHOD is still -32601. What changed is one factual
 * claim about what this store has.
 * The shelf's own guards are in test/mcp-resources.spec.ts.
 */

async function rpc(body: Record<string, unknown>) {
  const res = await SELF.fetch(`${BASE}/mcp`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, ...body }),
  });
  return (await res.json()) as Record<string, unknown>;
}

describe("the handshake declares what the shelves will answer", () => {
  it("carries tools, resources, and prompts capabilities together", async () => {
    const reply = await rpc({ method: "initialize", params: {} });
    const result = isRecord(reply["result"]) ? reply["result"] : {};
    const capabilities = isRecord(result["capabilities"])
      ? result["capabilities"]
      : {};
    // A declared capability whose list method errors, or an answering
    // list method behind an undeclared capability, are the same
    // defect: the handshake and the shelves disagreeing.
    expect(capabilities["tools"]).toBeDefined();
    expect(capabilities["resources"]).toBeDefined();
    expect(capabilities["prompts"]).toBeDefined();
  });
});

describe("the empty shelves answer honestly", () => {
  it("resources/list answers, and since 2026-08-21 it answers with resources", async () => {
    /*
     * The original assertion here was `toEqual([])`, correct for the
     * ten days the shelf was empty. What it was really defending is
     * the property below: the method ANSWERS rather than erroring,
     * because a scanner reads -32601 as breakage. That property is
     * unchanged. Only the contents are.
     */
    const reply = await rpc({ method: "resources/list", params: {} });
    expect(reply["error"]).toBeUndefined();
    const result = isRecord(reply["result"]) ? reply["result"] : {};
    const resources = result["resources"] as unknown[];
    expect(Array.isArray(resources)).toBe(true);
    // And the correction itself: a declared capability keeps its promise.
    expect(resources.length).toBeGreaterThan(0);
  });

  it("resources/templates/list is empty too, since scanners probe it next", async () => {
    const reply = await rpc({ method: "resources/templates/list", params: {} });
    expect(reply["error"]).toBeUndefined();
    const result = isRecord(reply["result"]) ? reply["result"] : {};
    expect(result["resourceTemplates"]).toEqual([]);
  });

  it("prompts/list is an empty list, not a missing method", async () => {
    const reply = await rpc({ method: "prompts/list", params: {} });
    expect(reply["error"]).toBeUndefined();
    const result = isRecord(reply["result"]) ? reply["result"] : {};
    expect(result["prompts"]).toEqual([]);
  });

  it("resources/read still refuses a URI the shelf does not carry", async () => {
    const reply = await rpc({
      method: "resources/read",
      params: { uri: "file:///anything" },
    });
    const error = isRecord(reply["error"]) ? reply["error"] : {};
    expect(error["code"]).toBe(-32002);
  });

  it("prompts/get refuses, since no prompt exists to get", async () => {
    const reply = await rpc({
      method: "prompts/get",
      params: { name: "anything" },
    });
    const error = isRecord(reply["error"]) ? reply["error"] : {};
    expect(error["code"]).toBe(-32602);
  });

  it("a genuinely unknown method still gets -32601", async () => {
    // The empty shelves must not have widened into answering
    // everything: the method-not-found door still exists.
    const reply = await rpc({ method: "completion/complete", params: {} });
    const error = isRecord(reply["error"]) ? reply["error"] : {};
    expect(error["code"]).toBe(-32601);
  });
});
