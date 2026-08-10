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

describe("the keeper's resolution (2026-08-04, the audit's first real catches)", () => {
  it("turns an intent into a resolution record and stops the paging", async () => {
    const { openDeliveryIntent, auditDeliveries, resolveDeliveryIntent } =
      await import("@/services/delivery-audit");
    const tx = "4pUYtest" + Math.random().toString(36).slice(2, 8);
    await openDeliveryIntent(testEnv, {
      path: "/api/buy/settlement_attestation",
      item_id: "settlement_attestation",
      settled_at: new Date(Date.now() - 60 * 60000).toISOString(),
      paid_usdc: 0.004,
      transaction: tx,
      payer: "GUhrGGnu8fcaGpV7iL1XjA4P3XoM31auicMxd58NkL4J",
    } as never);

    const before = await auditDeliveries(testEnv);
    expect(before.undelivered.some((sale) => sale.transaction === tx)).toBe(true);

    const result = await resolveDeliveryIntent(testEnv, tx, "house_absorbed");
    expect(result.ok).toBe(true);

    const after = await auditDeliveries(testEnv);
    expect(after.undelivered.some((sale) => sale.transaction === tx)).toBe(false);
    // A record, not an erasure: the resolution row keeps the intent.
    const record = await testEnv.ORDERS.get(`delivery_resolved:${tx}`, "json") as Record<string, unknown>;
    expect(record?.outcome).toBe("house_absorbed");
    expect((record?.intent as Record<string, unknown>)?.paid_usdc).toBe(0.004);
  });

  it("refuses an unknown transaction rather than inventing a resolution", async () => {
    const { resolveDeliveryIntent } = await import("@/services/delivery-audit");
    const result = await resolveDeliveryIntent(testEnv, "0xnobody", "refunded");
    expect(result.ok).toBe(false);
  });
});

describe("closing a chain orphan (live case, 2026-08-05)", () => {
  /**
   * The bank walk finds money OUTSIDE the buy flow — no intent row
   * ever existed, the cursor has moved past it, and the alert trail
   * is its only record. The lever refused everything without an
   * intent, so two Jupiter swaps of the keeper's own money sat
   * unresolvable for two days. The trail now vouches for the tx the
   * way the intent row used to.
   */
  it("resolves a tx the walk alerted on, though no intent row ever existed", async () => {
    const { resolveDeliveryIntent } = await import("@/services/delivery-audit");
    const { sendAlert } = await import("@/lib/alerts");
    const sig = "FdzOrphan" + Math.random().toString(36).slice(2, 8);
    await sendAlert(testEnv, {
      condition: "undelivered_sale",
      detail: `24.794126 USDC arrived on Solana from EPUHjseDexVault111111111111111111111111111 in transaction ${sig} (block 437207739) and NO certificate names it. The chain says we were paid; our own records do not. Check whether an artifact was minted under a different hash, then fulfil or refund by hand.`,
      key: sig,
    });

    const result = await resolveDeliveryIntent(testEnv, sig, "house_absorbed");
    expect(result.ok).toBe(true);

    const record = (await testEnv.ORDERS.get(
      `delivery_resolved:${sig}`,
      "json",
    )) as Record<string, unknown>;
    expect(record?.outcome).toBe("house_absorbed");
    // The record says which instrument found the money — and that no
    // intent ever existed, so nobody later reads it as an erasure.
    expect(record?.source).toBe("chain_reconciliation");
  });

  it("still refuses a tx that neither an intent nor the trail ever named", async () => {
    const { resolveDeliveryIntent } = await import("@/services/delivery-audit");
    const result = await resolveDeliveryIntent(
      testEnv,
      "SigNobodyEverAlertedOn",
      "house_absorbed",
    );
    expect(result.ok).toBe(false);
    expect((result as { refusal: string }).refusal).toContain("no alert");
  });
});

describe("clicking the wrong outcome (live case, 2026-08-10)", () => {
  /**
   * The keeper refunded a dropped attestation and then clicked
   * "fulfilled by hand" on the page. Two things had to be true after
   * that: the record must end up saying REFUNDED, because that is what
   * happened to the money — and it must not quietly pretend it always
   * had. A store that publishes its corrections cannot overwrite one.
   *
   * The old path was worse than either: the first resolution consumes
   * the intent row, so the fix fell through to the chain-orphan branch
   * and stamped "No delivery intent ever existed" onto the corrected
   * record. False, and false in the worst possible place.
   */
  async function resolvedRow(tx: string): Promise<Record<string, unknown>> {
    return (await testEnv.ORDERS.get(`delivery_resolved:${tx}`, "json")) as Record<
      string,
      unknown
    >;
  }

  async function openOne(tx: string): Promise<void> {
    await openDeliveryIntent(testEnv, {
      path: "/api/buy/settlement_attestation",
      item_id: "settlement_attestation",
      settled_at: new Date(Date.now() - 60 * 60000).toISOString(),
      paid_usdc: 0.004,
      transaction: tx,
      payer: "0x72f6d77a000000000000000000000000000000ab",
    } as never);
  }

  it("records the correction and KEEPS the outcome that was wrong", async () => {
    const { resolveDeliveryIntent } = await import("@/services/delivery-audit");
    const tx = "0xmisclick" + Math.random().toString(36).slice(2, 8);
    await openOne(tx);

    await resolveDeliveryIntent(testEnv, tx, "fulfilled_by_hand");
    const fix = await resolveDeliveryIntent(testEnv, tx, "refunded");
    expect(fix.ok).toBe(true);

    const record = await resolvedRow(tx);
    // What actually happened to the money is what the record says now.
    expect(record?.outcome).toBe("refunded");
    expect(record?.corrected).toBe(true);
    // And the mistake is still in there, not painted over.
    expect((record?.superseded as Record<string, unknown>)?.outcome).toBe(
      "fulfilled_by_hand",
    );
    expect(String(record?.note)).toContain("fulfilled_by_hand");
  });

  it("never files a correction as a chain orphan", async () => {
    // The specific lie the old code told: the intent DID exist, the
    // first resolution simply consumed it.
    const { resolveDeliveryIntent } = await import("@/services/delivery-audit");
    const tx = "0xnotorphan" + Math.random().toString(36).slice(2, 8);
    await openOne(tx);
    await resolveDeliveryIntent(testEnv, tx, "fulfilled_by_hand");
    await resolveDeliveryIntent(testEnv, tx, "refunded");

    const record = await resolvedRow(tx);
    expect(record?.source).not.toBe("chain_reconciliation");
    expect(String(record?.note ?? "")).not.toContain("never existed");
  });

  it("treats clicking the same outcome twice as the no-op it is", async () => {
    // Double-submit, back button, impatient reload. None of those are
    // a correction, and none should manufacture a correction record.
    const { resolveDeliveryIntent } = await import("@/services/delivery-audit");
    const tx = "0xdoubleclick" + Math.random().toString(36).slice(2, 8);
    await openOne(tx);
    await resolveDeliveryIntent(testEnv, tx, "refunded");
    expect((await resolveDeliveryIntent(testEnv, tx, "refunded")).ok).toBe(true);

    const record = await resolvedRow(tx);
    expect(record?.outcome).toBe("refunded");
    expect(record?.corrected).toBeUndefined();
    // The original intent survives the second click, which is the
    // whole reason the no-op returns early instead of rewriting.
    expect((record?.intent as Record<string, unknown>)?.paid_usdc).toBe(0.004);
  });
});
