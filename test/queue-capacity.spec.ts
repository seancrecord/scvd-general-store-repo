import { SELF, env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { KV_KEYS, currentWeekKey } from "@/lib/kv-keys";
import {
  OPEN_LABOR_CAP,
  capacityVerdict,
  queueLoad,
} from "@/services/queue-capacity";
import { getMenuItem } from "@/store";
import { markKeeperSeen } from "@/services/shutter";
import { installFacilitatorMock } from "./helpers/facilitator-mock";
import { buildPaymentSignature, decodePaymentRequired } from "./helpers/payment";
import type { Env, OrderRecord } from "@/types";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";

/**
 * THE BENCH — how much labor is already promised.
 *
 * The shutter enforces "the store never promises labor nobody is there
 * to do" by checking PRESENCE. It never checked LOAD, and those are
 * different questions: a keeper seen an hour ago could be sold ten
 * weeks of work in an afternoon.
 *
 * The trap these tests exist to keep shut is that the store LOOKED
 * bounded. `weekly_inventory` reads like a cap and is not one — it is
 * a rate, it resets every Monday, and a rate limit cannot bound a
 * backlog. That is the case named explicitly below, because it is the
 * one somebody would remove this gate over, having read the inventory
 * check and concluded it was already handled.
 */

async function clearOrders(): Promise<void> {
  const listed = await testEnv.ORDERS.list({ prefix: KV_KEYS.orderPrefix });
  for (const key of listed.keys) await testEnv.ORDERS.delete(key.name);
}

async function putOrder(
  id: string,
  itemId: string,
  status: OrderRecord["status"] = "queued",
): Promise<void> {
  const record: OrderRecord = {
    order_id: id,
    item_id: itemId,
    item_name: itemId,
    status,
    created_at: new Date(Date.now() - 3_600_000).toISOString(),
    sla_hours: 168,
    paid_usdc: 3,
    tip_usdc: 0,
    patron_number: 1,
    cert_id: `cert_${id}`,
    ...(status === "completed" ? { completed_at: new Date().toISOString() } : {}),
  };
  await testEnv.ORDERS.put(KV_KEYS.order(id), JSON.stringify(record));
}

beforeEach(clearOrders);

describe("counting what is already promised", () => {
  it("counts open labor orders and ignores finished ones", async () => {
    await putOrder("a", "quick_judgment");
    await putOrder("b", "quick_judgment", "completed");
    await putOrder("c", "the_collab");
    const load = await queueLoad(testEnv);
    expect(load.open_total).toBe(2);
    expect(load.open_by_item["quick_judgment"]).toBe(1);
    expect(load.open_by_item["the_collab"]).toBe(1);
    expect(load.cap).toBe(OPEN_LABOR_CAP);
  });

  it("ignores machine items entirely — they promise nobody's time", async () => {
    await putOrder("m1", "settlement_attestation");
    await putOrder("m2", "small_blessing");
    expect((await queueLoad(testEnv)).open_total).toBe(0);
  });

  it("reports the oldest open order, which is the queue's real shape", async () => {
    await putOrder("old", "quick_judgment");
    const load = await queueLoad(testEnv);
    expect(load.oldest_open_hours).toBeGreaterThan(0.5);
  });
});

describe("the ceiling that weekly inventory was never going to be", () => {
  it("refuses a labor item once its own open count reaches its declared weekly rate", async () => {
    const item = getMenuItem("quick_judgment")!;
    expect(item.weekly_inventory).toBe(5);
    for (let index = 0; index < 5; index += 1) {
      await putOrder(`q${index}`, "quick_judgment");
    }
    const verdict = await capacityVerdict(testEnv, item);
    expect(verdict.ok).toBe(false);
    if (verdict.ok) throw new Error("unreachable");
    expect(verdict.reason).toContain("already 5 of these in the queue");
    expect(verdict.reason).toContain("Nothing charged");
  });

  it("REFUSES A BACKLOG THAT EVERY WEEKLY CHECK WOULD HAVE WAVED THROUGH", async () => {
    /*
     * THE BUG, named so nobody removes this gate after reading the
     * inventory check and concluding it was covered.
     *
     * weekly_inventory lives at inventory:<item>:<week> and RESETS
     * every Monday. Five judgments bought last week and none finished
     * means this week's counter reads zero and the sale goes through
     * — five open becomes six, then eleven, with every weekly check
     * passing the whole way. A rate cannot bound a level.
     *
     * Here the weekly counter is explicitly untouched, so the only
     * thing that can refuse this sale is the open-queue gate.
     */
    await testEnv.COUNTERS.delete(
      KV_KEYS.inventory("quick_judgment", currentWeekKey()),
    );
    for (let index = 0; index < 5; index += 1) {
      await putOrder(`carried${index}`, "quick_judgment");
    }
    // The weekly ledger says this week is untouched...
    const sold = await testEnv.COUNTERS.get(
      KV_KEYS.inventory("quick_judgment", currentWeekKey()),
    );
    expect(sold).toBeNull();
    // ...and the bench still says no.
    const verdict = await capacityVerdict(testEnv, getMenuItem("quick_judgment")!);
    expect(verdict.ok).toBe(false);
  });

  it("caps the house even for an item that declares no rate at all", async () => {
    /*
     * the_collab: $25, a 168-hour promised window, and no
     * weekly_inventory of any kind. Before this gate, ten bought in an
     * afternoon was ten weeks of work owed inside one week, and the
     * refund-window detector would have found them all a week later.
     */
    const item = getMenuItem("the_collab")!;
    expect(item.weekly_inventory).toBeUndefined();
    expect(item.sla_hours).toBe(168);
    for (let index = 0; index < OPEN_LABOR_CAP; index += 1) {
      await putOrder(`c${index}`, "the_collab");
    }
    const verdict = await capacityVerdict(testEnv, item);
    expect(verdict.ok).toBe(false);
    if (verdict.ok) throw new Error("unreachable");
    expect(verdict.reason).toContain("The bench is full");
    expect(verdict.cap).toBe(OPEN_LABOR_CAP);
  });

  it("lets labor through when the bench has room", async () => {
    await putOrder("one", "quick_judgment");
    expect((await capacityVerdict(testEnv, getMenuItem("the_collab")!)).ok).toBe(
      true,
    );
  });

  it("never gates a machine item, however deep the labor queue", async () => {
    for (let index = 0; index < OPEN_LABOR_CAP + 5; index += 1) {
      await putOrder(`deep${index}`, "the_collab");
    }
    for (const id of ["settlement_attestation", "small_blessing", "service_audit"]) {
      expect((await capacityVerdict(testEnv, getMenuItem(id)!)).ok, id).toBe(true);
    }
  });
});

describe("at the door", () => {
  it("refuses a full bench with 503 and settles nothing", async () => {
    const facilitator = installFacilitatorMock();
    await markKeeperSeen(testEnv);

    // A challenge first, while the bench is clear.
    const challenge = await SELF.fetch(`${BASE}/api/buy/the_collab`);
    expect(challenge.status).toBe(402);
    const signature = buildPaymentSignature(
      decodePaymentRequired(challenge).accepts[0] as never,
    );

    for (let index = 0; index < OPEN_LABOR_CAP; index += 1) {
      await putOrder(`full${index}`, "the_collab");
    }
    facilitator.settleCalls = 0;
    const refused = await SELF.fetch(`${BASE}/api/buy/the_collab`, {
      headers: { "PAYMENT-SIGNATURE": signature },
    });

    expect(refused.status).toBe(503);
    const body = (await refused.json()) as { error: string; cap: number };
    expect(body.error).toContain("The bench is full");
    expect(body.cap).toBe(OPEN_LABOR_CAP);
    // The half that matters: refused BEFORE the money, like the shutter.
    expect(facilitator.settleCalls).toBe(0);
  });

  it("points a turned-away buyer at the doors that are still open", async () => {
    for (let index = 0; index < OPEN_LABOR_CAP; index += 1) {
      await putOrder(`full${index}`, "the_collab");
    }
    const refused = await SELF.fetch(`${BASE}/api/buy/the_collab`);
    const body = (await refused.json()) as Record<string, string>;
    expect(body["machine_shelves"]).toContain("/menu.json");
    expect(body["leave_a_request"]).toContain("/api/request");
  });

  it("leaves the instant shelves selling while the bench is full", async () => {
    for (let index = 0; index < OPEN_LABOR_CAP + 3; index += 1) {
      await putOrder(`full${index}`, "the_collab");
    }
    const response = await SELF.fetch(`${BASE}/api/buy/settlement_attestation`);
    expect(response.status).toBe(402);
  });
});
