import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import {
  auditDeliveries,
  closeDeliveryIntent,
  DELIVERY_GRACE_MINUTES,
  DELIVERY_SCAN_CAP,
  openDeliveryIntent,
  runDeliveryAudit,
} from "@/services/delivery-audit";
import { KV_KEYS } from "@/lib/kv-keys";
import { listAlerts } from "@/lib/alerts";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;

/**
 * THE DELIVERY AUDIT — the instrument for the one failure this store
 * cannot be told about: money settled, goods never went out, and the
 * buyer is an agent that may not be running any more to complain.
 *
 * The tests that matter here are the ones where something went wrong
 * BETWEEN the money and the goods, because the healthy path is the
 * easy half. A row that survives is the finding; a row that vanishes
 * when it should not have is the bug.
 */

async function clearIntents(): Promise<void> {
  const listed = await testEnv.ORDERS.list({
    prefix: KV_KEYS.deliveryIntentPrefix,
  });
  for (const key of listed.keys) {
    await testEnv.ORDERS.delete(key.name);
  }
}

function minutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60000).toISOString();
}

beforeEach(async () => {
  await clearIntents();
});

describe("opening and closing an intent", () => {
  it("keys on the settlement transaction, which an outsider can check", async () => {
    const key = await openDeliveryIntent(testEnv, {
      path: "/api/buy/hello",
      transaction: "0xabc123",
      payer: "0xpayer",
      paid_usdc: 0.01,
      settled_at: new Date().toISOString(),
    });
    expect(key).toBe(KV_KEYS.deliveryIntent("0xabc123"));
    expect(await testEnv.ORDERS.get(key)).not.toBeNull();
  });

  it("still records a sale the facilitator gave no hash for, marked as such", async () => {
    const key = await openDeliveryIntent(testEnv, {
      path: "/api/buy/hello",
      paid_usdc: 0.01,
      settled_at: new Date().toISOString(),
    });
    // Synthesised, and visibly so — a missing hash must not silently
    // look like a real one.
    expect(key).toContain("notx-");
    expect(await testEnv.ORDERS.get(key)).not.toBeNull();
  });

  it("closing removes the row, because its whole purpose is to stop existing", async () => {
    const key = await openDeliveryIntent(testEnv, {
      path: "/api/buy/hello",
      transaction: "0xdone",
      paid_usdc: 0.01,
      settled_at: new Date().toISOString(),
    });
    await closeDeliveryIntent(testEnv, key);
    expect(await testEnv.ORDERS.get(key)).toBeNull();
  });
});

describe("the audit", () => {
  it("reports nothing when every sale delivered", async () => {
    const key = await openDeliveryIntent(testEnv, {
      path: "/api/buy/hello",
      transaction: "0xok",
      paid_usdc: 0.01,
      settled_at: minutesAgo(60),
    });
    await closeDeliveryIntent(testEnv, key);
    const audit = await auditDeliveries(testEnv);
    expect(audit.undelivered).toEqual([]);
    expect(audit.checked).toBe(0);
  });

  it("does not flag a request that is still in flight", async () => {
    await openDeliveryIntent(testEnv, {
      path: "/api/buy/hello",
      transaction: "0xfresh",
      paid_usdc: 0.01,
      settled_at: new Date().toISOString(),
    });
    const audit = await auditDeliveries(testEnv);
    expect(audit.in_flight).toBe(1);
    expect(audit.undelivered).toEqual([]);
  });

  it("FLAGS a sale that took money and delivered nothing", async () => {
    // The whole point: settled, never closed, past the grace window.
    await openDeliveryIntent(testEnv, {
      path: "/api/buy/phone_call",
      transaction: "0xstranded",
      payer: "0xbuyer",
      paid_usdc: 20,
      settled_at: minutesAgo(DELIVERY_GRACE_MINUTES + 5),
    });
    const audit = await auditDeliveries(testEnv);
    expect(audit.undelivered.length).toBe(1);
    const sale = audit.undelivered[0]!;
    expect(sale.transaction).toBe("0xstranded");
    expect(sale.payer).toBe("0xbuyer");
    expect(sale.paid_usdc).toBe(20);
    expect(sale.minutes_waiting).toBeGreaterThanOrEqual(
      DELIVERY_GRACE_MINUTES,
    );
  });

  it("treats an unreadable settled_at as overdue rather than in flight", async () => {
    /**
     * Failing the other way would let one bad timestamp hide a real
     * undelivered sale forever — a silent loss instead of a
     * dismissible alert.
     */
    await testEnv.ORDERS.put(
      KV_KEYS.deliveryIntent("0xbaddate"),
      JSON.stringify({
        path: "/api/buy/hello",
        transaction: "0xbaddate",
        paid_usdc: 0.01,
        settled_at: "not a date",
      }),
    );
    const audit = await auditDeliveries(testEnv);
    expect(audit.undelivered.length).toBe(1);
    expect(audit.in_flight).toBe(0);
  });

  it("puts the longest-stranded sale first", async () => {
    await openDeliveryIntent(testEnv, {
      path: "/api/buy/hello",
      transaction: "0xrecent",
      paid_usdc: 0.01,
      settled_at: minutesAgo(20),
    });
    await openDeliveryIntent(testEnv, {
      path: "/api/buy/hello",
      transaction: "0xold",
      paid_usdc: 0.01,
      settled_at: minutesAgo(5000),
    });
    const audit = await auditDeliveries(testEnv);
    expect(audit.undelivered[0]?.transaction).toBe("0xold");
  });

  it("reports its own cap rather than truncating silently", async () => {
    const audit = await auditDeliveries(testEnv);
    expect(audit.truncated).toBe(false);
    expect(DELIVERY_SCAN_CAP).toBeGreaterThan(0);
  });

  it("survives a corrupt row instead of failing the whole sweep", async () => {
    await testEnv.ORDERS.put(
      KV_KEYS.deliveryIntent("0xjunk"),
      "not json at all",
    );
    await openDeliveryIntent(testEnv, {
      path: "/api/buy/hello",
      transaction: "0xreal",
      paid_usdc: 0.01,
      settled_at: minutesAgo(99),
    });
    // The good row still surfaces; one bad row cannot blind the check.
    const audit = await auditDeliveries(testEnv);
    expect(
      audit.undelivered.some((s) => s.transaction === "0xreal"),
    ).toBe(true);
  });
});

describe("the cron pass", () => {
  it("pages the keeper, naming the money and the route", async () => {
    await openDeliveryIntent(testEnv, {
      path: "/api/buy/phone_call",
      transaction: "0xpaged",
      payer: "0xbuyer",
      paid_usdc: 20,
      settled_at: minutesAgo(120),
    });
    await runDeliveryAudit(testEnv);
    const alerts = await listAlerts(testEnv, 50);
    const alert = alerts.find((a) => a.condition === "undelivered_sale");
    expect(alert).toBeDefined();
    expect(alert!.detail).toContain("/api/buy/phone_call");
    expect(alert!.detail).toContain("0xpaged");
    // The keeper is told what to DO, not merely that something is off.
    expect(alert!.detail.toLowerCase()).toContain("refund or fulfil");
  });

  it("stays quiet when there is nothing to report", async () => {
    const audit = await runDeliveryAudit(testEnv);
    expect(audit.undelivered).toEqual([]);
  });
});
