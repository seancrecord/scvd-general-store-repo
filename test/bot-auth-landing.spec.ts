import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { getMenuItem } from "@/store";

const BASE = "https://scvd.store";

/**
 * The Web Bot Auth desk's room: one page, both dialects, price read
 * off the menu rather than typed, and an own-posture line derived
 * from the live config so the page cannot claim signing that is not
 * configured.
 */
describe("the /bot-auth room", () => {
  it("answers JSON with the price derived from the shelf", async () => {
    const response = await SELF.fetch(`${BASE}/bot-auth`, {
      headers: { Accept: "application/json" },
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, any>;
    expect(body.free_check.url).toBe(`${BASE}/api/bot-auth/check`);
    // Derived, not typed: the page price IS the menu price, whatever
    // the menu says this week.
    expect(body.signed_card.price_usdc).toBe(
      getMenuItem("signature_agent_card")?.price_usdc,
    );
    expect(body.signed_card.url).toBe(
      `${BASE}/api/buy/signature_agent_card`,
    );
    expect(body.what_this_is_not).toContain("Not an endorsement");
  });

  it("states the store's own posture from live config, not copy", async () => {
    // vitest.config.ts sets WBA_SIGNING_KEY, so the true sentence is
    // the signed one; were the key unset this assertion should fail,
    // because the page would be honestly saying the other thing.
    const response = await SELF.fetch(`${BASE}/bot-auth`, {
      headers: { Accept: "application/json" },
    });
    const body = (await response.json()) as Record<string, any>;
    expect(body.own_posture).toContain("signed with the same mechanism");
    expect(body.own_posture).toContain(
      "/.well-known/http-message-signatures-directory",
    );
  });

  it("renders the same room as HTML for a browser", async () => {
    const response = await SELF.fetch(`${BASE}/bot-auth`, {
      headers: { Accept: "text/html" },
    });
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("curl -X POST");
    expect(html).toContain("/api/bot-auth/check");
    expect(html).toContain("The Web Bot Auth desk");
  });
});
