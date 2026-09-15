import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { surfacesSectionOf, SURFACE_BODY_CAP, type SurfaceReads } from "@/services/surface-reads";
import { performServiceAudit } from "@/services/service-audit";
import { verifyMessageSignature } from "@/lib/signing";
import { sampleOnceOver } from "@/services/sample-artifacts";
import { defectClass, VOCABULARY_CHANGELOG } from "@/store/defect-vocabulary";
import type { Env } from "@/types";

const URL = "https://merchant.example/tool";
const NOW = new Date("2026-09-14T12:00:00Z");
const offer = { method: "tempo", intent: "charge", amount: "500", currency: "usd" };
function header(terms = offer, id = "first"): string {
  const request = btoa(JSON.stringify({ amount: terms.amount, currency: terms.currency })).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  return `Payment id="${id}", realm="merchant", method="${terms.method}", intent="${terms.intent}", request="${request}"`;
}
function document(info: unknown = offer): string {
  return JSON.stringify({ openapi: "3.1.0", paths: { "/tool": { get: { "x-payment-info": info } } } });
}
function reads(text = document(), again: string | null = header(offer, "rotated")): SurfaceReads {
  return { probed_url: URL, llms: { url: `${URL}/llms.txt`, status: 404, text: null },
    openapi: { url: "https://merchant.example/openapi.json", status: 200, text },
    resource: null, resource_url: null,
    bookend: { url: URL, status: 402, text: null, www_authenticate: again } };
}
function section(r = reads(), first: string | null = header()) {
  return surfacesSectionOf(r, null, NOW.toISOString(), { status: 402, www_authenticate: first }).mpp!;
}

describe("paid MPP discovery comparison", () => {
  it("compares an operation's terms with a stable challenge, ignoring rotating ids", () => {
    expect(section()).toMatchObject({ version: "mpp-discovery-v1", agree: 1, differ: 0, moving: false, compared: 1 });
    expect(section().rows[0]).toMatchObject({ state: "agree", matching_offers: [0] });
  });
  it.each(["method", "intent", "amount", "currency"] as const)("reports a stable %s difference without changing x402 totals", (field) => {
    const info = { ...offer, [field]: field === "intent" ? "session" : field === "amount" ? "501" : "other" };
    const s = section(reads(document(info)));
    expect(s).toMatchObject({ agree: 0, differ: 1, compared: 1 });
    expect(s.rows[0]?.candidates[0]?.differ).toEqual([field]);
    expect(s.rows[0]?.defect_class).toBe("surface-contradicts-challenge");
    expect(surfacesSectionOf(reads(document(info)), null, NOW.toISOString()).differ).toBe(0);
  });
  it("reads alternative offers without pairing by position or demanding every advertised option", () => {
    const other = { ...offer, method: "stripe", amount: "5" };
    const r = reads(document({ offers: [other, offer] }), `${header(other)}, ${header()}`);
    const s = section(r, `${header()}, ${header(other)}`);
    expect(s).toMatchObject({ agree: 2, differ: 0, moving: false });
    expect(section(reads(document({ offers: [other, offer] })))).toMatchObject({ agree: 1, differ: 0 });
  });
  it("leaves dynamic amount and omitted currency unmeasured, never asserting price agreement", () => {
    const s = section(reads(document({ method: offer.method, intent: offer.intent, amount: null })));
    expect(s).toMatchObject({ agree: 1, differ: 0 });
    expect(s.rows[0]?.candidates[0]?.not_compared).toEqual(["amount", "currency"]);
    expect(s.gaps.join(" ")).toContain("dynamic");
  });
  it("withdraws contradictions when terms move, disappear or the bookend fails", () => {
    const doc = document({ ...offer, amount: "900" });
    for (const again of [header({ ...offer, amount: "501" }), null]) {
      expect(section(reads(doc, again))).toMatchObject({ moving: true, agree: 0, differ: 0, compared: 0 });
    }
    const r = reads(doc); r.bookend = { url: URL, status: null, text: null, failure: "timeout" };
    expect(section(r)).toMatchObject({ moving: false, differ: 0, compared: 0, bookend: { state: "unreadable" } });
    expect(section(reads(doc, 'Payment request="broken"'))).toMatchObject({ differ: 0, compared: 0 });
  });
  it("keeps absent, silent and unreadable separate", () => {
    const r = reads(); r.openapi = { ...r.openapi, status: 404, text: null };
    expect(section(r).openapi.state).toBe("absent");
    expect(section(reads(document({ price_usdc: 1 }))).openapi.state).toBe("silent");
    for (const info of [{ ...offer, amount: 500 }, { offers: [] }, { offers: [offer, {}] }, { ...offer, amount: "0500" }, { ...offer, intent: { toString: 1 } }]) {
      expect(section(reads(document(info)))).toMatchObject({ openapi: { state: "unreadable" }, differ: 0 });
    }
    expect(section(reads("{invalid"))).toMatchObject({ openapi: { state: "unreadable" }, differ: 0 });
    expect(section(reads(), null)).toMatchObject({ challenge: { state: "absent" }, compared: 0 });
    expect(section(reads(), 'Payment request="bad"')).toMatchObject({ challenge: { state: "unreadable" }, compared: 0 });
  });
  it("does not borrow POST, templated paths, references or another server's operation", () => {
    const docs = [
      { paths: { "/tool": { post: { "x-payment-info": offer } } } },
      { paths: { "/{name}": { get: { "x-payment-info": offer } } } },
      { paths: { "/tool": { $ref: "elsewhere.json" } } },
      { servers: [{ url: "https://another.example" }], paths: { "/tool": { get: { "x-payment-info": offer } } } },
    ];
    for (const doc of docs) expect(section(reads(JSON.stringify({ openapi: "3.1.0", ...doc }))).compared).toBe(0);
  });
  it("does not treat an explicitly null server declaration as an omitted one", () => {
    for (const doc of [
      { servers: null, paths: { "/tool": { get: { "x-payment-info": offer } } } },
      { paths: { "/tool": { servers: null, get: { "x-payment-info": offer } } } },
      { paths: { "/tool": { get: { servers: null, "x-payment-info": offer } } } },
    ]) {
      expect(section(reads(JSON.stringify({ openapi: "3.1.0", ...doc })))).toMatchObject({
        openapi: { state: "unreadable" }, compared: 0,
      });
    }
  });
  it("retains the new reading inside the paid signature, with no extra requests or x402 verdict changes", async () => {
    const requests: string[] = [];
    const run = async (info: unknown, mpp = true) => performServiceAudit(env as unknown as Env, URL, { now: NOW,
      fetch: (async (input: RequestInfo | URL) => {
        const url = String(input); requests.push(url);
        if (url.endsWith("/openapi.json")) return new Response(document(info));
        if (url.endsWith("/llms.txt")) return new Response(null, { status: 404 });
        return new Response("{}", { status: 402, headers: mpp ? { "WWW-Authenticate": header() } : {} });
      }) as typeof fetch });
    const a = await run(offer);
    expect(requests).toEqual([URL, "https://merchant.example/llms.txt", "https://merchant.example/openapi.json", URL]);
    expect(a.surfaces?.mpp).toMatchObject({ agree: 1, differ: 0 });
    const b = await run({ ...offer, amount: "501" });
    const legacy = await run(offer, false);
    expect(b.verdict).toBe(a.verdict); expect(a.verdict).toBe(legacy.verdict);
    expect(b.checks).toEqual(a.checks); expect(b.surfaces?.mpp?.differ).toBe(1);
    const { signature, public_key, signature_covers: _covers, ...signed } = b;
    expect(await verifyMessageSignature(JSON.stringify(signed), signature, public_key)).toBe(true);
    const { evidence_hash, scope: _scope, ...core } = signed;
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(core)));
    expect([...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("")).toBe(evidence_hash);
    signed.surfaces!.mpp!.differ = 0;
    expect(await verifyMessageSignature(JSON.stringify(signed), signature, public_key)).toBe(false);
  });
  it("keeps the specimen and vocabulary tied to the new reading", async () => {
    const sample = await sampleOnceOver(env as unknown as Env, 5);
    expect(sample.sample.surfaces?.mpp).toMatchObject({ challenge: { state: "absent" }, compared: 0 });
    expect(defectClass("surface-contradicts-challenge")?.our_signal).toContain("surfaces.mpp");
    expect(VOCABULARY_CHANGELOG.at(-1)?.what_changed).toContain("MPP");
  });
  it("caps OpenAPI bytes while streaming and cancels before the tail is read", async () => {
    let canceled = false;
    const result = await performServiceAudit(env as unknown as Env, URL, { now: NOW,
      fetch: (async (input: RequestInfo | URL) => {
        if (String(input).endsWith("/openapi.json")) return new Response(new ReadableStream({
          start(controller) { controller.enqueue(new TextEncoder().encode("é".repeat(SURFACE_BODY_CAP))); },
          cancel() { canceled = true; },
        }));
        if (String(input).endsWith("/llms.txt")) return new Response(null, { status: 404 });
        return new Response("{}", { status: 402, headers: { "WWW-Authenticate": header() } });
      }) as typeof fetch });
    expect(canceled).toBe(true);
    expect(result.surfaces?.mpp).toMatchObject({ openapi: { state: "unreadable" }, compared: 0 });
  }, 10_000);
});
