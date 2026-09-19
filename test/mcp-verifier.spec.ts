import { SELF, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { readPorchLedger } from "@/lib/metrics";
import type { Env } from "@/types";
import receiptValid from "../verifier/fixtures/receipt-valid.json";
import { VERIFIER_SERVER_NAME, VERIFIER_TOOLS, verifierToolCatalog } from "@/routes/mcp-verifier";
import { mcpToolCatalog } from "@/lib/mcp-tools";
import { DEFECT_CLASSES } from "@/store/defect-vocabulary";
import { FREE_DOORS } from "@/store/atlas";
import { readAskedFor } from "@/services/asked-queue";

/**
 * THE VERIFIER DOOR (2026-09-03, roadmap A3). What this file holds:
 *
 *   - tools/list serves exactly five tools, none of them a buy, each
 *     declaring its bookkeeping writes, under task-shaped names;
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

describe("the porch counts this door", () => {
  it("books a handshake and a named tool call under mcp-verifier:, and nothing for a name not on the door", async () => {
    const testEnv = env as unknown as Env;
    const before = await readPorchLedger(testEnv);
    const listBefore = before.surfaces["mcp-verifier:tools/list"]?.["organic:mcp"] ?? 0;
    const toolBefore = before.surfaces["mcp-verifier:tool:get_defect_definition"]?.["organic:mcp"] ?? 0;
    await rpc("tools/list");
    await rpc("tools/call", { name: "get_defect_definition", arguments: {} });
    await rpc("tools/call", { name: "buy_observation", arguments: {} });
    // The porch write is deferred past the response and, since
    // 2026-09-11, goes through the counter ledger before it reaches
    // KV; give the last one a beat to land, as the porch suite does.
    await new Promise((resolve) => setTimeout(resolve, 50));
    const after = await readPorchLedger(testEnv);
    expect(after.surfaces["mcp-verifier:tools/list"]?.["organic:mcp"]).toBe(listBefore + 1);
    expect(after.surfaces["mcp-verifier:tool:get_defect_definition"]?.["organic:mcp"]).toBe(toolBefore + 1);
    expect(after.surfaces["mcp-verifier:tool:buy_observation"]).toBeUndefined();
    const catalog = verifierToolCatalog(BASE);
    for (const entry of catalog) {
      // Every listed tool takes the same traffic-writing dispatch path.
      expect(entry["annotations"]).toMatchObject({ readOnlyHint: false });
    }
  });
});

describe("tools/list", () => {
  it("serves the verifier roster with explicit effects and no buy", async () => {
    const { result } = await rpc("tools/list");
    const names = result.tools.map((tool: { name: string }) => tool.name);
    expect(names).toEqual(VERIFIER_TOOLS.map((tool) => tool.name));
    expect(names.some((name: string) => name.startsWith("buy_"))).toBe(false);
    for (const tool of result.tools) {
      expect(tool.annotations.readOnlyHint).toBe(false);
      expect(tool.annotations.destructiveHint).toBe(false);
      expect(typeof tool.inputSchema).toBe("object");
    }
  });

  it("never contradicts /mcp about whether a renamed tool reaches outside the store", () => {
    /*
     * 2026-09-16. This door read openWorldHint off one negation
     * ("everything but the defect vocabulary is open"), and so told
     * clients that verify_scvd_artifact reaches outward while /mcp
     * told them the same tool does not. The same tool, two doors,
     * two answers — the drift this file exists to make impossible,
     * on the field a directory reviewer reads first.
     *
     * A tool renamed from /mcp inherits its base's reading. A tool
     * this door owns has no base to disagree with and is asserted
     * below by name.
     */
    const here = verifierToolCatalog(BASE);
    const full = mcpToolCatalog(BASE);
    for (const entry of VERIFIER_TOOLS.filter((tool) => tool.base)) {
      const mine = here.find((tool) => tool["name"] === entry.name)!;
      const theirs = full.find((tool) => tool.name === entry.base)!;
      expect(
        (mine["annotations"] as Record<string, unknown>)["openWorldHint"],
        `${entry.name} and ${entry.base} disagree about openWorldHint`,
      ).toBe(theirs.annotations?.openWorldHint);
      /*
       * 2026-09-19. The same guard, on the field the submission round
       * corrected: a metered handler is not read-only, whichever door
       * names it. Both doors read METERED_TOOL_EFFECTS for the shared
       * verification handlers, so the pairs agree today; this holds
       * them to it.
       */
      for (const hint of ["readOnlyHint", "destructiveHint"] as const) {
        expect(
          (mine["annotations"] as Record<string, unknown>)[hint],
          `${entry.name} and ${entry.base} disagree about ${hint}`,
        ).toBe(theirs.annotations?.[hint]);
      }
    }
  });

  it("pins exactly which /mcp tools still declare themselves read-only, dated", () => {
    /*
     * docs/SPEC_READS.md (2026-09-16): OpenAI's guidelines read
     * readOnlyHint as false for any handler that writes, counters
     * included, and the verifier door was corrected to say so before
     * submission. /mcp still declares readOnlyHint: true for the free
     * instruments below, whose handlers bump the porch counters; the
     * keeper has deliberately left that standing rather than take the
     * auto-approval friction a flip would add to every free call. That
     * is a decision, not drift — so the set is held EXACTLY, by name:
     * a tool that joins it or leaves it fails here and is argued for in
     * a commit, and the annotation itself moves only on his call.
     */
    const readOnly = mcpToolCatalog(BASE)
      .filter((tool) => tool.annotations?.readOnlyHint === true)
      .map((tool) => tool.name)
      .sort();
    expect(readOnly).toEqual([
      "check_a2a_card",
      "check_before_you_pay",
      "check_order",
      "check_purchase",
      "find_in_catalog",
      "look_at_door",
      "look_in_window",
      "read_binder",
      "read_store_guide",
    ]);
    // None of them is a shared verification handler: those carry the metered effects on both doors.
    for (const name of readOnly) expect(VERIFIER_TOOLS.map((tool) => tool.base)).not.toContain(name);
  });

  it("reads open world as what the call touches, not what the answer is about", () => {
    /*
     * The two doors this store's own tools own. The readiness lookup
     * is the interesting one: its SUBJECT is every host on the public
     * discovery list, and an unprobed host joins the public queue
     * for a later outbound sweep. That queued work is part of the
     * interaction even though this call does not probe the host.
     */
    const here = verifierToolCatalog(BASE);
    const reading = Object.fromEntries(
      here.map((tool) => [tool["name"], (tool["annotations"] as Record<string, unknown>)["openWorldHint"]]),
    );
    expect(reading).toEqual({
      preflight_x402_endpoint: true,
      verify_x402_receipt: true,
      lookup_endpoint_readiness: true,
      get_defect_definition: false,
      verify_scvd_artifact: false,
    });
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
    const asked = await readAskedFor(env as unknown as Env);
    expect(asked.hosts["never-met.example"]?.surfaces).toContain("look");
    const lookup = verifierToolCatalog(BASE).find((tool) => tool["name"] === "lookup_endpoint_readiness")!;
    expect(lookup["annotations"]).toMatchObject({ readOnlyHint: false, openWorldHint: true });
    expect(lookup["description"]).toMatch(/public.*queue/);
    expect(lookup["description"]).toContain("later sweep");
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
