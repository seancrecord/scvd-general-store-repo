import { SELF, env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { installFacilitatorMock, TEST_PAYER } from "./helpers/facilitator-mock";
import {
  buildPaymentSignature,
  decodePaymentRequired,
} from "./helpers/payment";
import { createOrder } from "@/services/orders";
import { getMenuItem } from "@/store";
import type { Env } from "@/types";
import { isRecord } from "@/types";

const BASE = "https://scvd.store";
const testEnv = env as unknown as Env;

beforeAll(() => {
  installFacilitatorMock();
});

/**
 * THE WALLET-SAFETY PAIR (PROBLEMS.md #16 and #17): mechanisms that
 * protect a buyer's wallet and goods from the buyer's own bugs.
 *
 * The idempotency tests simulate the exact failure they close: a
 * retry loop that signs a FRESH authorization each pass (the payment
 * helper mints a new nonce per call, as a real EIP-3009 client
 * would), which the chain happily settles as a new charge every
 * time. The claims tests prove the door's one law: possession of the
 * key gets everything, a bare address gets nothing.
 */

async function buyHello(
  idempotencyKey?: string,
): Promise<{ status: number; body: Record<string, unknown>; replayHeader: string | null }> {
  const url = `${BASE}/api/buy/hello`;
  const challenge = await SELF.fetch(url);
  expect(challenge.status).toBe(402);
  const accepted = decodePaymentRequired(challenge).accepts[0]!;
  const response = await SELF.fetch(url, {
    headers: {
      "PAYMENT-SIGNATURE": buildPaymentSignature(accepted),
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
  });
  return {
    status: response.status,
    body: (await response.json()) as Record<string, unknown>,
    replayHeader: response.headers.get("Idempotency-Replay"),
  };
}

function certIdOf(body: Record<string, unknown>): string {
  const cert = body["certificate"];
  return isRecord(cert) ? String(cert["cert_id"]) : String(body["cert_id"]);
}

describe("idempotency on the HTTP door", () => {
  it("replays the original sale instead of charging a looping agent again", async () => {
    const key = "loop-guard-test-key-0001";
    const first = await buyHello(key);
    expect(first.status).toBe(200);
    const firstCert = certIdOf(first.body);
    expect(firstCert).toMatch(/^cert_/);

    // The loop: same key, FRESH authorization (new nonce) — without
    // the mechanism this settles as a second honest charge.
    const second = await buyHello(key);
    expect(second.status).toBe(200);
    expect(second.replayHeader).toBe("true");
    expect(second.body["idempotent_replay"]).toBe(true);
    // Same artifact, not a second one: the proof no second mint ran.
    expect(certIdOf(second.body)).toBe(firstCert);
    expect(String(second.body["note"])).toContain("no new payment was taken");
  });

  it("treats a guessably short key as absent — two calls, two real sales", async () => {
    const first = await buyHello("short");
    const second = await buyHello("short");
    expect(second.body["idempotent_replay"]).toBeUndefined();
    expect(certIdOf(second.body)).not.toBe(certIdOf(first.body));
  });

  it("never caches a refusal: a 402 with a key stays retryable", async () => {
    const url = `${BASE}/api/buy/hello`;
    const bare = await SELF.fetch(url, {
      headers: { "Idempotency-Key": "refusal-not-cached-key-01" },
    });
    expect(bare.status).toBe(402);
    // The same key then buys for real: the refusal left nothing behind.
    const paid = await buyHello("refusal-not-cached-key-01");
    expect(paid.status).toBe(200);
    expect(paid.body["idempotent_replay"]).toBeUndefined();
  });
});

describe("idempotency on the MCP door", () => {
  async function mcpBuy(idempotencyKey: string): Promise<Record<string, unknown>> {
    // First call collects the 402 terms, second call pays — the same
    // dance the MCP instructions teach.
    const rpc = async (meta: Record<string, unknown>) => {
      const res = await SELF.fetch(`${BASE}/mcp`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: "buy_hello", arguments: {}, _meta: meta },
        }),
      });
      return (await res.json()) as Record<string, unknown>;
    };
    const bare = await rpc({});
    const challenge = (
      (bare["error"] as Record<string, unknown>)["data"] as Record<string, unknown>
    )["x402/payment-required"] as { accepts: Array<Record<string, unknown>> };
    const payment = JSON.parse(
      atob(
        buildPaymentSignature(
          challenge.accepts[0] as unknown as Parameters<typeof buildPaymentSignature>[0],
        ),
      ),
    ) as Record<string, unknown>;
    const reply = await rpc({
      "x402/payment": payment,
      "x402/idempotency-key": idempotencyKey,
    });
    const result = reply["result"] as Record<string, unknown>;
    return result["structuredContent"] as Record<string, unknown>;
  }

  it("replays by _meta key: same cert, marked, no second settlement", async () => {
    const key = "mcp-loop-guard-key-0001";
    const first = await mcpBuy(key);
    expect(String(first["cert_id"])).toMatch(/^cert_/);
    const second = await mcpBuy(key);
    expect(second["idempotent_replay"]).toBe(true);
    expect(second["cert_id"]).toBe(first["cert_id"]);
  });
});

describe("the claims door", () => {
  // A well-known test private key; the wallet that "paid" for orders.
  const account = privateKeyToAccount(
    "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  );

  async function challengeFor(address: string): Promise<Record<string, unknown>> {
    const res = await SELF.fetch(`${BASE}/api/claims/challenge`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ address }),
    });
    return (await res.json()) as Record<string, unknown>;
  }

  it("returns the wallet's own orders to the key that paid, and only to it", async () => {
    const item = getMenuItem("phone_call")!;
    const order = await createOrder(testEnv, {
      item,
      paidUsdc: 5,
      tipUsdc: 0,
      patronNumber: 990002,
      certId: "cert_claimtest1",
      payer: account.address,
    });

    const challenge = await challengeFor(account.address);
    const signature = await account.signMessage({
      message: String(challenge["challenge"]),
    });
    const res = await SELF.fetch(`${BASE}/api/claims`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ address: account.address, signature }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    const orders = body["orders"] as Array<Record<string, unknown>>;
    const found = orders.find((o) => o["order_id"] === order.order_id);
    expect(found).toBeDefined();
    expect(String(found!["order_url"])).toContain(order.order_id);
  });

  it("refuses a signature from the wrong key, and burns the nonce either way", async () => {
    const stranger = privateKeyToAccount(`0x${"11".repeat(32)}`);
    const challenge = await challengeFor(account.address);
    const wrongSig = await stranger.signMessage({
      message: String(challenge["challenge"]),
    });
    const res = await SELF.fetch(`${BASE}/api/claims`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ address: account.address, signature: wrongSig }),
    });
    expect(res.status).toBe(403);

    // The nonce is spent: even the RIGHT key cannot reuse it.
    const rightSig = await account.signMessage({
      message: String(challenge["challenge"]),
    });
    const retry = await SELF.fetch(`${BASE}/api/claims`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ address: account.address, signature: rightSig }),
    });
    expect(retry.status).toBe(400);
    const body = (await retry.json()) as Record<string, unknown>;
    expect(String(body["error"])).toContain("No live challenge");
  });

  it("gives a bare address nothing — no challenge, no orders", async () => {
    const res = await SELF.fetch(`${BASE}/api/claims`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        address: TEST_PAYER,
        signature: `0x${"00".repeat(65)}`,
      }),
    });
    // No live challenge for that address: the enumeration path is shut.
    expect(res.status).toBe(400);
  });
});
