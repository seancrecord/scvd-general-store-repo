import { SELF, env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { runMcpPayment } from "@/lib/mcp-payment";
import { getOpenDeliveryIntent } from "@/services/delivery-audit";
import { KV_KEYS } from "@/lib/kv-keys";
import { buildPaymentSignature, decodePaymentRequired } from "./helpers/payment";
import {
  installFacilitatorMock,
  TEST_TRANSACTION,
} from "./helpers/facilitator-mock";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";

beforeAll(() => {
  installFacilitatorMock();
});

/**
 * THE DELIVERY INTENT IS TRANSPORT-AGNOSTIC (task #85, second half).
 *
 * The intent row exists for exactly one failure: money moved, goods
 * never left, buyer possibly an agent that is no longer running. That
 * failure is ITEM-shaped, not DOOR-shaped — the same mint runs behind
 * both doors — yet only the HTTP gate opened the row. A sale that
 * settled through MCP and died before its mint was invisible to
 * /admin/deliveries: the books balanced, the buyer got nothing, and
 * the one instrument built for that state never saw it. (The morning
 * the keeper read that desk twice during the recurring_patronage
 * report, its "undelivered: []" was only true of one door.)
 *
 * Same law as the HTTP gate, both directions: opening never fails the
 * sale, closing never fails the response, and a row left behind is a
 * false alarm the keeper can dismiss — the noisy direction, chosen on
 * purpose.
 */

function nonceHex(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return `0x${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

async function paymentFor(item: string): Promise<Record<string, unknown>> {
  const challenge = decodePaymentRequired(
    await SELF.fetch(`${BASE}/api/buy/${item}`),
  );
  return JSON.parse(
    atob(buildPaymentSignature(challenge.accepts[0]!, nonceHex())),
  ) as Record<string, unknown>;
}

describe("the MCP till opens the delivery intent when money moves", () => {
  it("a settle whose mint never finishes leaves the row the audit reads", async () => {
    const outcome = await runMcpPayment(
      testEnv,
      "hello",
      await paymentFor("hello"),
      { userAgent: "delivery-intent-spec" },
      undefined,
      "asked_for=the-exact-thing-the-buyer-wanted",
    );
    expect(outcome.kind).toBe("authorized");
    if (outcome.kind !== "authorized") return;

    // The mint's last line, and then the isolate dies: settle runs,
    // nothing after it does. This call IS that failure.
    await outcome.pending.settle();

    const open = await getOpenDeliveryIntent(testEnv, TEST_TRANSACTION);
    expect(open).not.toBeNull();
    expect(open!.intent.path).toBe("/api/buy/hello");
    expect(open!.intent.transaction).toBe(TEST_TRANSACTION);
    expect(open!.intent.paid_usdc).toBeGreaterThan(0);
    // What the buyer asked for rides the row, so a delivery that dies
    // after settlement can still be finished by hand (the 2026-08-10
    // settlement_attestation lesson, now on this door too).
    expect(open!.intent.query).toContain("the-exact-thing-the-buyer-wanted");
  });
});

describe("a delivered MCP sale closes its row at the same seam", () => {
  it("goods out means no open intent and a delivered-settlement record", async () => {
    const payment = await paymentFor("hello");
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
    const body = (await response.json()) as {
      result?: { isError?: boolean };
      error?: unknown;
    };
    expect(body.error).toBeUndefined();
    expect(body.result?.isError ?? false).toBe(false);

    // The row's whole purpose is to stop existing.
    expect(await getOpenDeliveryIntent(testEnv, TEST_TRANSACTION)).toBeNull();
    // And the chain walk learns this money BOUGHT SOMETHING — the same
    // record the HTTP door writes at its 2xx seam, so reconciliation
    // does not depend on which door a buyer came through.
    const delivered = await testEnv.COUNTERS.get(
      KV_KEYS.settledDelivery(TEST_TRANSACTION.toLowerCase()),
    );
    expect(delivered).not.toBeNull();
  });
});
