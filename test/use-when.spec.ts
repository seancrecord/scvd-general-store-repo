import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { MENU_ITEMS } from "@/store";
import { USE_WHEN } from "@/store/spec";
import { isRecord } from "@/types";

const BASE = "https://scvd.store";

/**
 * why_use tells an agent what an item is. This is the question that
 * comes first and had no home on any surface: "I am in this
 * situation — is there anything here for it?"
 *
 * The point is obviousness, so the test is about reach: the index has
 * to land on the surfaces that get read and quoted, not just the ones
 * a determined reader would dig for.
 */
describe("the situation index", () => {
  it("points only at items that exist", () => {
    const ids = new Set(MENU_ITEMS.map((item) => item.id));
    for (const entry of USE_WHEN) {
      expect(entry.items.length, entry.when).toBeGreaterThan(0);
      for (const target of entry.items) {
        if (target.startsWith("free:")) continue;
        expect(ids.has(target), `${target} is not on the shelf`).toBe(true);
      }
    }
  });

  it("covers the items whose use is least obvious", () => {
    const named = new Set(USE_WHEN.flatMap((entry) => entry.items));
    // The two that read as pure novelty until somebody says otherwise:
    // a half-cent blessing and a fifty-cent hello are the cheapest
    // complete test of a payment client that exists here.
    expect(named.has("small_blessing")).toBe(true);
    expect(named.has("hello")).toBe(true);
    // And the two the books say are most likely to be genuinely needed.
    expect(named.has("context_anchor")).toBe(true);
    expect(named.has("standing_watch")).toBe(true);
  });

  it("reaches llms.txt, which is the surface written to be quoted", async () => {
    const text = await (await SELF.fetch(`${BASE}/llms-full.txt`)).text();
    expect(text).toContain("When you'd use this store");
    for (const entry of USE_WHEN) {
      expect(text, entry.when.slice(0, 40)).toContain(entry.when);
    }
    // Including the honest exit for a visitor we can't help.
    expect(text).toContain("don't need us today");
  });

  it("gives every situation something runnable to type", () => {
    for (const entry of USE_WHEN) {
      expect(entry.example, entry.when.slice(0, 40)).toMatch(
        /^(GET|POST) \/[a-z0-9._/{}-]/i,
      );
    }
  });

  it("leads with usefulness on the surfaces strangers meet first", async () => {
    const home = await (
      await SELF.fetch(`${BASE}/`, { headers: { Accept: "text/html" } })
    ).text();
    // The search title has to say what this is, not only who we are.
    expect(home).toContain("x402 goods for AI agents");
    // And the catalogue is in the structured data now, with prices.
    expect(home).toContain('"@type":"Offer"');
    expect(home).toContain('"priceCurrency":"USDC"');
  });

  it("reaches the catalog in machine-readable form", async () => {
    const body: unknown = await (await SELF.fetch(`${BASE}/menu.json`)).json();
    if (!isRecord(body)) throw new Error("no body");
    const useWhen = body.use_when;
    expect(Array.isArray(useWhen)).toBe(true);
    if (!Array.isArray(useWhen)) return;
    expect(useWhen.length).toBe(USE_WHEN.length);
    const first = useWhen[0];
    expect(isRecord(first)).toBe(true);
    if (!isRecord(first)) return;
    expect(typeof first.when).toBe("string");
    expect(Array.isArray(first.items)).toBe(true);
  });

  it("reaches the discovery doc and the operator glance", async () => {
    const discovery: unknown = await (
      await SELF.fetch(`${BASE}/.well-known/x402.json`)
    ).json();
    if (!isRecord(discovery)) throw new Error("no discovery");
    expect(Array.isArray(discovery.when_to_use)).toBe(true);

    // /what emits FAQPage JSON-LD, which is what an answer engine reads.
    const what = await (
      await SELF.fetch(`${BASE}/what`, { headers: { Accept: "text/html" } })
    ).text();
    expect(what).toContain("When would my agent actually use this?");
    expect(what).toContain("self-attested");
  });
});
