import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { STORE_METADATA } from "@/store";
import { isRecord } from "@/types";

const BASE = "https://scvd.store";

/**
 * A directory listed the whole store as "a lucky... $5-$25" because
 * every resource carried a description and the store carried none, so
 * the importer used the first thing it reached. These are the surfaces
 * an importer reads; the store has to describe itself on each.
 */
describe("the store describes itself", () => {
  it("carries a description in x402 discovery, beside the name", async () => {
    const response = await SELF.fetch(`${BASE}/.well-known/x402.json`);
    expect(response.status).toBe(200);
    const body: unknown = await response.json();
    expect(isRecord(body)).toBe(true);
    if (!isRecord(body)) return;

    expect(body.name).toBe(STORE_METADATA.name);
    expect(body.description).toBe(STORE_METADATA.description);
  });

  it("carries it on the catalog root too", async () => {
    const body: unknown = await (await SELF.fetch(`${BASE}/menu.json`)).json();
    expect(isRecord(body)).toBe(true);
    if (!isRecord(body)) return;
    const store = body.store;
    expect(isRecord(store)).toBe(true);
    if (!isRecord(store)) return;
    expect(store.description).toBe(STORE_METADATA.description);
  });

  it("describes the store, not one item off the shelf", () => {
    const text = STORE_METADATA.description.toLowerCase();
    // The exact failure that prompted this: a novelty standing in for
    // the whole shop.
    expect(text).not.toContain("lucky");
    expect(text).not.toContain("herd");
    // What an indexer needs in one line: what we are, how you pay,
    // what proves it, and how cheap the first door is.
    expect(text).toContain("agents");
    expect(text).toContain("x402");
    expect(text).toContain("verify");
    expect(text).toContain("half a cent");
  });
});
