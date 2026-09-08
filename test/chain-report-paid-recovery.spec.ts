import { runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { beforeAll, beforeEach, expect, it, vi } from "vitest";
import { getPaymentStack, atomicToUsdc } from "@/lib/payments";
import { BASE_USDC, TRANSFER_TOPIC } from "@/lib/base-rpc";
import { SOLANA_CHAIN, SOLANA_USDC_MINT } from "@/lib/solana-rpc";
import { encodeBase58 } from "@/lib/base58";
import { verifyMessageSignature } from "@/lib/signing";
import { extractPaymentNonce } from "@/lib/replay-guard";
import { sha256Hex } from "@/lib/idempotency";
import { jcsCanonicalize } from "@/lib/jcs";
import { purchaseIntentStore, type PurchaseIntent } from "@/services/purchase-intent";
import { KV_KEYS } from "@/lib/kv-keys";
import { installLaborAdmissionHarness, laborNetworks, sendLabor, signLabor, transfers, type LaborDoor } from "./helpers/labor-admission";
import { items, shelves, call, object, request, sourceEnv, testEnv, NOW, type Obj } from "./helpers/buyer-harness";
import { evmBuyer, solBuyer } from "./helpers/buyer-signed-payments";

installLaborAdmissionHarness();
let fault = "", hits = 0, reads = 0, unavailable = false;
let prepared: Obj | undefined, observed: Obj | undefined, published: Obj | undefined;
let reportKey = "", subjectWallet = "", subjectTx = "", outTx = "";
let rpcReads = 0, chainChanged = false;
const other = `0x${"22".repeat(20)}`;
const topic = (address: string) => `0x${address.slice(2).toLowerCase().padStart(64, "0")}`;
const head = 1_000_000;
function observing() {
  reads++;
  if (unavailable) throw new Error("fixture chain unavailable after settlement");
}
vi.mock("@/services/wallet-statement", async original => {
  const actual = await original<typeof import("@/services/wallet-statement")>();
  return { ...actual, performWalletStatement: async (...args: Parameters<typeof actual.performWalletStatement>) => {
    observing();
    const report = await actual.performWalletStatement(...args);
    observed = object(report); reportKey = KV_KEYS.walletStatement(report.statement_id);
    return report;
  } };
});
vi.mock("@/services/settlement-reconciliation", async original => {
  const actual = await original<typeof import("@/services/settlement-reconciliation")>();
  return { ...actual, reconcileSettlement: async (...args: Parameters<typeof actual.reconcileSettlement>) => {
    observing();
    const report = await actual.reconcileSettlement(...args);
    observed = object(report); reportKey = KV_KEYS.settlementReconciliation(report.reconciliation_id);
    return report;
  } };
});
vi.mock("@/services/certificates", async original => {
  const actual = await original<typeof import("@/services/certificates")>();
  return { ...actual, mintCertificate: async (...args: Parameters<typeof actual.mintCertificate>) => {
    if (fault === "certificate-before") { hits++; throw new Error("fixture signing unavailable"); }
    const minted = await actual.mintCertificate(...args);
    if (fault === "certificate-after") { hits++; throw new Error("fixture certificate publication acknowledgement lost"); }
    return minted;
  } };
});
beforeAll(() => {
  const innerFetch = globalThis.fetch;
  // Exercise the real RPC parsers, report arithmetic and signing against a
  // local node. The payment facilitator remains the signed fixture below it.
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const body = init?.body && typeof init.body === "string" ? object(JSON.parse(init.body)) : {};
    const method = String(body.method ?? "");
    if (!["eth_blockNumber", "eth_getLogs", "eth_getTransactionReceipt", "getSlot", "getTokenAccountsByOwner", "getSignaturesForAddress", "getTransaction"].includes(method)) return innerFetch(input, init);
    rpcReads++;
    const params = body.params as unknown[];
    const reply = (result: unknown) => Response.json({ jsonrpc: "2.0", id: body.id, result });
    const amount = chainChanged ? 999_000_000 : 370_000;
    if (method === "eth_blockNumber" || method === "getSlot") return reply(method === "getSlot" ? head : `0x${head.toString(16)}`);
    if (method === "eth_getLogs") {
      const filter = object(params[0]), topics = filter.topics as unknown[];
      const inbound = topics[2] !== undefined;
      expect(topics[inbound ? 2 : 1]).toBe(topic(subjectWallet));
      return reply([{ address: filter.address, transactionHash: inbound ? subjectTx : outTx, blockNumber: `0x${(head - 1).toString(16)}`,
        topics: [TRANSFER_TOPIC, topic(inbound ? other : subjectWallet), topic(inbound ? subjectWallet : other)], data: `0x${amount.toString(16)}` }]);
    }
    if (method === "eth_getTransactionReceipt") {
      expect(params[0]).toBe(subjectTx);
      return reply({ status: "0x1", blockNumber: `0x${(head - 1).toString(16)}`, logs: [{ address: BASE_USDC,
        topics: [TRANSFER_TOPIC, topic(subjectWallet), topic(other)], data: `0x${amount.toString(16)}` }] });
    }
    if (method === "getTokenAccountsByOwner") {
      expect(params[0]).toBe(subjectWallet);
      return reply({ value: [{ pubkey: "7UX2i7SucgLMQcfZ75s3VXmZZY4YRUyJN9X1RgfMoDUi", account: { data: { parsed: { info: { state: "initialized" } } } } }] });
    }
    if (method === "getSignaturesForAddress") return reply([{ signature: subjectTx, slot: head - 1, err: null }]);
    expect(params[0]).toBe(subjectTx);
    const owners = [subjectWallet, solBuyer];
    const balances = (after: boolean) => owners.map((owner, i) => ({ accountIndex: i, mint: SOLANA_USDC_MINT, owner,
      uiTokenAmount: { amount: String(1_000_000_000 + (after ? i === 0 ? amount : -amount : 0)) } }));
    return reply({ slot: head - 1, meta: { err: null, preTokenBalances: balances(false), postTokenBalances: balances(true) }, transaction: { message: { accountKeys: [] } } });
  });
  const patrons = testEnv.PATRONS;
  testEnv.PATRONS = new Proxy(patrons, { get(target, property) {
    if (property === "put") return async (...args: Parameters<typeof patrons.put>) => {
      if (args[0] === reportKey && fault === "report-before") { hits++; throw new Error("fixture report publication failed"); }
      await target.put(...args);
      if (args[0] === reportKey) {
        published = object(JSON.parse(String(args[1])));
        if (fault === "report-after") { hits++; throw new Error("fixture report acknowledgement lost"); }
      }
    };
    const member = Reflect.get(target, property);
    return typeof member === "function" ? member.bind(target) : member;
  } });
  const namespace = testEnv.PAID_RECOVERIES!;
  testEnv.PAID_RECOVERIES = new Proxy(namespace, { get(target, property) {
    if (property === "get") return (...args: Parameters<typeof namespace.get>) => {
      const stub = target.get(...args);
      return new Proxy(stub, { get(inner, method) {
        if (method === "retainObservation") return async (...a: Parameters<typeof inner.retainObservation>) => {
          if (a[2] !== undefined && fault === "observation-before") { hits++; throw new Error("fixture observation write unavailable"); }
          const saved = await inner.retainObservation(...a);
          if (saved) {
            prepared = object(JSON.parse(saved));

          }
          if (a[2] !== undefined && fault === "observation-after") { hits++; throw new Error("fixture observation acknowledgement lost"); }
          return saved;
        };
        if (method === "artifactStage") return async (...a: Parameters<typeof inner.artifactStage>) => {
          if (a[2] !== undefined && a[1] === "response" && fault === "response-before") { hits++; throw new Error("fixture response write unavailable"); }
          return inner.artifactStage(...a);
        };
        const member = Reflect.get(inner, method);
        return typeof member === "function" ? (...a: unknown[]) => Reflect.apply(member, inner, a) : member;
      } });
    };
    const member = Reflect.get(target, property);
    return typeof member === "function" ? member.bind(target) : member;
  } });
});
beforeEach(() => { fault = ""; hits = 0; reads = 0; unavailable = false; prepared = observed = published = undefined; reportKey = ""; rpcReads = 0; chainChanged = false; vi.setSystemTime(NOW); });
const goods = [
  { id: "the_statement", snapshot: "walletStatement", field: "statement", input: "wallet", idField: "statement_id", urlField: "statement_url", dateField: "created_at" },
  { id: "settlement_reconciliation", snapshot: "reconciliation", field: "reconciliation", input: "tx_hash", idField: "reconciliation_id", urlField: "reconciliation_url", dateField: "stored_at" },
];
let product = goods[0]!;
const doors = ["http", "mcp", "mcp-standard"] as const;
async function purchase(id: string, door: LaborDoor, rail: number, subjectNetwork = "base") {
  product = goods.find(g => g.id === id)!;
  const item = items.find(i => i.id === id)!, network = laborNetworks()[rail]!;
  const canary = `SCVD-E2E-${crypto.randomUUID()}`;
  const digest = await sha256Hex(canary);
  subjectWallet = subjectNetwork === "solana" ? encodeBase58(crypto.getRandomValues(new Uint8Array(32))) : `0x${digest.slice(0, 40)}`;
  subjectTx = subjectNetwork === "solana" ? encodeBase58(crypto.getRandomValues(new Uint8Array(64))) : `0x${digest}`;
  outTx = `0x${await sha256Hex(canary + "out")}`;
  const subject = id === "the_statement" ? subjectWallet : subjectTx;
  const args: Record<string, string> = id === "the_statement"
    ? { wallet: subjectWallet, network: subjectNetwork, hours: "3", purpose: canary }
    : { tx_hash: subjectTx, payer: subjectWallet, recipient: other, declared_cap_usdc: "0.73", purpose: canary };
  const offer = (await call(item, "mcp", args, shelves(item)[0])).offers.find(o => o.network === network)!;
  const signed = await signLabor(offer), payer = network.startsWith("eip155:") ? evmBuyer.address.toLowerCase() : solBuyer;
  const identity = extractPaymentNonce(signed) ?? object(signed.payload).transaction;
  const intentKey = await sha256Hex(jcsCanonicalize({ network, payer, identity }));
  return { canary, args, subject, network, stub: purchaseIntentStore(sourceEnv, intentKey), send: (changed: Obj = args) => sendLabor(id, door, changed, signed) };
}
async function assertGood(body: Obj, expected: Obj, subject: string, canary: string) {
  const actual = object(body[product.field]);
  expect(actual).toEqual(expected);
  expect(actual[product.input === "wallet" ? "wallet" : "tx_hash"]).toBe(subject);
  expect(actual.observed_at).toBe(NOW.toISOString());
  const entries = Object.entries(actual), end = entries.findIndex(([key]) => key === "signature");
  expect(end).toBeGreaterThan(0);
  const unsigned = Object.fromEntries(entries.slice(0, end));
  expect(await verifyMessageSignature(JSON.stringify(unsigned), String(actual.signature), String(actual.public_key))).toBe(true);
  expect(await verifyMessageSignature(JSON.stringify({ ...unsigned, observed_at: "2099-01-01" }), String(actual.signature), String(actual.public_key))).toBe(false);
  if (product.id === "the_statement") {
    expect(actual.coverage).toBe("complete");
    expect(object(actual.window)).toMatchObject({ hours_requested: 3, chain_head_at_read: head, to_block: head });
    expect(object(actual.inflows)).toMatchObject({ count: 1, total_atomic: "370000", transfers: [{ tx_hash: subjectTx, amount_atomic: "370000", amount_usdc: 0.37, block: head - 1 }] });
    if (actual.chain !== SOLANA_CHAIN) expect(object(actual.outflows)).toMatchObject({ count: 1, total_atomic: "370000", transfers: [{ tx_hash: outTx }] });
  } else {
    expect(actual).toMatchObject({ chain: "eip155:8453", tx_hash: subjectTx, settled_usdc: 0.37, settled_from: subjectWallet, settled_to: other,
      cap_usdc: 0.73, cap_observed: false, cap_source: "declared_by_caller", verdict: "within_cap",
      query: { txHash: subjectTx, payer: subjectWallet, recipient: other, declaredCapUsdc: 0.73 } });
  }
  const cert = object(body.certificate);
  expect(cert.purpose).toBe(canary); expect(cert.attests).toBe(actual.evidence_hash);
  expect(object(await (await request(String(body.verify_url))).json()).valid).toBe(true);
  const response = await request(String(body[product.urlField]));
  expect(response.status).toBe(200);
  expect(object(await response.json())).toMatchObject({ [product.field]: expected, [product.dateField]: NOW.toISOString(),
    ...(product.id === "the_statement" ? { certificate: body.verify_url } : { cert_id: cert.cert_id }) });
  expect(body[product.idField]).toBe(expected[product.idField]);
}
for (const { id } of goods) for (const door of doors) for (const [rail] of laborNetworks().entries()) {
  for (const point of ["certificate-before", "certificate-after", "report-before", "report-after", "response-before"]) it(`${id} ${door} rail ${rail}: ${point} recovers original signed evidence with chain unavailable`, async () => {
    const p = await purchase(id, door, rail);
    fault = point;
    const first = await p.send();
    expect(first.refused).toBe(true);
    expect(first.body.charged).toBe(true);
    expect(hits).toBeGreaterThan(0);
    expect(transfers).toBe(1);
    expect(prepared).toBeDefined();
    const original = structuredClone(observed!);
    expect(object(prepared![product.snapshot])).toEqual(original);
    const firstPublished = published && structuredClone(published);
    expect(reads).toBeGreaterThan(0);
    const readsBefore = reads, rpcBefore = rpcReads;
    fault = ""; unavailable = true; vi.setSystemTime(new Date(NOW.getTime() + 86400_000));
    expect(await runDurableObjectAlarm(p.stub)).toBe(true);
    const record = JSON.parse((await p.stub.existingPurchase())!) as PurchaseIntent;
    const status = object(await (await request(`/api/purchase-status/${record.id}`, { headers: { Authorization: `Bearer ${record.token}` } })).json());
    expect(status).toMatchObject({ charged: true, payment_state: "settled", delivery_state: "delivered" });
    await assertGood(object(status.fulfillment), original, p.subject, p.canary);
    expect(reads).toBe(readsBefore);
    expect(rpcReads).toBe(rpcBefore);
    if (firstPublished) expect(await sourceEnv.PATRONS.get(reportKey, "json")).toEqual(firstPublished);
    expect(transfers).toBe(1);
    expect((await sourceEnv.PATRONS.list({ prefix: KV_KEYS.certPrefix })).keys).toHaveLength(1);
    expect(await runDurableObjectAlarm(p.stub)).toBe(false);
  });
}
for (const { id } of goods) for (const door of doors) {
  for (const point of ["observation-before", "observation-after"]) it(`${id} ${door}: ${point} prevents settlement and permits the same request`, async () => {
    const p = await purchase(id, door, 0);
    fault = point;
    const first = await p.send();
    expect(hits).toBeGreaterThan(0);
    expect(first.refused).toBe(true);
    expect(first.body).toMatchObject({ code: "observation_storage_unavailable", charged: false, settlement_attempted: false });
    expect(transfers).toBe(0);
    expect(await p.stub.existingPurchase()).toBeNull();
    expect((await sourceEnv.PATRONS.list({ prefix: KV_KEYS.certPrefix })).keys).toHaveLength(0);
    const readsBefore = reads;
    fault = ""; unavailable = point === "observation-after";
    const retry = await p.send();
    expect(retry.refused, JSON.stringify(retry.body)).toBe(false);
    if (unavailable) expect(reads).toBe(readsBefore);
    expect(transfers).toBe(1);
  });
  it(`${id} ${door}: same-payment retry cannot substitute different buyer input`, async () => {
    const p = await purchase(id, door, 0);
    fault = "response-before";
    expect((await p.send()).body.charged).toBe(true);
    fault = ""; unavailable = true;
    const readsBefore = reads;
    const wrong = await p.send({ ...p.args, [product.input]: id === "the_statement" ? `0x${"33".repeat(20)}` : `0x${"33".repeat(32)}` });
    expect(wrong.refused).toBe(true);
    expect(wrong.body.charged).toBe(true);
    expect(transfers).toBe(1);
    const same = await p.send();
    expect(same.refused).toBe(false);
    expect(reads).toBe(readsBefore);
    expect(transfers).toBe(1);
  });
}
for (const { id } of goods) for (const door of doors) {
  it(`${id} ${door}: concurrent requests commit one evidence snapshot and settle once`, async () => {
    const p = await purchase(id, door, 0);
    const results = await Promise.all([p.send(), p.send()]);
    expect(results.some(result => !result.refused)).toBe(true);
    expect(transfers).toBe(1);
    unavailable = true;
    const readsBefore = reads;
    expect(await runDurableObjectAlarm(p.stub)).toBe(true);
    const record = JSON.parse((await p.stub.existingPurchase())!) as PurchaseIntent;
    await assertGood(object(record.delivery), object(prepared![product.snapshot]), p.subject, p.canary);
    expect(reads).toBe(readsBefore);
    expect(transfers).toBe(1);
  });
}

for (const { id } of goods) for (const door of doors) {
  it(`${id} ${door}: missing original evidence remains owed with no replacement`, async () => {
    const p = await purchase(id, door, 0); fault = "certificate-before";
    expect((await p.send()).body.charged).toBe(true);
    await runInDurableObject(p.stub, (_instance, state) => state.storage.delete("observation"));
    fault = ""; unavailable = true; const before = reads;
    expect(await runDurableObjectAlarm(p.stub)).toBe(true);
    const record = JSON.parse((await p.stub.existingPurchase())!) as PurchaseIntent;
    expect(record.state).toBe("settled"); expect(record.delivery).toBeUndefined();
    const retry = await p.send(); expect(retry.refused).toBe(true); expect(retry.body.charged).toBe(true);
    expect(reads).toBe(before); expect(transfers).toBe(1);
  });
  it(`${id} ${door}: changed chain cannot rewrite the purchased report`, async () => {
    const p = await purchase(id, door, 0); fault = "certificate-before";
    expect((await p.send()).body.charged).toBe(true);
    const original = structuredClone(observed!);
    chainChanged = true;
    fault = ""; const before = reads; vi.setSystemTime(new Date(NOW.getTime() + 86400_000));
    expect(await runDurableObjectAlarm(p.stub)).toBe(true);
    const record = JSON.parse((await p.stub.existingPurchase())!) as PurchaseIntent;
    await assertGood(object(record.delivery), original, p.subject, p.canary);
    expect(reads).toBe(before); expect(transfers).toBe(1);
  });
}

for (const { id } of goods) for (const door of doors) for (const [rail] of laborNetworks().entries()) {
  it(`${id} ${door} rail ${rail}: lost settlement acknowledgement retains the original report`, async () => {
    const p = await purchase(id, door, rail), stack = getPaymentStack(testEnv);
    const settle = stack.httpServer.processSettlement.bind(stack.httpServer);
    let receipt: Awaited<ReturnType<typeof settle>> | undefined;
    const spy = vi.spyOn(stack.httpServer, "processSettlement").mockImplementation(async (...args) => {
      if (!receipt) receipt = await settle(...args);
      throw new TypeError("fixture drops confirmed settlement answer");
    });
    try {
      const first = await p.send();
      expect(first.refused).toBe(true); expect(first.body.charged).toBeNull(); expect(transfers).toBe(1);
      const original = structuredClone(observed!);
      expect(object(prepared![product.snapshot])).toEqual(original);
      const saved = JSON.parse((await p.stub.existingPurchase())!) as PurchaseIntent;
      expect(saved.state).toBe("unknown");
      expect(object(first.body.recovery).purchase_id).toBe(saved.id);
      if (!receipt?.success) throw new Error("Fixture did not settle");
      // Use the actual confirmed fixture receipt, not a second settlement.
      // Chain finality itself is covered by separate negative-control suites.
      await p.stub.updatePurchase({ state: "settled", payment: { transaction: receipt.transaction, network: p.network,
        payer: saved.payer, paidUsdc: atomicToUsdc(saved.terms.amount), tipUsdc: 0, settleHeaders: receipt.headers } });
      unavailable = true; const before = reads; vi.setSystemTime(new Date(NOW.getTime() + 86400_000));
      expect(await runDurableObjectAlarm(p.stub)).toBe(true);
      const recovered = JSON.parse((await p.stub.existingPurchase())!) as PurchaseIntent;
      await assertGood(object(recovered.delivery), original, p.subject, p.canary);
      expect(reads).toBe(before); expect(transfers).toBe(1);
    } finally { spy.mockRestore(); }
  });
}

for (const door of doors) for (const network of ["polygon", "solana"]) {
  it(`${door}: recovery keeps the statement's ${network} subject chain independent of the payment rail`, async () => {
    const p = await purchase("the_statement", door, 0, network); fault = "report-before";
    expect((await p.send()).body.charged).toBe(true);
    const original = structuredClone(observed!);
    expect(original.chain).toBe(network === "solana" ? SOLANA_CHAIN : "eip155:137");
    fault = ""; unavailable = true; const before = rpcReads;
    expect(await runDurableObjectAlarm(p.stub)).toBe(true);
    const record = JSON.parse((await p.stub.existingPurchase())!) as PurchaseIntent;
    await assertGood(object(record.delivery), original, p.subject, p.canary);
    expect(rpcReads).toBe(before); expect(transfers).toBe(1);
  });
}
