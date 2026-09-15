import { env } from "cloudflare:test";
import { afterEach, expect, it, vi } from "vitest";
import { BASE_EVM, AUTHORIZATION_USED_TOPIC, TRANSFER_TOPIC, type RpcLog } from "@/lib/base-rpc";
import { reconcileSettlement } from "@/services/settlement-reconciliation";
import { verifyMessageSignature } from "@/lib/signing";
import type { Env } from "@/types";
const payer = `0x${"11".repeat(20)}`, recipient = `0x${"22".repeat(20)}`, other = `0x${"33".repeat(20)}`;
const txHash = `0x${"ab".repeat(32)}`, nonce = `0x${"cd".repeat(32)}`;
const topic = (a: string) => `0x${a.slice(2).padStart(64, "0")}`;
const auth = (key = nonce): RpcLog => ({ address: BASE_EVM.usdc, topics: [AUTHORIZATION_USED_TOPIC, topic(payer), key], data: "0x" });
const transfer = (amount = 1000000n, to = recipient): RpcLog => ({ address: BASE_EVM.usdc, topics: [TRANSFER_TOPIC, topic(payer), topic(to)], data: `0x${amount.toString(16).padStart(64, "0")}` });
afterEach(() => vi.restoreAllMocks());
async function observe(logs: RpcLog[], declaredCapUsdc?: number) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
    const q = JSON.parse(String(init?.body));
    return Response.json({ jsonrpc: "2.0", id: q.id, result: q.method === "eth_chainId" ? "0x2105" : q.method === "eth_blockNumber" ? "0x90" :
      { transactionHash: txHash, status: "0x1", blockNumber: "0x64", logs } });
  });
  return reconcileSettlement(env as Env, { txHash, payer, recipient, declaredCapUsdc });
}
it.each([
  ["same payer's smaller authorized leg", [auth(), transfer(1n), transfer()]],
  ["same payer's other recipient", [auth(), transfer(1n, other), transfer()]],
  ["identical amounts on a different receipt position", [transfer(), auth(), transfer()]],
  ["reversed events", [transfer(), auth()]],
  ["duplicated authorization", [auth(), transfer(), auth(), transfer()]],
  ["malformed authorized value", [auth(), { ...transfer(), data: "0x1" }, transfer()]],
] satisfies [string, RpcLog[]][])("does not sign no_discretion from %s", async (_name, logs) => {
  const signed = await observe(logs);
  expect(signed).toMatchObject({ settled_usdc: 1, cap_source: "none", cap_observed: false, verdict: "cap_not_observable" });
});
it("retains the caller's cap as declared when another leg was authorized", async () => {
  expect(await observe([auth(), transfer(1n), transfer()], 2)).toMatchObject({ cap_source: "declared_by_caller", cap_observed: false, verdict: "within_cap" });
});
it("signs no discretion only for the selected paired transfer", async () => {
  const signed = await observe([transfer(1n), auth(), transfer()]);
  expect(signed).toMatchObject({ cap_source: "chain_eip3009_fixed_value", cap_observed: true, verdict: "no_discretion" });
  const { signature, public_key, signature_covers: _a, signature_jcs: _b, signature_jcs_covers: _c, ...body } = signed;
  expect(await verifyMessageSignature(JSON.stringify(body), signature, public_key)).toBe(true);
  expect(await verifyMessageSignature(JSON.stringify({ ...body, cap_observed: false }), signature, public_key)).toBe(false);
});
