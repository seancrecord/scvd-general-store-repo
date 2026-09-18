import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { purchaseRequestDigest } from "@/services/purchase-intent";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;

/**
 * WIDENING A UNION THAT NOBODY MATCHES ON EXHAUSTIVELY IS A SILENT
 * DEFAULT WAITING TO HAPPEN.
 *
 * Adding "ucp" to the purchase door produced zero compiler errors. The
 * two places that read the field said "mcp, or else treat it as HTTP",
 * so the new door would have had its request digested as a query
 * string it does not have — and the request digest is what a recovered
 * purchase is matched against, so a wrong one means a buyer's paid
 * goods are refused as an input mismatch.
 *
 * These tests exist so the third door has to keep answering for
 * itself.
 */
describe("every purchase door digests its own request shape", () => {
  it("digests an MCP request as its canonical tool arguments", async () => {
    const args = JSON.stringify({ url: "https://example.test", agent_name: "a" });
    const digest = await purchaseRequestDigest(testEnv, "mcp", "/api/buy/x", args);
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    // Key order is not part of the request: JCS canonicalises it away.
    const reordered = JSON.stringify({ agent_name: "a", url: "https://example.test" });
    expect(await purchaseRequestDigest(testEnv, "mcp", "/api/buy/x", reordered)).toBe(digest);
  });

  it("digests an HTTP request as the resource URL and its query", async () => {
    const digest = await purchaseRequestDigest(
      testEnv,
      "http",
      "/api/buy/service_audit",
      "url=https%3A%2F%2Fexample.test",
    );
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
  });

  it("digests a UCP completion as the checkout identity it completes", async () => {
    const completion = JSON.stringify({
      checkout_id: "chk_abc",
      checkout_version: 3,
      terms_digest: "a".repeat(64),
    });
    const digest = await purchaseRequestDigest(testEnv, "ucp", "/ucp/v1/checkout-sessions/chk_abc", completion);
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    // Reproducible from the stored checkout alone, in any key order —
    // which is what lets a recovery recompute it without the original
    // request body.
    const reordered = JSON.stringify({
      terms_digest: "a".repeat(64),
      checkout_version: 3,
      checkout_id: "chk_abc",
    });
    expect(
      await purchaseRequestDigest(testEnv, "ucp", "/ucp/v1/checkout-sessions/chk_abc", reordered),
    ).toBe(digest);
  });

  it("moves when the checkout, its version or its terms move", async () => {
    const base = { checkout_id: "chk_abc", checkout_version: 3, terms_digest: "a".repeat(64) };
    const digest = (value: object) =>
      purchaseRequestDigest(testEnv, "ucp", "/ucp/v1/checkout-sessions/chk_abc", JSON.stringify(value));
    const original = await digest(base);
    for (const change of [
      { checkout_id: "chk_other" },
      { checkout_version: 4 },
      { terms_digest: "b".repeat(64) },
    ]) {
      expect(await digest({ ...base, ...change }), JSON.stringify(change)).not.toBe(original);
    }
  });

  it("does not hand a UCP completion the HTTP treatment", async () => {
    // The silent default this guards against: a UCP request digested
    // as "path?request" would be a different value, and a purchase
    // recovered against it would be refused as an input mismatch.
    const completion = JSON.stringify({ checkout_id: "chk_abc", checkout_version: 1 });
    const asUcp = await purchaseRequestDigest(testEnv, "ucp", "/ucp/v1/x", completion);
    const asHttp = await purchaseRequestDigest(testEnv, "http", "/ucp/v1/x", completion);
    expect(asUcp).not.toBe(asHttp);
  });
});
