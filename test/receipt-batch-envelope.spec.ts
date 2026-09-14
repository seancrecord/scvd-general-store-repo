import { env } from "cloudflare:test";
import { afterEach, expect, it, vi } from "vitest";
import { getReceiptsBatch } from "@/lib/base-rpc";
import type { Env } from "@/types";
const txHash = `0x${"ab".repeat(32)}`;
afterEach(() => vi.restoreAllMocks());
it.each([
  ["result missing", [{ jsonrpc: "2.0", id: 0 }]],
  ["duplicate answer ID", [{ jsonrpc: "2.0", id: 0, result: null }, { jsonrpc: "2.0", id: 0, result: null }]],
] as const)("does not turn %s into NOT_FOUND", async (_name, body) => {
  vi.spyOn(globalThis, "fetch").mockImplementation(async () => Response.json(body));
  await expect(getReceiptsBatch(env as Env, [txHash])).rejects.toThrow();
});
it("preserves an explicit null receipt", async () => {
  vi.spyOn(globalThis, "fetch").mockImplementation(async () => Response.json([{ jsonrpc: "2.0", id: 0, result: null }]));
  expect((await getReceiptsBatch(env as Env, [txHash])).get(txHash)).toBeNull();
});
