import { SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

import { installFacilitatorMock } from "./helpers/facilitator-mock";
beforeAll(() => installFacilitatorMock());
const BASE = "https://scvd.store";

describe("the A2A repair desk", () => {
  it("publishes its supported scope, price, instructions and gaps", async () => {
    const response = await SELF.fetch(`${BASE}/a2a-desk.json`);
    expect(response.status).toBe(200);
    const body = await response.json() as Record<string, unknown>;
    for (const key of ["what_this_is", "price", "how_to_call", "errors", "security"]) expect(body).toHaveProperty(key);
    expect(JSON.stringify(body)).toContain("0.3.0");
  });
  it("refuses a private target before making a free card request", async () => {
    const response = await SELF.fetch(`${BASE}/api/a2a/check`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://127.0.0.1/card" }),
    });
    expect(response.status).toBe(400);
  });
  it("requires the card URL before asking for payment", async () => {
    const response = await SELF.fetch(`${BASE}/api/buy/a2a_repair_kit`, { headers: { "PAYMENT-SIGNATURE": "invalid" } });
    expect(response.status).toBe(400);
  });
  it("has a human page with a walkable purchase path", async () => {
    const response = await SELF.fetch(`${BASE}/a2a-desk`, { headers: { Accept: "text/html" } });
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("/menu/a2a_repair_kit");
  });
});

import { afterEach, vi } from "vitest";
import { CARD_URL, AGENT, card, fixture } from "./helpers/a2a-fixture";
import { buildPaymentSignature, decodePaymentRequired } from "./helpers/payment";
import type { SignedA2AReading } from "@/services/a2a-kit";

afterEach(() => { vi.unstubAllGlobals(); installFacilitatorMock(); });
function stubAgent(options: Parameters<typeof fixture>[0] = {}) {
  const inner = globalThis.fetch; const f = fixture(options);
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    return url.startsWith(AGENT + "/") ? f.fetchImpl(url, init) : inner(input, init);
  });
  return f;
}
it("delivers the purchased kit, certificate binding, private recheck and readable report", async () => {
  stubAgent();
  const path = `${BASE}/api/buy/a2a_repair_kit?url=${encodeURIComponent(CARD_URL)}`;
  const challenge = await SELF.fetch(path); expect(challenge.status).toBe(402);
  const accepts = decodePaymentRequired(challenge).accepts;
  const paid = await SELF.fetch(path, { headers: { "PAYMENT-SIGNATURE": buildPaymentSignature(accepts[0]!) } });
  expect(paid.status).toBe(200);
  const body = await paid.json() as { report_url: string; report: SignedA2AReading; kit_id: string; certificate: { cert_id: string }; recheck: { body: { token: string }; url: string } };
  expect(body.report.observation.counts.fail).toBe(0);
  const verification = await (await SELF.fetch(`${BASE}/api/verify/${body.certificate.cert_id}`)).json() as { valid: boolean; certificate: { attests: string } };
  expect(verification.valid).toBe(true); expect(verification.certificate.attests).toBe(body.report.evidence_hash);
  const report = await SELF.fetch(BASE + body.report_url, { headers: { Accept: "application/json" } }); expect(report.status).toBe(200);
  expect(await report.text()).not.toContain(body.recheck.body.token);
  const recheck = await SELF.fetch(BASE + body.recheck.url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body.recheck.body) });
  expect(recheck.status).toBe(200);
  const refused = await SELF.fetch(BASE + body.recheck.url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: "wrong" }) });
  expect(refused.status).toBe(403);
  expect(await refused.json()).toMatchObject({ error: expect.any(String), recheck: { status: "unauthorized" } });
});
it("lets a browser check its card without executing a runtime task", async () => {
  const f = stubAgent();
  const response = await SELF.fetch(`${BASE}/a2a-desk?url=${encodeURIComponent(CARD_URL)}`, { headers: { Accept: "text/html" } });
  expect(response.status).toBe(200); const html = await response.text(); expect(html).toContain("Your card check"); expect(html).toContain("name=\"url\"");
  expect(f.calls).toHaveLength(1); expect(f.calls[0]?.init?.method).toBe("GET");
});
it("gives a browser a readable repair and acceptance test before its raw evidence", async () => {
  stubAgent({ card: { ...card, skills: [{}] } });
  const html = await (await SELF.fetch(`${BASE}/a2a-desk?url=${encodeURIComponent(CARD_URL)}`, { headers: { Accept: "text/html" } })).text();
  expect(html).toContain('<article class="a2a-repair">');
  expect(html).toContain("<strong>Acceptance test:</strong>");
  expect(html).toContain("<summary>Card-check evidence and gaps</summary>");
});
it("MCP calls the card instrument and reports refusal as an error", async () => {
  const f = stubAgent();
  const call = (url: string) => SELF.fetch(`${BASE}/mcp`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "check_a2a_card", arguments: { url } } }) });
  const good = await (await call(CARD_URL)).json() as { result: { structuredContent: { reading: { card_url: string }; signed: boolean } } };
  expect(good.result.structuredContent.reading.card_url).toBe(CARD_URL);
  expect(good.result.structuredContent.signed).toBe(false);
  const bad = await (await call("https://127.0.0.1/card")).json() as { error?: unknown };
  expect(bad.error).toBeTruthy(); expect(f.calls).toHaveLength(1);
});
