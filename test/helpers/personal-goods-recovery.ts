import { runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { beforeAll, beforeEach, expect, it, vi } from "vitest";
import { atomicToUsdc, getPaymentStack } from "@/lib/payments";
import { invertedTimestamp, KV_KEYS } from "@/lib/kv-keys";
import { listConfessions, setConfessionStatus } from "@/services/confessions";
import { listTags, setTagStatus } from "@/services/train";
import { listClosers } from "@/services/closers";
import { getLucky, setLuckyStatus, verifyLuckySignature } from "@/services/luckies";
import { purchaseIdentity, purchaseIntentStore, type PurchaseIntent } from "@/services/purchase-intent";
import { installLaborAdmissionHarness, laborNetworks, sendLabor, signLabor, transfers, type LaborDoor } from "./labor-admission";
import { items, shelves, call, object, request, sourceEnv, testEnv, NOW, type Obj } from "./buyer-harness";
import { evmBuyer, solBuyer } from "./buyer-signed-payments";

installLaborAdmissionHarness();
let fault = "", hits = 0;
let prepared: Obj | undefined;
const failure = () => { hits++; throw new Error("fixture durable write acknowledgement unavailable"); };
const prefixes = [KV_KEYS.confessionPrefix, KV_KEYS.closerPrefix, KV_KEYS.trainTagPrefix, KV_KEYS.lucky("")];
vi.mock("@/lib/kv-retry", async original => {
  const actual = await original<typeof import("@/lib/kv-retry")>();
  return { ...actual, kvPut: async (...args: Parameters<typeof actual.kvPut>) => {
    const product = prefixes.some(prefix => args[1].startsWith(prefix));
    if (product && fault === "publication-before") failure();
    await actual.kvPut(...args);
    if (product && fault === "publication-after") failure();
  } };
});
vi.mock("@/lib/signing", async original => {
  const actual = await original<typeof import("@/lib/signing")>();
  return { ...actual, signMessage: async (...args: Parameters<typeof actual.signMessage>) => {
    if (fault === "lucky-signing" && args[0].includes('"lucky_id"')) failure();
    return actual.signMessage(...args);
  } };
});
vi.mock("@/services/certificates", async original => {
  const actual = await original<typeof import("@/services/certificates")>();
  return { ...actual, mintCertificate: async (...args: Parameters<typeof actual.mintCertificate>) => {
    if (fault === "certificate-before") failure();
    const saved = await actual.mintCertificate(...args);
    if (fault === "certificate-after") failure();
    return saved;
  } };
});
beforeAll(() => {
  const namespace = testEnv.PAID_RECOVERIES!;
  testEnv.PAID_RECOVERIES = new Proxy(namespace, { get(target, property) {
    if (property === "get") return (...args: Parameters<typeof namespace.get>) => {
      const stub = target.get(...args);
      return new Proxy(stub, { get(inner, method) {
        if (method === "artifactStage") return async (...a: Parameters<typeof inner.artifactStage>) => {
          if (a[2] !== undefined && fault === `${a[1]}-before`) failure();
          const saved = await inner.artifactStage(...a);
          if (a[1] === "personal_record" && saved) prepared = object(JSON.parse(saved));
          if (a[2] !== undefined && fault === `${a[1]}-after`) failure();
          return saved;
        };
        if (method === "publishPersonalRecord") return async (...a: Parameters<typeof inner.publishPersonalRecord>) => {
          if (fault === "record-before") failure();
          const saved = await inner.publishPersonalRecord(...a);
          if (fault === "record-after") failure();
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
beforeEach(() => { fault = ""; hits = 0; prepared = undefined; vi.setSystemTime(NOW); });
type PersonalItem = "the_confession" | "coffees_for_closers" | "graffiti_on_a_train" | "luckies";
const doors = ["http", "mcp", "mcp-standard"] as const;
async function purchase(id: PersonalItem, door: LaborDoor, rail = 0) {
  const item = items.find(i => i.id === id)!, network = laborNetworks()[rail]!;
  const canary = `SCVD-E2E-${NOW.getTime()}-${crypto.randomUUID()}`;
  const text = `${canary} π & 🚀`;
  const args: Obj = { purpose: canary,
    ...(id === "the_confession" ? { confession: text, sign_as: "anonymous" } : {}),
    ...(id === "coffees_for_closers" ? { win: text } : {}),
    ...(id === "graffiti_on_a_train" ? { tag: text } : {}),
  };
  const quote = await call(item, "mcp", args, shelves(item)[0]);
  const offer = quote.offers.find(o => o.network === network);
  expect(offer, JSON.stringify(quote.body)).toBeDefined();
  const signed = await signLabor(offer!), payer = network.startsWith("eip155:") ? evmBuyer.address.toLowerCase() : solBuyer;
  const identity = await purchaseIdentity(network, payer, signed);
  return { id, text, args, network, stub: purchaseIntentStore(sourceEnv, identity.id),
    send: (changed: Obj = args) => sendLabor(id, door, changed, signed) };
}
type Purchase = Awaited<ReturnType<typeof purchase>>;
async function row(p: Purchase) {
  if (p.id === "the_confession") return (await listConfessions(sourceEnv)).find(r => r.record.confession === p.text)?.record;
  if (p.id === "graffiti_on_a_train") return (await listTags(sourceEnv)).find(r => r.record.tag === p.text)?.record;
  if (p.id === "coffees_for_closers") return (await listClosers(sourceEnv)).find(r => r.win === p.text);
  const keys = await sourceEnv.PATRONS.list({ prefix: KV_KEYS.lucky("") });
  expect(keys.keys).toHaveLength(1);
  return sourceEnv.PATRONS.get(keys.keys[0]!.name, "json");
}
async function assertGood(p: Purchase, body: Obj, original?: Obj) {
  const cert = object(JSON.parse(String(body.signed_payload)));
  expect(cert.purpose).toBe(p.args.purpose);
  expect(object(await (await request(String(body.verify_url))).json()).valid).toBe(true);
  const saved = object(await row(p));
  expect(Object.keys(saved).length).toBeGreaterThan(0);
  if (original) expect(saved).toEqual(original.record);
  if (p.id === "the_confession") {
    expect(saved).toMatchObject({ confession: p.text, date: NOW.toISOString() });
    expect(body.confession_id).toBe(saved.id);
    expect(JSON.stringify(cert)).not.toContain(p.text);
    expect(saved).not.toHaveProperty("cert_id");
    expect(saved).not.toHaveProperty("payer");
  } else if (p.id === "graffiti_on_a_train") {
    expect(saved).toMatchObject({ tag: p.text, cert_id: cert.cert_id, date: NOW.toISOString() });
    expect(cert.tag).toBe(p.text);
  } else if (p.id === "coffees_for_closers") {
    expect(saved).toMatchObject({ win: p.text, at: NOW.toISOString() });
    expect(cert.win).toBe(p.text);
    expect(body.win_recorded).toBe(p.text);
  } else {
    const lucky = await getLucky(sourceEnv, String(body.lucky_id));
    expect(lucky!.lucky).toMatchObject({ cert_id: cert.cert_id, date: NOW.toISOString() });
    expect(await verifyLuckySignature(lucky!)).toBe(true);
    expect((await request(String(body.card_url))).status).toBe(200);
    expect((await request(String(body.record_url))).status).toBe(200);
  }
}
async function recover(p: Purchase, original?: Obj) {
  expect(await runDurableObjectAlarm(p.stub)).toBe(true);
  const record = JSON.parse((await p.stub.existingPurchase())!) as PurchaseIntent;
  const status = object(await (await request(`/api/purchase-status/${record.id}`, { headers: { Authorization: `Bearer ${record.token}` } })).json());
  expect(status).toMatchObject({ charged: true, payment_state: "settled", delivery_state: "delivered" });
  await assertGood(p, object(status.fulfillment), original);
  return object(status.fulfillment);
}
// Each product gets its own Worker fixture. The assertions stay shared, while
// retained Durable Objects from hundreds of cases cannot crowd one isolate.
export function personalGoodsRecovery(item: PersonalItem): void {
const ids: readonly PersonalItem[] = [item];
for (const id of ids) for (const door of doors) for (const [rail] of laborNetworks().entries()) {
  for (const point of ["certificate-before", "certificate-after", "personal_record-before", "personal_record-after", "publication-before", "publication-after", "response-before"]) it(`${id} ${door} rail ${rail}: ${point} recovers the purchased good`, async () => {
    const p = await purchase(id, door, rail);
    fault = point;
    const first = await p.send();
    expect(first.refused).toBe(true);
    expect(first.body.charged).toBe(true);
    expect(hits).toBeGreaterThan(0);
    expect(transfers).toBe(1);
    const original = prepared ? structuredClone(prepared) : undefined;
    fault = ""; vi.setSystemTime(new Date(NOW.getTime() + 86400_000));
    await recover(p, original);
    expect(transfers).toBe(1);
  });
}
for (const id of ids) for (const door of doors) {
  it(`${id} ${door}: changed-input replay refuses and original retry returns the same good`, async () => {
    const p = await purchase(id, door);
    fault = "response-before";
    expect((await p.send()).body.charged).toBe(true);
    const original = structuredClone(prepared!);
    fault = "";
    expect((await p.send({ ...p.args, purpose: "wrong" })).refused).toBe(true);
    const again = await p.send();
    expect(again.refused, JSON.stringify(again.body)).toBe(false);
    await assertGood(p, again.body, original);
    expect(transfers).toBe(1);
  });
  it(`${id} ${door}: concurrent duplicate requests settle once`, async () => {
    const p = await purchase(id, door);
    const results = await Promise.all([p.send(), p.send()]);
    expect(results.some(r => !r.refused)).toBe(true);
    await recover(p, prepared);
    expect(transfers).toBe(1);
  });
  it(`${id} ${door}: persistent storage loss stays owed until publication returns`, async () => {
    const p = await purchase(id, door);
    fault = "publication-before";
    expect((await p.send()).body.charged).toBe(true);
    const original = structuredClone(prepared!);
    expect(await runDurableObjectAlarm(p.stub)).toBe(true);
    const owed = JSON.parse((await p.stub.existingPurchase())!) as PurchaseIntent;
    expect(owed.state).toBe("settled");
    expect(owed.delivery).toBeUndefined();
    fault = "";
    await recover(p, original);
    expect(transfers).toBe(1);
  });
}
for (const id of ids) for (const door of doors) for (const [rail] of laborNetworks().entries()) {
  it(`${id} ${door} rail ${rail}: lost settlement acknowledgement preserves original inputs`, async () => {
    const p = await purchase(id, door, rail), stack = getPaymentStack(testEnv);
    const settle = stack.httpServer.processSettlement.bind(stack.httpServer);
    let receipt: Awaited<ReturnType<typeof settle>> | undefined;
    const spy = vi.spyOn(stack.httpServer, "processSettlement").mockImplementation(async (...args) => {
      if (!receipt) receipt = await settle(...args);
      throw new TypeError("fixture drops confirmed settlement answer");
    });
    try {
      const first = await p.send();
      expect(first.body.charged).toBeNull();
      expect(transfers).toBe(1);
      const saved = JSON.parse((await p.stub.existingPurchase())!) as PurchaseIntent;
      expect(saved.state).toBe("unknown");
      if (!receipt?.success) throw new Error("Fixture did not settle");
      await p.stub.updatePurchase({ state: "settled", payment: { transaction: receipt.transaction, network: p.network,
        payer: saved.payer, paidUsdc: atomicToUsdc(saved.terms.amount), tipUsdc: 0, settleHeaders: receipt.headers } });
      vi.setSystemTime(new Date(NOW.getTime() + 86400_000));
      await recover(p);
      expect(transfers).toBe(1);
    } finally { spy.mockRestore(); }
  });
}
if (item === "luckies") for (const door of doors) it(`luckies ${door}: signing failure recovers the original purchase`, async () => {
  const p = await purchase("luckies", door);
  fault = "lucky-signing";
  expect((await p.send()).body.charged).toBe(true);
  expect(hits).toBeGreaterThan(0);
  fault = "";
  await recover(p);
  expect(transfers).toBe(1);
});
for (const id of ids) {
  if (id === "coffees_for_closers") continue;
  for (const legacy of [false, true]) for (const interrupted of [false, true]) it(`${id}: legacy=${legacy} recovery preserves the keeper's decision even when its publication fails (${interrupted})`, async () => {
    const p = await purchase(id, "http");
    fault = "response-before";
    expect((await p.send()).body.charged).toBe(true);
    const original = structuredClone(prepared!);
    if (legacy) {
      // A pre-journal record exists only in KV. Its first keeper decision
      // must adopt that original record without resetting its lifecycle.
      const ns = id === "luckies" ? sourceEnv.PATRONS : sourceEnv.ORDERS;
      const prefix = id === "luckies" ? KV_KEYS.lucky("") : id === "the_confession" ? KV_KEYS.confessionPrefix : KV_KEYS.trainTagPrefix;
      const key = (await ns.list({ prefix })).keys[0]!.name;
      const coordinator = sourceEnv.PAID_RECOVERIES!.get(sourceEnv.PAID_RECOVERIES!.idFromName(`personal:${key}`));
      await runInDurableObject(coordinator, async (_instance, state) => { await state.storage.delete("personal"); });
    }
    fault = interrupted ? "publication-before" : "";
    const r = object(original.record);
    const mutate = id === "the_confession" ? () => setConfessionStatus(sourceEnv, String(r.id), "printed")
      : id === "graffiti_on_a_train" ? () => setTagStatus(sourceEnv, String(r.id), "approved")
      : () => setLuckyStatus(sourceEnv, String(object(r.lucky).lucky_id), "promoted", "earned it");
    if (interrupted) await expect(mutate()).rejects.toThrow(); else await mutate();
    fault = "";
    for (const ns of [sourceEnv.ORDERS, sourceEnv.PATRONS]) for (const prefix of prefixes) {
      for (const key of (await ns.list({ prefix })).keys) await ns.delete(key.name);
    }
    await recover(p);
    const current = object(await row(p));
    expect(id === "luckies" ? object(current.lucky).status : current.status).toBe(id === "the_confession" ? "printed" : id === "luckies" ? "promoted" : "approved");
    if (id === "graffiti_on_a_train") expect(current.displayed_at).toBe(NOW.toISOString());
    expect(transfers).toBe(1);
  });
}
if (item === "coffees_for_closers") it("coffees_for_closers: two purchases in the same millisecond keep both wins", async () => {
  const a = await purchase("coffees_for_closers", "http"), b = await purchase("coffees_for_closers", "http");
  expect((await a.send()).refused).toBe(false);
  expect((await b.send()).refused).toBe(false);
  const rows = await listClosers(sourceEnv);
  expect(rows.map(r => r.win).sort()).toEqual([a.text, b.text].sort());
  expect(new Set(rows.map(r => r.id)).size).toBe(2);
  expect(transfers).toBe(2);
});
if (item === "coffees_for_closers") it("coffees_for_closers: recovery cannot renew the 90-day Sunday listing", async () => {
  const p = await purchase("coffees_for_closers", "http");
  fault = "response-before";
  expect((await p.send()).body.charged).toBe(true);
  fault = ""; vi.setSystemTime(new Date(NOW.getTime() + 91 * 86400_000));
  for (const k of (await sourceEnv.ORDERS.list({ prefix: KV_KEYS.closerPrefix })).keys) await sourceEnv.ORDERS.delete(k.name);
  expect(await runDurableObjectAlarm(p.stub)).toBe(true);
  const saved = JSON.parse((await p.stub.existingPurchase())!) as PurchaseIntent;
  expect(object(saved.delivery).win_recorded).toBe(p.text);
  expect(await listClosers(sourceEnv)).toEqual([]);
  expect((await sourceEnv.ORDERS.list({ prefix: KV_KEYS.closerPrefix })).keys).toEqual([]);
  expect(transfers).toBe(1);
});

for (const id of ids) for (const door of doors) for (const point of ["record-before", "record-after"]) {
  it(`${id} ${door}: ${point} retains one record across coordinator interruption`, async () => {
    const p = await purchase(id, door);
    fault = point;
    expect((await p.send()).body.charged).toBe(true);
    expect(hits).toBeGreaterThan(0);
    const original = structuredClone(prepared!);
    fault = "";
    await recover(p, original);
    expect(transfers).toBe(1);
  });
}

for (const kind of ["confession", "tag"] as const) if ((kind === "confession" && item === "the_confession") || (kind === "tag" && item === "graffiti_on_a_train")) it(`${kind}: legacy moderation updates its actual key when the two old clock reads differ`, async () => {
  const id = `legacy_${crypto.randomUUID()}`, text = `SCVD-E2E-${NOW.getTime()}-${id}`;
  const record = kind === "confession" ? { id, confession: text, date: NOW.toISOString(), status: "pending_review" }
    : { id, tag: text, date: NOW.toISOString(), status: "pending_review", cert_id: "legacy-cert", patron_number: 1 };
  const later = NOW.getTime() + 2;
  const key = kind === "confession" ? KV_KEYS.confession(invertedTimestamp(later), id) : KV_KEYS.trainTag(String(later).padStart(14, "0"), id);
  await sourceEnv.ORDERS.put(key, JSON.stringify(record));
  const changed = kind === "confession" ? await setConfessionStatus(sourceEnv, id, "approved") : await setTagStatus(sourceEnv, id, "approved");
  expect(changed?.status).toBe("approved");
  expect(object(await sourceEnv.ORDERS.get(key, "json")).status).toBe("approved");
  const prefix = kind === "confession" ? KV_KEYS.confessionPrefix : KV_KEYS.trainTagPrefix;
  expect((await sourceEnv.ORDERS.list({ prefix })).keys.map(k => k.name)).toEqual([key]);
});
for (const id of ids) for (const door of doors) for (const [rail] of laborNetworks().entries()) {
  it(`${id} ${door} rail ${rail}: the buyer can verify the purchased subject`, async () => {
    const p = await purchase(id, door, rail);
    const first = await p.send();
    expect(first.refused, JSON.stringify(first.body)).toBe(false);
    await assertGood(p, first.body);
    expect(transfers).toBe(1);
  });
}

}
