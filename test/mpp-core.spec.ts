import { env, SELF } from "cloudflare:test";
import { describe, expect, it, vi } from "vitest";
import { performServiceAudit } from "@/services/service-audit";
import { preflightUrl } from "@/services/preflight";
import { runMppChecks } from "@/services/mpp-battery";
import { readMppCore } from "@/services/mpp-core";
import { sampleOnceOver } from "@/services/sample-artifacts";
import { verifyMessageSignature } from "@/lib/signing";
import { defectClass } from "@/store/defect-vocabulary";
import { PROTOCOL_FAMILIES } from "@/evidence/subject";
import type { Env } from "@/types";

const URL = "https://core-merchant.example/tool";
const NOW = new Date("2026-09-15T12:00:00Z");
const encode = (text: string) => btoa(text).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
const challenge = (extra = "", request = "e30") => `Payment id="fixture", realm="", method="example", intent="charge", request="${request}"${extra}`;
interface Reading {
  battery: string; state: string; spec: { draft: string };
  checks: { name: string; state: string; defect_class?: string; failed_challenges?: number[] }[];
  challenges: { index: number; credential_header: string | null }[];
  problem: { state: string; recognized: boolean | null; status_matches: boolean | null };
  counts: { checks: number; pass: number; fail: number; unmeasured: number; not_applicable: number };
  gaps: string[];
}
async function audit(header: string | null = challenge(), options: { status?: number; cache?: string; body?: string; receipt?: string } = {}) {
  const requests: string[] = [];
  const headers = new Headers({ "Content-Type": "application/problem+json", "Cache-Control": options.cache ?? "no-store" });
  if (header !== null) headers.set("WWW-Authenticate", header);
  if (options.receipt !== undefined) headers.set("Payment-Receipt", options.receipt);
  const body = options.body ?? JSON.stringify({ type: "https://paymentauth.org/problems/payment-required", status: options.status ?? 402 });
  const result = await performServiceAudit(env as unknown as Env, URL, { now: NOW, fetch: (async (input: RequestInfo | URL) => {
    requests.push(String(input));
    if (String(input) !== URL) return new Response(null, { status: 404 });
    return new Response(body, { status: options.status ?? 402, headers });
  }) as typeof fetch });
  expect(result).toHaveProperty("mpp_core");
  return { result, requests, core: (result as unknown as { mpp_core: Reading }).mpp_core };
}
const check = (core: Reading, name: string) => core.checks.find(c => c.name === name)?.state;

describe("draft-01 observable core reading", () => {
  it("reads the core without imposing a method's amount, recipient or registry", async () => {
    const { core } = await audit();
    expect(core).toMatchObject({ battery: "mpp-core-v1", spec: { draft: "draft-01" }, state: "read", counts: { fail: 0 } });
    expect(check(core, "method-format")).toBe("pass");
    expect(check(core, "intent-registration")).toBe("unmeasured");
    expect(core.challenges[0]?.credential_header).toBe("Authorization");
    expect(PROTOCOL_FAMILIES.find(f => f.id === "mpp")?.versions).toContain("draft-01");
    expect(core.counts.checks).toBe(core.checks.length);
    expect(core.counts.pass + core.counts.fail + core.counts.unmeasured + core.counts.not_applicable).toBe(core.counts.checks);
  });
  it.each(["x402", "Tempo", "some-method", ""])("rejects malformed method %s separately from registration", async method => {
    expect(check((await audit(challenge().replace('method="example"', `method="${method}"`))).core, "method-format")).toBe("fail");
  });
  it("selects only the specified alternate credential header", async () => {
    expect((await audit(challenge(', header="Payment-Authorization"'))).core.challenges[0]?.credential_header).toBe("Payment-Authorization");
    for (const header of ["Authorization", "payment-authorization", "X-Pay", ""]) {
      const { core } = await audit(challenge(`, header="${header}"`));
      expect(check(core, "credential-header")).toBe("fail");
      expect(core.challenges[0]?.credential_header).toBeNull();
    }
  });
  it.each([', id="second"', ', ID="second"', ', broken=', ', broken="unterminated', ', broken="bad"tail', ', broken="a\\\u0001"'])("refuses ambiguous or malformed auth parameters %s", async extra => {
    // The control-character case uses a quoted-pair allowed by neither qdtext nor quoted-pair.
    const { core } = await audit(challenge(extra));
    expect(check(core, "challenge-syntax")).toBe("fail");
    expect(check(core, "request-jcs")).not.toBe("pass");
  });
  it("honors BWS, quoted commas, escaped quotes and multiple authentication schemes", async () => {
    const value = `Bearer abc==, ${challenge(', description="quoted, \\"word\\"", future="a,b"')}, Basic realm="a", ${challenge(', header="Payment-Authorization"').replace('id="fixture"', 'id = "second"')}`;
    const { core } = await audit(value);
    expect(check(core, "challenge-syntax")).toBe("pass");
    expect(core.challenges).toHaveLength(2);
    expect(core.counts.fail).toBe(0);
  });
  it("requires a space between the Payment scheme and its parameters", async () => {
    expect(check((await audit(challenge().replace("Payment ", "Payment,"))).core, "challenge-syntax")).toBe("fail");
    expect(check((await audit(challenge().replace("Payment ", "Payment\t"))).core, "challenge-syntax")).toBe("fail");
  });
  it.each(["e30=", "e31", encode('{"b":1,"a":2}'), encode('{"a":1,"a":1}'), "_w", encode('{"x":"\\ud800"}')])("refuses a non-canonical request encoding %s", async request => {
    const { core } = await audit(challenge("", request));
    expect(check(core, "request-jcs")).toBe("fail");
  });
  it("rejects uppercase custom parameter names while ignoring valid unknown values", async () => {
    expect(check((await audit(challenge(', Future="ignored"'))).core, "custom-parameter-names")).toBe("fail");
    expect(check((await audit(challenge(', future="ignored"'))).core, "custom-parameter-names")).toBe("pass");
  });
  it("validates opaque data without publishing it", async () => {
    const marker = "private-fixture-correlation";
    const { core } = await audit(challenge(`, opaque="${encode(JSON.stringify({ reference: marker }))}"`));
    expect(check(core, "opaque-jcs")).toBe("pass");
    expect(JSON.stringify(core)).not.toContain(marker);
    for (const value of ['{"a":1}', '[]', '{"b":"2","a":"1"}', 'null']) {
      expect(check((await audit(challenge(`, opaque="${encode(value)}"`))).core, "opaque-jcs")).toBe("fail");
    }
  });
  it("checks the actual no-store directive, not matching text inside a quoted extension", async () => {
    expect(check((await audit(challenge(), { cache: 'extension="a,no-store,b"' })).core, "challenge-no-store")).toBe("fail");
    expect(check((await audit(challenge(), { cache: 'extension="a,b", No-Store' })).core, "challenge-no-store")).toBe("pass");
  });
  it("records invalid expiry syntax, expiration at observation time, and unsupported leap-second evaluation", async () => {
    for (const expires of ["tomorrow", "2026-02-30T00:00:00Z", "2026-09-15T25:00:00Z"]) {
      expect(check((await audit(challenge(`, expires="${expires}"`))).core, "expires-format")).toBe("fail");
    }
    expect(check((await audit(challenge(', expires="2026-09-15T11:00:00Z"'))).core, "expires-future")).toBe("fail");
    expect(check((await audit(challenge(', expires="2026-09-15T13:00:00Z"'))).core, "expires-future")).toBe("pass");
    expect(check((await audit(challenge(', expires="2026-12-31T23:59:60Z"'))).core, "expires-future")).toBe("unmeasured");
  });
  it("recognizes the expanded error table without rewriting the historical advisory", async () => {
    for (const [type, status] of [["bad-request", 400], ["invalid-payload", 402], ["internal-payment-error", 500], ["payment-action-required", 402]] as const) {
      const body = JSON.stringify({ type: `https://paymentauth.org/problems/${type}`, status });
      expect((await audit(challenge(), { body, status })).core.problem).toMatchObject({ state: "read", recognized: true, status_matches: true });
      const old = runMppChecks({ headers: new Headers({ "WWW-Authenticate": challenge(), "Content-Type": "application/problem+json" }), url: URL, bodyText: body, now: NOW });
      expect(old).toMatchObject({ battery: "mpp-v1", spec: "draft-00" });
      expect(old.advisories.some(a => a.name === "mpp-body-not-problem-json")).toBe(true);
    }
  });
  it("separates missing MPP from an unreadable probe and publishes binding gaps", async () => {
    expect((await audit(null)).core).toMatchObject({ state: "absent", checks: [] });
    const result = await performServiceAudit(env as unknown as Env, URL, { now: NOW, fetch: (async () => { throw new Error("offline fixture"); }) as typeof fetch });
    expect((result as unknown as { mpp_core: Reading }).mpp_core).toMatchObject({ state: "unmeasured", checks: [] });
    const { core } = await audit(challenge(', digest="not-verified"'));
    expect(check(core, "challenge-binding")).toBe("unmeasured");
    expect(check(core, "digest-binding")).toBe("unmeasured");
    expect(core.gaps.join(" ")).toContain("No reading here rests on a payment");
  });
  it("keeps all alternatives, bounds the reader and never claims a prefix passed", async () => {
    const { core } = await audit(`${challenge()}, ${challenge().replace('method="example"', 'method="x402"')}`);
    expect(core.checks.find(c => c.name === "method-format")?.failed_challenges).toEqual([1]);
    const bounded = await audit(challenge(`, description="${"a".repeat(17000)}"`));
    expect(bounded.core).toMatchObject({ state: "unmeasured", checks: [] });
  });
  it("does not infer an error cause from a non-402 status", async () => {
    expect(check((await audit(challenge(), { status: 400 })).core, "challenge-status")).toBe("unmeasured");
  });
  it("does not score a prefix when the alternative limit is exceeded", async () => {
    expect((await audit(Array.from({ length: 65 }, () => challenge()).join(", "))).core).toMatchObject({ state: "unmeasured", checks: [] });
  });
  it("flags a receipt on an error without exposing its bytes", async () => {
    const { core } = await audit(challenge(), { receipt: "private-receipt-fixture" });
    expect(check(core, "error-receipt-absent")).toBe("fail");
    expect(JSON.stringify(core)).not.toContain("private-receipt-fixture");
  });
  it("signs the reading and detects tampering, with the same request budget and x402 verdict", async () => {
    const { core, result, requests } = await audit();
    expect(requests).toEqual([URL, "https://core-merchant.example/llms.txt", "https://core-merchant.example/openapi.json", "https://core-merchant.example/.well-known/openapi.json", URL]);
    expect(result.verdict).toBe((await audit(null)).result.verdict);
    const { signature, public_key, signature_covers: _covers, ...signed } = result;
    expect(await verifyMessageSignature(JSON.stringify(signed), signature, public_key)).toBe(true);
    const { evidence_hash, scope: _scope, ...evidence } = signed;
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(evidence)));
    expect([...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("")).toBe(evidence_hash);
    core.counts.fail++;
    expect(await verifyMessageSignature(JSON.stringify(signed), signature, public_key)).toBe(false);
    expect(defectClass("mpp-core-observable-invalid")?.detectable).toBe("unpaid");
  });
  it("serves the practice challenge without cache reuse or an observable core failure", async () => {
    const url = `${(env as unknown as Env).STORE_BASE_URL}/api/practice/mpp-shape`;
    const response = await SELF.fetch(url);
    expect(response.status).toBe(402);
    const core = readMppCore({ status: response.status, headers: response.headers, url, now: NOW, bodyText: await response.text() });
    expect(check(core, "challenge-no-store")).toBe("pass");
    expect(core.checks.filter(c => c.state === "fail")).toEqual([]);
  });
  it("appears on the one-request free report and the specimen", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return new Response("{}", { status: 402, headers: { "WWW-Authenticate": challenge(), "Cache-Control": "no-store" } });
    });
    try {
      const result = await preflightUrl(URL, env as unknown as Env);
      expect(result.body).toHaveProperty("mpp_core.battery", "mpp-core-v1");
      expect(result.body).toHaveProperty("mpp.battery", "mpp-v1");
      expect(calls).toHaveLength(1);
    } finally { vi.unstubAllGlobals(); }
    expect((await sampleOnceOver(env as unknown as Env, 5)).sample).toHaveProperty("mpp_core.state", "absent");
  });
});
