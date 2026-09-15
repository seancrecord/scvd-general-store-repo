import { SELF, env } from "cloudflare:test";
import { afterEach, expect, it, vi } from "vitest";
import { BASE_USDC, TRANSFER_TOPIC } from "@/lib/base-rpc";
import { reconcileSettlement, storeReconciliation } from "@/services/settlement-reconciliation";
import { signMessage, verifyMessageSignature } from "@/lib/signing";
import { signJcs, jcsCanonicalize } from "@/lib/jcs";
import type { Env } from "@/types";
const tx = `0x${"ab".repeat(32)}`;
afterEach(() => vi.restoreAllMocks());
async function observation(declaredCapUsdc?: number) {
  const mock = vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
    const q = JSON.parse(String(init?.body));
    return Response.json({ jsonrpc: "2.0", id: q.id, result: q.method === "eth_chainId" ? "0x2105" : q.method === "eth_blockNumber" ? "0x90" : {
      transactionHash: tx, status: "0x1", blockNumber: "0x64", logs: [{ address: BASE_USDC,
        topics: [TRANSFER_TOPIC, `0x${"11".repeat(20).padStart(64, "0")}`, `0x${"22".repeat(20).padStart(64, "0")}`], data: `0x${"f4240".padStart(64, "0")}` }],
    } });
  });
  return reconcileSettlement(env as Env, { txHash: tx, declaredCapUsdc }).finally(() => mock.mockRestore());
}
async function read(report: Awaited<ReturnType<typeof observation>>) {
  await storeReconciliation(env as Env, report, "fixture-cert", "2026-09-14T00:00:00Z");
  const response = await SELF.fetch(`https://scvd.store/api/reconciliation/${report.reconciliation_id}`);
  expect(response.status).toBe(200);
  return response.json() as Promise<{ reconciliation: typeof report; read_this_first: string; how_to_verify: string[] }>;
}
it("does not tell a recipient that an absent cap was supplied by the buyer", async () => {
  const result = await read(await observation());
  expect(result.read_this_first).toContain("No ceiling was established or declared");
  expect(result.read_this_first).not.toContain("supplied by whoever");
});
it("keeps a declared ceiling distinct from an observed authorization", async () => {
  const result = await read(await observation(2));
  expect(result.read_this_first).toContain("commissioner");
  expect(result.read_this_first).toContain("never that it is true");
});
it("flags the retired approval inference without rewriting a historical signature", async () => {
  const current = await observation();
  const { signature: _s, public_key: _k, signature_covers: _c, signature_jcs: _j, signature_jcs_covers: _jc, ...payload } = current;
  const old = { ...payload, cap_source: "chain_same_tx_approval" as const, cap_observed: true, cap_usdc: 10, verdict: "within_cap" as const };
  const signed = await signMessage(JSON.stringify(old), (env as Env).SIGNING_KEY);
  const historical = { ...current, ...old, signature: signed.signature, public_key: signed.publicKey, signature_jcs: await signJcs(old, (env as Env).SIGNING_KEY) };
  const result = await read(historical);
  expect(result.reconciliation).toEqual(historical);
  expect(result.read_this_first).toContain("Approval");
  expect(result.read_this_first).toContain("does not establish");
  expect(result.read_this_first).toContain("/corrections");
  expect(result.read_this_first).not.toContain("carries weight with a stranger");
  const { signature, public_key, signature_covers: _a, signature_jcs, signature_jcs_covers: _b, ...bytes } = result.reconciliation;
  expect(await verifyMessageSignature(JSON.stringify(bytes), signature, public_key)).toBe(true);
  expect(await verifyMessageSignature(jcsCanonicalize(bytes), signature_jcs, public_key)).toBe(true);
  expect(await verifyMessageSignature(JSON.stringify({ ...bytes, tx_hash: `0x${"cd".repeat(32)}` }), signature, public_key)).toBe(false);
});
it("gives an unauthenticated recipient exact primary signature and historical key instructions", async () => {
  const result = await read(await observation());
  const guide = result.how_to_verify.join(" ");
  expect(guide).toContain("JSON.stringify");
  expect(guide).toContain("key_history.retired");
  expect(guide).toContain("does not prove");
  expect(guide).toContain("/corrections");
  expect(guide).not.toContain("an observed ceiling is in an Approval log");
});
