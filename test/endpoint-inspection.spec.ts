import { env, SELF } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { preflightUrl, PREFLIGHT_VERSION_NEXT } from "@/services/preflight";
import type { Env } from "@/types";
import inputs from "../x402-preflight/fixtures/inspection-inputs.json";
import { inspectOne } from "../x402-preflight/x402-preflight.js";
import { INSPECTION_TERM_LIMIT, inspectionOf } from "../x402-preflight/inspection.js";
import { ENDPOINT_INSPECTION_SCHEMA } from "@/lib/endpoint-inspection-schema";
import { mcpToolCatalog } from "@/lib/mcp-tools";

const retained = import.meta.glob("../x402-preflight/fixtures/inspection/*.json", {
  query: "?raw", import: "default", eager: true,
}) as Record<string, string>;

interface Reading {
  version: string;
  observed_at: string;
  reachability: { state: string; http_status: number | null; method: string | null };
  protocols: { observed: string[]; state: string; scope: string };
  coverage: { body: string; mpp_core: string };
  terms: { trust: string; x402: { entries: unknown[] }; mpp: { entries: unknown[] } };
  signatures: { state: string };
  unperformed: string[];
  gaps: string[];
}

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("one unpaid observation, distinct from the x402 deploy verdict", () => {
  for (const [index, sample] of inputs.cases.entries()) {
    it(sample.name, async () => {
      const now = new Date(Date.parse(inputs.observed_at) + index * 60_000);
      vi.setSystemTime(now);
      const fetcher = vi.fn(async (_url: unknown, init?: RequestInit) => {
        expect(String(_url)).toBe(sample.url);
        const headers = new Headers(init?.headers);
        for (const key of ["payment-signature", "authorization", "payment-authorization"]) {
          expect(headers.has(key)).toBe(false);
        }
        if (sample.status === null) throw new Error("synthetic network gap");
        return new Response("over_limit" in sample ? "x".repeat(300_000) : sample.body, {
          status: sample.status, headers: sample.headers as Record<string, string>,
        });
      });
      vi.stubGlobal("fetch", fetcher);
      const result = await preflightUrl(sample.url, env as Env, PREFLIGHT_VERSION_NEXT);
      expect(result.status).toBe(200);
      const reading = (result.body as unknown as { inspection: Reading }).inspection;
      expect(reading).toBeDefined();
      const recorded = retained[`../x402-preflight/fixtures/inspection/${sample.name}.json`];
      expect(recorded).toBeDefined();
      expect({ version: PREFLIGHT_VERSION_NEXT, verdict: (result.body as { verdict: string }).verdict, inspection: reading }).toEqual(JSON.parse(recorded!));
      expect(reading.observed_at).toBe(now.toISOString());
      expect(reading.protocols.observed).toEqual(sample.protocols);
      expect(reading.protocols.scope).toMatch(/response/);
      expect(reading.signatures.state).toBe("not_checked");
      expect(reading.terms.trust).toBe("unverified_advertisement");
      expect(reading.unperformed).toEqual(expect.arrayContaining(["payment_signing", "payment_submission", "settlement", "delivery"]));
      const state = sample.name === "unreachable" ? "unreachable" : sample.name === "method-unresolved" ? "method_unresolved" : "responded";
      expect(reading.reachability.state).toBe(state);
      expect(reading.reachability.http_status).toBe(sample.status);
      expect(fetcher).toHaveBeenCalledTimes(sample.name === "method-unresolved" ? 2 : 1);
      if (state !== "responded") {
        expect(reading.protocols.state).toBe("unobserved");
        expect(reading.terms.x402.entries).toEqual([]);
        expect(reading.terms.mpp.entries).toEqual([]);
        expect(reading.gaps.length).toBeGreaterThan(0);
      }
      if (sample.name === "unreachable") expect(reading.reachability.method).toBeNull();
      if (sample.name === "over-limit") {
        expect(reading.coverage.body).toBe("over_limit");
        expect(reading.gaps.join(" ")).toMatch(/body/i);
      }
      if (sample.name === "mpp-only") {
        expect(result.body).toHaveProperty("verdict", "not_ready");
        expect(reading.terms.mpp.entries).toHaveLength(1);
      }
      if ((sample.protocols as string[]).includes("x402")) expect(reading.terms.x402.entries).toHaveLength(1);

      const http = async (version: string) => (await SELF.fetch(`https://scvd.store/api/preflight/${version}`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: sample.url }),
      })).json();
      expect(inspectionOf(await http("v2"))).toEqual(reading);
      const legacy = inspectionOf(await http("v1"));
      const rpc = await SELF.fetch("https://scvd.store/mcp", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: index + 1, method: "tools/call", params: { name: "preflight_endpoint", arguments: { url: sample.url } } }),
      });
      const envelope = await rpc.json() as { result: { structuredContent: unknown } };
      expect(inspectionOf(envelope.result.structuredContent)).toEqual(legacy);
      expect(legacy?.protocols).toEqual(reading.protocols);
      expect(legacy?.terms).toEqual(reading.terms);
      const client = await inspectOne(sample.url, { fetch: (input, init) => SELF.fetch(input, init) });
      expect(client.inspection).toEqual(reading);
      expect(client.inspectionExitCode).toBe(state === "responded" ? 0 : 3);
      // Every surface uses the same unpaid probe; no key resolution, payment retry or link following.
      expect(fetcher).toHaveBeenCalledTimes((sample.name === "method-unresolved" ? 2 : 1) * 5);
    });
  }
});

it("publishes capped advertised terms without hiding omissions or echoing extension data", async () => {
  vi.setSystemTime(new Date("2026-09-28T12:10:00Z"));
  const sample = inputs.cases[0]!;
  const challenge = JSON.parse(atob(sample.headers["payment-required"]!)) as { accepts: Record<string, unknown>[] };
  challenge.accepts = Array.from({ length: INSPECTION_TERM_LIMIT + 3 }, () => ({ ...challenge.accepts[0], extra: { private_note: "must-not-echo" } }));
  vi.stubGlobal("fetch", async () => new Response("{}", { status: 402, headers: { "payment-required": btoa(JSON.stringify(challenge)) } }));
  const result = await preflightUrl(sample.url, env as Env);
  const r = inspectionOf(result.body)!;
  expect(r.terms.x402.entries).toHaveLength(INSPECTION_TERM_LIMIT);
  expect(r.terms.x402.total).toBe(challenge.accepts.length);
  expect(r.terms.x402.omitted).toBe(3);
  expect(JSON.stringify(r)).not.toContain("must-not-echo");
  expect(r.gaps.join(" ")).toMatch(/omitted/);
});

it("keeps an incomplete challenge header and fake signature unverified", async () => {
  vi.setSystemTime(new Date("2026-09-28T12:11:00Z"));
  const sample = inputs.cases[0]!;
  const challenge = JSON.parse(atob(sample.headers["payment-required"]!)) as Record<string, unknown>;
  challenge.extensions = { "offer-receipt": { offers: [{ format: "jws", signature: "fake.fake.fake" }] } };
  vi.stubGlobal("fetch", async () => new Response("{}", { status: 402, headers: {
    "payment-required": btoa(JSON.stringify(challenge)), "www-authenticate": 'Payment id="unfinished',
  } }));
  const result = await preflightUrl(sample.url, env as Env);
  const r = inspectionOf(result.body)!;
  expect(r.signatures.state).toBe("not_checked");
  expect(r.structure.mpp_core.failed).toContain("challenge-syntax");
  expect(r.structure.mpp_core.unmeasured.length).toBeGreaterThan(0);
  expect(r.protocols.state).toBe("partial");
  expect(r.gaps.join(" ")).toMatch(/header/);
});

it("HTTP and the canonical tool catalogue describe the same inspection contract", async () => {
  const tool = mcpToolCatalog("https://scvd.store").find((t) => t.name === "preflight_endpoint")!;
  expect(tool.outputSchema?.properties).toHaveProperty("inspection", ENDPOINT_INSPECTION_SCHEMA);
  const doc = await (await SELF.fetch("https://scvd.store/api/preflight/v2")).json();
  expect(doc).toHaveProperty("inspection", ENDPOINT_INSPECTION_SCHEMA);
  const openapi = await (await SELF.fetch("https://scvd.store/openapi.json")).text();
  expect(openapi).toContain(JSON.stringify(ENDPOINT_INSPECTION_SCHEMA));
});
