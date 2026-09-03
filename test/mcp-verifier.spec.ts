import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import receiptValid from "../verifier/fixtures/receipt-valid.json";
import { VERIFIER_SERVER_NAME, VERIFIER_TOOLS, verifierToolCatalog } from "@/routes/mcp-verifier";
import { mcpToolCatalog } from "@/lib/mcp-tools";
import { DEFECT_CLASSES } from "@/store/defect-vocabulary";
import { FREE_DOORS } from "@/store/atlas";

/**
 * THE VERIFIER DOOR (2026-09-03, roadmap A3). What this file holds:
 *
 *   - tools/list serves exactly five tools, none of them a buy, each
 *     read-only by annotation, under task-shaped names;
 *   - the three renamed tools carry the base tool's input schema, so
 *     a client built against /mcp's shapes works here unchanged;
 *   - tools/call runs the same handlers: a receipt verifies here as
 *     it does on /mcp; the readiness lookup and the defect definition
 *     answer from the chain and the vocabulary;
 *   - a paid tool's name is refused as unknown on this door;
 *   - initialize names the verifier, and the door is on the atlas.
 */

const BASE = "https://scvd.store";

async function rpc(method: string, params: Record<string, unknown> = {}, id = 1): Promise<Record<string, any>> {
  const response = await SELF.fetch(`${BASE}/mcp/verifier`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });
  return (await response.json()) as Record<string, any>;
}

describe("tools/list", () => {
  it("serves exactly five read-only tools under task-shaped names and no buy", async () => {
    const { result } = await rpc("tools/list");
    const names = result.tools.map((tool: { name: string }) => tool.name);
    expect(names).toEqual(VERIFIER_TOOLS.map((tool) => tool.name));
    expect(names.some((name: string) => name.startsWith("buy_"))).toBe(false);
    for (const tool of result.tools) {
      expect(tool.annotations.readOnlyHint).toBe(true);
      expect(tool.annotations.destructiveHint).toBe(false);
      expect(typeof tool.inputSchema).toBe("object");
    }
  });

  it("the renamed tools carry the base tool's input schema from /mcp", () => {
    const here = verifierToolCatalog(BASE);
    const full = mcpToolCatalog(BASE);
    for (const entry of VERIFIER_TOOLS.filter((tool) => tool.base)) {
      const mine = here.find((tool) => tool["name"] === entry.name)!;
      const theirs = full.find((tool) => tool.name === entry.base)!;
      expect(mine["inputSchema"]).toEqual(theirs.inputSchema);
    }
  });
});

describe("tools/call", () => {
  it("verifies a receipt through the same handler /mcp uses", async () => {
    const { result } = await rpc("tools/call", { name: "verify_x402_receipt", arguments: { artifact: receiptValid.receipt, public_key_hex: receiptValid.publicKeyHex } }, 2);
    expect(result.structuredContent.verdict).toBe("conforms");
  });

  it("looks up readiness from the chain and a defect from the vocabulary", async () => {
    const readiness = await rpc("tools/call", { name: "lookup_endpoint_readiness", arguments: { host: "never-met.example" } }, 3);
    expect(readiness.result.structuredContent.result).toBe("never_met");
    expect(readiness.result.structuredContent.does_not_establish.join(" ")).toMatch(/whether to pay/);
    const first = DEFECT_CLASSES[0]!;
    const defect = await rpc("tools/call", { name: "get_defect_definition", arguments: { id: first.id } }, 4);
    expect(defect.result.structuredContent.id).toBe(first.id);
    expect(defect.result.structuredContent.definition_url).toContain(`/defects#${first.id}`);
    const all = await rpc("tools/call", { name: "get_defect_definition", arguments: {} }, 5);
    expect(all.result.structuredContent.classes).toHaveLength(DEFECT_CLASSES.length);
    const missing = await rpc("tools/call", { name: "get_defect_definition", arguments: { id: "no-such-class" } }, 6);
    expect(missing.error.code).toBe(-32602);
  });

  it("refuses a paid tool's name as unknown on this door, and names what it serves", async () => {
    const { error } = await rpc("tools/call", { name: "buy_observation", arguments: { item_id: "service_audit" } }, 7);
    expect(error.code).toBe(-32602);
    expect(error.message).toContain("preflight_x402_endpoint");
  });
});

describe("the handshake and the door", () => {
  it("initialize names the verifier, not the store, and the door is on the atlas", async () => {
    const { result } = await rpc("initialize", { protocolVersion: "2025-11-25" }, 8);
    expect(result.serverInfo.name).toBe(VERIFIER_SERVER_NAME);
    expect(result.instructions.toLowerCase()).toContain("evidence observatory");
    expect(result.instructions.toLowerCase()).not.toContain("buy_");
    const unknown = await rpc("resources/list", {}, 9);
    expect(unknown.error.code).toBe(-32601);
    const doc = (await (await SELF.fetch(`${BASE}/mcp/verifier`)).json()) as Record<string, any>;
    expect(doc.server).toBe(VERIFIER_SERVER_NAME);
    expect(FREE_DOORS.map((door) => door.path)).toContain("/mcp/verifier");
  });
});
