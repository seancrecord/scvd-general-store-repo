import { SELF, env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { readMonthLedger } from "@/lib/metrics";
import { createOrder } from "@/services/orders";
import { runHealthChecks } from "@/services/health";
import { getMenuItem } from "@/store";
import {
  duplicatelyShelvedItemIds,
  unshelvedItemIds,
} from "@/lib/mcp-tools";
import { installFacilitatorMock } from "./helpers/facilitator-mock";
import {
  buildPaymentSignature,
  decodePaymentRequired,
} from "./helpers/payment";
import type { Env, MenuItem } from "@/types";

/**
 * Phase 1: the MCP door, channel attribution with house exclusion,
 * P1 alerting, and the split ledger.
 */

const BASE = "https://scvd.store";
const testEnv = env as unknown as Env;
const adminAuth = {
  Authorization: `Basic ${btoa("keeper:test-admin-password")}`,
};

beforeAll(() => {
  installFacilitatorMock();
});

async function json(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

let rpcId = 0;
async function rpc(
  method: string,
  params?: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  rpcId += 1;
  const response = await SELF.fetch(`${BASE}/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: rpcId, method, params }),
  });
  return json(response);
}

describe("the MCP door", () => {
  it("initializes free and unauthenticated", async () => {
    const reply = await rpc("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "test-agent", version: "1.0" },
    });
    const result = reply["result"] as Record<string, unknown>;
    expect(result["protocolVersion"]).toBe("2025-06-18");
    const serverInfo = result["serverInfo"] as Record<string, unknown>;
    expect(serverInfo["name"]).toBe("scvd-general-store");
    expect(String(result["instructions"])).toContain("never asks you to run code");
  });

  it("lists every shelf as a tool, free tools included", async () => {
    const reply = await rpc("tools/list");
    const result = reply["result"] as Record<string, unknown>;
    const tools = result["tools"] as Array<Record<string, unknown>>;
    const names = tools.map((tool) => String(tool["name"]));
    expect(names).toContain("ring_bell");
    expect(names).toContain("sign_guestbook");
    expect(names).toContain("verify_artifact");
    expect(names).toContain("read_store_guide");
    expect(names).toContain("buy_signed_record");
    expect(names).toContain("buy_memory_anchor");
    expect(names).toContain("buy_observation");
    // The buy tools were grouped by what an agent is trying to
    // accomplish on 2026-08-02 (23 per-item tools -> 5 shelves); see
    // SHELF_CLUSTERS for why one generic buy_item was the wrong fix.
    // A sixth was added 2026-08-03 — the front counter, for a caller
    // that should not have to read the other five.
    //
    // Counted rather than pinned. The number is not the property worth
    // guarding; what matters is that every shelf reaches the door, and
    // a literal here made the sixth tool look like a regression.
    expect(tools.length).toBe(new Set(names).size);
    expect(names).toContain("buy_simple");
    /**
     * Single source of truth, reconciled both directions: every menu
     * item is sold by exactly one shelf, and no shelf sells an item
     * the menu does not carry. An item added to MENU_ITEMS but not to
     * a shelf would be silently unbuyable over MCP — the defect this
     * assertion exists to make loud.
     */
    const menu = await json(await SELF.fetch(`${BASE}/menu.json`));
    const menuIds = (menu["items"] as Array<{ id: string }>)
      .map((item) => item.id)
      .sort();
    /**
     * PARTITION TESTS EXCLUDE OVERLAYS. The five clusters partition the
     * menu — every item on exactly one. The front counter added
     * 2026-08-03 deliberately RE-offers items that already live on a
     * cluster, so a capable agent still finds small_blessing by
     * semantic match while a weak one finds it without reading.
     * Including it here would report the duplication as a defect.
     */
    const shelvedIds = tools
      .filter((tool) => Array.isArray(tool["itemIds"]) && !tool["overlay"])
      .flatMap((tool) => tool["itemIds"] as string[])
      .sort();
    expect(shelvedIds).toEqual(menuIds);

    // And the overlay may only ever re-offer items the shelves already
    // sell. A door offering something the partition does not carry
    // would be a second catalogue, which is the thing this design
    // exists to avoid.
    const overlayIds = tools
      .filter((tool) => tool["overlay"])
      .flatMap((tool) => tool["itemIds"] as string[]);
    expect(overlayIds.length).toBeGreaterThan(0);
    for (const id of overlayIds) {
      expect(menuIds, `the front counter offers ${id}, which is not on the menu`).toContain(id);
    }
    expect(unshelvedItemIds()).toEqual([]);
    expect(duplicatelyShelvedItemIds()).toEqual([]);
    const records = tools.find(
      (tool) => tool["name"] === "buy_signed_record",
    )!;
    // The shelf still carries each item's price and what it returns,
    // which is the semantic surface an agent matches against.
    expect(String(records["description"])).toContain("hello");
    expect(String(records["description"])).toContain("$0.5");
    const schema = records["inputSchema"] as Record<string, unknown>;
    expect(schema["type"]).toBe("object");
    expect(schema["required"]).toContain("item_id");
    // No single-item itemId leaks into a shelf listing.
    expect(records["itemId"]).toBeUndefined();
  });

  it("rings the same bell as HTTP, free", async () => {
    const reply = await rpc("tools/call", {
      name: "ring_bell",
      arguments: { agent_name: "mcp-first-ringer" },
    });
    const result = reply["result"] as Record<string, unknown>;
    const structured = result["structuredContent"] as Record<string, unknown>;
    expect(String(structured["message"])).toContain("bell has been rung");
    expect(Number(structured["count"])).toBeGreaterThanOrEqual(1);
  });

  it("answers a bare shelf call with error 402 and the terms", async () => {
    const reply = await rpc("tools/call", {
      name: "buy_signed_record",
      arguments: { item_id: "hello" },
    });
    const error = reply["error"] as Record<string, unknown>;
    expect(error["code"]).toBe(402);
    expect(String(error["message"])).toContain("fifty cents");
    const data = error["data"] as Record<string, unknown>;
    const challenge = data["x402/payment-required"] as Record<string, unknown>;
    expect(challenge["x402Version"]).toBe(2);
    expect(Array.isArray(challenge["accepts"])).toBe(true);
  });

  it("settles in-band and hands over the goods, attributed to mcp", async () => {
    const bare = await rpc("tools/call", {
      name: "buy_signed_record",
      arguments: { item_id: "hello" },
    });
    const challenge = (
      (bare["error"] as Record<string, unknown>)["data"] as Record<
        string,
        unknown
      >
    )["x402/payment-required"] as { accepts: Array<Record<string, unknown>> };
    const payment = buildPaymentSignature(
      challenge.accepts[0] as unknown as Parameters<
        typeof buildPaymentSignature
      >[0],
    );
    const paid = await rpc("tools/call", {
      name: "buy_signed_record",
      arguments: { item_id: "hello", agent_name: "MCP Customer" },
      _meta: { "x402/payment": payment },
    });
    const result = paid["result"] as Record<string, unknown>;
    const goods = result["structuredContent"] as Record<string, unknown>;
    expect(String(goods["deliverable"])).toContain("dirty dog");
    expect(goods["cert_id"]).toBeTruthy();
    expect(goods["patron_number"]).toBeTruthy();
    // The name rides the certificate, verifiable like any other.
    const verified = await json(
      await SELF.fetch(`${BASE}/api/verify/${String(goods["cert_id"])}`),
    );
    const certificate = verified["certificate"] as Record<string, unknown>;
    expect(certificate["name"]).toBe("MCP Customer");
    expect(verified["valid"]).toBe(true);
    // The channel column knows where this settle came from.
    const ledger = await readMonthLedger(testEnv);
    expect(ledger.channels["mcp"]).toBeGreaterThanOrEqual(1);
  });

  it("refuses a paid tool without required args before money moves", async () => {
    const reply = await rpc("tools/call", {
      name: "buy_observation",
      arguments: { item_id: "standing_watch" },
    });
    const error = reply["error"] as Record<string, unknown>;
    expect(error["code"]).toBe(-32602);
    expect(String(error["message"])).toContain("No target, no charge");
  });
});

async function payFor(url: string, headers: Record<string, string> = {}): Promise<Response> {
  const challenge = await SELF.fetch(url, { headers });
  expect(challenge.status).toBe(402);
  const required = decodePaymentRequired(challenge);
  const accepted = required.accepts[0]!;
  return SELF.fetch(url, {
    headers: { ...headers, "PAYMENT-SIGNATURE": buildPaymentSignature(accepted) },
  });
}

describe("house traffic exclusion", () => {
  it("books flagged settles as house, apart from organic", async () => {
    const before = await readMonthLedger(testEnv);
    const houseBefore = before.items["dibs"]?.settledHouse ?? 0;
    const paid = await payFor(`${BASE}/api/buy/dibs`, {
      "X-House": "test-house-secret",
    });
    expect(paid.status).toBe(200);
    // The flag never leaks into the public response.
    expect(JSON.stringify(await paid.json())).not.toContain("house");
    const after = await readMonthLedger(testEnv);
    expect(after.items["dibs"]?.settledHouse ?? 0).toBe(houseBefore + 1);
  });

  it("opens the books complete: the founding settle is on them, as house", async () => {
    const ledger = await readMonthLedger(testEnv, "2026-07");
    expect(ledger.items["hello"]?.settledHouse).toBeGreaterThanOrEqual(1);
    expect(
      ledger.channelsHouse["direct (founding, by hand)"],
    ).toBeGreaterThanOrEqual(1);
  });
});

describe("verify-call counting", () => {
  it("counts re-verification per item", async () => {
    const paid = await payFor(`${BASE}/api/buy/small_blessing`);
    const goods = await json(paid);
    const verifyUrl = String(goods["verify_url"]);
    await SELF.fetch(verifyUrl);
    await SELF.fetch(verifyUrl);
    const ledger = await readMonthLedger(testEnv);
    expect(ledger.items["small_blessing"]?.verifies).toBeGreaterThanOrEqual(2);
  });
});

describe("the four alarms", () => {
  it("fires the test alert from the back room and logs it", async () => {
    const response = await SELF.fetch(`${BASE}/admin/alerts/test`, {
      method: "POST",
      headers: adminAuth,
      redirect: "manual",
    });
    expect([200, 302]).toContain(response.status);
    const listed = await testEnv.COUNTERS.list({ prefix: "alert_log:" });
    expect(listed.keys.length).toBeGreaterThanOrEqual(1);
  });

  it("pages once for a queued order nobody acknowledged in 24h", async () => {
    const item = getMenuItem("the_collab") as MenuItem;
    const order = await createOrder(testEnv, {
      item,
      paidUsdc: 5,
      tipUsdc: 0,
      patronNumber: 99,
      certId: "cert_slatest",
    });
    // Wind the clock: the order has sat for 30 hours.
    const record = (await testEnv.ORDERS.get(`order:${order.order_id}`, "json")) as Record<string, unknown>;
    record["created_at"] = new Date(Date.now() - 30 * 3600 * 1000).toISOString();
    await testEnv.ORDERS.put(`order:${order.order_id}`, JSON.stringify(record));

    await runHealthChecks(testEnv);
    const listed = await testEnv.COUNTERS.list({ prefix: "alert_log:" });
    let slaAlert = false;
    for (const key of listed.keys) {
      const alert = (await testEnv.COUNTERS.get(key.name, "json")) as Record<string, unknown> | null;
      if (alert?.["condition"] === "order_sla" && String(alert["detail"]).includes(order.order_id)) {
        slaAlert = true;
      }
    }
    expect(slaAlert).toBe(true);
  });
});
