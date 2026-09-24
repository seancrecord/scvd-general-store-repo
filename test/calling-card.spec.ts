import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { getMenuItem } from "@/store";

describe("calling-card setup", () => {
  it("lets a browser organize inputs locally and reach the existing priced record", async () => {
    const response = await SELF.fetch("https://scvd.store/bot-auth", { headers: { Accept: "text/html" } });
    const html = await response.text();
    expect(html).toContain('id="calling-card-setup"');
    expect(html).toMatch(/src="\/calling-card\/setup.js\?v=[a-f0-9]{16}"/);
    expect(html).toContain('href="/calling-card/calling-card.mjs"');
    expect(html).toContain("/menu/signature_agent_card");
    expect(response.headers.get("Content-Security-Policy")).toContain("script-src 'self'");
  });

  it("gives machine readers explicit scope, prices, errors, and local integration instructions", async () => {
    const response = await SELF.fetch("https://scvd.store/bot-auth");
    const doc = await response.json() as Record<string, unknown>;
    expect(doc.what_this_is).toBeTypeOf("string");
    expect(doc.how_to_call).toBeDefined();
    expect(doc.security).toBeDefined();
    expect(doc.errors).toBeDefined();
    expect(doc.price).toMatchObject({ setup_usdc: 0, signed_record_usdc: getMenuItem("signature_agent_card")?.price_usdc, cadence: "one_off" });
  });

  it("serves the actual reusable module and browser entry point with correct media types", async () => {
    for (const [path, symbol] of [["calling-card.mjs", "createCallingCardFetch"], ["setup.js", "normalizeCallingCard"]]) {
      const response = await SELF.fetch(`https://scvd.store/calling-card/${path}`);
      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toContain("javascript");
      expect(await response.text()).toContain(symbol);
    }
  });
});
