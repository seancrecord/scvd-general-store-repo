import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import {
  ALTERNATE_NAMES,
  ASKED_FOR_NOUNS,
  ASKED_FOR_SENTENCE,
  ITEMS_WITHOUT_A_NOUN,
  ITEM_ASKED_FOR,
  STORE_NAMES,
  WRITTEN_ABOUT,
  askedForFaq,
} from "@/store/copy/asked-for";
import { VALUE_PROPOSITION } from "@/store/copy/position";
import { MENU_ITEMS } from "@/store";
import { CAPABILITY_QUERY } from "@/store/spec";

const BASE = "https://scvd.store";

/**
 * THE WORDS PEOPLE USE, ON EVERY SURFACE A QUESTION RESOLVES THROUGH
 * (2026-09-02). One constant; the Organization and WebSite nodes, the
 * guides, the OpenAPI and MCP descriptions, the FAQ and every menu
 * page derive from it. A surface that drops a phrase fails here, and
 * a capability item without an asked-for noun fails the build.
 */

async function text(path: string, accept = "text/html"): Promise<string> {
  const response = await SELF.fetch(`${BASE}${path}`, { headers: { Accept: accept } });
  expect(response.status, path).toBe(200);
  return response.text();
}

function jsonLd(html: string): Record<string, unknown>[] {
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(
    (m) => JSON.parse(m[1]!) as Record<string, unknown>,
  );
}

describe("the intents an agent types are in the tool descriptions (2026-09-03)", () => {
  it("names monitoring, the client test, the launch check and the issuer key where each is sold or done", async () => {
    const { mcpToolCatalog } = await import("@/lib/mcp-tools");
    const tools = mcpToolCatalog("https://scvd.store");
    const text = (name: string) => tools.find((t) => t.name === name)?.description ?? "";
    expect(text("buy_observation")).toContain("x402 endpoint monitoring");
    expect(text("buy_observation")).toContain("x402 payment client");
    expect(text("buy_observation")).toContain("x402 launch check");
    expect(text("check_conformance")).toContain("issuer's published key");
    expect(text("preflight_endpoint")).toContain("x402 endpoint preflight");
    expect(text("check_conformance")).toContain("x402 receipt verification");
  });
});

describe("the asked-for vocabulary", () => {
  it("names a noun for every capability item", () => {
    expect(ITEMS_WITHOUT_A_NOUN).toEqual([]);
    for (const id of Object.keys(CAPABILITY_QUERY)) expect(ITEM_ASKED_FOR[id], id).toBeTruthy();
  });

  it("keeps the naming law's first entry first", () => {
    expect(ALTERNATE_NAMES[0]).toBe(STORE_NAMES[0]);
    expect(ALTERNATE_NAMES).toContain("scvd.store");
    expect(ALTERNATE_NAMES).toContain("SCVD General Store");
    for (const noun of ASKED_FOR_NOUNS) expect(ALTERNATE_NAMES).toContain(noun);
  });

  it("rides in the storefront's Organization and WebSite nodes", async () => {
    const blocks = jsonLd(await text("/"));
    const org = blocks.find((b) => b["@type"] === "Organization")!;
    const site = blocks.find((b) => b["@type"] === "WebSite")!;
    expect(org["alternateName"]).toEqual(ALTERNATE_NAMES);
    expect(site["alternateName"]).toEqual(ALTERNATE_NAMES);
    expect(org["knowsAbout"]).toEqual(ASKED_FOR_NOUNS);
    const subjectOf = org["subjectOf"] as { url: string }[];
    for (const piece of WRITTEN_ABOUT) expect(subjectOf.map((s) => s.url)).toContain(piece.url);
  });

  it("is in every guide, after the sixty words, never before them", async () => {
    for (const [path, accept] of [
      ["/llms.txt", "text/plain"],
      ["/llms-full.txt", "text/plain"],
      ["/agents.md", "text/markdown"],
      ["/index.md", "text/markdown"],
    ] as const) {
      const body = await text(path, accept);
      const sixty = body.indexOf(VALUE_PROPOSITION);
      expect(sixty, `${path} lacks the sixty words`).toBeGreaterThan(-1);
      for (const noun of ASKED_FOR_NOUNS) {
        const at = body.indexOf(noun);
        expect(at, `${path} lacks "${noun}"`).toBeGreaterThan(sixty);
      }
      for (const piece of WRITTEN_ABOUT) expect(body, `${path} lacks the byline link`).toContain(piece.url);
    }
  });

  it("travels in the OpenAPI and MCP descriptions", async () => {
    const openapi = (await (await SELF.fetch(`${BASE}/openapi.json`)).json()) as {
      info: { description: string };
    };
    expect(openapi.info.description).toContain(ASKED_FOR_SENTENCE);
    const init = await SELF.fetch(`${BASE}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "0" } },
      }),
    });
    const raw = await init.text();
    expect(raw).toContain("Also asked for as:");
  });

  it("answers to the phrases and to the name on /what", async () => {
    const faq = jsonLd(await text("/what")).find((b) => b["@type"] === "FAQPage")!;
    const questions = (faq["mainEntity"] as { name: string; acceptedAnswer: { text: string } }[]);
    expect(questions[0]!.name).toBe("What is scvd.store?");
    expect(questions[0]!.acceptedAnswer.text).toContain(VALUE_PROPOSITION);
    for (const pair of askedForFaq(BASE)) {
      expect(questions.map((q) => q.name), pair.question).toContain(pair.question);
    }
  });

  it("leads every capability item's title and Service node with its noun", async () => {
    for (const item of MENU_ITEMS.filter((entry) => entry.id in ITEM_ASKED_FOR)) {
      const html = await text(`/menu/${item.id}`);
      const noun = ITEM_ASKED_FOR[item.id]!;
      const title = /<title>(.*?)<\/title>/s
        .exec(html)![1]!
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, "&")
        .toLowerCase();
      expect(title, item.id).toContain(noun.toLowerCase().slice(0, 40));
      const service = jsonLd(html).find((b) => b["@type"] === "Service")!;
      expect(service["alternateName"], item.id).toBe(noun);
      expect(html, `${item.id} has no at-a-glance block`).toContain("At a glance");
    }
  });

  it("puts the five at-a-glance lines in menu.json, derived", async () => {
    const menu = (await (await SELF.fetch(`${BASE}/menu.json`)).json()) as {
      items: { id: string; at_a_glance: Record<string, string>; asked_for?: string }[];
    };
    for (const item of menu.items) {
      expect(Object.keys(item.at_a_glance), item.id).toEqual([
        "attests",
        "cryptography",
        "verify",
        "price_and_fulfilment",
        "does_not_attest",
      ]);
      expect(item.at_a_glance.verify).toContain("/api/verify/");
      if (item.id in ITEM_ASKED_FOR) expect(item.asked_for).toBe(ITEM_ASKED_FOR[item.id]);
    }
  });
});
