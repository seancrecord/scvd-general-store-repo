import { runDurableObjectAlarm } from "cloudflare:test";
import { beforeAll, beforeEach, expect, it, vi } from "vitest";
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
let reportKey = "", pageReads = 0;
// Run the real instruments and signing code against local pages. A second
// observation after settlement is forbidden, even if the upstream later works.
const page: typeof fetch = async () => {
  pageReads++;
  return new Response('<!doctype html><html lang="en"><head><title>Buyer fixture</title></head><body>Original evidence</body></html>', { headers: { "Content-Type": "text/html" } });
};
function observing() {
  reads++;
  if (unavailable) throw new Error("fixture target disappeared after settlement");
}
vi.mock("@/services/service-audit", async original => {
  const actual = await original<typeof import("@/services/service-audit")>();
  return { ...actual, performServiceAudit: async (...args: Parameters<typeof actual.performServiceAudit>) => {
    observing();
    const report = await actual.performServiceAudit(args[0], args[1], { fetch: page });
    observed = object(report);
    return report;
  } };
});
vi.mock("@/services/good-buyer", async original => {
  const actual = await original<typeof import("@/services/good-buyer")>();
  return { ...actual, performGoodBuyerReading: async (...args: Parameters<typeof actual.performGoodBuyerReading>) => {
    observing();
    const report = await actual.performGoodBuyerReading(args[0], args[1], args[2], { fetch: page });
    observed = object(report);
    return report;
  } };
});
vi.mock("@/services/bot-auth-card", async original => {
  const actual = await original<typeof import("@/services/bot-auth-card")>();
  return { ...actual, performSignatureAgentCard: async (...args: Parameters<typeof actual.performSignatureAgentCard>) => {
    observing();
    const report = await actual.performSignatureAgentCard(args[0], args[1], { fetch: page });
    observed = object(report);
    return report;
  } };
});
vi.mock("@/services/onpage-audit", async original => {
  const actual = await original<typeof import("@/services/onpage-audit")>();
  return { ...actual, performOnpageAudit: async (...args: Parameters<typeof actual.performOnpageAudit>) => {
    observing();
    const report = await actual.performOnpageAudit(args[0], args[1], { fetch: page });
    observed = object(report);
    return report;
  } };
});
vi.mock("@/services/certificates", async original => {
  const actual = await original<typeof import("@/services/certificates")>();
  return { ...actual, mintCertificate: async (...args: Parameters<typeof actual.mintCertificate>) => {
    const minted = await actual.mintCertificate(...args);
    if (fault === "certificate-after") { hits++; throw new Error("fixture certificate publication acknowledgement lost"); }
    return minted;
  } };
});
beforeAll(() => {
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
            const report = object(prepared[product.snapshot]);
            reportKey = product.key(String(report[product.idField]));
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
beforeEach(() => { fault = ""; hits = 0; reads = 0; unavailable = false; prepared = observed = published = undefined; reportKey = ""; pageReads = 0; vi.setSystemTime(NOW); });
const goods = [
  { id: "service_audit", snapshot: "serviceAudit", field: "audit", idField: "audit_id", urlField: "report_url", subject: "url", key: KV_KEYS.serviceAudit },
  { id: "good_buyer", snapshot: "goodBuyer", field: "reading", idField: "reading_id", urlField: "report_url", subject: "url", key: KV_KEYS.goodBuyerReading },
  { id: "signature_agent_card", snapshot: "signatureAgentCard", field: "card", idField: "card_id", urlField: "card_url", subject: "subject", key: KV_KEYS.signatureAgentCard },
  { id: "onpage_audit", snapshot: "onpageAudit", field: "audit", idField: "audit_id", urlField: "report_url", subject: "url", key: KV_KEYS.onpageAudit },
];
let product = goods[0]!;
const doors = ["http", "mcp", "mcp-standard"] as const;
async function purchase(id: string, door: LaborDoor, rail: number) {
  product = goods.find(g => g.id === id)!;
  const item = items.find(i => i.id === id)!, network = laborNetworks()[rail]!;
  const canary = `SCVD-E2E-${crypto.randomUUID()}`;
  const args = { url: `https://buyer-fixture.example/${canary}?label=original`, purpose: canary,
    ...(id === "good_buyer" ? { max_usd: "0.37" } : {}) };
  const offer = (await call(item, "mcp", args, shelves(item)[0])).offers.find(o => o.network === network)!;
  const signed = await signLabor(offer), payer = network.startsWith("eip155:") ? evmBuyer.address.toLowerCase() : solBuyer;
  const identity = extractPaymentNonce(signed) ?? object(signed.payload).transaction;
  const key = await sha256Hex(jcsCanonicalize({ network, payer, identity }));
  return { canary, args, stub: purchaseIntentStore(sourceEnv, key), send: (changed: Obj = args) => sendLabor(id, door, changed, signed) };
}
async function assertGood(body: Obj, expected: Obj, url: string, canary: string) {
  const actual = object(body[product.field]);
  expect(actual).toEqual(expected);
  expect(actual[product.subject]).toBe(url);
  expect(actual.observed_at).toBe(NOW.toISOString());
  const entries = Object.entries(actual), end = entries.findIndex(([key]) => key === "signature");
  expect(end).toBeGreaterThan(0);
  const unsigned = Object.fromEntries(entries.slice(0, end));
  expect(await verifyMessageSignature(JSON.stringify(unsigned), String(actual.signature), String(actual.public_key))).toBe(true);
  expect(await verifyMessageSignature(JSON.stringify({ ...unsigned, [product.subject]: "https://wrong.example/" }), String(actual.signature), String(actual.public_key))).toBe(false);
  if (product.id === "good_buyer") expect(actual.client_profile_as_declared).toEqual({ max_amount_per_payment_usd: 0.37 });
  const cert = object(body.certificate);
  expect(cert.purpose).toBe(canary);
  expect(cert.attests).toBe(actual.evidence_hash);
  const verified = object(await (await request(String(body.verify_url))).json());
  expect(verified.valid).toBe(true);
  const response = await request(String(body[product.urlField]));
  expect(response.status).toBe(200);
  const publicReport = object(await response.json());
  expect(publicReport).toMatchObject({ [product.field]: expected, cert_id: cert.cert_id, created_at: NOW.toISOString() });
  expect(body[product.idField]).toBe(expected[product.idField]);
}
for (const { id } of goods) for (const door of doors) for (const [rail] of laborNetworks().entries()) {
  for (const point of ["certificate-after", "report-before", "report-after", "response-before"]) it(`${id} ${door} rail ${rail}: ${point} recovers original signed evidence with upstream down`, async () => {
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
    expect(pageReads).toBeGreaterThan(0);
    expect(original.verdict).not.toMatch(/unreachable|refused/);
    const readsBefore = reads;
    fault = ""; unavailable = true; vi.setSystemTime(new Date(NOW.getTime() + 86400_000));
    expect(await runDurableObjectAlarm(p.stub)).toBe(true);
    const record = JSON.parse((await p.stub.existingPurchase())!) as PurchaseIntent;
    const status = object(await (await request(`/api/purchase-status/${record.id}`, { headers: { Authorization: `Bearer ${record.token}` } })).json());
    expect(status).toMatchObject({ charged: true, payment_state: "settled", delivery_state: "delivered" });
    await assertGood(object(status.fulfillment), original, p.args.url, p.canary);
    expect(reads).toBe(readsBefore);
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
    const wrong = await p.send({ ...p.args, url: "https://wrong.example/different-purchase" });
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
    await assertGood(object(record.delivery), object(prepared![product.snapshot]), p.args.url, p.canary);
    expect(reads).toBe(readsBefore);
    expect(transfers).toBe(1);
  });
}
