// Regression probes promoted from the buyer audit; failures must remain typed refusals.
// Synthetic receipts and a public test signing key; no network or payment.
import { env } from "cloudflare:test";
import { afterEach, expect, it, vi } from "vitest";
import { APPROVAL_TOPIC, TRANSFER_TOPIC, AUTHORIZATION_USED_TOPIC, BASE_USDC, type RpcReceipt } from "@/lib/base-rpc";
import { reconcileSettlement } from "@/services/settlement-reconciliation";
import { ReceiptEvidenceUnavailable } from "@/lib/receipt-context";
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
async function observe() {
  const observation = await reconcileSettlement(env as unknown as Env, { txHash: tx, payer, recipient }, new Date("2026-09-14T00:00:00Z"));
  const { signature, public_key, signature_covers: _covers, signature_jcs: _jcs, signature_jcs_covers: _jcovers, ...payload } = observation;
  expect(await verifyMessageSignature(JSON.stringify(payload), signature, public_key)).toBe(true);
  return observation;
}
for (const order of ["before", "after"] as const) it(`an unrelated ${order}-transfer Approval cannot override a paired EIP-3009 transfer`, async () => {
  provider(receipt(order === "before" ? [approval, authorization, transfer] : [authorization, transfer, approval]));
  const observation = await observe();
  expect(observation.verdict).toBe("no_discretion");
  expect(observation.cap_source).toBe("chain_eip3009_fixed_value");
});
it("a later Approval without spending evidence is not the selected transfer's observed cap", async () => {
  provider(receipt([transfer, approval]));
  expect((await observe()).cap_observed).toBe(false);
});
const faults = {
  wrong_hash: "receipt_identity_not_established", missing_hash: "receipt_identity_not_established",
  wrong_chain: "chain_not_established", future_block: "block_not_established",
  malformed_head: "head_not_established", invalid_status: "receipt_status_not_established",
  malformed_block: "block_not_established", missing_logs: "receipt_status_not_established",
} as const;
for (const [fault, reason] of Object.entries(faults)) it(`refuses to sign ${fault} receipt context`, async () => {
  const value = receipt([authorization, transfer]);
  if (fault === "wrong_hash") value.transactionHash = `0x${"cc".repeat(32)}`;
  if (fault === "missing_hash") delete value.transactionHash;
  if (fault === "future_block") value.blockNumber = "0x81";
  if (fault === "malformed_block") value.blockNumber = "0x64garbage";
  if (fault === "invalid_status") value.status = "0x2";
  if (fault === "missing_logs") Reflect.deleteProperty(value, "logs");
  provider(value, fault === "malformed_head" ? "not-a-head" : "0x80", fault === "wrong_chain" ? "0x89" : "0x2105");
  const result = reconcileSettlement(env as unknown as Env, { txHash: tx, payer, recipient });
  await expect(result).rejects.toBeInstanceOf(ReceiptEvidenceUnavailable);
  await expect(result).rejects.toMatchObject({ reason });
});
for (const order of ["before", "after"] as const) for (const target of [spender, recipient]) {
  it(`an unbound ${order} Approval to ${target} cannot establish a spending cap`, async () => {
    const unbound = { ...approval, topics: [APPROVAL_TOPIC, topic(payer), topic(target)] };
    provider(receipt(order === "before" ? [unbound, transfer] : [transfer, unbound]));
    expect(await observe()).toMatchObject({ verdict: "cap_not_observable", cap_source: "none", cap_observed: false, cap_usdc: null });
  });
}
it("a declared cap stays declared beside an unbound approval", async () => {
  provider(receipt([approval, transfer]));
  expect(await reconcileSettlement(env as unknown as Env, { txHash: tx, declaredCapUsdc: 2 })).toMatchObject({
    verdict: "over_cap", cap_source: "declared_by_caller", cap_observed: false, cap_usdc: 2,
  });
});
it("control: an established paired authorization remains no_discretion", async () => {
  provider(receipt([authorization, transfer]));
  expect((await observe()).verdict).toBe("no_discretion");
});
it("control: explicit null remains no_settlement", async () => {
  provider(null);
  expect((await observe()).verdict).toBe("no_settlement");
});

for (const [label, value] of [
  ["missing receipt", null], ["empty receipt", receipt([])],
  ["reverted receipt", { ...receipt([transfer]), status: "0x0" }],
] as const) it(`${label}: the signed prose agrees with zero matching transfers`, async () => {
  provider(value);
  const result = await observe();
  expect(result).toMatchObject({ verdict: "no_settlement", matched_transfers: 0, match_ambiguous: false });
  const caveats = result.what_this_cannot_see.join(" ");
  expect(caveats).not.toContain("exactly one matched");
  expect(caveats).toContain("No matching USDC transfer was observed");
});
