import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import {
  auditRefundWindows,
  runRefundWindowAudit,
  WINDOW_GRACE_MINUTES,
} from "@/services/refund-window";
import { KV_KEYS } from "@/lib/kv-keys";
import { listAlerts } from "@/lib/alerts";
import type { Env, OrderRecord, RefundRecord } from "@/types";

const testEnv = env as unknown as Env;

/**
 * THE REFUND-WINDOW DETECTOR — the check behind the loudest money
 * promise on the card by the door: "we miss a promised window, you
 * get your money back — and you won't have to argue for it."
 *
 * Rule 10 was written about a claim that outran its code by five
 * days. These tests are that rule pointed at the claim most likely to
 * repeat the mistake, because this one is enforced by a human
 * remembering across a week rather than by anything that runs.
 */

const HOUR = 3_600_000;

async function clear(prefix: string): Promise<void> {
  const listed = await testEnv.ORDERS.list({ prefix });
  for (const key of listed.keys) await testEnv.ORDERS.delete(key.name);
}

async function putOrder(order: Partial<OrderRecord> & { order_id: string }): Promise<void> {
  const record: OrderRecord = {
    item_id: "quick_judgment",
    item_name: "A Quick Judgment",
    status: "queued",
    created_at: new Date(Date.now() - 200 * HOUR).toISOString(),
    sla_hours: 168,
    paid_usdc: 5,
    tip_usdc: 0,
    patron_number: 41,
    cert_id: "cert_test",
    ...order,
  };
  await testEnv.ORDERS.put(KV_KEYS.order(record.order_id), JSON.stringify(record));
}

beforeEach(async () => {
  await clear(KV_KEYS.orderPrefix);
  await clear(KV_KEYS.refundPrefix);
});

describe("the refund-window detector", () => {
  it("finds a window that passed with nothing delivered, and says what is owed", async () => {
    await putOrder({ order_id: "ord_open", payer: "0xaaa", paid_usdc: 5 });
    const audit = await auditRefundWindows(testEnv);
    expect(audit.owed).toHaveLength(1);
    expect(audit.owed[0]!.kind).toBe("breached_unfulfilled");
    expect(audit.owed[0]!.hours_late).toBeGreaterThan(30);
    expect(audit.owed_usdc).toBe(5);
  });

  it("counts a LATE DELIVERY as a breach, because the promise does not say 'unless we get there eventually'", async () => {
    /*
     * The class nobody would have counted. Reading the promise the
     * other way would let the store discharge it by being slow and
     * then finishing — which is exactly the argument the buyer was
     * told they would not have to have.
     */
    await putOrder({
      order_id: "ord_late",
      status: "completed",
      created_at: new Date(Date.now() - 300 * HOUR).toISOString(),
      completed_at: new Date(Date.now() - 100 * HOUR).toISOString(),
      payer: "0xbbb",
      paid_usdc: 3,
    });
    const audit = await auditRefundWindows(testEnv);
    expect(audit.owed).toHaveLength(1);
    expect(audit.owed[0]!.kind).toBe("breached_delivered_late");
    // Lateness is measured to DELIVERY, not to now — 300h old, 168h
    // window, delivered at 100h ago, so it landed 32h past due.
    expect(audit.owed[0]!.hours_late).toBeCloseTo(32, 0);
  });

  it("leaves alone an order delivered inside its window, and one still inside it", async () => {
    await putOrder({
      order_id: "ord_ontime",
      status: "completed",
      created_at: new Date(Date.now() - 100 * HOUR).toISOString(),
      completed_at: new Date(Date.now() - 90 * HOUR).toISOString(),
    });
    await putOrder({
      order_id: "ord_running",
      created_at: new Date(Date.now() - 2 * HOUR).toISOString(),
    });
    const audit = await auditRefundWindows(testEnv);
    expect(audit.breaches).toEqual([]);
    expect(audit.checked).toBe(2);
  });

  it("does not page for a window that expired inside the grace period", async () => {
    // An unstated grace is a quiet extension of the promise, so it is
    // a published constant and this test pins it.
    await putOrder({
      order_id: "ord_edge",
      created_at: new Date(
        Date.now() - 168 * HOUR - (WINDOW_GRACE_MINUTES - 2) * 60_000,
      ).toISOString(),
    });
    expect((await auditRefundWindows(testEnv)).breaches).toEqual([]);
  });

  it("stops counting an order as owed once a refund exists against it", async () => {
    await putOrder({ order_id: "ord_refunded", payer: "0xccc", paid_usdc: 5 });
    const refund: RefundRecord = {
      refund_id: "ref_1",
      item: "quick_judgment",
      amount_usdc: 5,
      payer: "0xccc",
      status: "refund_pending",
      created_at: new Date().toISOString(),
    };
    await testEnv.ORDERS.put(KV_KEYS.refund(refund.refund_id), JSON.stringify(refund));
    const audit = await auditRefundWindows(testEnv);
    // Still a breach — it happened. Just no longer money we owe.
    expect(audit.breaches).toHaveLength(1);
    expect(audit.owed).toEqual([]);
    expect(audit.owed_usdc).toBe(0);
    expect(audit.breaches[0]!.refund_status).toBe("refund_pending");
  });

  it("says out loud that the refund join is heuristic, so owed_usdc reads as a floor", async () => {
    // RefundRecord carries no order_id: two breached orders from the
    // same payer for the same item are indistinguishable here. The
    // audit publishes that rather than implying a join the data
    // cannot support.
    await putOrder({ order_id: "ord_a", payer: "0xddd" });
    await putOrder({ order_id: "ord_b", payer: "0xddd" });
    await testEnv.ORDERS.put(
      KV_KEYS.refund("ref_2"),
      JSON.stringify({
        refund_id: "ref_2",
        item: "quick_judgment",
        amount_usdc: 5,
        payer: "0xddd",
        status: "refund_paid",
        created_at: new Date().toISOString(),
      } satisfies RefundRecord),
    );
    const audit = await auditRefundWindows(testEnv);
    // One refund silently covers both. That is the weakness, and the
    // number is a floor rather than a lie about it.
    expect(audit.owed).toEqual([]);
    expect(audit.join_note).toContain("FLOOR");
    expect(audit.join_note).toContain("no order_id");
  });

  it("pages per order, and the page says the money is owed rather than optional", async () => {
    await putOrder({ order_id: "ord_page", payer: "0xeee", paid_usdc: 5 });
    await runRefundWindowAudit(testEnv);
    const alerts = await listAlerts(testEnv, 10);
    // listAlerts surfaces condition/detail/at; the dedupe key is
    // internal, so the order id in the body is what identifies it.
    const page = alerts.find((entry) => entry.detail.includes("ord_page"));
    expect(page, "no alert was raised for a breached window").toBeTruthy();
    expect(page!.condition).toBe("order_sla");
    expect(page!.detail).toContain("owed, not optional");
    expect(page!.detail).toContain("will not have to argue");
  });

  it("never claims to have moved money, because nothing here does", async () => {
    await putOrder({ order_id: "ord_honest", payer: "0xfff" });
    const audit = await auditRefundWindows(testEnv);
    expect(audit.what_this_cannot_see.join(" ")).toContain("keeper pays it by hand");
  });
});
