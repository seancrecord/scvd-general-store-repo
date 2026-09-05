import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { createOrder, completeOrder } from "@/services/orders";
import { orderStatusBody } from "@/lib/order-status";
import { ASYNC_JOB } from "@/lib/collection-semantics";
import { findMcpTool } from "@/lib/mcp-tools";
import { webmcpTools, TOOL_ENDPOINTS } from "@/routes/webmcp";
import { getMenuItem } from "@/store";
import type { Env } from "@/types";

/**
 * THE POLL HALF OF THE ASYNC JOB, ON THE MCP DOOR (2026-09-05).
 *
 * The human queue answers a purchase with an order id and an HTTP
 * URL to poll. An agent holding only the MCP transport could not
 * follow that URL, so the pattern was documented and half-reachable.
 * check_order is GET /api/order/{order_id} as a tool; what this file
 * holds is that the two doors serve the same object, that the tool
 * is free and read-only and so on the browser surface, and that the
 * breach line is derived from an injected clock on both sides.
 */

const BASE = "https://scvd.store";
const testEnv = env as unknown as Env;

async function rpc(method: string, params: Record<string, unknown> = {}, id = 1): Promise<Record<string, any>> {
  const response = await SELF.fetch(`${BASE}/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });
  return (await response.json()) as Record<string, any>;
}

async function checkOrder(order_id: string): Promise<Record<string, any>> {
  return rpc("tools/call", { name: "check_order", arguments: { order_id } });
}

describe("check_order on the MCP door", () => {
  it("is listed, free, read-only, and named by the async-job semantics", () => {
    const tool = findMcpTool("check_order", BASE);
    expect(tool).toBeTruthy();
    expect(tool!.itemId).toBeUndefined();
    expect(tool!.annotations?.readOnlyHint).toBe(true);
    expect(tool!.inputSchema["required"]).toEqual(["order_id"]);
    expect(ASYNC_JOB.mcp_tool).toBe("check_order");
    // Free and read-only means the browser surface derives it too,
    // and the derivation must know its door.
    expect(webmcpTools().map((t) => t.name)).toContain("check_order");
    expect(TOOL_ENDPOINTS["check_order"]).toEqual({ method: "GET", path: "/api/order/{order_id}" });
  });

  it("serves a queued order as the HTTP poll does, byte for byte", async () => {
    const order = await createOrder(testEnv, {
      item: getMenuItem("the_collab")!,
      paidUsdc: 5,
      tipUsdc: 0,
      patronNumber: 990101,
      certId: "cert_checkorder1",
    });
    const { result } = await checkOrder(order.order_id);
    expect(result.structuredContent.status).toBe("queued");
    expect(result.structuredContent.order_id).toBe(order.order_id);
    expect(result.structuredContent.deliverable).toBeUndefined();
    const http = await SELF.fetch(`${BASE}/api/order/${order.order_id}`);
    expect(http.status).toBe(200);
    const body = (await http.json()) as Record<string, unknown>;
    expect(result.structuredContent).toEqual(body);
    expect(JSON.parse(result.content[0].text)).toEqual(body);
  });

  it("carries the deliverable once the keeper has delivered", async () => {
    const order = await createOrder(testEnv, {
      item: getMenuItem("the_collab")!,
      paidUsdc: 5,
      tipUsdc: 0,
      patronNumber: 990102,
      certId: "cert_checkorder2",
    });
    await completeOrder(testEnv, order.order_id, "the goods, as promised");
    const { result } = await checkOrder(order.order_id);
    expect(result.structuredContent.status).toBe("completed");
    expect(result.structuredContent.deliverable).toBe("the goods, as promised");
    expect(typeof result.structuredContent.completed_at).toBe("string");
  });

  it("refuses an unknown id and a missing one as a refusal, not a record", async () => {
    const unknown = await checkOrder("ord_nobody_ever_had");
    expect(unknown.error).toBeTruthy();
    expect(unknown.error.message).toContain("ord_nobody_ever_had");
    const missing = await rpc("tools/call", { name: "check_order", arguments: {} });
    expect(missing.error).toBeTruthy();
    expect(missing.error.message).toContain("order_id");
  });

  it("derives the breach from an injected clock, the same on both doors", () => {
    const created = Date.parse("2026-09-01T00:00:00.000Z");
    const order = {
      order_id: "ord_clock",
      item_id: "the_collab",
      item_name: "The Collab",
      status: "queued" as const,
      created_at: new Date(created).toISOString(),
      sla_hours: 24,
      paid_usdc: 5,
      tip_usdc: 0,
      patron_number: 1,
      cert_id: "cert_clock",
    };
    const inside = orderStatusBody(BASE, order, created + 23 * 3_600_000);
    expect(inside["window_breached"]).toBeUndefined();
    const past = orderStatusBody(BASE, order, created + 30 * 3_600_000) as {
      window_breached: Record<string, unknown>;
    };
    expect(past.window_breached["kind"]).toBe("still_open");
    expect(past.window_breached["hours_late"]).toBe(6);
    expect(past.window_breached["owed_usdc"]).toBe(5);
  });
});
