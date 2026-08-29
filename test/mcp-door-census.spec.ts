import { SELF, env } from "cloudflare:test";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { installFacilitatorMock } from "./helpers/facilitator-mock";
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

  it("still answers a handshake that names nobody", async () => {
    // The census must never be able to refuse a connection: a door
    // that fails when its own counter fails is a worse trade than a
    // door that does not count.
    const reply = await rpc("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
    });
    expect(reply["result"]).toBeTruthy();
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
    const events = await listRecentPorchEvents(
      testEnv,
      "mcp:tool:read_store_guide",
    );
    expect(
      events.length,
      "read_store_guide left no trace at the MCP door",
    ).toBeGreaterThan(0);
  });

  it("refuses an unknown tool before it can mint a counter key", async () => {
    /*
     * The key-space guard. Surfaces are bounded by the catalog: an
     * invented tool name is refused above the recording line, so a
     * stranger cannot write new keys by calling nonsense.
     */
    const { listRecentPorchEvents } = await import("@/lib/metrics");
    await rpc("tools/call", { name: "not_a_real_tool_xyz", arguments: {} });
    const events = await listRecentPorchEvents(
      testEnv,
      "mcp:tool:not_a_real_tool_xyz",
    );
    expect(events.length).toBe(0);
  });
});
