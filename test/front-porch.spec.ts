import { SELF, env } from "cloudflare:test";
import { beforeAll, describe, expect, it, vi } from "vitest";
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

  it("catches the census's 2026-08-19 walkers, and spares the SDK strings they hid among", () => {
    // The eleven self-identifying walkers the keeper read off the live
    // census page — surveys, indexes, discovery crawlers — each was
    // sitting in the organic column, inflating every conversion
    // denominator (the funnel's flat-profile caveat, proven live).
    for (const ua of [
      "entropy-daemon-trust-oracle/2.0",
      "ApisTrust/1.0 (+https://apistrust.com)",
      "CoinbaseBazaarDiscovery/1.0 (+https://docs.cdp.coinbase.com/x402)",
      "radar-x402/0.1 (+brazilayer.com)",
      "402scout-indexer/1.0 (+https://402scout.com/methodology)",
      "MPP32-Health/1.0 (+https://mpp32.org)",
      "AnalogHubris-TrustIndex/0.2 (health survey; no payment attached)",
      "x402statsweb/1.0 (+https://x402stats.decredcommunity.org)",
      "BrickBlueBot/0.1 (+https://brick.blue/bot; agentic-web indexer)",
      "x402-healthbot/1.0 (+https://decixa.ai/bot)",
      "hermes-contact-discovery/1.0 (research; contact@hermes.ai)",
    ]) {
      expect(inferChannel({ userAgent: ua }), ua).toBe("infrastructure");
    }
    // The generic strings walking beside them stay CUSTOMERS: these
    // are what a real buyer's SDK looks like, and a string promoted
    // to the crawler table is misclassified forever. The behavioural
    // walk detector handles them per-window instead.
    for (const ua of [
      "node",
      "Deno/2.7.4",
      "axios/1.18.1",
      "python-httpx/0.28.1",
      "Go-http-client/2.0",
      "curl/8.18.0",
    ]) {
      expect(inferChannel({ userAgent: ua }), ua).toBe("direct");
    }
  });

  it("catches machinery that names its own job (first reading, 2026-07-26)", () => {
    // The exact UA that walked our catalog and got counted as a customer.
    expect(inferChannel({ userAgent: "mako-pulse-prober/0.1" })).toBe(
      "infrastructure",
    );
    for (const userAgent of [
      "acme-monitor/2",
      "fleet-watchdog/1.0",
      "link-checker",
      "sec-scanner/3",
      "registry-inspector/0.9",
      "edge-sentinel/1",
      "deploy-canary/1",
      "status-heartbeat/1",
      "datadog-synthetics",
    ]) {
      expect(inferChannel({ userAgent })).toBe("infrastructure");
    }
    // Second pass: the ones that call themselves a probe, not a prober.
    for (const userAgent of [
      "x402-reliability-probe/1.0",
      "nohumans.directory-probe/1.0 (+https://nohumans.directory)",
      "some-qos-agent/2",
      "liveness-check/1",
    ]) {
      expect(inferChannel({ userAgent })).toBe("infrastructure");
    }
    // The line we do not cross: agents are customers, bots included.
    expect(inferChannel({ userAgent: "clawdbot/1.4" })).toBe("direct");
    expect(inferChannel({ userAgent: "curl/8.4.0" })).toBe("direct");
    expect(inferChannel({ userAgent: "python-httpx/0.27" })).toBe("direct");
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
    // One organic challenge against the porch visits above. The bare
    // quote's tally rides waitUntil (the 2026-08-27 ruling), so the
    // read holds lands-within-the-request instead of assuming synchrony.
    await SELF.fetch(`${BASE}/api/buy/hello`, {
      headers: { "User-Agent": "friendly-agent/1.0" },
    });
    await vi.waitFor(async () => {
      const porch = await readPorchLedger(testEnv);
      expect(porch.organicVisits).toBeGreaterThanOrEqual(2);
      expect(porch.porchToPurchase).not.toBeNull();
      expect(porch.porchToPurchase!).toBeGreaterThan(0);
    });
  });

  it("keeps infrastructure 402s out of the organic falsification counts", async () => {
    const { readMonthLedger } = await import("@/lib/metrics");
    const before = await readMonthLedger(testEnv);
    const organicBefore = before.items["small_blessing"]?.challenges ?? 0;
    await SELF.fetch(`${BASE}/api/buy/small_blessing`, {
      headers: { "User-Agent": "Googlebot/2.1" },
    });
    // Same contract: the infra tally lands within the request.
    await vi.waitFor(async () => {
      const after = await readMonthLedger(testEnv);
      expect(after.items["small_blessing"]?.challengesInfra).toBeGreaterThanOrEqual(1);
      expect(after.items["small_blessing"]?.challenges ?? 0).toBe(organicBefore);
    });
  });
});

describe("nothing client-side that can act", () => {
  /*
   * AMENDED 2026-08-27 with rule 17's rewrite. The old assertion was
   * ZERO executable scripts — the mechanism form of the promise, and
   * true while it held. The property form is what the rule says now:
   * nothing served can act without the visitor's decision. The
   * storefront ships exactly one first-party script — /webmcp.js,
   * which registers read-only tools derived from the MCP catalog
   * (test/webmcp.spec.ts pins that it cannot act and cannot drift) —
   * fenced by a CSP that refuses every other script origin. Still no
   * cookies, still nothing third-party, and the count is pinned at
   * ONE so a second script has to argue with this test in review.
   */
  it("serves the storefront with only the fenced WebMCP script and no cookies", async () => {
    const response = await SELF.fetch(`${BASE}/`, {
      headers: { "User-Agent": "browser/1.0" },
    });
    const html = await response.text();
    expect(response.headers.get("Set-Cookie")).toBeNull();
    // JSON-LD is inert structured data; executable script is exactly
    // the one derived, read-only WebMCP surface.
    const executableScripts =
      html.match(/<script(?![^>]*type="application\/ld\+json")/g) ?? [];
    expect(executableScripts).toHaveLength(1);
    expect(html).toContain('<script src="/webmcp.js" defer>');
    expect(
      response.headers.get("Content-Security-Policy") ?? "",
    ).toContain("script-src 'self'");
    expect(html).toContain('"@type":"Organization"');
  });
});
