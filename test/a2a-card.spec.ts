import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { MENU_ITEMS } from "@/store";

const BASE = "https://scvd.store";

async function json(path: string): Promise<Record<string, any>> {
  const response = await SELF.fetch(`${BASE}${path}`);
  expect(response.status, `${path} did not serve`).toBe(200);
  return (await response.json()) as Record<string, any>;
}

/**
 * THE A2A AGENT CARD (keeper's call, 2026-08-07): one file that makes
 * the store legible to frameworks that read A2A cards. What is
 * testable is the same thing as always — that the card derives from
 * the live menu rather than hand-listing it, that it makes no claim
 * the till can't answer, and that it hangs where a reader would look.
 */
describe("the A2A agent card", () => {
  it("serves the same card at all three doors the spec's history left behind", async () => {
    const a2a = await json("/.well-known/a2a.json");
    const canonical = await json("/.well-known/agent-card.json");
    const legacy = await json("/.well-known/agent.json");
    expect(canonical).toEqual(a2a);
    expect(legacy).toEqual(a2a);
    expect(a2a.protocolVersion).toBe("0.3.0");
    expect(a2a.name).toBeTruthy();
    expect(a2a.provider.organization).toBeTruthy();
  });

  it("derives its skills from the menu, every item, plus free verification", async () => {
    const card = await json("/.well-known/a2a.json");
    const skillIds = new Set(card.skills.map((skill: any) => skill.id));
    for (const item of MENU_ITEMS) {
      expect(skillIds.has(item.id), `${item.id} missing from the card`).toBe(
        true,
      );
    }
    expect(skillIds.has("verify"), "the free verify skill is gone").toBe(true);
    // Derived means priced from the same shelf: spot-check one price.
    const hello = card.skills.find((skill: any) => skill.id === "hello");
    const menuHello = MENU_ITEMS.find((item) => item.id === "hello");
    expect(hello.description).toContain(`$${menuHello?.price_usdc}`);
  });

  it("claims only the transport it actually speaks", async () => {
    const card = await json("/.well-known/a2a.json");
    /**
     * The store does not speak the A2A message protocol. "JSONRPC"
     * here would invite message/send calls the till cannot answer — a
     * false claim in machine form. "MCP" is true, and a strict A2A
     * client reads it, correctly, as a transport it doesn't speak.
     */
    expect(card.preferredTransport).toBe("MCP");
    expect(card.preferredTransport).not.toBe("JSONRPC");
    // The honest limit is in the card itself, not left to be
    // discovered by erroring against /mcp.
    expect(card.description).toContain("does not speak the A2A message protocol");
    // And every capability the store doesn't have says so.
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
 * The honesty constraint survives the upgrade through the spec's own
 * door: §5.8 says custom protocol bindings SHOULD be identified by a
 * URI. The store's real doors are MCP and x402-over-HTTP, so the
 * bindings are those protocols' URIs — and never one of the three
 * A2A message bindings, which would invite message/send calls the
 * till cannot answer.
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
    // First entry is the preferred door, and it is the MCP endpoint —
    // the same URL the 0.3 dialect's preferredTransport points at.
    expect(interfaces[0].url).toBe(card.url);
  });

  it("never claims an A2A message binding it cannot answer", async () => {
    const card = await json("/.well-known/agent-card.json");
    for (const entry of card.supportedInterfaces) {
      // §5.8: custom bindings are URIs. The three canonical A2A
      // message bindings are exactly the claims that would be false.
      expect(["JSONRPC", "GRPC", "HTTP+JSON"]).not.toContain(
        entry.protocolBinding,
      );
      expect(entry.protocolBinding).toMatch(/^https?:\/\//);
    }
  });

  it("keeps the 0.3 dialect beside it for older readers", async () => {
    const card = await json("/.well-known/agent-card.json");
    // The both-spellings posture: nothing the 0.3 reader used goes away.
    expect(card.protocolVersion).toBe("0.3.0");
    expect(card.preferredTransport).toBe("MCP");
    expect(Array.isArray(card.additionalInterfaces)).toBe(true);
    // And v1.0's relocated extended-card flag says no in both homes.
    expect(card.supportsAuthenticatedExtendedCard).toBe(false);
    expect(card.capabilities.extendedAgentCard).toBe(false);
  });
});
