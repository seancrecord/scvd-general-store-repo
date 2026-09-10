import { SELF, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import {
  BEFORE_YOU_START_HEADING,
  optionalToolingLines,
} from "@/lib/before-you-start";
import { checkoutNetworks, type PaymentNetworkConfig } from "@/lib/payment-networks";
import { CLIENT_CAP_LABEL } from "@/lib/client-spend-cap";

const BASE = "https://scvd.store";

/**
 * ONE "GETTING STARTED" LIST, NOT THREE PAGES TO ASSEMBLE IT FROM.
 *
 * A field read on 2026-09-10 found every prerequisite published and
 * none of them together: /agents.md named the networks and currency,
 * /openapi.json named the chains, /skill.md named the optional
 * tooling. These assertions hold the four front doors to the same
 * derived checklist, so the list can neither scatter again nor drift
 * from the live payment quote.
 */
describe("the prerequisites checklist is on every front door", () => {
  const networks = checkoutNetworks(env as unknown as PaymentNetworkConfig);
  const markdownDoors = ["/agents.md", "/skill.md"] as const;

  it("is derived from at least one live checkout network", () => {
    expect(networks.length).toBeGreaterThan(0);
  });

  for (const path of markdownDoors) {
    it(`${path} carries the section, every live network, the currency, the cap and the tooling`, async () => {
      const res = await SELF.fetch(`${BASE}${path}`);
      expect(res.status).toBe(200);
      const text = await res.text();
      const start = text.indexOf(BEFORE_YOU_START_HEADING);
      expect(start, `${path} lost the ${BEFORE_YOU_START_HEADING} section`).toBeGreaterThan(-1);
      // The section, up to the next H2, must be self-contained.
      const rest = text.slice(start + BEFORE_YOU_START_HEADING.length);
      const nextHeading = rest.search(/\n## /);
      const section = nextHeading === -1 ? rest : rest.slice(0, nextHeading);
      for (const row of networks) {
        expect(section, `${path} omits ${row.label}`).toContain(`${row.label} (${row.network})`);
      }
      expect(section).toContain("USDC");
      expect(section).toContain("x402 v2 client");
      expect(section).toContain(CLIENT_CAP_LABEL);
      for (const line of optionalToolingLines(BASE)) {
        expect(section, `${path} omits a tooling line`).toContain(line);
      }
      expect(section).toContain(`${BASE}/menu.json`);
      expect(section).toContain(`${BASE}/openapi.json`);
      expect(section).toContain(`${BASE}/mcp`);
    });
  }

  it("/openapi.json names the same networks, currency and cap in its guidance field", async () => {
    const res = await SELF.fetch(`${BASE}/openapi.json`);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { info: Record<string, unknown> };
    const guidance = String(json.info["x-guidance"] ?? "");
    expect(guidance).toContain("Before you start:");
    for (const row of networks) {
      expect(guidance, `openapi.json omits ${row.label}`).toContain(`${row.label} (${row.network})`);
    }
    expect(guidance).toContain("USDC");
    expect(guidance).toContain("x402 v2 client");
    expect(guidance).toContain(CLIENT_CAP_LABEL);
    expect(guidance).toContain("scvd-tab");
  });

  it("/llms.txt, which sits at its 30,000-character budget, points at the checklist by name", async () => {
    // The index had 53 characters of room when this landed; the full
    // list would not fit and a stale copy would be worse than none.
    // It carries the shared quick-start line, which names the list.
    const text = await (await SELF.fetch(`${BASE}/llms.txt`)).text();
    expect(text).toContain(`Prerequisites checklist and full instructions: ${BASE}/agents.md`);
  });

  it("/agents.md lists the optional tooling exactly once", async () => {
    const text = await (await SELF.fetch(`${BASE}/agents.md`)).text();
    for (const line of optionalToolingLines(BASE)) {
      expect(text.split(line).length - 1, `duplicated: ${line.slice(0, 40)}`).toBe(1);
    }
  });
});
