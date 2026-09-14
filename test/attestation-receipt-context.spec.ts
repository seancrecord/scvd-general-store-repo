import { env } from "cloudflare:test";
import { afterEach, expect, it, vi } from "vitest";
import { BASE_EVM, TRANSFER_TOPIC, type RpcReceipt } from "@/lib/base-rpc";
import { observeSettlement, observeWithFacts, readTransferClaim } from "@/services/attestation";
import type { Env } from "@/types";
const txHash = `0x${"ab".repeat(32)}`, otherHash = `0x${"cd".repeat(32)}`;
const receipt = (): RpcReceipt => ({ transactionHash: txHash, status: "0x1", blockNumber: "0x64", logs: [
  { address: BASE_EVM.usdc, topics: [TRANSFER_TOPIC, `0x${"0".repeat(24)}${"11".repeat(20)}`, `0x${"0".repeat(24)}${"22".repeat(20)}`], data: `0x${(1000n).toString(16).padStart(64, "0")}` },
] });
afterEach(() => vi.restoreAllMocks());
function stub(options: { chain?: unknown; receipt?: unknown; head?: unknown; polygon?: boolean } = {}) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
    const q = JSON.parse(String(init?.body)), polygon = String(url).includes("polygon");
    const body = options.receipt === undefined ? receipt() : options.receipt;
    return Response.json({ jsonrpc: "2.0", id: q.id, result:
      q.method === "eth_chainId" ? options.chain ?? (polygon ? "0x89" : "0x2105") :
      q.method === "eth_blockNumber" ? options.head ?? "0x90" :
      options.polygon && !polygon ? null : body });
  });
}
it.each([
  ["wrong transaction", { transactionHash: otherHash }],
  ["missing identity", { transactionHash: undefined }],
  ["partially numeric block", { blockNumber: "0x64junk" }],
  ["decimal block", { blockNumber: "100" }],
  ["unsafe block", { blockNumber: "0x20000000000000" }],
  ["unknown status", { status: "0x2" }],
  ["absent status", { status: undefined }],
  ["missing logs", { logs: undefined }],
] as const)("refuses to sign %s", async (_name, fields) => {
  // Deliberately malformed provider output, beyond the compile-time RPC type.
  const malformed = { ...receipt(), ...fields } as RpcReceipt;
  await expect(observeWithFacts(env as Env, { txHash }, malformed, 144)).rejects.toThrow();
});
it.each([NaN, Infinity, -1, 99, 100.5, Number.MAX_SAFE_INTEGER + 1])("refuses an invalid or behind head %s", async head => {
  await expect(observeWithFacts(env as Env, { txHash }, receipt(), head)).rejects.toThrow();
});
it.each(["0x89", "garbage", { chain: "0x2105" }])("does not sign a Base observation from chain response %s", async chain => {
  stub({ chain });
  await expect(observeSettlement(env as Env, { txHash })).rejects.toThrow();
});
it("does not sign NOT_FOUND when the chain identity is unestablished", async () => {
  stub({ chain: "0x1", receipt: null });
  await expect(observeSettlement(env as Env, { txHash })).rejects.toThrow();
});
it("checks Polygon's reported chain before signing its fallback receipt", async () => {
  stub({ polygon: true, chain: "0x2105" });
  await expect(observeSettlement(env as Env, { txHash })).rejects.toThrow();
});
it("does not read another hash as a broad transfer claim", async () => {
  stub({ receipt: { ...receipt(), transactionHash: otherHash } });
  await expect(readTransferClaim(env as Env, txHash, {})).rejects.toThrow();
});
it.each(["0x1", "0x0"])("preserves valid receipt status %s", async status => {
  stub({ receipt: { ...receipt(), status } });
  expect((await observeSettlement(env as Env, { txHash })).status).toBe(status === "0x1" ? "SETTLED" : "REVERTED");
});
it("preserves a valid empty observation after checking both chains", async () => {
  stub({ receipt: null });
  expect(await observeSettlement(env as Env, { txHash })).toMatchObject({ status: "NOT_FOUND", chains_checked: ["eip155:8453", "eip155:137"] });
});
it("accepts case-insensitive transaction identity and reports young receipts as pending", async () => {
  expect(await observeWithFacts(env as Env, { txHash }, { ...receipt(), transactionHash: txHash.toUpperCase().replace("0X", "0x") }, 101))
    .toMatchObject({ status: "PENDING_FINALITY", confirmations: 1 });
});
