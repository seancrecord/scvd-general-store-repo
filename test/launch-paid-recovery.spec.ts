import { runDurableObjectAlarm } from "cloudflare:test";
import { beforeAll, beforeEach, expect, it, vi } from "vitest";
import { verifyMessageSignature } from "@/lib/signing";
import { KV_KEYS } from "@/lib/kv-keys";
import { purchaseIdentity, purchaseIntentStore, type PurchaseIntent } from "@/services/purchase-intent";
import type { LaunchCheckCore, SignedLaunchCheck } from "@/services/launch-check";
import { installLaborAdmissionHarness, laborNetworks, sendLabor, signLabor, transfers, type LaborDoor } from "./helpers/labor-admission";
import { items, shelves, call, object, request, sourceEnv, testEnv, NOW, type Obj } from "./helpers/buyer-harness";
import { evmBuyer, solBuyer } from "./helpers/buyer-signed-payments";

installLaborAdmissionHarness();
let fault = "", hits = 0, walks = 0;
let original: LaunchCheckCore | undefined;
let header: string | undefined;
const payments = new Set<string>();
const fail = () => { hits++; throw new Error("fixture launch interruption"); };
vi.mock("@/services/launch-check", async load => {
  const actual = await load<typeof import("@/services/launch-check")>();
  return { ...actual, performLaunchCheck: async (...args: Parameters<typeof actual.performLaunchCheck>) => {
    walks++;
    const options = args[2];
    return actual.performLaunchCheck(args[0], args[1], { ...options,
      signer: await actual.fieldSignerFromKey(testEnv.FIELD_WALLET_KEY!),
      screen: async () => ({ listed: false, source: "local clear screen" }),
      fetch: async (_url, init) => {
        const paid = new Headers(init?.headers).get("PAYMENT-SIGNATURE");
        if (!paid) return Response.json({ x402Version: 2, accepts: [{ scheme: "exact", network: "eip155:8453", amount: "10000", asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", payTo: "0x2222222222222222222222222222222222222222", maxTimeoutSeconds: 60, extra: { name: "USD Coin", version: "2" } }] }, { status: 402 });
        header = paid;
        if (payments.has(paid)) return Response.json({ error: "already spent" }, { status: 402 });
        payments.add(paid);
        if (fault === "timeout") throw new Error("response lost after seller accepted payment");
        if (fault === "body-reset") return new Response(new ReadableStream({ start(controller) { controller.error(new Error("body lost")); } }));
        return Response.json({ good: "the original upstream good" });
      },
      retain: options?.retain ? async (stage, core) => {
        if (fault === `${stage}-before`) fail();
        await options.retain!(stage, core);
        original = structuredClone(core);
        if (fault === `${stage}-after`) fail();
      } : undefined,
    });
  } };
});
vi.mock("@/lib/signing", async load => {
  const actual = await load<typeof import("@/lib/signing")>();
  return { ...actual, signMessage: async (...args: Parameters<typeof actual.signMessage>) => {
    if (fault === "report-signing" && args[0].includes('"check_id":"lcheck_')) fail();
    return actual.signMessage(...args);
  } };
});
vi.mock("@/lib/kv-retry", async load => {
  const actual = await load<typeof import("@/lib/kv-retry")>();
  return { ...actual, kvPut: async (...args: Parameters<typeof actual.kvPut>) => {
    const kind = args[1].startsWith(KV_KEYS.launchCheck("")) ? "report" : args[1].startsWith(KV_KEYS.openingDay("")) ? "bundle" : args[1].startsWith(KV_KEYS.conformanceWatchPrefix) ? "watch" : "";
    if (kind && fault === `${kind}-before`) fail();
    await actual.kvPut(...args);
    if (kind && fault === `${kind}-after`) fail();
  } };
});
vi.mock("@/services/certificates", async load => {
  const actual = await load<typeof import("@/services/certificates")>();
  return { ...actual, mintCertificate: async (...args: Parameters<typeof actual.mintCertificate>) => {
    if (fault === "certificate-before") fail();
    const minted = await actual.mintCertificate(...args);
    if (fault === "certificate-after") fail();
    return minted;
  } };
});
beforeAll(() => {
  const namespace = testEnv.PAID_RECOVERIES!;
  testEnv.PAID_RECOVERIES = new Proxy(namespace, { get(target, property) {
    if (property === "get") return (...args: Parameters<typeof namespace.get>) => {
      const stub = target.get(...args);
      return new Proxy(stub, { get(inner, method) {
        if (method === "artifactStage") return async (...a: Parameters<typeof inner.artifactStage>) => {
          if (a[2] !== undefined && fault === `${a[1]}-before`) fail();
          const saved = await inner.artifactStage(...a);
          if (a[2] !== undefined && fault === `${a[1]}-after`) fail();
          return saved;
        };
        if (method === "retainObservation") return async (...a: Parameters<typeof inner.retainObservation>) => {
          if (a[2] !== undefined && fault === "observe-save-before") fail();
          const saved = await inner.retainObservation(...a);
          if (a[2] !== undefined && fault === "observe-save-after") fail();
          return saved;
        };
        if (method === "prepareLaunchCheck") return async (...a: Parameters<typeof inner.prepareLaunchCheck>) => {
          const saved = await inner.prepareLaunchCheck(...a);
          if (fault === "rpc-after") fail();
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
beforeEach(() => { fault = ""; hits = 0; walks = 0; original = undefined; header = undefined; payments.clear(); vi.setSystemTime(NOW); });
async function purchase(id: string, door: LaborDoor, rail = 0) {
  const item = items.find(i => i.id === id)!, network = laborNetworks()[rail]!;
  const canary = `SCVD-E2E-${NOW.getTime()}-${crypto.randomUUID()}`;
  const args = { url: `https://buyer-fixture.example/api/paid?subject=${canary}`, purpose: canary };
  const quote = await call(item, "mcp", args, shelves(item)[0]);
  const offer = quote.offers.find(o => o.network === network);
  expect(offer, JSON.stringify(quote.body)).toBeDefined();
  const signed = await signLabor(offer!), payer = network.startsWith("eip155:") ? evmBuyer.address.toLowerCase() : solBuyer;
  const identity = await purchaseIdentity(network, payer, signed);
  return { id, args, stub: purchaseIntentStore(sourceEnv, identity.id), send: (changed: Obj = args) => sendLabor(id, door, changed, signed) };
}
type Purchase = Awaited<ReturnType<typeof purchase>>;
async function assertGood(p: Purchase, body: Obj) {
  const cert = object(JSON.parse(String(body.signed_payload)));
  expect(cert.cert_id).toBeTypeOf("string");
  expect(cert.purpose).toBe(p.args.purpose);
  expect(object(await (await request(String(body.verify_url))).json()).valid).toBe(true);
  const link = p.id === "opening_day" ? object(body.launch_check).check_url : body.check_url;
  const served = object(await (await request(String(link))).json());
  expect(served.created_at).toBe(NOW.toISOString());
  const check = served.check as SignedLaunchCheck;
  expect(check.url).toBe(p.args.url);
  expect(check.observed_at).toBe(NOW.toISOString());
  expect(cert.attests).toBe(check.evidence_hash);
  const { signature, public_key, signature_covers: _covers, ...observation } = check;
  expect(await verifyMessageSignature(JSON.stringify(observation), signature, public_key)).toBe(true);
  expect(await verifyMessageSignature(JSON.stringify({ ...observation, url: "https://wrong.example" }), signature, public_key)).toBe(false);
  if (original) expect(check.check_id).toBe(original.check_id);
  if (header) expect(check.payment_attempt?.nonce).toBe(object(object(object(JSON.parse(atob(header))).payload).authorization).nonce);
  expect(JSON.stringify(check)).not.toContain(header ?? "never-a-payment-header");
  if (p.id === "opening_day") {
    const bundle = object(await (await request(String(body.opening_day_url))).json());
    expect(bundle).toMatchObject({ url: p.args.url, opened_at: NOW.toISOString() });
    const history = object(await (await request(String(bundle.conformance_watch))).json());
    expect(history).toMatchObject({ url: p.args.url, ends_at: new Date(NOW.getTime() + 7 * 86400_000).toISOString() });
    const commission = object(history.commission);
    expect(JSON.parse(String(commission.signed_payload))).toMatchObject({ cert_id: cert.cert_id, item_id: p.id, url: p.args.url, started_at: NOW.toISOString() });
    expect(await verifyMessageSignature(String(commission.signed_payload), String(commission.signature), String(commission.public_key))).toBe(true);
    expect(object(body.conformance_watch).commission).toEqual(commission);
    expect((await sourceEnv.ORDERS.list({ prefix: KV_KEYS.conformanceWatchPrefix })).keys).toHaveLength(1);
  }
  return check;
}
async function recover(p: Purchase) {
  expect(await runDurableObjectAlarm(p.stub)).toBe(true);
  const record = JSON.parse((await p.stub.existingPurchase())!) as PurchaseIntent;
  const status = object(await (await request(`/api/purchase-status/${record.id}`, { headers: { Authorization: `Bearer ${record.token}` } })).json());
  expect(status).toMatchObject({ charged: true, payment_state: "settled", delivery_state: "delivered" });
  await assertGood(p, object(status.fulfillment));
  return object(status.fulfillment);
}
for (const id of ["launch_check", "opening_day"]) for (const door of ["http", "mcp", "mcp-standard"] as const) {
  for (const [rail] of laborNetworks().entries()) for (const point of ["certificate-before", "certificate-after", "report-before", "report-after", "response-before", ...(id === "opening_day" ? ["watch-before", "watch-after", "bundle-before", "bundle-after", "watch_record-before", "watch_record-after", "opening_day-before", "opening_day-after"] : [])]) {
    it(`${id} ${door} rail ${rail}: ${point} retains one original walk and purchase`, async () => {
      const p = await purchase(id, door, rail); fault = point;
      expect((await p.send()).body.charged).toBe(true); expect(hits).toBeGreaterThan(0);
      fault = ""; vi.setSystemTime(new Date(NOW.getTime() + 9 * 86400_000));
      await recover(p); expect(payments.size).toBe(1); expect(walks).toBe(1); expect(transfers).toBe(1);
      await p.send(); expect(payments.size).toBe(1); expect(transfers).toBe(1);
    });
  }
  for (const point of ["attempt-before", "attempt-after", "observation-before", "observation-after", "report-signing", "body-reset", "rpc-after", "observe-save-before", "observe-save-after"]) {
    it(`${id} ${door}: ${point} cannot repeat an upstream spend on retry`, async () => {
      const p = await purchase(id, door); fault = point;
      const failed = await p.send(); expect(failed.refused).toBe(true); expect(failed.body.charged).toBe(false); expect(transfers).toBe(0);
      const before = payments.size; fault = "";
      const body = (await p.send()).body; const check = await assertGood(p, body);
      expect(transfers).toBe(1);
      expect(payments.size).toBe(point === "attempt-before" ? 1 : before);
      if (["attempt-after", "observation-before", "body-reset"].includes(point)) expect(check.stages.map(s => s.detail).join(" ")).toContain("unknown");
    });
  }
  it(`${id} ${door}: accepted payment with a lost response remains unknown`, async () => {
    const p = await purchase(id, door); fault = "timeout";
    const body = (await p.send()).body; const check = await assertGood(p, body);
    expect(check.stages.map(s => s.detail).join(" ")).toContain("unknown");
    expect(check.stages.map(s => s.detail).join(" ")).not.toContain("never accepted");
    expect(check.payment_attempt?.settlement).toBe("unknown");
    fault = ""; await p.send(); expect(payments.size).toBe(1); expect(walks).toBe(1); expect(transfers).toBe(1);
  });
  it(`${id} ${door}: concurrent duplicates and changed targets never create a second walk`, async () => {
    const p = await purchase(id, door);
    await Promise.all([p.send(), p.send(), p.send()]);
    await assertGood(p, (await p.send()).body);
    expect((await p.send({ ...p.args, url: `${p.args.url}-wrong` })).refused).toBe(true);
    expect(payments.size).toBe(1); expect(walks).toBe(1); expect(transfers).toBe(1);
  });
}
