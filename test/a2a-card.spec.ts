import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { LATEST_PROTOCOL } from "@/routes/mcp";
import { A2A_PROTOCOL_VERSION, EVIDENCE_TASKS } from "@/services/a2a-evidence";

const BASE = "https://scvd.store";

async function json(path: string): Promise<Record<string, any>> {
  const response = await SELF.fetch(`${BASE}${path}`);
  expect(response.status, `${path} did not serve`).toBe(200);
  return (await response.json()) as Record<string, any>;
}

/**
 * THE A2A AGENT CARD (keeper's call, 2026-08-07; rewritten as the
 * evidence agent's 2026-09-03, roadmap A2). What is testable is the
 * same thing as always — that the card makes no claim the door behind
 * it cannot answer, and that it hangs where a reader would look. The
 * tasks themselves are test/a2a-evidence.spec.ts's.
 *
 * Until 2026-09-03 the card led with "MCP" because the store did not
 * speak the A2A message protocol; a canonical binding would have been
 * a false claim in machine form. It speaks it now, at POST /a2a, so
 * "JSONRPC" is the truth — and the honesty law holds in the other
 * direction: the card claims exactly the one canonical binding that
 * door answers, and never GRPC or HTTP+JSON.
 */
describe("the A2A agent card", () => {
  it("serves the same card at all three doors the spec's history left behind", async () => {
    const a2a = await json("/.well-known/a2a.json");
    const canonical = await json("/.well-known/agent-card.json");
    const legacy = await json("/.well-known/agent.json");
    expect(canonical).toEqual(a2a);
    expect(legacy).toEqual(a2a);
    expect(a2a.protocolVersion).toBe(A2A_PROTOCOL_VERSION);
    expect(a2a.name).toBeTruthy();
    expect(a2a.provider.organization).toBeTruthy();
  });

  it("names exactly the three tasks the door answers, and nothing from the shelf", async () => {
    const card = await json("/.well-known/a2a.json");
    expect(card.skills.map((skill: any) => skill.id)).toEqual([...EVIDENCE_TASKS]);
    for (const skill of card.skills) {
      expect(skill.description).not.toMatch(/\$\d/);
      expect(skill.tags).toContain("free");
    }
  });

  it("claims only the transport it actually speaks, and the door answers it", async () => {
    const card = await json("/.well-known/a2a.json");
    expect(card.preferredTransport).toBe("JSONRPC");
    expect(card.url).toBe(`${BASE}/a2a`);
    // The claim is checked against the door, not taken from the card:
    // message/send at card.url is answered with a result, not
    // "method not found".
    const response = await SELF.fetch(card.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "message/send",
        params: { message: { role: "user", messageId: "m-1", parts: [{ kind: "data", data: { task: "get_endpoint_readiness", host: "never-met.example" } }] } },
      }),
    });
    const answer = (await response.json()) as Record<string, any>;
    expect(answer.error).toBeUndefined();
    expect(answer.result.kind).toBe("task");
    // And every capability the door doesn't have says so.
    expect(card.capabilities.streaming).toBe(false);
    expect(card.capabilities.pushNotifications).toBe(false);
  });

  it("hangs where a reader would look", async () => {
    const llms = await (await SELF.fetch(`${BASE}/llms.txt`)).text();
    expect(llms).toContain("/.well-known/a2a.json");
    const x402 = await json("/.well-known/x402");
    expect(x402.a2a).toBe(`${BASE}/.well-known/a2a.json`);
  });
});

/**
 * THE v1.0 DIALECT, BESIDE THE 0.3 ONE (scanner finding C5,
 * 2026-08-27). A2A v1.0 consolidated preferredTransport +
 * additionalInterfaces into supportedInterfaces[] — each entry
 * {url, protocolBinding, protocolVersion}, first entry preferred —
 * and scanners validating against a2a.proto v1.0.0 read only the new
 * field. Both dialects ride the same card, the mcp/mcp.json posture.
 *
 * §5.8 says custom protocol bindings SHOULD be identified by a URI.
 * The A2A door is the one canonical binding; the store's other doors,
 * MCP and x402-over-HTTP, are named by those protocols' URIs with
 * each protocol's own version.
 */
describe("the A2A card speaks v1.0 without lying about transports", () => {
  it("carries supportedInterfaces in the v1.0 shape, first entry preferred", async () => {
    const card = await json("/.well-known/agent-card.json");
    const interfaces = card.supportedInterfaces;
    expect(Array.isArray(interfaces)).toBe(true);
    expect(interfaces.length).toBeGreaterThanOrEqual(2);
    for (const entry of interfaces) {
      expect(typeof entry.url).toBe("string");
      expect(typeof entry.protocolBinding).toBe("string");
      expect(typeof entry.protocolVersion).toBe("string");
    }
    // First entry is the preferred door — the same URL the 0.3
    // dialect's preferredTransport points at.
    expect(interfaces[0].url).toBe(card.url);
    expect(interfaces[0].protocolBinding).toBe("JSONRPC");
  });

  it("claims exactly one canonical A2A binding, the one its door answers, and names the rest by URI", async () => {
    const card = await json("/.well-known/agent-card.json");
    const canonical = card.supportedInterfaces.filter((entry: any) =>
      ["JSONRPC", "GRPC", "HTTP+JSON"].includes(entry.protocolBinding),
    );
    expect(canonical.map((entry: any) => entry.protocolBinding)).toEqual(["JSONRPC"]);
    for (const entry of card.supportedInterfaces) {
      if (entry.protocolBinding === "JSONRPC") continue;
      expect(entry.protocolBinding).toMatch(/^https?:\/\//);
    }
    const mcp = card.supportedInterfaces.find((entry: any) => entry.protocolBinding.includes("modelcontextprotocol"));
    expect(mcp?.url).toBe(`${BASE}/mcp`);
    expect(mcp?.protocolVersion).toBe(LATEST_PROTOCOL);
  });

  it("keeps the 0.3 dialect beside it for older readers", async () => {
    const card = await json("/.well-known/agent-card.json");
    // The both-spellings posture: nothing the 0.3 reader used goes away.
    expect(card.protocolVersion).toBe("0.3.0");
    expect(card.preferredTransport).toBe("JSONRPC");
    expect(Array.isArray(card.additionalInterfaces)).toBe(true);
    expect(card.additionalInterfaces.map((entry: any) => entry.transport)).toContain("MCP");
    // And v1.0's relocated extended-card flag says no in both homes.
    expect(card.supportsAuthenticatedExtendedCard).toBe(false);
    expect(card.capabilities.extendedAgentCard).toBe(false);
  });
});
