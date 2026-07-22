import { SELF, env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { inferChannel } from "@/lib/channel";
import { readPorchLedger } from "@/lib/metrics";
import { installFacilitatorMock } from "./helpers/facilitator-mock";
import type { Env } from "@/types";

/**
 * The front-porch log: free-tier attribution. Headers and paths only,
 * nothing client-side, infrastructure separate from organic and house.
 */

const BASE = "https://scvd.store";
const testEnv = env as unknown as Env;

beforeAll(() => {
  installFacilitatorMock();
});

describe("channel inference upgrades", () => {
  it("classifies known crawlers as infrastructure, separate from everything", () => {
    expect(
      inferChannel({ userAgent: "Mozilla/5.0 (compatible; Googlebot/2.1)" }),
    ).toBe("infrastructure");
    expect(inferChannel({ userAgent: "CensysInspect/1.1" })).toBe(
      "infrastructure",
    );
    // A plain agent with curl is a customer, not infrastructure.
    expect(inferChannel({ userAgent: "curl/8.4.0" })).toBe("direct");
    // Arriving FROM a bazaar listing is bazaar; the crawler itself is not.
    expect(
      inferChannel({
        userAgent: "some-agent/1.0",
        referrer: "https://www.x402scan.com/resources/123",
      }),
    ).toBe("bazaar");
    // The skill's designed self-identification.
    expect(inferChannel({ declaredSource: "clawhub-skill" })).toBe("skill");
  });
});

describe("the porch log", () => {
  it("logs free-tier visits with channel and bucket, no cookies in sight", async () => {
    const organic = await SELF.fetch(`${BASE}/llms.txt`, {
      headers: { "User-Agent": "friendly-agent/1.0" },
    });
    expect(organic.status).toBe(200);
    expect(organic.headers.get("Set-Cookie")).toBeNull();
    await SELF.fetch(`${BASE}/menu.json`, {
      headers: { "User-Agent": "Googlebot/2.1" },
    });
    await SELF.fetch(`${BASE}/what`, {
      headers: { "User-Agent": "keeper-check", "X-House": "test-house-secret" },
    });
    await SELF.fetch(`${BASE}/api/bell`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "friendly-agent/1.0",
      },
      body: JSON.stringify({ agent_name: "porch-test" }),
    });

    const porch = await readPorchLedger(testEnv);
    expect(porch.surfaces["llms.txt"]?.["organic"]).toBeGreaterThanOrEqual(1);
    expect(porch.surfaces["llms.txt"]?.["organic:direct"]).toBeGreaterThanOrEqual(1);
    expect(porch.surfaces["menu.json"]?.["infrastructure"]).toBeGreaterThanOrEqual(1);
    expect(porch.surfaces["menu.json"]?.["organic"] ?? 0).toBe(0);
    expect(porch.surfaces["what"]?.["house"]).toBeGreaterThanOrEqual(1);
    expect(porch.surfaces["bell"]?.["organic"]).toBeGreaterThanOrEqual(1);
  });

  it("logs the MCP door's free surfaces with the definitive channel", async () => {
    await SELF.fetch(`${BASE}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });
    const porch = await readPorchLedger(testEnv);
    expect(porch.surfaces["mcp:tools/list"]?.["organic:mcp"]).toBeGreaterThanOrEqual(1);
  });

  it("computes porch-to-purchase as an honest rate", async () => {
    // One organic challenge against the porch visits above.
    await SELF.fetch(`${BASE}/api/buy/hello`, {
      headers: { "User-Agent": "friendly-agent/1.0" },
    });
    const porch = await readPorchLedger(testEnv);
    expect(porch.organicVisits).toBeGreaterThanOrEqual(2);
    expect(porch.porchToPurchase).not.toBeNull();
    expect(porch.porchToPurchase!).toBeGreaterThan(0);
  });

  it("keeps infrastructure 402s out of the organic falsification counts", async () => {
    const { readMonthLedger } = await import("@/lib/metrics");
    const before = await readMonthLedger(testEnv);
    const organicBefore = before.items["small_blessing"]?.challenges ?? 0;
    await SELF.fetch(`${BASE}/api/buy/small_blessing`, {
      headers: { "User-Agent": "Googlebot/2.1" },
    });
    const after = await readMonthLedger(testEnv);
    expect(after.items["small_blessing"]?.challenges ?? 0).toBe(organicBefore);
    expect(after.items["small_blessing"]?.challengesInfra).toBeGreaterThanOrEqual(1);
  });
});

describe("nothing client-side", () => {
  it("serves the storefront with no scripts and no cookies", async () => {
    const response = await SELF.fetch(`${BASE}/`, {
      headers: { "User-Agent": "browser/1.0" },
    });
    const html = await response.text();
    expect(response.headers.get("Set-Cookie")).toBeNull();
    expect(html).not.toContain("<script");
  });
});
