import { SELF, env } from "cloudflare:test";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { purchaseRequestDigest } from "@/services/purchase-intent";
import { admitUcpCompletion } from "@/services/ucp-admission";
import { walkToSettlementBoundary } from "@/services/ucp-settlement-boundary";
import { realSettlementProducer } from "@/services/ucp-settlement-producer";
import { readBuyerSignals } from "@/services/buyer-signals";
import { variantGid } from "@/lib/ucp/ids";
import { buyInputSchema } from "@/lib/bazaar-discovery";
import { getMenuItem } from "@/store/menu";
import { metricsMonth } from "@/lib/metrics";
import { KV_KEYS } from "@/lib/kv-keys";
import { installMultiPurchaseFacilitatorMock, TEST_PAYER } from "../helpers/facilitator-mock";
import { buildPaymentSignature, decodePaymentRequired } from "../helpers/payment";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";
const NETWORK = "eip155:8453";

beforeAll(() => {
  installMultiPurchaseFacilitatorMock();
});

/** Deferred writes land beside the answer; no waitUntil in tests, so give the loop a turn. */
const settledWrites = () => new Promise((resolve) => setTimeout(resolve, 50));

/**
 * The rail map is append-only across a file's tests, so this one
 * clears its own key first — otherwise it passes alone and reads
 * another spec's http settles in the suite.
 */
async function clearRail(): Promise<void> {
  await testEnv.COUNTERS.delete(KV_KEYS.metric(metricsMonth(), "signals", "rail"));
}

let nonceSeed = 0x7000;
const nextNonce = () => (++nonceSeed).toString(16).padStart(64, "0");

function credential(nonce: string, atomic: string) {
  return {
    x402Version: 2,
    payload: {
      signature: `0x${"1".repeat(130)}`,
      authorization: {
        from: TEST_PAYER,
        to: "0x1111111111111111111111111111111111111111",
        value: atomic,
        validAfter: "0",
        validBefore: "99999999999",
        nonce: `0x${nonce}`,
      },
    },
  };
}

/** Open a checkout for the cheapest shelf item and admit a payment for it. */
async function admittedCheckout(itemId = "hello") {
  const item = getMenuItem(itemId)!;
  const inputs: Record<string, string> = {};
  for (const name of buyInputSchema(item).required ?? []) {
    inputs[name] = "https://example.test/door";
  }
  const res = await SELF.fetch(`${BASE}/ucp/v1/checkout-sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      line_items: [{ item: { id: variantGid(itemId) }, quantity: 1 }],
      "store.scvd": { inputs },
    }),
  });
  expect(res.status, await res.clone().text()).toBe(201);
  const checkout = (await res.json()) as Record<string, any>;
  const cred = credential(nextNonce(), String(Math.round(item.price_usdc * 1e6)));
  const outcome = await admitUcpCompletion(testEnv, {
    checkoutId: checkout.id,
    credential: cred,
    verify: vi.fn(async () => ({ isValid: true, payer: TEST_PAYER })),
  });
  expect(outcome.ok, outcome.ok ? "" : outcome.detail).toBe(true);
  return { checkout, cred };
}

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

/**
 * THE SAME SILENT DEFAULT, TWO SITES THE DIGEST SWEEP DID NOT REACH.
 *
 * The block at the top of this file caught "mcp, or else treat it as
 * HTTP" in the request digest. The identical shape survived in two
 * other readers of the same field:
 *
 *   services/fulfillment.ts       door: input.source === "mcp" ? "mcp" : "http"
 *   services/purchase-reconciliation.ts   if (record.door === "mcp") input.source = "mcp"
 *
 * Neither names `ucp`, so a settled UCP purchase is filed at the
 * buyer-signals desk as an HTTP one — the third door's sales counted
 * under the first door's name, on the one page that exists to say
 * which door buyers actually use.
 *
 * Nothing about the money is wrong: the certificate, the order and
 * the books all record `ucp` correctly. It is the observation that
 * collapses, which is the harder kind to notice, because the page
 * shows a plausible number rather than a missing one.
 */
describe("a settled UCP purchase is observed at its own door", () => {
  it("files the settle under ucp, not under http", async () => {
    await clearRail();
    const { checkout, cred } = await admittedCheckout();
    const outcome = await walkToSettlementBoundary(testEnv, {
      checkoutId: checkout.id,
      produce: realSettlementProducer(testEnv, { credential: cred }),
    });
    expect(outcome.ok, outcome.ok ? "" : JSON.stringify(outcome)).toBe(true);
    await settledWrites();

    const rail = (await readBuyerSignals(testEnv)).rail;
    const doors = Object.keys(rail).map((key) => key.split(":")[0]);
    expect(doors, `rail keys: ${JSON.stringify(rail)}`).toContain("ucp");
    expect(doors).not.toContain("http");
  });
});

/**
 * THE DOOR IS OURS TO SAY, NOT THE BUYER'S.
 *
 * The collapsing ternary read `input.source`, and at the HTTP door
 * that field is a stranger's `?source=` query string (routes/buy.ts).
 * So any caller could file its own sale under the MCP door simply by
 * asking to — on the one page that exists to observe which door
 * buyers actually choose.
 *
 * Nothing about the money was ever reachable this way; `?source=` is
 * kept for what it was for, and the door is taken from the route that
 * answered instead.
 */
describe("the buyer does not get to name the door it came through", () => {
  it("files an HTTP purchase under http however ?source= is set", async () => {
    await clearRail();
    const url = `${BASE}/api/buy/hello?source=mcp`;
    const quote = await SELF.fetch(url);
    expect(quote.status).toBe(402);
    const challenge = decodePaymentRequired(quote);
    const paid = await SELF.fetch(url, {
      headers: { "PAYMENT-SIGNATURE": buildPaymentSignature(challenge.accepts[0]!) },
    });
    expect(paid.status, await paid.clone().text()).toBe(200);
    await settledWrites();

    const rail = (await readBuyerSignals(testEnv)).rail;
    const doors = Object.keys(rail).map((key) => key.split(":")[0]);
    expect(doors, `rail keys: ${JSON.stringify(rail)}`).toContain("http");
    expect(doors).not.toContain("mcp");
  });
});
