import { SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { MENU_ITEMS } from "@/store";
import { buyInputExample, buyInputSchema } from "@/lib/bazaar-discovery";
import { mcpToolCatalog } from "@/lib/mcp-tools";
import { purchaseInputFrom, toolArgs } from "@/lib/purchase-args";
import { isRecord } from "@/types";
import type { MenuItem } from "@/types";
import { installFacilitatorMock } from "./helpers/facilitator-mock";
import { buildPaymentSignature } from "./helpers/payment";

const BASE = "https://scvd.store";

beforeAll(() => {
  installFacilitatorMock();
});

/**
 * THE ARGUMENTS THE BUYER SENT HAVE TO REACH THE GOODS.
 *
 * Reported by the first agent to shop the MCP shelf with a real
 * wallet, 2026-09-04, and every line of it reproduced before anything
 * was changed:
 *
 *   "url arg drops between validation and fulfillment on
 *    buy_observation — charged me $0.99 (good_buyer) and $5
 *    (launch_check) for signed readings of an empty string."
 *
 * The MCP door read eleven arguments off the wire and dropped the
 * rest. Everything downstream then did exactly what it is built to
 * do with a target it cannot reach: good_buyer and launch_check
 * folded the failure into a signed reading and SETTLED, so the buyer
 * holds two real, correctly signed artifacts about no endpoint on
 * earth. attestation_bundle minted over an empty sheaf, settled, and
 * threw on its way out — money moved, certificate exists, buyer got
 * a 500. passport_refresh and provenance_check threw on `new URL("")`
 * before the settle, which cost nothing and worked half the time.
 *
 * One defect, three faces: the door had its own argument map. The
 * fix is that it does not any more (lib/purchase-args), and these are
 * the guards that would have caught it — the first two derived from
 * the published schema rather than from a list somebody maintains,
 * because a hand-kept list is exactly what went stale.
 */

/** Every menu item an MCP shelf actually sells. */
function shelvedItems(): { item: MenuItem; tool: string }[] {
  const shelves = mcpToolCatalog(BASE).filter(
    (tool) => tool.itemId || tool.itemIds,
  );
  return MENU_ITEMS.flatMap((item) => {
    const tool = shelves.find(
      (shelf) => shelf.itemId === item.id || shelf.itemIds?.includes(item.id),
    );
    return tool ? [{ item, tool: tool.name }] : [];
  });
}

describe("the argument map carries what the schema requires", () => {
  it("cannot drop a required input on the floor, for any item on any shelf", () => {
    const dropped: string[] = [];
    for (const { item } of shelvedItems()) {
      const required = buyInputSchema(item).required ?? [];
      if (required.length === 0) continue;
      const example = buyInputExample(item);
      for (const field of required) {
        /*
         * THE TEST IS "DOES IT MATTER", not "which field does it
         * land in": `url` becomes targetUrl, `tx_hashes` becomes
         * bundleTxHashes, `address` becomes subjectAddress, and a
         * guard that named those pairs would be a second list to
         * rot. What cannot be argued with is that REMOVING a
         * required argument has to change what fulfillment is
         * handed. If it does not, the door is not reading it.
         */
        const withField = purchaseInputFrom(item, toolArgs(example));
        const without = { ...example };
        delete without[field];
        const withoutField = purchaseInputFrom(item, toolArgs(without));
        if (JSON.stringify(withField) === JSON.stringify(withoutField)) {
          dropped.push(`${item.id}.${field}`);
        }
      }
    }
    expect(
      dropped,
      "an MCP buyer can send a required argument and have fulfillment never see it — this is the defect that sold two signed readings of an empty string",
    ).toEqual([]);
  });

  it("reads the same arguments the HTTP door reads, field for field", () => {
    // Both doors go through one function now; the point of this guard
    // is that they go through it with the SAME values, so a query
    // string and a tools/call argument object of the same shape
    // produce byte-identical fulfillment input.
    for (const { item } of shelvedItems()) {
      const example = buyInputExample(item);
      const query = new URLSearchParams(
        Object.entries(example).map(([k, v]): [string, string] => [k, String(v)]),
      );
      const viaHttp = purchaseInputFrom(item, {
        get: (name) => query.get(name) ?? undefined,
        field: (name) => `${name} query parameter`,
      });
      const viaMcp = purchaseInputFrom(item, toolArgs(example));
      expect(viaMcp, item.id).toEqual(viaHttp);
    }
  });
});

let rpcId = 0;
async function rpc(
  params: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  rpcId += 1;
  const response = await SELF.fetch(`${BASE}/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: rpcId,
      method: "tools/call",
      params,
    }),
  });
  return (await response.json()) as Record<string, unknown>;
}

describe("no terms are quoted for a purchase the door would refuse", () => {
  it("refuses every shelved item that is missing a required argument, before the 402", async () => {
    const quoted: string[] = [];
    for (const { item, tool } of shelvedItems()) {
      const required = buyInputSchema(item).required ?? [];
      if (required.length === 0) continue;
      const body = await rpc({
        name: tool,
        arguments: { item_id: item.id },
      });
      const error = isRecord(body["error"]) ? body["error"] : {};
      if (error["code"] === 402) {
        quoted.push(item.id);
        continue;
      }
      // Whatever the refusal is, it must say the money did not move.
      const data = isRecord(error["data"]) ? error["data"] : {};
      expect(data["charged"], item.id).toBe(false);
      expect(typeof data["code"], item.id).toBe("string");
    }
    expect(
      quoted,
      "an MCP shelf issued payment terms for a purchase it could not fulfil — the buyer signs, pays, and gets a signed reading of nothing",
    ).toEqual([]);
  });
});

/** A well-formed x402 v2 challenge, the shape the store's own till emits. */
function wellFormed402(): Response {
  return new Response(JSON.stringify({ error: "payment required" }), {
    status: 402,
    headers: {
      "PAYMENT-REQUIRED": btoa(
        JSON.stringify({
          x402Version: 2,
          accepts: [
            {
              scheme: "exact",
              network: "eip155:8453",
              amount: "5000",
              asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
              payTo: "0x1111111111111111111111111111111111111111",
            },
          ],
        }),
      ),
    },
  });
}

/** Buys one item over MCP: quote, sign the first accept, call again. */
async function buyOverMcp(
  tool: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const quote = await rpc({ name: tool, arguments: args });
  const error = isRecord(quote["error"]) ? quote["error"] : {};
  expect(
    error["code"],
    `no terms came back: ${JSON.stringify(quote).slice(0, 400)}`,
  ).toBe(402);
  const data = isRecord(error["data"]) ? error["data"] : {};
  const challenge = data["x402/payment-required"] as {
    accepts: Array<Record<string, unknown>>;
  };
  const paid = await rpc({
    name: tool,
    arguments: args,
    _meta: {
      "x402/payment": buildPaymentSignature(challenge.accepts[0] as never),
    },
  });
  const result = isRecord(paid["result"]) ? paid["result"] : undefined;
  expect(
    result,
    `the purchase did not deliver: ${JSON.stringify(paid).slice(0, 500)}`,
  ).toBeTruthy();
  return isRecord(result!["structuredContent"])
    ? (result!["structuredContent"] as Record<string, unknown>)
    : {};
}

describe("what the buyer paid for is about what the buyer named", () => {
  it("signs the audit over the url the tools/call carried, not an empty string", async () => {
    const inner = globalThis.fetch;
    vi.stubGlobal(
      "fetch",
      async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const url =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;
        let origin = "";
        try {
          origin = new URL(url).origin;
        } catch {
          origin = "";
        }
        // Exact origin, never a prefix.
        if (origin === "https://merchant.example") return wellFormed402();
        return inner(input as never, init as never);
      },
    );
    const goods = await buyOverMcp("buy_observation", {
      item_id: "service_audit",
      url: "https://merchant.example/api/buy/thing",
    });
    const audit = isRecord(goods["audit"]) ? goods["audit"] : {};
    expect(audit["url"]).toBe("https://merchant.example/api/buy/thing");
    // And the verdict is the one a reachable, well-formed door earns —
    // the empty-string purchase could only ever return `unreachable`.
    expect(goods["verdict"]).toBe("ready");
    vi.stubGlobal("fetch", inner);
  });

  it("reads the books for the host the tools/call named", async () => {
    const goods = await buyOverMcp("buy_observation", {
      item_id: "spot_check",
      host: "merchant.example",
    });
    expect(JSON.stringify(goods)).toContain("merchant.example");
  });

  it("delivers the sheaf instead of settling and then throwing on an empty one", async () => {
    const first = `0x${"a".repeat(64)}`;
    const second = `0x${"b".repeat(64)}`;
    // The chain answerer: batched receipts come back null, which is
    // the honest NOT_FOUND for hashes that never existed. What is
    // under test is that TWO hashes arrive at all — the empty sheaf
    // read no chain, minted, settled and then threw.
    const inner = globalThis.fetch;
    vi.stubGlobal(
      "fetch",
      async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const url =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;
        let origin = "";
        try {
          origin = new URL(url).origin;
        } catch {
          origin = "";
        }
        // Exact origin, never a prefix.
        if (origin === "https://mainnet.base.org") {
          const body = JSON.parse(String(init?.body ?? "null")) as
            | { id: number; method: string }
            | Array<{ id: number; method: string }>;
          if (Array.isArray(body)) {
            return Response.json(
              body.map((entry) => ({ jsonrpc: "2.0", id: entry.id, result: null })),
            );
          }
          if (body.method === "eth_blockNumber") {
            return Response.json({ jsonrpc: "2.0", id: body.id, result: "0x2ff0000" });
          }
          return Response.json({ jsonrpc: "2.0", id: 1, result: null });
        }
        return inner(input as never, init as never);
      },
    );
    const goods = await buyOverMcp("buy_observation", {
      item_id: "attestation_bundle",
      tx_hashes: `${first},${second}`,
    });
    // The bug: the certificate minted, the settle happened, and THEN
    // deliverInstantGoods threw "reached goods with no sheaf".
    expect(goods["cert_id"]).toBeTruthy();
    const attestations = goods["attestations"];
    expect(Array.isArray(attestations)).toBe(true);
    expect(attestations as unknown[]).toHaveLength(2);
    vi.stubGlobal("fetch", inner);
  });
});
