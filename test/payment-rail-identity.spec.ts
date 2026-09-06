import { KV_KEYS } from "@/lib/kv-keys";
import { beforeAll, expect, it, vi } from "vitest";
import { encodeBase58 } from "@/lib/base58";
import { BASE_NETWORK, POLYGON_NETWORK, SOLANA_NETWORK } from "@/lib/payments";
import { installBuyerHarness, items, shelves, call, clean, object, testEnv, sourceEnv, facilitator, NOW, type Obj, type Reading } from "./helpers/buyer-harness";
import { evmPayment, evmValid, evmBuyer, recipient, initializeSol, solPayment, solFacts, solBuyer, solFeePayer, associated } from "./helpers/buyer-signed-payments";
import type { ChallengeRequirement } from "./helpers/payment";

installBuyerHarness();
let ledger = new Map<string, Obj>();
let verifyResponses: Obj[] = [];
beforeAll(async () => {
  await initializeSol();
  testEnv.PAY_TO_ADDRESS = recipient; testEnv.POLYGON_PAY_TO = recipient;
  const inner = globalThis.fetch;
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    if (url.pathname.endsWith("/x402/supported")) {
      const body = object(await (await inner(input, init)).json());
      for (const kind of body.kinds as Obj[]) if (String(kind.network).startsWith("solana:")) kind.extra = { ...object(kind.extra), feePayer: solFeePayer };
      return Response.json(body);
    }
    if (!/\/x402\/(verify|settle)$/.test(url.pathname)) return inner(input, init);
    const body = object(JSON.parse(String(init?.body ?? "{}"))), w = object(body.paymentPayload);
    const o = object(body.paymentRequirements) as unknown as ChallengeRequirement;
    const verifying = url.pathname.endsWith("/verify");
    if (verifying) facilitator.verifyCalls++; else facilitator.settleCalls++;
    let reason = "", payer = "", identity = "", tx = "";
    try {
      if (o.network.startsWith("solana:")) {
        const facts = await solFacts(w);
        payer = facts.payer; identity = facts.tx; tx = facts.tx;
        if (!facts.valid) reason = "signature_invalid";
        else if (facts.mint !== o.asset) reason = "wrong_token";
        else if (facts.recipientAccount !== encodeBase58(await associated(o.payTo, o.asset))) reason = "wrong_recipient";
        else if (facts.amount !== BigInt(o.amount)) reason = "wrong_amount";
        else if (facts.feePayer !== o.extra?.feePayer) reason = "wrong_fee_payer";
      } else {
        const a = object(object(w.payload).authorization);
        payer = String(a.from); identity = `${o.network}:${String(a.nonce)}`;
        if (!await evmValid(w, o)) reason = "signature_invalid";
        else if (String(a.to).toLowerCase() !== o.payTo.toLowerCase()) reason = "wrong_recipient";
        else if (a.value !== o.amount) reason = "wrong_amount";
        else if (Number(a.validBefore) <= Date.now() / 1000) reason = "authorization_expired";
        tx = String(ledger.get(identity)?.transaction ?? `0x${crypto.randomUUID().replace(/-/g, "").repeat(2)}`);
      }
    } catch { reason = "malformed_transaction"; }
    if (!verifying && !reason && ledger.has(identity) && !o.network.startsWith("solana:")) reason = "nonce_already_used";
    if (verifying) {
      const result = { isValid: !reason, ...(reason ? { invalidReason: reason } : {}), payer };
      verifyResponses.push(result); return Response.json(result);
    }
    if (!reason) ledger.set(identity, { transaction: tx, network: o.network, amount: o.amount, payer });
    const result = { success: !reason, ...(reason ? { errorReason: reason } : {}), transaction: tx, network: o.network, payer };
    return Response.json(result);
  });
});
const encode = (w: Obj) => btoa(JSON.stringify(w));
const idOf = (r: Reading) => r.body.cert_id ?? object(r.body.certificate).cert_id;
async function reset() { ledger = new Map(); verifyResponses = []; vi.setSystemTime(NOW); await clean(); }

for (const door of ["http", "mcp"] as const) for (const victimNetwork of [BASE_NETWORK, POLYGON_NETWORK])
it(`${door}: Solana metadata cannot claim a ${victimNetwork} payer's cached purchase`, async () => {
  const item = items.find(i => i.id === "daily_fortune")!, tool = shelves(item)[0]!;
  await reset(); const q = await call(item, door, {}, tool);
  const base = q.offers.find(o => o.network === victimNetwork)!, sol = q.offers.find(o => o.network === SOLANA_NETWORK)!;
  const key = String(object(q.body.idempotency).suggested_key);
  expect(key).not.toBe("undefined");
  const original = await call(item, door, {}, tool, encode(await evmPayment(base)), key);
  expect(idOf(original)).toBeTruthy();
  const replay = await call(item, door, {}, tool, encode(await evmPayment(base)), key);
  expect(idOf(replay)).toBe(idOf(original));
  expect(ledger.size).toBe(1);
  const attack = await solPayment(sol);
  object(attack.payload).authorization = { from: evmBuyer.address, nonce: `0x${"cd".repeat(32)}` };
  const result = await call(item, door, {}, tool, encode(attack), key);
  expect(verifyResponses.at(-1)?.payer).toBe(solBuyer);
  expect(idOf(result)).toBeTruthy();
  expect(idOf(result)).not.toBe(idOf(original));
  expect(ledger.size).toBe(2);
  expect(await sourceEnv.COUNTERS.get(KV_KEYS.paymentNonce(`0x${"cd".repeat(32)}`))).toBeNull();
});
