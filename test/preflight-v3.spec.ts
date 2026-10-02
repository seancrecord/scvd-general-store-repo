import { SELF, env } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { preflightUrl, type PreflightBattery, type PreflightReport } from "@/services/preflight";
import { performServiceAudit } from "@/services/service-audit";
import { probeHost } from "@/services/ward-round";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;
const url = "https://s8.example/api/thing";
const terms = { scheme: "exact", network: "eip155:8453", asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", payTo: "0x1111111111111111111111111111111111111111", amount: "1000" };
const b64 = (value: unknown) => btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const offer = (amount: string) => ({ signature: `${b64({ alg: "EdDSA", kid: "did:web:s8.example#key" })}.${b64({ version: 1, resourceUrl: url, ...terms, amount })}.${b64("signature")}` });
const discovery = (type: string) => ({ bazaar: { info: { input: { type, method: "GET" } }, schema: { type: "object", required: ["input"], properties: { input: { type: "object", properties: { type: { const: "http" } } } } } } });
const offers = (amounts: string[]) => ({ "offer-receipt": { info: { offers: amounts.map(offer) } } });
function stub(extensions: Record<string, unknown>, amounts = ["1000"], bodyOnly = false) {
  const challenge = { x402Version: 2, resource: { url, description: "a thing" }, accepts: amounts.map(amount => ({ ...terms, amount })), extensions };
  vi.stubGlobal("fetch", vi.fn(async (input: unknown) => String(input) === url
    ? new Response(JSON.stringify(challenge), { status: 402, headers: { "PAYMENT-REQUIRED": btoa(JSON.stringify(bodyOnly ? { ...challenge, extensions: {} } : challenge)) } })
    : new Response("not read", { status: 404 })));
}
afterEach(() => vi.unstubAllGlobals());

async function read(version: string) {
  const result = await preflightUrl(url, testEnv, version as PreflightBattery);
  expect(result.status).toBe(200);
  return result.body as PreflightReport;
}

describe("S8 v3 readiness", () => {
  it.each([
    ["discovery-info-validates", "discovery-info-fails-schema", discovery("grpc")],
    ["offer-amount-matches-accepts", "offer-contradicts-challenge", offers(["2000"])],
  ])("%s affects v3 across free, paid and census readings; old batteries stay frozen", async (check, advisory, extensions) => {
    stub(extensions);
    for (const version of ["v1", "v2"]) {
      const old = await read(version);
      expect(old.version).toBe(version);
      expect(old.verdict).toBe("ready");
      expect(old.checks.some(row => row.name === check)).toBe(false);
      expect(old.advisories.some(row => row.name === advisory)).toBe(true);
    }
    const current = await read("v3");
    expect(current.verdict).toBe("not_ready");
    expect(current.version).toBe("v3");
    expect(current.checks.find(row => row.name === check)?.ok).toBe(false);
    expect(current.also_under).toMatchObject({ version: "v2", verdict: "ready" });
    const census = await probeHost(testEnv, url);
    expect(census).toMatchObject({ battery: "preflight-v3", verdict: "not_ready" });
    expect(census.failed).toContain(check);
    const audit = await performServiceAudit(testEnv, url, { fetch: globalThis.fetch });
    expect(audit.criteria).toContain("preflight-v3");
    expect(audit.verdict).toBe("not_ready");
    expect(audit.checks.find(row => row.name === check)?.ok).toBe(false);
  });

  it("accepts valid discovery and multiple matching price tiers", async () => {
    stub({ ...discovery("http"), ...offers(["1000", "2000"]) }, ["1000", "2000"]);
    const result = await read("v3");
    expect(result.verdict).toBe("ready");
    for (const name of ["discovery-info-validates", "offer-amount-matches-accepts"]) {
      expect(result.checks.find(row => row.name === name)?.ok).toBe(true);
    }
  });

  it("does not turn absent optional extensions into failures or invented passes", async () => {
    stub({});
    const result = await read("v3");
    expect(result.verdict).toBe("ready");
    expect(result.checks.some(row => ["discovery-info-validates", "offer-amount-matches-accepts"].includes(row.name))).toBe(false);
  });

  it("reads offer contradictions from the body when the header has no offer mirror", async () => {
    stub(offers(["2000"]), ["1000"], true);
    const result = await read("v3");
    expect(result.verdict).toBe("not_ready");
    expect(result.checks.find(row => row.name === "offer-amount-matches-accepts")?.ok).toBe(false);
  });

  it("does not claim a match when an offer's payment terms cannot be read", async () => {
    stub({ "offer-receipt": { info: { offers: [{ signature: `${b64({ alg: "EdDSA", kid: "did:web:s8.example#key" })}.${b64({ version: 1 })}.${b64("signature")}` }] } } });
    const result = await read("v3");
    expect(result.checks.some(row => row.name === "offer-amount-matches-accepts")).toBe(false);
  });

  it("the agent tool applies current readiness too", async () => {
    stub(offers(["2000"]));
    const response = await SELF.fetch("https://scvd.store/mcp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "preflight_endpoint", arguments: { url } } }),
    });
    const rpc = await response.json() as { result: { content: { text: string }[] } };
    const result = JSON.parse(rpc.result.content[0]!.text) as PreflightReport;
    expect(result).toMatchObject({ version: "v3", verdict: "not_ready" });
  });

  it("serves the new version and retains both old documents", async () => {
    for (const version of ["v1", "v2", "v3"]) {
      const response = await SELF.fetch(`https://scvd.store/api/preflight/${version}`);
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ version, batteries: { served: ["v1", "v2", "v3"] } });
    }
  });
});
