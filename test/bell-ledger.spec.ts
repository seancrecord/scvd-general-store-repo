import { SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { installFacilitatorMock } from "./helpers/facilitator-mock";

/**
 * The bell, ring by ring: every door that rings now leaves a porch
 * row, and the office reads them back from the raw 90-day log.
 */

const BASE = "https://scvd.store";
const adminAuth = {
  Authorization: `Basic ${btoa("keeper:test-admin-password")}`,
};

beforeAll(() => {
  installFacilitatorMock();
});

describe("the bell ledger", () => {
  it("hears rings from both doors and remembers their provenance", async () => {
    // HTTP ring, arriving off the skill's own bell line.
    const httpRing = await SELF.fetch(
      `${BASE}/api/bell?src=clawhub-skill`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "curious-agent/1.0",
        },
        body: JSON.stringify({ name: "http-ringer" }),
      },
    );
    expect(httpRing.status).toBe(200);

    // MCP ring; this door used to ring silently.
    const mcpRing = await SELF.fetch(`${BASE}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "ring_bell", arguments: { agent_name: "mcp-ringer" } },
      }),
    });
    expect(mcpRing.status).toBe(200);

    const ledger = await SELF.fetch(`${BASE}/admin/bell`, {
      headers: adminAuth,
    });
    expect(ledger.status).toBe(200);
    const html = await ledger.text();
    expect(html).toContain("The bell, ring by ring");
    expect(html).toContain("clawhub-skill");
    expect(html).toContain("curious-agent/1.0");
    expect(html).toContain("<td>mcp</td>");
  });
});
