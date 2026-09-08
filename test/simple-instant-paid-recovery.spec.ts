import { runDurableObjectAlarm } from "cloudflare:test";
import { beforeAll, beforeEach, expect, it, vi } from "vitest";
import { getPaymentStack } from "@/lib/payments";
import { extractPaymentNonce } from "@/lib/replay-guard";
import { sha256Hex } from "@/lib/idempotency";
import { jcsCanonicalize } from "@/lib/jcs";
import { purchaseIntentStore, type PurchaseIntent } from "@/services/purchase-intent";
import { KV_KEYS } from "@/lib/kv-keys";
import { dailyFortune } from "@/services/penny-shelf";
import { installLaborAdmissionHarness, laborNetworks, sendLabor, signLabor, type LaborDoor } from "./helpers/labor-admission";
import { items, shelves, call, object, request, sourceEnv, testEnv, NOW, type Obj } from "./helpers/buyer-harness";
import { evmBuyer, solBuyer } from "./helpers/buyer-signed-payments";

installLaborAdmissionHarness();
let fault = "", hits = 0;
vi.mock("@/services/certificates", async original => {
  const actual = await original<typeof import("@/services/certificates")>();
  return { ...actual, mintCertificate: async (...args: Parameters<typeof actual.mintCertificate>) => {
    const minted = await actual.mintCertificate(...args);
    if (fault === "publication-after") { hits++; throw new Error("fixture interruption after certificate publication"); }
    return minted;
  } };
});
const savedStages = new Map<string, Obj>();
beforeAll(() => {
  const namespace = testEnv.PAID_RECOVERIES!;
  testEnv.PAID_RECOVERIES = new Proxy(namespace, { get(target, property) {
    if (property === "get") return (...args: Parameters<typeof namespace.get>) => {
      const stub = target.get(...args);
      return new Proxy(stub, { get(inner, method) {
        if (method === "artifactStage") return async (...args: Parameters<typeof inner.artifactStage>) => {
          if (args[2] !== undefined && fault === `${args[1]}-before`) { hits++; throw new Error("fixture durable write failure"); }
          const saved = await inner.artifactStage(...args);
          if (saved && args[2] !== undefined) savedStages.set(args[1], object(JSON.parse(saved)));
          if (args[2] !== undefined && fault === `${args[1]}-after`) { hits++; throw new Error("fixture durable write acknowledgement lost"); }
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
beforeEach(() => { fault = ""; hits = 0; savedStages.clear(); vi.setSystemTime(NOW); });

// Independent commercial cases, not the implementation's eligibility predicate.
const goods = ["hello", "certificate_of_patronage", "small_blessing", "daily_fortune"];
async function purchase(id: string, door: LaborDoor, rail: number) {
  const item = items.find(i => i.id === id)!, network = laborNetworks()[rail]!;
  const canary = `SCVD-E2E-${crypto.randomUUID()}`;
  const args = { agent_name: canary, purpose: canary };
  const offer = (await call(item, "mcp", args, shelves(item)[0])).offers.find(o => o.network === network)!;
  const signed = await signLabor(offer), payer = network.startsWith("eip155:") ? evmBuyer.address.toLowerCase() : solBuyer;
  const idValue = await sha256Hex(jcsCanonicalize({ network, payer, identity: extractPaymentNonce(signed) ?? object(signed.payload).transaction }));
  const stack = getPaymentStack(testEnv), original = stack.httpServer.processSettlement.bind(stack.httpServer);
  let settlements = 0;
  const spy = vi.spyOn(stack.httpServer, "processSettlement").mockImplementation(async (...a) => { settlements++; return original(...a); });
  const send = () => sendLabor(id, door, args, signed);
  const stub = purchaseIntentStore(sourceEnv, idValue);
  return { send, stub, canary, network, spy, settlements: () => settlements };
}

for (const id of goods) for (const door of ["http", "mcp", "mcp-standard"] as const) for (const [rail] of laborNetworks().entries()) {
  for (const point of ["publication-after", "instant_goods-after", "response-before", "response-after"]) {
    it(`${id} ${door} rail ${rail} ${point}: the retained purchase delivers one original good after midnight`, async () => {
      const p = await purchase(id, door, rail);
      try {
        fault = point;
        const first = await p.send();
        expect(first.refused).toBe(true);
        expect(first.body.charged).toBe(true);
        expect(hits).toBeGreaterThan(0);
        expect(p.settlements()).toBe(1);
        const record = JSON.parse((await p.stub.existingPurchase())!) as PurchaseIntent;
        const originalCertificate = object(savedStages.get("certificate")?.certificate);
        const originalText = savedStages.get("instant_goods")?.deliverable;
        fault = "";
        vi.setSystemTime(new Date(NOW.getTime() + 86400_000));
        expect(await runDurableObjectAlarm(p.stub)).toBe(true);
        const status = object(await (await request(`/api/purchase-status/${record.id}`, { headers: { Authorization: `Bearer ${record.token}` } })).json());
        expect(status).toMatchObject({ charged: true, payment_state: "settled", delivery_state: "delivered" });
        const result = object(status.fulfillment), cert = object(result.certificate);
        expect(cert).toEqual(originalCertificate);
        expect(cert).toMatchObject({ item: id, name: p.canary, purpose: p.canary, network: p.network });
        expect(typeof result.deliverable).toBe("string");
        expect(String(result.deliverable).length).toBeGreaterThan(10);
        if (originalText) expect(result.deliverable).toBe(originalText);
        if (id === "daily_fortune") {
          expect(result.fortune_date).toBe(NOW.toISOString().slice(0, 10));
          expect(result.deliverable).toBe(dailyFortune(NOW));
        }
        expect(object(await (await request(String(result.verify_url))).json()).valid).toBe(true);
        expect(await runDurableObjectAlarm(p.stub)).toBe(false);
        expect(p.settlements()).toBe(1);
        expect((await sourceEnv.PATRONS.list({ prefix: KV_KEYS.certPrefix })).keys).toHaveLength(1);
      } finally { p.spy.mockRestore(); }
    });
  }
}

for (const id of goods) for (const door of ["http", "mcp", "mcp-standard"] as const) {
  it(`${id} ${door}: concurrent paid retries preserve one selected text and certificate`, async () => {
    const p = await purchase(id, door, 0);
    try {
      fault = "response-before";
      expect((await p.send()).refused).toBe(true);
      const text = savedStages.get("instant_goods")?.deliverable;
      fault = "";
      const retries = await Promise.all([p.send(), p.send()]);
      for (const retry of retries) {
        expect(retry.refused).toBe(false);
        expect(retry.body.deliverable).toBe(text);
      }
      expect(object(retries[0]!.body.certificate).cert_id).toBe(object(retries[1]!.body.certificate).cert_id);
      expect(p.settlements()).toBe(1);
      expect((await sourceEnv.PATRONS.list({ prefix: KV_KEYS.certPrefix })).keys).toHaveLength(1);
    } finally { p.spy.mockRestore(); }
  });
}
