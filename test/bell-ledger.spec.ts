import { SELF, env } from "cloudflare:test";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { installFacilitatorMock } from "./helpers/facilitator-mock";
import { listRecentPorchEvents, readPorchLedger } from "@/lib/metrics";
import { FREE_TRAFFIC_COLLECTION_NOTE } from "@/lib/operating-cost";
import type { Env } from "@/types";

/**
 * Both bell doors keep aggregate counts. The office's ring-by-ring
 * view is historical now that optional raw free-visit rows are retired.
 */

const BASE = "https://scvd.store";
const testEnv = env as unknown as Env;
const adminAuth = {
  Authorization: `Basic ${btoa("keeper:test-admin-password")}`,
};

beforeAll(() => {
  installFacilitatorMock();
});

describe("the bell ledger", () => {
  it("counts both doors without collecting individual visitor details", async () => {
    const before = (await readPorchLedger(testEnv)).surfaces.bell?.organic ?? 0;
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
    await vi.waitFor(async () => {
      expect((await readPorchLedger(testEnv)).surfaces.bell?.organic).toBe(before + 1);
    });

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

    await vi.waitFor(async () => {
      expect((await readPorchLedger(testEnv)).surfaces.bell?.organic).toBe(before + 2);
    });
    expect(await listRecentPorchEvents(testEnv, "bell")).toEqual([]);
    const ledger = await SELF.fetch(`${BASE}/admin/bell`, { headers: adminAuth });
    expect(ledger.status).toBe(200);
    const html = await ledger.text();
    expect(html).toContain("The bell, ring by ring");
    expect(html).toContain(FREE_TRAFFIC_COLLECTION_NOTE);
    expect(html).toContain("New rings keep aggregate counts only");
    expect(html).not.toContain("curious-agent/1.0");
  });
});
