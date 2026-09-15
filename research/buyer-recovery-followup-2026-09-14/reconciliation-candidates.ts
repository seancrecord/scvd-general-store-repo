// Opt-in expected-failing probes. The runner temporarily places this in test/.
// Synthetic receipts and a public test signing key; no network or payment.
import { env } from "cloudflare:test";
import { afterEach, expect, it, vi } from "vitest";
import { APPROVAL_TOPIC, TRANSFER_TOPIC, AUTHORIZATION_USED_TOPIC, BASE_USDC, type RpcReceipt } from "@/lib/base-rpc";
import { reconcileSettlement } from "@/services/settlement-reconciliation";
import { verifyMessageSignature } from "@/lib/signing";
import type { Env } from "@/types";
const payer = `0x${"11".repeat(20)}`, recipient = `0x${"22".repeat(20)}`, spender = `0x${"33".repeat(20)}`;
const tx = `0x${"aa".repeat(32)}`, nonce = `0x${"bb".repeat(32)}`;
const topic = (address: string) => `0x${"0".repeat(24)}${address.slice(2)}`;
const amount = (value: bigint) => `0x${value.toString(16).padStart(64, "0")}`;
const transfer = { address: BASE_USDC, topics: [TRANSFER_TOPIC, topic(payer), topic(recipient)], data: amount(3_000_000n) };
const authorization = { address: BASE_USDC, topics: [AUTHORIZATION_USED_TOPIC, topic(payer), nonce], data: "0x" };
const approval = { address: BASE_USDC, topics: [APPROVAL_TOPIC, topic(payer), topic(spender)], data: amount(10_000_000n) };
const receipt = (logs = [transfer]): RpcReceipt => ({ transactionHash: tx, blockNumber: "0x64", status: "0x1", logs });
afterEach(() => vi.unstubAllGlobals());
function provider(value: RpcReceipt | null, head = "0x80", chain = "0x2105") {
  const calls: string[] = [];
  vi.stubGlobal("fetch", async (_input: RequestInfo | URL, init?: RequestInit) => {
    const request = JSON.parse(String(init?.body)) as { method: string; id: unknown };
    calls.push(request.method);
    const result = request.method === "eth_getTransactionReceipt" ? value : request.method === "eth_blockNumber" ? head : chain;
    return Response.json({ jsonrpc: "2.0", id: request.id, result });
  });
  return calls;
}
async function observe(label: string) {
  const observation = await reconcileSettlement(env as unknown as Env, { txHash: tx, payer, recipient }, new Date("2026-09-14T00:00:00Z"));
  const { signature, public_key, signature_covers: _covers, signature_jcs: _jcs, signature_jcs_covers: _jcovers, ...payload } = observation;
  expect(await verifyMessageSignature(JSON.stringify(payload), signature, public_key)).toBe(true);
  console.log(JSON.stringify({ probe: label, signature_valid: true, verdict: observation.verdict, cap_source: observation.cap_source,
    cap_observed: observation.cap_observed, cap_usdc: observation.cap_usdc, tx_hash: observation.tx_hash, block_height: observation.block_height, chain_head: observation.chain_head }));
  return observation;
}
for (const order of ["before", "after"] as const) it(`an unrelated ${order}-transfer Approval cannot override a paired EIP-3009 transfer`, async () => {
  provider(receipt(order === "before" ? [approval, authorization, transfer] : [authorization, transfer, approval]));
  const observation = await observe(`approval-${order}`);
  expect(observation.verdict).toBe("no_discretion");
  expect(observation.cap_source).toBe("chain_eip3009_fixed_value");
});
it("a later Approval without spending evidence is not the selected transfer's observed cap", async () => {
  provider(receipt([transfer, approval]));
  expect((await observe("approval-after-unpaired")).cap_observed).toBe(false);
});
for (const fault of ["wrong_hash", "missing_hash", "wrong_chain", "future_block", "malformed_head", "invalid_status"]) it(`refuses to sign ${fault} receipt context`, async () => {
  const value = receipt([authorization, transfer]);
  if (fault === "wrong_hash") value.transactionHash = `0x${"cc".repeat(32)}`;
  if (fault === "missing_hash") delete value.transactionHash;
  if (fault === "future_block") value.blockNumber = "0x81";
  if (fault === "invalid_status") value.status = "0x2";
  const calls = provider(value, fault === "malformed_head" ? "not-a-head" : "0x80", fault === "wrong_chain" ? "0x89" : "0x2105");
  let signed = false;
  try { await observe(fault); signed = true; } catch { /* a refusal is the expected boundary */ }
  console.log(JSON.stringify({ probe: fault, signed, methods: calls }));
  expect(signed).toBe(false);
});
it("control: an established paired authorization remains no_discretion", async () => {
  provider(receipt([authorization, transfer]));
  expect((await observe("valid-control")).verdict).toBe("no_discretion");
});
it("control: explicit null remains no_settlement", async () => {
  provider(null);
  expect((await observe("null-control")).verdict).toBe("no_settlement");
});
