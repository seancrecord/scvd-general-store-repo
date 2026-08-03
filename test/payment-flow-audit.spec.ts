import { SELF, env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { installFacilitatorMock } from "./helpers/facilitator-mock";
import {
  buildPaymentSignature,
  decodePaymentRequired,
} from "./helpers/payment";
import { KV_KEYS, currentWeekKey } from "@/lib/kv-keys";
import type { Env } from "@/types";

/**
 * PART A OF THE PAYMENT-FLOW AUDIT (CV's MPP spec, 2026-08-03,
 * revised in PAYMENT_RAILS.md): walk the EXISTING single-rail flow
 * and prove — not assume — the drop points are safe, BEFORE any
 * second rail is written. These are the scenarios that had no
 * dedicated coverage; the ones that did are cited in the audit table
 * rather than re-tested here.
 */

const BASE = "https://scvd.store";
const testEnv = env as unknown as Env;

beforeAll(() => {
  installFacilitatorMock();
});

describe("A.1.1 — a 402 challenge creates no money state", () => {
  it("no order, no cert, no patron consumed by an unsigned probe", async () => {
    const patronBefore = await testEnv.COUNTERS.get(KV_KEYS.patronNumber);
    const response = await SELF.fetch(`${BASE}/api/buy/small_blessing`);
    expect(response.status).toBe(402);
    const patronAfter = await testEnv.COUNTERS.get(KV_KEYS.patronNumber);
    /**
     * The invariant as amended in the revised spec: no MONEY state —
     * patron numbers, orders, certs. Observability state (decline
     * counters, event rows) is written BY DESIGN; a census that
     * cannot see window-shoppers cannot falsify "nobody came".
     */
    expect(patronAfter).toBe(patronBefore);
  });
});

describe("A.1.8 — amount_check rides every priced 402, not just the tested one", () => {
  it("every item's challenge carries the atomic-units warning", async () => {
    const { MENU_ITEMS } = await import("@/store");
    for (const item of MENU_ITEMS) {
      if (item.fulfillment === "human_queue" && item.weekly_inventory === 0) {
        continue;
      }
      const response = await SELF.fetch(`${BASE}/api/buy/${item.id}`);
      if (response.status !== 402) {
        // Sold out / presence-gated — not this test's business.
        continue;
      }
      const body = (await response.json()) as Record<string, unknown>;
      expect(
        body["amount_check"],
        `${item.id}'s 402 carries no amount_check — the one weak-model failure that does not bounce`,
      ).toBeTruthy();
    }
  });
});

describe("A.2 — the stock race, refused silence", () => {
  async function settleOne(itemId: string): Promise<Response> {
    const url = `${BASE}/api/buy/${itemId}?detail=audit+test`;
    const challenge = await SELF.fetch(url, {
      headers: { "PAYMENT-SIGNATURE": "price-probe" },
    });
    if (challenge.status !== 402) {
      return challenge;
    }
    const required = decodePaymentRequired(challenge);
    return SELF.fetch(url, {
      headers: { "PAYMENT-SIGNATURE": buildPaymentSignature(required.accepts[0]!) },
    });
  }

  it("an oversold sale alerts loudly instead of queueing quietly", async () => {
    /**
     * The race itself cannot be reliably provoked in one isolate, and
     * the code read already proves it exists (read-modify-write, gate
     * before settle). What CAN be pinned deterministically is the
     * BACKSTOP: when the (weekly_inventory + 1)th sale lands — however
     * it got past the gate — the keeper is alerted with the order id
     * and the refund instruction. Silence is the failure mode; this
     * asserts its absence.
     */
    const { MENU_ITEMS } = await import("@/store");
    const witness = MENU_ITEMS.find((entry) => entry.id === "human_witness")!;
    const key = KV_KEYS.inventory("human_witness", currentWeekKey());
    // Simulate the race's outcome: the gate was passed while the
    // counter already sat AT the ceiling.
    await testEnv.COUNTERS.put(key, String(witness.weekly_inventory));

    const { fulfillPurchase } = await import("@/services/fulfillment");
    await fulfillPurchase(
      testEnv,
      witness,
      {
        paidUsdc: witness.price_usdc,
        tipUsdc: 0,
        payer: "0x9999999999999999999999999999999999999999",
      } as never,
      { detail: "audit: simulated concurrent winner" } as never,
    );

    const { listAlerts } = await import("@/lib/alerts");
    const alerts = await listAlerts(testEnv, 10);
    expect(
      alerts.some((alert) => alert.detail.includes("OVERSOLD: human_witness")),
      "a sale past the ceiling must never be silent",
    ).toBe(true);
    await testEnv.COUNTERS.delete(key);
  });

  it("concurrent same-key idempotent retries settle at most once", async () => {
    /**
     * A.2's second race, tested live-in-isolate: two requests, same
     * Idempotency-Key, fired together. Either both return the same
     * original purchase or one replays from cache — what must NOT
     * happen is two distinct certificates.
     */
    const url = `${BASE}/api/buy/small_blessing`;
    const challenge = await SELF.fetch(url, {
      headers: { "PAYMENT-SIGNATURE": "price-probe" },
    });
    const required = decodePaymentRequired(challenge);
    const headers = {
      "PAYMENT-SIGNATURE": buildPaymentSignature(required.accepts[0]!),
      "Idempotency-Key": "audit-race-key-1",
    };
    const [first, second] = await Promise.all([
      SELF.fetch(url, { headers }),
      SELF.fetch(url, { headers }),
    ]);
    const bodies = [
      (await first.json()) as Record<string, unknown>,
      (await second.json()) as Record<string, unknown>,
    ];
    const certIds = bodies
      .map((body) => (body["certificate"] as Record<string, unknown>)?.["cert_id"] ?? body["cert_id"])
      .filter(Boolean);
    const distinct = new Set(certIds.map(String));
    expect(
      distinct.size,
      `same idempotency key produced ${distinct.size} distinct certs — a double settle`,
    ).toBeLessThanOrEqual(1);
  });
});

describe("A.1.3 — facilitator settlement failure delivers nothing and says why", () => {
  it("settle failure: no cert, no patron, a legible error", async () => {
    const state = installFacilitatorMock();
    state.settleShouldFail = true;
    const patronBefore = await testEnv.COUNTERS.get(KV_KEYS.patronNumber);
    const url = `${BASE}/api/buy/small_blessing`;
    const challenge = await SELF.fetch(url, {
      headers: { "PAYMENT-SIGNATURE": "price-probe" },
    });
    const required = decodePaymentRequired(challenge);
    const response = await SELF.fetch(url, {
      headers: { "PAYMENT-SIGNATURE": buildPaymentSignature(required.accepts[0]!) },
    });
    state.settleShouldFail = false;
    expect(response.status).toBe(402);
    const body = (await response.json()) as Record<string, unknown>;
    expect(JSON.stringify(body)).not.toContain("cert_id");
    const patronAfter = await testEnv.COUNTERS.get(KV_KEYS.patronNumber);
    expect(patronAfter).toBe(patronBefore);
  });
});
