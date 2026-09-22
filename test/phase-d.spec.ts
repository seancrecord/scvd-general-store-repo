import { SELF, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { SHELF_CLUSTERS } from "@/lib/mcp-tools";
import { deriveReadSpikes } from "@/services/outreach";
import { storeBuyersDigest } from "@/services/digest";
import { mandateSchema, MANDATE_SPEC_SECTIONS } from "@/store/copy/mandate-spec";
import type { BuyerSignals } from "@/services/buyer-signals";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";

/**
 * PHASE D (2026-09-21): the mandate as a primitive with its own tool,
 * schema and spec; the digest's store-buyers section; the read-spike
 * tier that sends nothing.
 */

describe("the mandate as a primitive", () => {
  it("has its own MCP tool and left the observation shelf", async () => {
    const mandate = SHELF_CLUSTERS.find((cluster) => cluster.name === "buy_mandate")!;
    expect(mandate.itemIds).toEqual(["the_mandate"]);
    expect(mandate.purpose).toContain("never enforced");
    expect(SHELF_CLUSTERS.find((cluster) => cluster.name === "buy_observation")!.itemIds).not.toContain("the_mandate");
    const listed = (await (await SELF.fetch(`${BASE}/mcp`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) })).json()) as { result: { tools: Array<{ name: string }> } };
    expect(listed.result.tools.map((tool) => tool.name)).toContain("buy_mandate");
  });

  it("serves the schema and the spec in three dialects, from one source", async () => {
    const schema = (await (await SELF.fetch(`${BASE}/schemas/scvd-mandate-v1.json`)).json()) as Record<string, unknown>;
    expect(schema).toEqual(mandateSchema(BASE));
    expect((schema["x-key-order"] as string[]).at(-1)).toBe("signature_covers");
    const html = await (await SELF.fetch(`${BASE}/mandate-spec`, { headers: { Accept: "text/html", "User-Agent": "Mozilla/5.0" } })).text();
    for (const section of MANDATE_SPEC_SECTIONS) expect(html).toContain(section.heading);
    expect(html).toContain("scvd-mandate-attestation:");
    const md = await SELF.fetch(`${BASE}/mandate-spec`, { headers: { Accept: "text/markdown" } });
    expect(md.headers.get("content-type")).toContain("text/markdown");
    expect(await md.text()).toContain("## The citation rule");
    const json = (await (await SELF.fetch(`${BASE}/mandate-spec`, { headers: { Accept: "application/json" } })).json()) as { schema: string };
    expect(json.schema).toBe(`${BASE}/schemas/scvd-mandate-v1.json`);
  });
});

describe("the read-spike tier", () => {
  it("lists hosts read in more than one format or five times, alphabetically, and never other", () => {
    const signals = {
      subjects: { "b.example": 2, "a.example": 6, "c.example": 1, other: 40 },
      subject_formats: { "b.example:html": 1, "b.example:json": 1, "a.example:json": 6, "c.example:html": 1, other: 40 },
      selfreads: { "b.example": 1 },
    } as unknown as BuyerSignals;
    expect(deriveReadSpikes(signals)).toEqual([
      { host: "a.example", reads: 6, formats: ["json"], self_referred: 0 },
      { host: "b.example", reads: 2, formats: ["html", "json"], self_referred: 1 },
    ]);
  });
});

describe("the digest's store-buyers section", () => {
  it("gathers the public counters with their window and exclusions, naming nobody", async () => {
    const section = await storeBuyersDigest(testEnv);
    expect(section.window).toContain("month to date");
    expect(section.exclusions.length).toBeGreaterThan(0);
    expect(typeof section.organic_settled).toBe("number");
    expect(section.host_pages).toHaveProperty("subjects");
    expect(JSON.stringify(section)).not.toMatch(/0x[0-9a-f]{40}/);
  });
});
