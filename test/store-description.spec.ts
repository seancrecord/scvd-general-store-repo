import { SELF } from "cloudflare:test";
import { MENU_ITEMS } from "@/store";
import { describe, expect, it } from "vitest";
import { STORE_METADATA, STORE_SERVICE_NAME } from "@/store";
import { WHAT_COPY } from "@/store/copy/what";
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

    // THE NAMING LAW: the discovery document carries the tier-2
    // display name, not the tier-3 full name. The description is
    // unchanged — only the name field moved tiers.
    expect(body.name).toBe(STORE_SERVICE_NAME);
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
    /*
     * WAS `toContain("half a cent")` until 2026-08-24, and that made
     * it the third test found today pinning a claim that had gone
     * false. The cheapest door is settlement_attestation at $0.004;
     * half a cent is small_blessing, which is a different item. A
     * test asserting a PRICE has to derive it, or it becomes a test
     * that the price never be corrected.
     */
    const floor = Math.min(...MENU_ITEMS.map((item) => item.price_usdc));
    expect(text).toContain(`$${floor.toFixed(3)}`);
  });
});

/**
 * THE DIRECT ANSWER.
 *
 * Answer-engine guidance: lead a key section with a short, COMPLETE
 * answer, because that is the span a generative engine lifts. A
 * lead-in that promises an answer further down gets summarized into
 * nothing.
 *
 * Guarded rather than trusted, because the failure mode is silent —
 * copy drifts long, or the page and the JSON get edited apart and
 * nobody notices they now say different things to different readers.
 */
describe("/what leads with an answer that stands alone", () => {
  it("is sized for the span an engine lifts, and carries the position", () => {
    const words = WHAT_COPY.directAnswer.trim().split(/\s+/).length;
    expect(words, "the direct answer has drifted outside the 40-60 word band").
      toBeGreaterThanOrEqual(40);
    expect(words).toBeLessThanOrEqual(60);
    expect(WHAT_COPY.directAnswer).toContain("evidence observatory");
    // Complete on its own: what it sells, what proves it, how you pay.
    expect(WHAT_COPY.directAnswer).toContain("signed observation");
    expect(WHAT_COPY.directAnswer).toContain("verify");
    expect(WHAT_COPY.directAnswer).toContain("x402");
  });

  it("says the same thing to a human and to a machine", async () => {
    const json = (await (
      await SELF.fetch(`${BASE}/what`, { headers: { Accept: "application/json" } })
    ).json()) as Record<string, unknown>;
    const html = await (
      await SELF.fetch(`${BASE}/what`, { headers: { Accept: "text/html" } })
    ).text();
    expect(json.what).toBe(WHAT_COPY.directAnswer);
    expect(html).toContain("evidence observatory for agentic commerce");
  });
});
