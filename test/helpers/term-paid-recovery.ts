import { jcsCanonicalize } from "@/lib/jcs";
import { BASE_NETWORK, SOLANA_NETWORK } from "@/lib/payments";
import { STATEMENT_RAILS } from "@/lib/statement-rails";
import { atomicToUsdc, getPaymentStack } from "@/lib/payments";
import { runDurableObjectAlarm } from "cloudflare:test";
import { beforeAll, beforeEach, expect, it, vi } from "vitest";
import { verifyMessageSignature } from "@/lib/signing";
import { KV_KEYS } from "@/lib/kv-keys";
import { purchaseIdentity, purchaseIntentStore, type PurchaseIntent } from "@/services/purchase-intent";
import { getPass } from "@/services/patronage";
import { sweepOperatorStatements } from "@/services/operator-statement";
import { installLaborAdmissionHarness, laborNetworks, sendLabor, signLabor, transfers, type LaborDoor } from "./labor-admission";
import { items, shelves, call, object, request, sourceEnv, testEnv, NOW, type Obj } from "./buyer-harness";
import { evmBuyer, solBuyer } from "./buyer-signed-payments";

installLaborAdmissionHarness();
let fault = "", hits = 0, head = 100_000, headReads = 0;
const fail = () => { hits++; throw new Error("fixture term interruption"); };
vi.mock("@/lib/statement-rails", async load => {
  const actual = await load<typeof import("@/lib/statement-rails")>();
  const wrap = (rail: typeof actual.BASE_RAIL) => ({ ...rail,
    head: async () => { headReads++; if (fault === "head") fail(); return head; },
    transfersTo: async () => [], transfersFrom: async () => [],
  });
  return { ...actual, BASE_RAIL: wrap(actual.BASE_RAIL),
    statementRailOf: (raw: string | undefined) => { const rail = actual.statementRailOf(raw); return rail ? wrap(rail) : null; },
    railOfCaip2: (raw: string) => wrap(actual.railOfCaip2(raw)),
  };
});
vi.mock("@/lib/kv-retry", async load => {
  const actual = await load<typeof import("@/lib/kv-retry")>();
  return { ...actual, kvPut: async (...args: Parameters<typeof actual.kvPut>) => {
    const target = args[1].startsWith(KV_KEYS.patronagePass("")) || args[1].startsWith(KV_KEYS.operatorStatementPrefix);
    if (target && fault === "public-before") fail();
    await actual.kvPut(...args);
    if (target && fault === "public-after") fail();
  } };
});
vi.mock("@/services/certificates", async load => {
  const actual = await load<typeof import("@/services/certificates")>();
  return { ...actual, mintCertificate: async (...args: Parameters<typeof actual.mintCertificate>) => {
    if (fault === "certificate-before") fail();
    const value = await actual.mintCertificate(...args);
    if (fault === "certificate-after") fail();
    return value;
  } };
});
vi.mock("@/lib/signing", async load => {
  const actual = await load<typeof import("@/lib/signing")>();
  return { ...actual, signMessage: async (...args: Parameters<typeof actual.signMessage>) => {
    if (fault === "commission" && /scvd\.(operator-commission|patronage-grant)/.test(args[0])) fail();
    return actual.signMessage(...args);
  } };
});
beforeAll(() => {
  const namespace = testEnv.PAID_RECOVERIES!;
  testEnv.PAID_RECOVERIES = new Proxy(namespace, { get(target, property) {
    if (property === "get") return (...args: Parameters<typeof namespace.get>) => {
      const stub = target.get(...args);
      return new Proxy(stub, { get(inner, method) {
        if (method === "grantPatronage") return async (...a: Parameters<typeof inner.grantPatronage>) => {
          if (fault === "coordinator-before") fail();
          const saved = await inner.grantPatronage(...a);
          if (fault === "coordinator-after") fail();
          return saved;
        };
        if (method === "publishWatch") return async (...a: Parameters<typeof inner.publishWatch>) => {
          if (fault === "coordinator-before") fail();
          const saved = await inner.publishWatch(...a);
          if (fault === "coordinator-after") fail();
          return saved;
        };
        if (method === "artifactStage") return async (...a: Parameters<typeof inner.artifactStage>) => {
          if (a[2] !== undefined && fault === `${a[1]}-before`) fail();
          const saved = await inner.artifactStage(...a);
          if (a[2] !== undefined && fault === `${a[1]}-after`) fail();
          return saved;
        };
        if (method === "retainObservation") return async (...a: Parameters<typeof inner.retainObservation>) => {
          if (a[2] !== undefined && fault === "observation-before") fail();
          const saved = await inner.retainObservation(...a);
          if (a[2] !== undefined && fault === "observation-after") fail();
          return saved;
        };
        const member = Reflect.get(inner, method);
        return typeof member === "function" ? (...a: unknown[]) => Reflect.apply(member, inner, a) : member;
      } });
    };
    const member = Reflect.get(target, property);
    return typeof member === "function" ? member.bind(target) : member;
  } });
});
beforeEach(() => { fault = ""; hits = 0; head = 100_000; headReads = 0; vi.setSystemTime(NOW); });
type Item = "recurring_patronage" | "operator_statement";
async function purchase(id: Item, door: LaborDoor, rail = 0, extra: Obj = {}) {
  const item = items.find(i => i.id === id)!, network = laborNetworks()[rail]!;
  const canary = `SCVD-E2E-${NOW.getTime()}-${crypto.randomUUID()}`;
  const args: Obj = { purpose: canary, agent_name: canary,
    ...(id === "operator_statement" ? { wallet: evmBuyer.address, network: "base" } : {}), ...extra };
  const quote = await call(item, "mcp", args, shelves(item)[0]);
  const offer = quote.offers.find(o => o.network === network);
  expect(offer, JSON.stringify(quote.body)).toBeDefined();
  const signed = await signLabor(offer!), payer = network.startsWith("eip155:") ? evmBuyer.address.toLowerCase() : solBuyer;
  const identity = await purchaseIdentity(network, payer, signed);
  return { id, args, payer, network, stub: purchaseIntentStore(sourceEnv, identity.id), send: (changed: Obj = args) => sendLabor(id, door, changed, signed) };
}
type Purchase = Awaited<ReturnType<typeof purchase>>;
async function good(p: Purchase, body: Obj) {
  const cert = object(JSON.parse(String(body.signed_payload))), proof = object(body.commission);
  expect(cert.purpose).toBe(p.args.purpose);
  expect(cert.name).toBe(p.args.agent_name);
  expect(object(await (await request(String(body.verify_url))).json()).valid).toBe(true);
  expect(await verifyMessageSignature(String(proof.signed_payload), String(proof.signature), String(proof.public_key))).toBe(true);
  const terms = object(JSON.parse(String(proof.signed_payload)));
  expect(terms.cert_id).toBe(cert.cert_id);
  expect(terms.preparation_hash).toBe(cert.attests);
  expect(await verifyMessageSignature(String(proof.signed_payload).replace(String(cert.cert_id), "wrong-certificate"), String(proof.signature), String(proof.public_key))).toBe(false);
  if (p.id === "recurring_patronage") {
    const pass = (await getPass(sourceEnv, String(body.pass_id)))!;
    expect(pass.pass_id).toBe(terms.pass_id);
    expect(terms.purchased_at).toBe(NOW.toISOString());
    expect(terms.expires_at).toBe(body.expires_at);
    expect(pass.agent_name).toBe(p.args.agent_name);
  } else {
    const history = object(await (await request(String(body.history_url))).json());
    expect(history).toMatchObject({ wallet: p.args.wallet?.toString().startsWith("0x") ? String(p.args.wallet).toLowerCase() : p.args.wallet,
      started_at: NOW.toISOString(), ends_at: new Date(NOW.getTime() + 30 * 86400_000).toISOString(), opened_at_block: 100_001 });
    expect(history.chain).toBe(p.args.network === "base" ? BASE_NETWORK : p.args.network === "solana" ? SOLANA_NETWORK : p.args.network);
    expect(history.commission).toEqual(proof);
    expect(terms).toMatchObject({ wallet: history.wallet, chain: history.chain, asset: history.asset,
      started_at: history.started_at, ends_at: history.ends_at, opened_at_block: history.opened_at_block });
    expect(terms.payer).toBe(p.payer);
  }
  for (const change of p.id === "operator_statement"
    ? [{ wallet: "wrong subject" }, { chain: "wrong chain" }, { ends_at: "2099-01-01" }]
    : [{ pass_id: "wrong pass" }, { expires_at: "2099-01-01" }]) {
    expect(await verifyMessageSignature(jcsCanonicalize({ ...terms, ...change }), String(proof.signature), String(proof.public_key))).toBe(false);
  }
  return terms;
}
async function recover(p: Purchase) {
  expect(await runDurableObjectAlarm(p.stub)).toBe(true);
  const record = JSON.parse((await p.stub.existingPurchase())!) as PurchaseIntent;
  const status = object(await (await request(`/api/purchase-status/${record.id}`, { headers: { Authorization: `Bearer ${record.token}` } })).json());
  expect(status).toMatchObject({ charged: true, payment_state: "settled", delivery_state: "delivered" });
  await good(p, object(status.fulfillment));
  return object(status.fulfillment);
}
export function termPaidRecovery(id: Item) {
  for (const door of ["http", "mcp", "mcp-standard"] as const) {
    for (const [rail] of laborNetworks().entries()) for (const point of ["certificate-before", "certificate-after", "public-before", "public-after", "response-before", "commission", "coordinator-before", "coordinator-after"]) {
      it(`${id} ${door} rail ${rail}: ${point} recovers the original term`, async () => {
        const p = await purchase(id, door, rail); fault = point;
        expect((await p.send()).body.charged).toBe(true); expect(hits).toBeGreaterThan(0);
        fault = ""; head += 1_000_000; vi.setSystemTime(new Date(NOW.getTime() + 40 * 86400_000));
        await recover(p); expect(transfers).toBe(1);
        await p.send(); expect(transfers).toBe(1);
        if (id === "operator_statement") expect(headReads).toBe(1);
      });
    }
    it(`${id} ${door}: concurrent first requests create and settle one original term`, async () => {
      const p = await purchase(id, door);
      const results = await Promise.all([p.send(), p.send()]);
      expect(results.some(result => !result.refused)).toBe(true);
      await recover(p); expect(transfers).toBe(1);
    });
    if (id === "operator_statement") for (const rail of STATEMENT_RAILS.filter(r => ["base", "polygon", "solana"].includes(r.key))) {
      it(`${door}: commission binds the requested ${rail.key} subject independently of the payment rail`, async () => {
        const p = await purchase(id, door, 0, { wallet: rail.key === "solana" ? solBuyer : evmBuyer.address, network: rail.caip2 });
        await good(p, (await p.send()).body); expect(transfers).toBe(1);
      });
    }
    for (const point of ["observation-before", "observation-after"]) it(`${id} ${door}: ${point} is unpaid and retry keeps retained terms`, async () => {
      const p = await purchase(id, door); fault = point;
      expect((await p.send()).body.charged).toBe(false); expect(transfers).toBe(0);
      fault = ""; const body = (await p.send()).body;
      await good(p, body); expect(transfers).toBe(1);
      if (id === "operator_statement") expect(headReads).toBe(point === "observation-after" ? 1 : 2);
    });
    it(`${id} ${door}: a persistent outage leaves delivery open until repair succeeds`, async () => {
      const p = await purchase(id, door); fault = "public-before";
      expect((await p.send()).body.charged).toBe(true);
      await runDurableObjectAlarm(p.stub);
      const saved = JSON.parse((await p.stub.existingPurchase())!) as PurchaseIntent;
      expect(saved.state).toBe("settled"); expect(saved.delivery).toBeUndefined();
      expect(transfers).toBe(1); fault = ""; await recover(p);
    });
    it(`${id} ${door}: changed inputs and simultaneous retries cannot replace the term`, async () => {
      const p = await purchase(id, door); fault = "response-before";
      expect((await p.send()).body.charged).toBe(true); fault = "";
      expect((await p.send({ ...p.args, purpose: "wrong purpose" })).refused).toBe(true);
      await Promise.all([p.send(), p.send()]); await recover(p); expect(transfers).toBe(1);
    });
    it(`${id} ${door}: ambiguous settlement retains the original preparation`, async () => {
      const p = await purchase(id, door), stack = getPaymentStack(testEnv);
      const settle = stack.httpServer.processSettlement.bind(stack.httpServer);
      let receipt: Awaited<ReturnType<typeof settle>> | undefined;
      const spy = vi.spyOn(stack.httpServer, "processSettlement").mockImplementation(async (...args) => {
        if (!receipt) receipt = await settle(...args);
        throw new TypeError("fixture lost settlement answer");
      });
      try {
        expect((await p.send()).body.charged).toBeNull(); expect(transfers).toBe(1);
        const saved = JSON.parse((await p.stub.existingPurchase())!) as PurchaseIntent;
        expect(saved.state).toBe("unknown");
        if (!receipt?.success) throw new Error("Fixture did not settle");
        await p.stub.updatePurchase({ state: "settled", payment: { transaction: receipt.transaction, network: p.network,
          payer: saved.payer, paidUsdc: atomicToUsdc(saved.terms.amount), tipUsdc: 0, settleHeaders: receipt.headers } });
        vi.setSystemTime(new Date(NOW.getTime() + 40 * 86400_000)); head += 1_000_000;
        await recover(p); expect(transfers).toBe(1);
      } finally { spy.mockRestore(); }
    });
    if (id === "recurring_patronage") for (const point of ["public-before", "public-after", "response-before", "commission"]) {
      it(`${door}: ${point} cannot apply a paid renewal twice or erase a later grant`, async () => {
        const first = await purchase(id, door), initial = (await first.send()).body;
        const renewal = await purchase(id, door, 0, { pass_id: initial.pass_id, agent_name: first.args.agent_name });
        fault = point; expect((await renewal.send()).body.charged).toBe(true); fault = "";
        await recover(renewal);
        const renewed = (await getPass(sourceEnv, String(initial.pass_id)))!;
        expect(renewed.renewals).toBe(1);
        const later = await purchase(id, door, 0, { pass_id: initial.pass_id, agent_name: first.args.agent_name });
        const laterBody = (await later.send()).body;
        expect((await getPass(sourceEnv, String(initial.pass_id)))!.renewals).toBe(2);
        await sourceEnv.PATRONS.delete(KV_KEYS.patronagePass(String(initial.pass_id)));
        await renewal.send();
        const latest = (await getPass(sourceEnv, String(initial.pass_id)))!;
        expect(latest.renewals).toBe(2); expect(latest.expires_at).toBe(laterBody.expires_at);
        expect(Date.parse(latest.expires_at) - Date.parse(String(initial.expires_at))).toBe(60 * 86400_000);
        expect(transfers).toBe(3);
      });
    }
    if (id === "operator_statement") it(`${door}: recovered history preserves signed passes after the term expires`, async () => {
      const p = await purchase(id, door, 4, { wallet: solBuyer, network: "solana" });
      fault = "response-before"; expect((await p.send()).body.charged).toBe(true); fault = "";
      vi.setSystemTime(new Date(NOW.getTime() + 6 * 3600_000)); head += 1000;
      await sweepOperatorStatements(sourceEnv, Date.now());
      const keys = await sourceEnv.ORDERS.list({ prefix: KV_KEYS.operatorStatementPrefix });
      expect(keys.keys).toHaveLength(1);
      const original = await sourceEnv.ORDERS.get(keys.keys[0]!.name, "json");
      await sourceEnv.ORDERS.delete(keys.keys[0]!.name);
      vi.setSystemTime(new Date(NOW.getTime() + 40 * 86400_000));
      const body = await recover(p);
      const history = object(await (await request(String(body.history_url))).json());
      const passes = history.passes as Obj[];
      expect(passes).toHaveLength(1); expect(history.complete).toBe(true);
      expect(await sourceEnv.ORDERS.get(keys.keys[0]!.name, "json")).toEqual(original);
      const pass = passes[0]!;
      expect(await verifyMessageSignature(String(pass.signed_payload), String(pass.signature), String(pass.public_key))).toBe(true);
      expect(JSON.parse(String(pass.signed_payload))).toMatchObject({ wallet: solBuyer, unit: "slot", from_block: 100_001 });
      expect(transfers).toBe(1);
    });
    if (id === "operator_statement") it(`${door}: an unavailable opening head cannot settle or open from genesis`, async () => {
      const p = await purchase(id, door); fault = "head";
      const result = await p.send(); expect(result.body.charged).toBe(false); expect(transfers).toBe(0);
      expect((await sourceEnv.ORDERS.list({ prefix: KV_KEYS.operatorStatementPrefix })).keys).toHaveLength(0);
      fault = ""; await good(p, (await p.send()).body);
    });
  }
}
