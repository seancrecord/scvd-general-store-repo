import { env } from "cloudflare:test";
import { afterEach, expect, it, vi } from "vitest";
import { WORLD_EVM } from "@/lib/base-rpc";
import { evmReconciliationKeys, RECONCILE_CATCHUP_PASSES, runChainReconciliation } from "@/services/chain-reconciliation";
import type { Env } from "@/types";

afterEach(() => vi.unstubAllGlobals());

it("recovers the World backlog through providers that accept only 100-block log reads", async () => {
  // Measured 2026-10-08: Alchemy rejected 500 blocks and named a
  // 100-block cap; all three configured public providers answered 100.
  const head = 100_000;
  const cursor = head - 3_000;
  const bindings = { ...env, WORLD_PAY_TO: "0x4444444444444444444444444444444444444444" } as unknown as Env;
  const keys = evmReconciliationKeys(WORLD_EVM);
  await bindings.COUNTERS.put(keys.cursor, String(cursor));
  const incoming: Array<{ from: number; to: number }> = [];
  const outgoing: Array<{ from: number; to: number }> = [];
  vi.stubGlobal("fetch", vi.fn(async (_url: unknown, init: RequestInit) => {
    const call = JSON.parse(String(init.body)) as {
      method: string;
      params: Array<{ fromBlock: string; toBlock: string; topics: unknown[] }>;
    };
    if (call.method === "eth_blockNumber") {
      return Response.json({ jsonrpc: "2.0", id: 1, result: `0x${head.toString(16)}` });
    }
    if (call.method !== "eth_getLogs") throw new Error(`Unexpected RPC: ${call.method}`);
    const filter = call.params[0]!;
    const from = Number.parseInt(filter.fromBlock, 16);
    const to = Number.parseInt(filter.toBlock, 16);
    if (to - from + 1 > 100) {
      return Response.json({ error: { code: -32600, message: "100 block range maximum" } }, { status: 400 });
    }
    (filter.topics.length === 3 ? incoming : outgoing).push({ from, to });
    return Response.json({ jsonrpc: "2.0", id: 1, result: [] });
  }));

  const result = await runChainReconciliation(bindings, { chain: WORLD_EVM });
  expect(result.ran).toBe(true);
  expect(await bindings.COUNTERS.get(keys.cursor)).toBe(String(head));
  expect(incoming.length).toBeGreaterThan(RECONCILE_CATCHUP_PASSES);
  expect(outgoing).toEqual(incoming);
  let next = cursor + 1;
  for (const range of incoming) {
    expect(range.from).toBe(next);
    expect(range.to - range.from + 1).toBeLessThanOrEqual(100);
    next = range.to + 1;
  }
  expect(next).toBe(head + 1);
});
