import { SELF, env } from "cloudflare:test";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { getOpenDeliveryIntent } from "@/services/delivery-audit";
import { DELIVERY_FAILED_CODE } from "@/lib/delivery-failed";
import type { Env } from "@/types";
import { buildPaymentSignature, decodePaymentRequired } from "./helpers/payment";
import {
  installFacilitatorMock,
  TEST_TRANSACTION,
} from "./helpers/facilitator-mock";

/**
 * MONEY MOVED AND THE GOODS DID NOT — WHAT THE BUYER IS TOLD
 * (2026-09-04, CV's second round: an attestation_bundle settled
 * on-chain over MCP, the door answered an internal error, and the
 * certificate was findable only by a buyer who knew /trust).
 *
 * The delivery-intent gate spec declines to add a route that fails
 * after taking payment, and rightly: a money-losing path in production
 * to prove a money-losing path is detected is the wrong trade. This
 * file induces the failure without one, by replacing the goods step
 * for a single item inside the test isolate. The store's own code is
 * untouched; only `hello`'s deliverable throws here.
 */
vi.mock("@/services/instant-goods", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/services/instant-goods")>();
  return {
    ...original,
    deliverInstantGoods: async (
      ...args: Parameters<typeof original.deliverInstantGoods>
    ) => {
      if (args[1].id === "hello") {
        throw new Error("the shelf gave way after the till rang");
      }
      return original.deliverInstantGoods(...args);
    },
  };
});

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";

beforeAll(() => {
  installFacilitatorMock();
});

async function paymentFor(path: string): Promise<Record<string, unknown>> {
  const challenge = decodePaymentRequired(await SELF.fetch(`${BASE}${path}`));
  return JSON.parse(atob(buildPaymentSignature(challenge.accepts[0]!))) as Record<
    string,
    unknown
  >;
}

describe("the HTTP door", () => {
  it("answers a throw after settlement with the truth in fields, never 'no charge'", async () => {
    const challenge = decodePaymentRequired(await SELF.fetch(`${BASE}/api/buy/hello`));
    const response = await SELF.fetch(`${BASE}/api/buy/hello`, {
      headers: { "PAYMENT-SIGNATURE": buildPaymentSignature(challenge.accepts[0]!) },
    });
    // Still our failure, still a 500 — but this body is honest.
    expect(response.status).toBe(500);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body["code"]).toBe(DELIVERY_FAILED_CODE);
    expect(body["charged"]).toBe(true);
    expect(body["transaction"]).toBe(TEST_TRANSACTION);
    expect(String(body["error"])).not.toMatch(/no charge/i);
    const recovery = body["recovery"] as Record<string, unknown>;
    expect(String(recovery["trust_url"])).toBe(`${BASE}/trust`);
    expect(String(recovery["do_not_retry"])).toContain("second charge");
    // The keeper's row is still there: telling the buyer did not
    // quietly close the delivery desk's case.
    expect(await getOpenDeliveryIntent(testEnv, TEST_TRANSACTION)).not.toBeNull();
  });
});

describe("the MCP door", () => {
  it("answers the same failure with the same fields, as a JSON-RPC error that is not a refusal", async () => {
    const payment = await paymentFor("/api/buy/hello");
    const response = await SELF.fetch(`${BASE}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "buy_signed_record",
          arguments: { item_id: "hello" },
          _meta: { "x402/payment": payment },
        },
      }),
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    const error = body["error"] as Record<string, unknown>;
    expect(error, JSON.stringify(body).slice(0, 300)).toBeTruthy();
    expect(error["code"]).toBe(-32000);
    const data = error["data"] as Record<string, unknown>;
    expect(data["code"]).toBe(DELIVERY_FAILED_CODE);
    expect(data["charged"]).toBe(true);
    expect(data["transaction"]).toBe(TEST_TRANSACTION);
    expect(String(error["message"])).toContain("settled");
    expect(String(error["message"])).not.toMatch(/no charge/i);
  });
});
