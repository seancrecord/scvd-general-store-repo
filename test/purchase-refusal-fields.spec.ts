import { SELF, env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { readDeclines } from "@/lib/declines";
import { app } from "@/index";
import { markKeeperSeen } from "@/services/shutter";
import { getMenuItem } from "@/store";
import { mcpToolCatalog } from "@/lib/mcp-tools";
import { isRecord, type Env } from "@/types";
import { installFacilitatorMock } from "./helpers/facilitator-mock";

const BASE = "https://scvd.store";
const testEnv = env as unknown as Env;
const wallet = `0x${"12".repeat(20)}`;
const hash = `0x${"ab".repeat(32)}`;
let facilitator: ReturnType<typeof installFacilitatorMock>;
beforeAll(() => { facilitator = installFacilitatorMock(); });
beforeEach(async () => {
  for (const prefix of ["evt:", "declevt:"]) {
    let cursor: string | undefined;
    do {
      const page = await testEnv.COUNTERS.list({ prefix, ...(cursor ? { cursor } : {}) });
      await Promise.all(page.keys.map(key => testEnv.COUNTERS.delete(key.name)));
      cursor = page.list_complete ? undefined : page.cursor;
    } while (cursor);
  }
});
const obj = (value: unknown): Record<string, unknown> => isRecord(value) ? value : {};
const cases: Array<{ item: string; args: Record<string, string>; field: string }> = [
  { item: "the_statement", args: { wallet, hours: "99" }, field: "hours" },
  { item: "the_statement", args: { wallet, network: "invented" }, field: "network" },
  { item: "the_mandate", args: { mandate: "Observe this endpoint", submitted_as: "invented" }, field: "submitted_as" },
  { item: "the_case_file", args: { tx_hash: hash, expected_amount_usdc: "-1" }, field: "expected_amount_usdc" },
  { item: "settlement_reconciliation", args: { tx_hash: hash, declared_cap_usdc: "-1" }, field: "declared_cap_usdc" },
  { item: "small_blessing", args: { mandate_id: "m_absent" }, field: "mandate_id" },
  // The actual failed check runs before the missing wallet check: do not
  // substitute a required field for the validator's own decision.
  { item: "the_statement", args: { network: "invented" }, field: "network" },
];

for (const door of ["http", "mcp"] as const) {
  describe(`${door} identifies the input that actually failed`, () => {
    it.each(cases)("$item: $field", async ({ item, args, field }) => {
      expect(getMenuItem(item)).toBeDefined();
      const before = { verify: facilitator.verifyCalls, settle: facilitator.settleCalls };
      let data: Record<string, unknown>;
      if (door === "http") {
        const query = new URLSearchParams(args);
        const response = await SELF.fetch(`${BASE}/api/buy/${item}?${query}`, {
          headers: { "PAYMENT-SIGNATURE": "not-a-real-payment", "User-Agent": "buyer-refusal-spec/1" },
        });
        expect(response.status).toBe(400);
        data = obj(await response.json());
      } else {
        const tool = mcpToolCatalog(BASE).find(tool => tool.itemId === item || tool.itemIds?.includes(item))!;
        const response = await SELF.fetch(`${BASE}/mcp`, {
          method: "POST", headers: { "Content-Type": "application/json", "User-Agent": "buyer-refusal-spec/1" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: {
            name: tool.name, arguments: { item_id: item, ...args }, _meta: { "x402/payment": { x402Version: 2 } },
          } }),
        });
        const body = obj(await response.json());
        expect(obj(body.error).code).toBe(-32602);
        data = obj(obj(body.error).data);
      }
      expect(data.charged).toBe(false);
      const issues = data.issues as Record<string, unknown>[];
      expect(issues[0]).toEqual({ field, code: "invalid", location: door === "http" ? "query" : "arguments" });
      const { declines } = await readDeclines(testEnv);
      expect(declines.filter(row => row.item === item).map(row => row.reason)).toEqual([`local:input_invalid:${field}`]);
      expect(facilitator.verifyCalls).toBe(before.verify);
      expect(facilitator.settleCalls).toBe(before.settle);
    });
  });
}


for (const door of ["http", "mcp"] as const) {
  describe(`${door} preserves non-input refusals`, () => {
    it.each([
      { item: "launch_check", status: 503, code: "upstream_unavailable" },
      { item: "trust_profile", status: 403, code: "passport_refused" },
    ])("$item does not tell the buyer to repair valid inputs", async ({ item, status, code }) => {
      const localEnv = { ...testEnv, FIELD_WALLET_KEY: "" };
      await markKeeperSeen(localEnv);
      const args = { url: "https://refusal-evidence.example/api/buy/thing" };
      const tool = mcpToolCatalog(BASE).find(tool => tool.itemId === item || tool.itemIds?.includes(item))!;
      const request = door === "http"
        ? new Request(`${BASE}/api/buy/${item}?${new URLSearchParams(args)}`, { headers: { "PAYMENT-SIGNATURE": "not-a-real-payment" } })
        : new Request(`${BASE}/mcp`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
          jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: tool.name, arguments: { item_id: item, ...args }, _meta: { "x402/payment": { x402Version: 2 } } },
        }) });
      const before = { verify: facilitator.verifyCalls, settle: facilitator.settleCalls };
      const context = createExecutionContext();
      const response = await app.fetch(request, localEnv, context);
      await waitOnExecutionContext(context);
      const body = obj(await response.json());
      const data = door === "http" ? body : obj(obj(body.error).data);
      if (door === "http") expect(response.status).toBe(status);
      expect(data.code).toBe(code);
      expect(data.charged).toBe(false);
      expect(data.next_action).toBeUndefined();
      expect(data.issues).toBeUndefined();
      expect(facilitator.verifyCalls).toBe(before.verify);
      expect(facilitator.settleCalls).toBe(before.settle);
    });
  });
}
