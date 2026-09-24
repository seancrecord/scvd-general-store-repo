import { beforeAll, beforeEach, expect, it, vi } from "vitest";
import { installLaborAdmissionHarness, laborNetworks, sendLabor, signLabor, transfers } from "./helpers/labor-admission";
import { items, shelves, call, object, request, NOW, type Obj } from "./helpers/buyer-harness";
import { verifyMessageSignature } from "@/lib/signing";
import { sha256Hex } from "@/lib/idempotency";

installLaborAdmissionHarness();
let certificateFault = false, unavailable = false, allRefused = false, probes = 0;
let original: Obj | undefined;
vi.mock("@/services/certificates", async original => {
  const actual = await original<typeof import("@/services/certificates")>();
  return { ...actual, mintCertificate: async (...args: Parameters<typeof actual.mintCertificate>) => {
    if (certificateFault) throw new Error("fixture certificate unavailable after settlement");
    return actual.mintCertificate(...args);
  } };
});
vi.mock("@/services/research-comparison", async load => {
  const actual = await load<typeof import("@/services/research-comparison")>();
  return { ...actual, performResearchComparison: async (...args: Parameters<typeof actual.performResearchComparison>) => {
    const report = await actual.performResearchComparison(...args);
    original = object(report);
    return report;
  } };
});
vi.mock("@/services/preflight", async load => {
  const actual = await load<typeof import("@/services/preflight")>();
  return { ...actual, preflightUrl: async (...args: Parameters<typeof actual.preflightUrl>) =>
    allRefused ? { status: 429, body: { error: "fixture budget exhausted", code: "budget_spent" } } : actual.preflightUrl(...args) };
});
const URLS = ["https://alpha.example/research", "https://beta.example/research"];
const args = { urls: JSON.stringify(URLS) };
beforeAll(() => {
  const inner = globalThis.fetch;
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    if (["alpha.example", "beta.example"].includes(url.hostname)) {
      probes++;
      if (unavailable) throw new Error("fixture endpoint changed or vanished");
      const headers = new Headers(input instanceof Request ? input.headers : init?.headers);
      expect(headers.get("PAYMENT-SIGNATURE")).toBeNull();
      expect(headers.get("Authorization")).toBeNull();
      return new Response("{}", { status: 402, headers: { "PAYMENT-REQUIRED": btoa(JSON.stringify({ x402Version: 2, accepts: [{
        scheme: "exact", network: "eip155:8453", amount: url.hostname === "alpha.example" ? "12000" : "9000",
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", payTo: `0x${"ab".repeat(20)}`,
        maxTimeoutSeconds: 60,
      }] })) } });
    }
    return inner(input, init);
  });
});
beforeEach(() => { certificateFault = false; unavailable = false; allRefused = false; probes = 0; original = undefined; vi.setSystemTime(NOW); });

for (const door of ["http", "mcp", "mcp-standard"] as const) {
  it(`${door}: purchases one signed comparison, then retrieves the same bytes after the endpoints change`, async () => {
    const item = items.find(row => row.id === "research_comparison")!;
    const offer = (await call(item, "mcp", args, shelves(item)[0])).offers.find(offer => offer.network === laborNetworks()[0])!;
    const signed = await signLabor(offer);
    const first = await sendLabor(item.id, door, args, signed);
    expect(first.refused, JSON.stringify(first.body)).toBe(false);
    expect(probes).toBe(URLS.length);
    expect(transfers).toBe(1);
    const record = object(first.body.research_comparison);
    expect((record.rows as Obj[]).map(row => row.url)).toEqual(URLS);
    const verified = object(await (await request(String(first.body.verify_url))).json());
    expect(verified.valid).toBe(true);
    expect(object(verified.certificate).attests).toBe(first.body.evidence_hash);
    const proof = object(first.body.observation);
    expect(await sha256Hex(String(proof.signed_payload))).toBe(first.body.evidence_hash);
    expect(await verifyMessageSignature(String(proof.signed_payload), String(proof.signature), String(proof.public_key))).toBe(true);
    expect(first.body.observation).toEqual(original);
    expect(String(first.body.how_to_verify)).toContain("observation.signature_jcs");
    unavailable = true;
    const retry = await sendLabor(item.id, door, args, signed);
    expect(retry.refused, JSON.stringify(retry.body)).toBe(false);
    expect(retry.body.observation).toEqual(first.body.observation);
    expect(probes).toBe(URLS.length);
    expect(transfers).toBe(1);
  });

  it(`${door}: a post-settlement failure recovers the original comparison without probing or paying again`, async () => {
    const item = items.find(row => row.id === "research_comparison")!;
    const offer = (await call(item, "mcp", args, shelves(item)[0])).offers.find(offer => offer.network === laborNetworks()[0])!;
    const signed = await signLabor(offer);
    certificateFault = true;
    const first = await sendLabor(item.id, door, args, signed);
    expect(first.body.charged, JSON.stringify(first.body)).toBe(true);
    expect(transfers).toBe(1);
    const saved = structuredClone(original);
    certificateFault = false; unavailable = true;
    const changed = await sendLabor(item.id, door, { urls: JSON.stringify([URLS[0], "https://other.example/research"]) }, signed);
    expect(changed.refused).toBe(true);
    const retry = await sendLabor(item.id, door, args, signed);
    expect(retry.refused, JSON.stringify(retry.body)).toBe(false);
    expect(retry.body.observation).toEqual(saved);
    expect(probes).toBe(URLS.length);
    expect(transfers).toBe(1);
  });

  it(`${door}: refuses a private target before probing or settling`, async () => {
    const item = items.find(row => row.id === "research_comparison")!;
    const offer = (await call(item, "mcp", args, shelves(item)[0])).offers[0]!;
    const signed = await signLabor(offer);
    const refused = await sendLabor(item.id, door, { urls: JSON.stringify([URLS[0], "https://169.254.169.254/"]) }, signed);
    expect(refused.refused).toBe(true);
    expect(refused.body.charged).toBe(false);
    expect(probes).toBe(0);
    expect(transfers).toBe(0);
  });

  it(`${door}: a wholly unavailable instrument returns an explicit uncharged refusal`, async () => {
    const item = items.find(row => row.id === "research_comparison")!;
    const offer = (await call(item, "mcp", args, shelves(item)[0])).offers[0]!;
    const signed = await signLabor(offer);
    allRefused = true;
    const refused = await sendLabor(item.id, door, args, signed);
    expect(refused.refused).toBe(true);
    expect(refused.body).toMatchObject({ charged: false, code: "upstream_unavailable", settlement_attempted: false });
    expect(transfers).toBe(0);
  });
}
