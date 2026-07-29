import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { SAMPLE_ARTIFACT_ID } from "@/store/spec";
import { isRecord } from "@/types";

const BASE = "https://scvd.store";

async function json(response: Response): Promise<Record<string, unknown>> {
  const body: unknown = await response.json();
  if (!isRecord(body)) {
    throw new Error("Expected a JSON object body");
  }
  return body;
}

describe("the practice counter", () => {
  it("serves JSON to agents with the cheapest real settlement named", async () => {
    const response = await SELF.fetch(`${BASE}/try`);
    expect(response.status).toBe(200);
    const body = await json(response);

    const cheapest = body.cheapest_settlement;
    expect(isRecord(cheapest)).toBe(true);
    if (!isRecord(cheapest)) return;
    // Half a cent, and NOT the $0.004 attestation: the recommended
    // practice buy is the cheapest one that needs no arguments, because
    // a builder exercising the payment path should not have to find a
    // transaction hash first. The cheaper item is still on the door.
    expect(cheapest.price_usdc).toBe(0.005);
    expect(cheapest.item_id).toBe("small_blessing");
    expect(cheapest.buy).toBe(`${BASE}/api/buy/small_blessing?src=try`);
  });

  it("lists the under-a-dollar shelf cheapest first, priced from the live menu", async () => {
    const body = await json(await SELF.fetch(`${BASE}/try`));
    const shelf = body.cheap_door;
    expect(Array.isArray(shelf)).toBe(true);
    if (!Array.isArray(shelf)) return;

    expect(shelf.length).toBeGreaterThanOrEqual(5);
    const prices = shelf.map((row) =>
      isRecord(row) && typeof row.price_usdc === "number" ? row.price_usdc : -1,
    );
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
    // Nothing on the cheap door costs more than a dollar; that's the point.
    expect(Math.max(...prices)).toBeLessThanOrEqual(1);
  });

  it("hands over the verification block, not just a promise of one", async () => {
    const body = await json(await SELF.fetch(`${BASE}/try`));
    const verification = body.verification;
    expect(isRecord(verification)).toBe(true);
    if (!isRecord(verification)) return;

    expect(verification.verify_url_template).toBe(`${BASE}/api/verify/{cert_id}`);
    expect(verification.signing_key).toBe(`${BASE}/.well-known/scvd-signing-key`);
    expect(verification.openapi).toBe(`${BASE}/openapi.json`);

    // The sample artifact is the one the rest of the store publishes; it
    // lives in the real store's KV, so tests check the pointer, not the row.
    expect(verification.sample_artifact_id).toBe(SAMPLE_ARTIFACT_ID);
    expect(verification.sample_verify_url).toBe(
      `${BASE}/api/verify/${SAMPLE_ARTIFACT_ID}`,
    );
  });

  it("says there is no sandbox, because there isn't one", async () => {
    const body = await json(await SELF.fetch(`${BASE}/try`));
    const protocolBlock = body.protocol;
    expect(isRecord(protocolBlock)).toBe(true);
    if (!isRecord(protocolBlock)) return;
    expect(protocolBlock.sandbox).toBe(false);
    expect(protocolBlock.version).toBe("2");
    expect(protocolBlock.network).toBe("eip155:8453");
  });

  it("renders a paper page for humans with the flow and the prices", async () => {
    const response = await SELF.fetch(`${BASE}/try`, {
      headers: { Accept: "text/html" },
    });
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("The Practice Counter");
    expect(html).toContain("half a cent");
    expect(html).toContain("/api/buy/small_blessing");
    expect(html).toContain("PAYMENT-SIGNATURE");
  });

  it("answers to the name a search engine would carry", async () => {
    const response = await SELF.fetch(`${BASE}/x402-test`, { redirect: "manual" });
    expect(response.status).toBe(301);
    expect(response.headers.get("location")).toBe("/try");
  });

  it("is hung where clients look: sitemap, front door, skill, discovery", async () => {
    const sitemap = await (await SELF.fetch(`${BASE}/sitemap.xml`)).text();
    expect(sitemap).toContain(`${BASE}/try`);

    const llms = await (await SELF.fetch(`${BASE}/llms.txt`)).text();
    expect(llms).toContain(`${BASE}/try`);

    const skill = await (await SELF.fetch(`${BASE}/skill.md`)).text();
    expect(skill).toContain(`${BASE}/try`);

    const discovery = await json(await SELF.fetch(`${BASE}/.well-known/x402.json`));
    expect(discovery.practice_counter).toBe(`${BASE}/try`);

    const storefront = await (await SELF.fetch(`${BASE}/`)).text();
    expect(storefront).toContain('href="/try"');
  });
});
