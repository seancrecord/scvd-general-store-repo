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
