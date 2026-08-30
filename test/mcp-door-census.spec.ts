import { SELF, env } from "cloudflare:test";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { installFacilitatorMock } from "./helpers/facilitator-mock";
import { findMcpTool } from "@/lib/mcp-tools";
import { readMcpClients } from "@/services/mcp-clients";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";

beforeAll(() => {
  installFacilitatorMock();
});

let rpcId = 0;
async function rpc(
  method: string,
  params?: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  rpcId += 1;
  const response = await SELF.fetch(`${BASE}/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: rpcId, method, params }),
  });
  return (await response.json()) as Record<string, unknown>;
}

/**
 * THE DOOR NOW RECORDS WHAT WALKED THROUGH IT.
 *
 * Two blind spots, both found by reading the keeper's porch table
 * against the code on 2026-08-29:
 *
 *   1. The handshake carries clientInfo and the door discarded it, so
 *      12,280 monthly connections were anonymous by construction.
 *   2. tools/call was not recorded at all. Five handlers logged
 *      themselves; the other eight — every buy_* tool,
 *      read_store_guide, verify_artifact — were invisible. "Nobody
 *      calls the tools" was therefore never a measurement.
 */
describe("the handshake is counted by who made it", () => {
  it("records the client that announced itself", async () => {
    await rpc("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "some-test-client", version: "9.9" },
    });
    /*
     * The census rides waitUntil so the handshake never waits on it —
     * so the assertion waits instead, the way this suite's other
     * deferred-write tests do.
     */
    await vi.waitFor(async () => {
      const census = await readMcpClients(testEnv);
      expect(census["some-test-client"]).toBeGreaterThanOrEqual(1);
    });
  });

  it("answers a handshake that names nobody, and still counts it", async () => {
    // Two things at once, on purpose. The census must never be able to
    // refuse a connection: a door that fails when its own counter
    // fails is a worse trade than a door that does not count. But an
    // answered-the-handshake assertion alone passes on a door with no
    // census at all, so it is bound here to the count it is defending
    // — a nameless client is a real observation and lands as
    // "unnamed" rather than quietly shrinking the denominator.
    const reply = await rpc("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
    });
    expect(reply["result"]).toBeTruthy();
    await vi.waitFor(async () => {
      const census = await readMcpClients(testEnv);
      expect(census["unnamed"]).toBeGreaterThanOrEqual(1);
    });
  });
});

describe("every tool call leaves a trace, not just five", () => {
  it("records a free tool that never recorded itself", async () => {
    /*
     * read_store_guide is one of the eight that logged nothing. If
     * this passes, the door is counting the whole shelf rather than
     * the handful of handlers that happened to call the porch.
     */
    const { listRecentPorchEvents } = await import("@/lib/metrics");
    await rpc("tools/call", { name: "read_store_guide", arguments: {} });
    // The count rides waitUntil so the tool call never waits on it
    // (rule 50), so the assertion waits instead.
    await vi.waitFor(async () => {
      const events = await listRecentPorchEvents(
        testEnv,
        "mcp:tool:read_store_guide",
      );
      expect(
        events.length,
        "read_store_guide left no trace at the MCP door",
      ).toBeGreaterThan(0);
    });
  });

  it("bounds the key space by the catalog, not by what a stranger types", async () => {
    /*
     * THIS GUARD USED TO BE UNFALSIFIABLE and that is the point of
     * rewriting it. It asserted only the ABSENCE of a key for an
     * invented tool name — which is true of a door that records
     * nothing at all, so it passed identically with the whole feature
     * stashed. Rule 46 names that class: a test asserting an absence
     * must derive it from the thing that would change it, or it is
     * green because the code never ran.
     *
     * So both halves are asserted together against the SAME catalog:
     * a tool the catalog lists leaves a key, an invented name does
     * not. The present half fails the moment the recording line goes
     * away, which is what makes the absent half worth reading.
     */
    const { listRecentPorchEvents } = await import("@/lib/metrics");
    const { mcpToolCatalog } = await import("@/lib/mcp-tools");
    // A free tool from the catalog: no itemId means nothing is sold,
    // so the call costs nothing and the recording line is still
    // reached — it sits above the handler, after the name is resolved.
    const listed = mcpToolCatalog(BASE).find(
      (tool) => !tool.itemId && !tool.itemIds,
    );
    expect(listed, "the catalog lists no free tool to walk").toBeTruthy();
    const invented = "not_a_real_tool_xyz";
    expect(
      findMcpTool(invented, BASE),
      "the invented name is on the shelf, so this proves nothing",
    ).toBeUndefined();

    await rpc("tools/call", { name: listed!.name, arguments: {} });
    await rpc("tools/call", { name: invented, arguments: {} });

    await vi.waitFor(async () => {
      expect(
        (await listRecentPorchEvents(testEnv, `mcp:tool:${listed!.name}`))
          .length,
        `${listed!.name} is on the shelf and left no trace`,
      ).toBeGreaterThan(0);
    });
    expect(
      (await listRecentPorchEvents(testEnv, `mcp:tool:${invented}`)).length,
      "an invented tool name minted a counter key",
    ).toBe(0);
  });
});
