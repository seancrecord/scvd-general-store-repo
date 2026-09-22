import { SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { installFacilitatorMock } from "./helpers/facilitator-mock";

const BASE = "https://scvd.store";

/**
 * THE KEYS AN MCP BUYER HAS TO KNOW, WRITTEN DOWN (2026-09-21).
 *
 * An agent review: "/mcp advertises buy_* tools with x402 paid in-band
 * (challenge/credential/receipt meta keys). This path wasn't exercised
 * in the review — run a full MCP purchase against it and confirm the
 * documented meta keys match reality."
 *
 * The walk was done: the live door answers an unpaid buy_observation
 * with error code 402 carrying BOTH challenges — the x402 terms under
 * `x402/payment-required` and the MPP challenge list under
 * `org.paymentauth/payment-required` — and mpp-mcp-checkout.spec.ts
 * drives a full PAID tools/call against a mocked facilitator with the
 * stock MCP and MPP clients, reading the receipt back out of its
 * documented key. The keys match reality.
 *
 * What the walk turned up was not a mismatch but an omission, and a
 * telling one. Every key was written down somewhere — x402/payment and
 * x402/idempotency-key in the tool descriptions, all three MPP keys in
 * the handshake instructions — except `x402/payment-required`, the key
 * an x402 client must read to find the terms AT ALL. It appeared on no
 * surface the store serves: not the handshake, not tools/list, not
 * /mcp.md, /skill.md, /agents.md or /openapi-tools.json. Its MPP twin
 * was spelled out three times over; the lane the store leads with was
 * the one left implicit, and an x402 client could only find it by
 * inspecting error.data and guessing right.
 *
 * So this file asserts documentation rather than wire shape: the wire
 * has its own tests, and what was missing was the writing down.
 *
 * ONLY THE x402 KEYS ARE ASSERTED HERE. The MPP lane is configuration
 * — a deployment may not offer it, and this test environment does not
 * — so requiring its keys unconditionally would freeze one config as
 * the contract. They are held instead by mpp-mcp-checkout.spec.ts,
 * which imports the same constants and only runs where the lane is on.
 */

/** The x402 lane is always open, so these three are always owed. */
const X402_KEYS = {
  "x402/payment-required": "where an unpaid call returns the x402 terms",
  "x402/payment": "where the signed x402 payment rides on the retry",
  "x402/idempotency-key": "how a retry reaches the original purchase",
} as const;

beforeAll(() => {
  installFacilitatorMock();
});

async function rpc(method: string, params: unknown): Promise<Record<string, unknown>> {
  const response = await SELF.fetch(`${BASE}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  expect(response.status, method).toBe(200);
  return (await response.json()) as Record<string, unknown>;
}

/** Everything the door tells a buyer before it is paid. */
async function documentedSurfaces(): Promise<string> {
  const handshake = await rpc("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "test", version: "1" },
  });
  const tools = await rpc("tools/list", {});
  return `${
    (handshake["result"] as { instructions?: string }).instructions ?? ""
  }\n${JSON.stringify(tools)}`;
}

describe("the MCP door names every key a buyer needs", () => {
  it("names all three x402 keys across the handshake and the tool list", async () => {
    const documented = await documentedSurfaces();
    for (const [key, why] of Object.entries(X402_KEYS)) {
      expect(
        documented,
        `the MCP door never names ${key} — ${why}. A buyer can only find it by guessing.`,
      ).toContain(key);
    }
  });

  it("names the challenge key where a buyer meets it, in error.data", async () => {
    /*
     * Not merely present somewhere in the text: the handshake has to
     * say WHERE to look, because the key is useless without the path
     * to it. This is the sentence the omission was found in.
     */
    const handshake = await rpc("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "test", version: "1" },
    });
    const instructions = (handshake["result"] as { instructions: string }).instructions;
    expect(instructions).toContain("error.data['x402/payment-required']");
  });

  it("routes a buyer to the right shelf instead of refusing flatly", async () => {
    /*
     * Walked live during the review and worth keeping: buy_simple does
     * not sell spot_check, and rather than a bare "unknown item" the
     * door names the tool that does. An agent that guessed the wrong
     * cluster recovers in one call instead of abandoning the purchase.
     */
    const wrong = await rpc("tools/call", {
      name: "buy_simple",
      arguments: { item_id: "spot_check", host: "example.com" },
    });
    const error = wrong["error"] as { message: string; data: Record<string, unknown> };
    expect(error.message).toContain("buy_observation");
    expect(error.data["charged"]).toBe(false);
    expect(error.data["retry_same_request"]).toBe(false);
  });
});
