import { env } from "cloudflare:test";
import { describe, expect, it, vi, afterEach } from "vitest";
import { ARBITRUM_EVM, WORLD_EVM } from "@/lib/base-rpc";
import { evmReconciliationKeys, reconciliationPasses, runChainReconciliation } from "@/services/chain-reconciliation";
import { KV_KEYS } from "@/lib/kv-keys";
import type { Env } from "@/types";
const bindings = { ...env, ARBITRUM_PAY_TO: "0x3333333333333333333333333333333333333333", WORLD_PAY_TO: "0x4444444444444444444444444444444444444444" } as unknown as Env;
afterEach(() => vi.unstubAllGlobals());
for (const chain of [ARBITRUM_EVM, WORLD_EVM]) {
  describe(`${chain.label} bank reconciliation`, () => {
    it("can read more than one hour of blocks each hour", () => {
      expect(reconciliationPasses(chain) * chain.logSpan).toBeGreaterThan(chain.blocksPerHour);
    });
    it("walks its own recipient and cursor, leaving Base untouched", async () => {
      const head = 100000;
      const keys = evmReconciliationKeys(chain);
      await bindings.COUNTERS.put(KV_KEYS.reconcileCursor, "1234");
      await bindings.COUNTERS.put(keys.cursor, String(head - 2));
      const calls: Record<string, unknown>[] = [];
      vi.stubGlobal("fetch", vi.fn(async (_url: unknown, init: { body: string }) => {
        const call = JSON.parse(init.body) as { method: string; params: unknown[] }; calls.push(call);
        const result = call.method === "eth_blockNumber" ? `0x${head.toString(16)}` : [];
        return Response.json({ jsonrpc: "2.0", id: 1, result });
      }));
      const result = await runChainReconciliation(bindings, { chain });
      expect(result.ran).toBe(true);
      expect(result.to_block).toBe(head);
      expect(await bindings.COUNTERS.get(KV_KEYS.reconcileCursor)).toBe("1234");
      expect(await bindings.COUNTERS.get(keys.cursor)).toBe(String(head));
      expect(await bindings.COUNTERS.get(keys.lastResult)).toBeTruthy();
      const logs = calls.filter(call => call.method === "eth_getLogs");
      expect(logs.length).toBeGreaterThan(0);
      const serialized = JSON.stringify(logs);
      expect(serialized).toContain(chain.usdc);
      expect(serialized).toContain(chain.key === "world" ? "4".repeat(40) : "3".repeat(40));
      expect(serialized).not.toContain("1".repeat(40));
    });
  });
}
