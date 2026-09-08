import { beforeAll, beforeEach, expect, it, vi } from "vitest";
import { runInDurableObject } from "cloudflare:test";
import { installBuyerHarness, object, sourceEnv, testEnv, SOL } from "./helpers/buyer-harness";
import { encodeBase58 } from "@/lib/base58";
import { SOLANA_CHAIN, SOLANA_USDC_MINT } from "@/lib/solana-rpc";
import { resolveHumanDelivery } from "@/services/human-delivery-resolution";
import { loadHumanResolution } from "@/services/human-resolution-record";
import { KV_KEYS } from "@/lib/kv-keys";
import { getMenuItem } from "@/store";

installBuyerHarness();
const payer = encodeBase58(new Uint8Array(32).fill(7));
let evidence: { original: string; refund: string; amount: number; defect?: string };
beforeEach(async () => {
  const ns = sourceEnv.PAID_RECOVERIES!;
  await runInDurableObject(ns.get(ns.idFromName("human-delivery-resolutions")), async (_instance, state) => state.storage.deleteAll());
});
beforeAll(() => {
  const inner = globalThis.fetch;
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const body = object(init?.body ? JSON.parse(String(init.body)) : null);
    if (!evidence || !["getGenesisHash", "getSignatureStatuses", "getTransaction"].includes(String(body.method))) return inner(input, init);
    const { defect, amount } = evidence;
    if (defect === "rpc") throw new Error("fixture RPC outage");
    const params = body.params as unknown[];
    let result: unknown;
    if (body.method === "getGenesisHash") result = defect === "chain" ? "other-network" : `${SOLANA_CHAIN.split(":")[1]}fixture`;
    else if (body.method === "getSignatureStatuses") result = { value: [{ err: null, slot: 200, confirmationStatus: defect === "pending" ? "confirmed" : "finalized" }] };
    else {
      const refund = params[0] === evidence.refund;
      const sender = refund ? SOL : payer, recipient = refund ? payer : SOL;
      const units = amount * 1e6 + (defect === "amount" && refund ? 1 : 0);
      const mint = defect === "token" && refund ? payer : SOLANA_USDC_MINT;
      const balance = (owner: string, accountIndex: number, value: number) => ({ owner, accountIndex, mint,
        uiTokenAmount: { amount: String(value), decimals: 6 } });
      result = { slot: 200, transaction: { signatures: [defect === "unrelated" && refund ? evidence.original : params[0]] },
        meta: { err: defect === "failed" && refund ? { InstructionError: [0, "fixture"] } : null,
          preTokenBalances: [balance(sender, 0, units), balance(recipient, 1, 0)],
          postTokenBalances: [balance(sender, 0, 0), balance(defect === "recipient" && refund ? SOL : recipient, 1, units)] } };
    }
    return Response.json({ jsonrpc: "2.0", id: body.id, result });
  });
});
let caseNumber = 0;
async function seed() {
  // These are public fixture identifiers, not generated secrets or sampled digits.
  const canary = `human-resolution-${++caseNumber}`;
  const signature = async (label: string) => encodeBase58(new Uint8Array(
    await crypto.subtle.digest("SHA-512", new TextEncoder().encode(`${canary}:${label}`))));
  const transaction = await signature("payment");
  const refund = await signature("refund");
  const intent = { path: "/api/buy/aura_walk", transaction, payer, paid_usdc: getMenuItem("aura_walk")!.price_usdc,
    settled_at: "2026-09-04T12:00:00.000Z" };
  evidence = { original: transaction, refund, amount: intent.paid_usdc };
  await sourceEnv.ORDERS.put(KV_KEYS.deliveryIntent(transaction), JSON.stringify(intent));
  return { transaction, refund, intent };
}
it("retains a finalized Solana refund with exact signature, mint, payer and smallest-unit amount", async () => {
  const s = await seed();
  const response = await resolveHumanDelivery(testEnv, s.transaction, "refunded", s.intent, { network: SOLANA_CHAIN, refund_tx: s.refund });
  expect(response.ok).toBe(true);
  const record = await loadHumanResolution(testEnv, SOLANA_CHAIN, s.transaction);
  expect(record?.statement.evidence.refund).toMatchObject({ transaction: s.refund, network: SOLANA_CHAIN,
    payer: SOL, recipient: payer, amount_units: String(s.intent.paid_usdc * 1e6), finality: "finalized" });
  expect(await sourceEnv.ORDERS.get(KV_KEYS.deliveryIntent(s.transaction))).toBeNull();
});
for (const defect of ["chain", "pending", "unrelated", "failed", "token", "recipient", "amount", "rpc", "malformed"]) {
  it(`Solana ${defect} evidence leaves the paid obligation open`, async () => {
    const s = await seed(); evidence.defect = defect;
    const response = await resolveHumanDelivery(testEnv, s.transaction, "refunded", s.intent,
      { network: SOLANA_CHAIN, refund_tx: defect === "malformed" ? "not-base58" : s.refund });
    expect(response.ok).toBe(false);
    expect(await sourceEnv.ORDERS.get(KV_KEYS.deliveryIntent(s.transaction))).not.toBeNull();
    expect(await loadHumanResolution(testEnv, SOLANA_CHAIN, s.transaction)).toBeNull();
  });
}
