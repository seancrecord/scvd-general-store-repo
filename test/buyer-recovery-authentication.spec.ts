import { expect, it, vi } from "vitest";
import { runInDurableObject } from "cloudflare:test";
import { getPaymentStack } from "@/lib/payments";
import { purchaseIdentity, purchaseIntentStore } from "@/services/purchase-intent";
import { installLaborAdmissionHarness, laborNetworks, signLabor, sendLabor, transfers } from "./helpers/labor-admission";
import { installExpiredPaymentFixture, refuseSpentVerification } from "./helpers/expired-payment";
import { items, call, shelves, object, testEnv, sourceEnv, request } from "./helpers/buyer-harness";
import { evmBuyer, solBuyer } from "./helpers/buyer-signed-payments";

installLaborAdmissionHarness();
installExpiredPaymentFixture();
async function prepare(network: string) {
  const item = items.find(i => i.id === "context_anchor")!, args = { summary: `SCVD-E2E-private-${crypto.randomUUID()}` };
  const offer = (await call(item, "mcp", args, shelves(item)[0])).offers.find(o => o.network === network)!;
  const wire = await signLabor(offer), key = crypto.randomUUID();
  return { item, args, offer, wire, key };
}
for (const door of ["http", "mcp", "mcp-standard"] as const) for (const network of laborNetworks()) {
  const changes = network.startsWith("eip155:")
    ? ["from", "to", "value", "validAfter", "validBefore", "nonce", "signature", "asset", "name", "version", "network"]
    : ["buyer_signature", "message", "network"];
  for (const change of changes) it(`${door} ${network}: ${change} tampering cannot retrieve another purchase`, async () => {
    const p = await prepare(network);
    const first = await sendLabor(p.item.id, door, p.args, p.wire, p.key);
    expect(first.refused).toBe(false);
    const bad = structuredClone(p.wire), payload = object(bad.payload), accepted = object(bad.accepted), a = object(payload.authorization);
    if (change === "network") accepted.network = network.startsWith("eip155:") ? "eip155:1" : "solana:wrongGenesis";
    else if (change === "asset") accepted.asset = "0x1111111111111111111111111111111111111111";
    else if (change === "name" || change === "version") object(accepted.extra)[change] = "unrelated-domain";
    else if (change === "signature") payload.signature = `0x${"01".repeat(65)}`;
    else if (change === "from" || change === "to") a[change] = "0x3333333333333333333333333333333333333333";
    else if (change === "nonce") a.nonce = `0x${"cd".repeat(32)}`;
    else if (change === "buyer_signature" || change === "message") {
      const bytes = Uint8Array.from(atob(String(payload.transaction)), c => c.charCodeAt(0));
      const at = change === "buyer_signature" ? 65 : bytes.length - 2;
      bytes[at] = bytes[at]! ^ 1; payload.transaction = btoa(String.fromCharCode(...bytes));
    } else a[change] = String(BigInt(String(a[change])) + 1n);
    refuseSpentVerification();
    const settle = vi.spyOn(getPaymentStack(testEnv).httpServer, "processSettlement");
    const retry = await sendLabor(p.item.id, door, p.args, bad, p.key);
    expect(retry.refused).toBe(true);
    expect(JSON.stringify(retry.body)).not.toContain(p.args.summary);
    expect(object(retry.body.recovery).purchase_id).toBeUndefined();
    expect(retry.body.anchor_id).toBeUndefined();
    expect(settle).not.toHaveBeenCalled(); expect(transfers).toBe(1);
  });
  it(`${door} ${network}: an expired unspent signature is not an invented purchase`, async () => {
    const p = await prepare(network); refuseSpentVerification();
    const retry = await sendLabor(p.item.id, door, p.args, p.wire, p.key);
    expect(retry.refused).toBe(true); expect(retry.body.anchor_id).toBeUndefined();
    expect(object(retry.body.recovery).purchase_id).toBeUndefined(); expect(transfers).toBe(0);
  });
  it(`${door} ${network}: changed inputs return the original private recovery handle`, async () => {
    const p = await prepare(network);
    expect((await sendLabor(p.item.id, door, p.args, p.wire, p.key)).refused).toBe(false);
    refuseSpentVerification();
    const retry = await sendLabor(p.item.id, door, { summary: "SCVD-E2E-replacement" }, p.wire);
    expect(retry.refused).toBe(true); expect(retry.quote).toBe(false);
    expect(retry.body).toMatchObject({ code: "purchase_input_mismatch", charged: true, settlement_attempted: false });
    const recovery = object(retry.body.recovery);
    const original = await request(String(recovery.status_url), { headers: { Authorization: `Bearer ${recovery.status_token}` } });
    expect(original.status).toBe(200);
    expect(JSON.stringify(await original.json())).toContain(p.args.summary);
    expect(transfers).toBe(1);
  });
  it(`${door} ${network}: records predating fingerprints still recover cryptographically`, async () => {
    const p = await prepare(network);
    const first = await sendLabor(p.item.id, door, p.args, p.wire, p.key); expect(first.refused).toBe(false);
    const { id } = await purchaseIdentity(network, network.startsWith("eip155:") ? evmBuyer.address : solBuyer, p.wire);
    await runInDurableObject(purchaseIntentStore(sourceEnv, id), async (_instance, state) => {
      const old = await state.storage.get<Record<string, unknown>>("purchase"); delete old!.payment_proof; await state.storage.put("purchase", old!);
    });
    refuseSpentVerification();
    const retry = await sendLabor(p.item.id, door, p.args, p.wire);
    expect(retry.refused).toBe(false); expect(retry.body).toMatchObject(first.body); expect(transfers).toBe(1);
  });
}

for (const door of ["http", "mcp", "mcp-standard"] as const) for (const network of laborNetworks().filter(n => n.startsWith("eip155:"))) {
  it(`${door} ${network}: a previously verified contract signature matches only its exact retained fingerprint`, async () => {
    const p = await prepare(network), contract = "0x2222222222222222222222222222222222222222";
    const payload = object(p.wire.payload); object(payload.authorization).from = contract;
    // A contract-signature fixture: its initial validity is the facilitator's
    // verdict, not ECDSA recovery. No contract or live RPC is contacted.
    payload.signature = `0x${"09".repeat(65)}`;
    if (door !== "http") p.wire.resource = { url: `https://scvd.store/api/buy/${p.item.id}`, description: "Café receipt 🧾" };
    const inner = globalThis.fetch;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      if (url.pathname.endsWith("/x402/verify")) return Response.json({ isValid: true, payer: contract });
      return inner(input, init);
    });
    const first = await sendLabor(p.item.id, door, p.args, p.wire, p.key); expect(first.refused).toBe(false);
    const { id } = await purchaseIdentity(network, contract, p.wire);
    const stub = purchaseIntentStore(sourceEnv, id), raw = (await stub.existingPurchase())!;
    expect(object(JSON.parse(raw)).payment_proof).toMatch(/^[a-f0-9]{64}$/);
    expect(raw).not.toContain(String(payload.signature));
    refuseSpentVerification();
    const settle = vi.spyOn(getPaymentStack(testEnv).httpServer, "processSettlement");
    const retry = await sendLabor(p.item.id, door, p.args, p.wire);
    expect(retry.refused).toBe(false); expect(retry.body).toMatchObject(first.body);
    const changed = structuredClone(p.wire); object(changed.payload).signature = `0x${"08".repeat(65)}`;
    const refused = await sendLabor(p.item.id, door, p.args, changed);
    expect(refused.refused).toBe(true); expect(object(refused.body.recovery).purchase_id).toBeUndefined();
    expect(JSON.stringify(refused.body)).not.toContain(p.args.summary);
    expect(settle).not.toHaveBeenCalled(); expect(transfers).toBe(1);
  });
}
