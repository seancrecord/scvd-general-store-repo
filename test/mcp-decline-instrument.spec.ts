import { SELF, env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { readDeclines } from "@/lib/declines";
import type { Env } from "@/types";
import { installFacilitatorMock, TEST_PAYER } from "./helpers/facilitator-mock";

const testEnv = env as unknown as Env;

beforeAll(() => {
  installFacilitatorMock();
});

/**
 * THE OTHER DOOR.
 *
 * CV, 2026-07-29, asking the question that should have come first:
 * does the MCP door inherit the HTTP door's fixes? It did not. It ran
 * its own copy of the payment pipeline, so it had no decline slot, no
 * diagnosis, no pre-flight — and recorded NO DECLINES AT ALL. An agent
 * bouncing off /mcp was invisible in the one instrument built to catch
 * a buyer bouncing, while the same failure on the HTTP door raised an
 * alarm.
 *
 * A fix that looks shared and isn't is worse than no fix, because it
 * is believed.
 */
async function callTool(payment: unknown): Promise<Record<string, unknown>> {
  const response = await SELF.fetch("https://scvd.store/mcp", {
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
  return (await response.json()) as Record<string, unknown>;
}

describe("the MCP door carries the same instrument", () => {
  it("books a decline, where before it recorded nothing", async () => {
    const before = (await readDeclines(testEnv)).declines.length;
    // A payload with numbers where decimal strings belong: the exact
    // shape that cost CV a round and told him nothing.
    await callTool({
      x402Version: 2,
      accepted: {
        scheme: "exact",
        network: "eip155:8453",
        amount: "500000",
        asset: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
        payTo: "0x1111111111111111111111111111111111111111",
        maxTimeoutSeconds: 300,
        extra: { name: "USD Coin", version: "2" },
      },
      payload: {
        signature: `0x${"cd".repeat(65)}`,
        authorization: {
          from: TEST_PAYER,
          to: "0x1111111111111111111111111111111111111111",
          value: 500000,
          validAfter: 0,
          validBefore: 99999999999,
          nonce: `0x${"44".repeat(32)}`,
        },
      },
    });

    const after = await readDeclines(testEnv);
    expect(
      after.declines.length,
      "the MCP door still records nothing",
    ).toBeGreaterThan(before);
    // And it names the field, rather than booking a shrug.
    expect(
      after.declines.some((row) => row.reason.startsWith("local:preflight:")),
    ).toBe(true);
  });

  it("refuses the malformed payload without calling the facilitator", async () => {
    const body = await callTool({
      x402Version: 2,
      accepted: { scheme: "exact", network: "eip155:8453", amount: "1" },
      payload: {
        signature: `0x${"cd".repeat(65)}`,
        authorization: {
          from: TEST_PAYER,
          to: "0x1111111111111111111111111111111111111111",
          value: 1,
          validAfter: "0",
          validBefore: "99999999999",
          nonce: `0x${"55".repeat(32)}`,
        },
      },
    });
    const error = body.error as Record<string, unknown> | undefined;
    const data = (error?.data ?? {}) as Record<string, unknown>;
    const declined = data.payment_declined as Record<string, unknown> | undefined;
    expect(String(declined?.reason ?? "")).toContain("local:preflight:");
    expect(String(declined?.note ?? "")).toContain("round trip");
  });
});
