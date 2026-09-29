import { env } from "cloudflare:test";
import { expect, it, vi } from "vitest";
import { BASE_EVM } from "@/lib/base-rpc";
import { verifyMessageSignature } from "@/lib/signing";
import {
  performLaunchCheck, signLaunchCheck,
  MAX_LAUNCH_REQUEST_BYTES,
  type LaunchCheckCore, type LaunchCheckOptions,
} from "@/services/launch-check";
import type { Env } from "@/types";

const target = "https://fixture.example/paid";
const body = '{ "pair": "USDG", "tax": 1, "note": "café" }\n';
const now = new Date("2026-09-28T16:30:00Z");
const signer = { address: `0x${"11".repeat(20)}`, signTypedData: vi.fn(async () => `0x${"ab".repeat(65)}`) };
const screen = vi.fn(async () => ({ listed: false, source: "offline fixture" }));
function challenge() {
  return Response.json({ x402Version: 2, accepts: [{ scheme: "exact", network: BASE_EVM.caip2,
    asset: BASE_EVM.usdc, payTo: `0x${"22".repeat(20)}`, amount: "5000", maxTimeoutSeconds: 60 }] }, { status: 402 });
}
async function digest(text: string) {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))),
    byte => byte.toString(16).padStart(2, "0")).join("");
}

it.each(['{"pair":"USDG","tax":1}', body])("preserves supplied POST bytes through quote, payment and replay despite mutation (case %#)", async body => {
  const request = { method: "POST" as const, body };
  const calls: Request[] = [];
  const retained: Array<{ stage: string; core: LaunchCheckCore }> = [];
  const report = await performLaunchCheck(env as Env, target, {
    request, signer, screen, now,
    retain: async (stage, core) => { retained.push({ stage, core }); },
    fetch: async (url, init) => {
      const sent = new Request(url, init);
      calls.push(sent);
      // A caller changing its options during the first await cannot reprice the purchase.
      request.body = '{"pair":"CHANGED","tax":99}';
      if (!sent.headers.has("PAYMENT-SIGNATURE")) return challenge();
      expect(retained[0]?.stage).toBe("attempt");
      return Response.json({ goods: "same fixture" });
    },
  });
  expect(report.verdict).toBe("settled");
  expect(calls).toHaveLength(3);
  expect(calls.map(call => call.method)).toEqual(["POST", "POST", "POST"]);
  expect(await Promise.all(calls.map(call => call.text()))).toEqual([body, body, body]);
  expect(calls.every(call => call.url === target && call.redirect === "manual"
    && call.headers.get("content-type") === "application/json")).toBe(true);
  expect(calls[0]!.headers.has("PAYMENT-SIGNATURE")).toBe(false);
  expect(calls[1]!.headers.get("PAYMENT-SIGNATURE")).toBeTruthy();
  expect(calls[2]!.headers.get("PAYMENT-SIGNATURE")).toBe(calls[1]!.headers.get("PAYMENT-SIGNATURE"));
  const evidence = { method: "POST", content_type: "application/json",
    body_bytes: new TextEncoder().encode(body).byteLength, body_sha256: await digest(body) } as const;
  expect(report.request_evidence).toEqual(evidence);
  expect(report.scope).toContain("nor proof the seller processed it");
  expect(retained.map(row => row.core.request_evidence)).toEqual([evidence, evidence]);
  expect(report.stages.find(stage => stage.stage === "approach")?.detail).toBe("POST answered HTTP 402.");
  expect(JSON.stringify(report)).not.toContain("USDG");
  const { signature, public_key, signature_covers: _covers, ...observation } = report;
  expect(await verifyMessageSignature(JSON.stringify(observation), signature, public_key)).toBe(true);
  observation.request_evidence = { ...evidence, body_sha256: await digest("different input") };
  expect(await verifyMessageSignature(JSON.stringify(observation), signature, public_key)).toBe(false);
  // Recovery signs the retained attempt, including its request, without rerunning the walk.
  const recovered = await signLaunchCheck(env as Env, retained[0]!.core);
  expect(recovered.request_evidence).toEqual(evidence);
  expect(calls).toHaveLength(3);
});

it.each([405, 501])("does not switch an explicitly supplied POST after HTTP %s", async status => {
  const send = vi.fn(async () => new Response(null, { status, headers: { Allow: "GET" } }));
  const report = await performLaunchCheck(env as Env, target, {
    request: { method: "POST", body }, signer, screen, now, fetch: send,
  });
  expect(send).toHaveBeenCalledTimes(1);
  expect(report.verdict).toBe("unreachable");
  expect(report.payment_attempt).toBeUndefined();
  expect(report.stages[0]?.detail).toContain("POST");
});

it.each([
  { method: "GET", body }, { method: "DELETE", body },
  { method: "POST", body: "" }, { method: "POST", body: "not JSON" },
  { method: "POST", body: "null" }, { method: "POST", body: "[]" },
  { method: "POST", body: {} }, { method: "POST" }, null,
  { method: "POST", body, headers: { Authorization: "not supported" } },
  { method: "POST", body: JSON.stringify({ text: "é".repeat(MAX_LAUNCH_REQUEST_BYTES / 2) }) },
].map((request, index) => ({ request, index })))("refuses invalid pilot input $index before any request or signing", async ({ request }) => {
  const send = vi.fn(async () => challenge());
  signer.signTypedData.mockClear();
  screen.mockClear();
  await expect(performLaunchCheck(env as Env, target, {
    request: request as unknown as NonNullable<LaunchCheckOptions["request"]>,
    signer, screen, now, fetch: send,
  })).rejects.toThrow("Launch Check request");
  expect(send).not.toHaveBeenCalled();
  expect(signer.signTypedData).not.toHaveBeenCalled();
  expect(screen).not.toHaveBeenCalled();
});

it("accepts the exact UTF-8 byte limit without truncating or normalizing the body", async () => {
  const boundary = '{"a":"' + "x".repeat(MAX_LAUNCH_REQUEST_BYTES - 8) + '"}';
  expect(new TextEncoder().encode(boundary)).toHaveLength(MAX_LAUNCH_REQUEST_BYTES);
  const calls: string[] = [];
  const report = await performLaunchCheck(env as Env, target, {
    request: { method: "POST", body: boundary }, signer, screen, now,
    fetch: async (_url, init) => { calls.push(String(init?.body)); return new Response(null, { status: 204 }); },
  });
  expect(calls).toEqual([boundary]);
  expect(report.request_evidence?.body_bytes).toBe(MAX_LAUNCH_REQUEST_BYTES);
});

it("keeps the default GET to empty-POST fallback usable and names the method that answered", async () => {
  const calls: Request[] = [];
  const report = await performLaunchCheck(env as Env, target, {
    signer, screen, now,
    fetch: async (url, init) => {
      const sent = new Request(url, init);
      calls.push(sent);
      if (sent.method === "GET") return new Response(null, { status: 405, headers: { Allow: "POST" } });
      return sent.headers.has("PAYMENT-SIGNATURE") ? Response.json({ goods: "same" }) : challenge();
    },
  });
  expect(report.verdict).toBe("settled");
  expect(calls.map(call => call.method)).toEqual(["GET", "POST", "POST", "POST"]);
  expect(await Promise.all(calls.map(call => call.text()))).toEqual(["", "{}", "{}", "{}"]);
  expect(report.request_evidence).toBeUndefined();
  expect(report.stages[0]?.detail).toBe("POST answered HTTP 402.");
});

it("stops before presenting payment when durable retention fails, even with a supplied body", async () => {
  const send = vi.fn(async () => challenge());
  await expect(performLaunchCheck(env as Env, target, {
    request: { method: "POST", body }, signer, screen, now, fetch: send,
    retain: async stage => { if (stage === "attempt") throw new Error("fixture storage unavailable"); },
  })).rejects.toThrow("fixture storage unavailable");
  expect(send).toHaveBeenCalledTimes(1);
});

it.each(["unknown screen", "over cap", "paid redirect"])("keeps the existing money boundary: %s", async condition => {
  const calls: Request[] = [];
  const report = await performLaunchCheck(env as Env, target, {
    request: { method: "POST", body }, signer, now,
    screen: async () => ({ listed: condition === "unknown screen" ? null : false, source: "fixture" }),
    fetch: async (url, init) => {
      const sent = new Request(url, init);
      calls.push(sent);
      if (sent.headers.has("PAYMENT-SIGNATURE")) return new Response(null, { status: 302, headers: { Location: "https://elsewhere.example/" } });
      const quote = await challenge().json() as { accepts: Array<{ amount: string }> };
      if (condition === "over cap") quote.accepts[0]!.amount = "999999999";
      return Response.json(quote, { status: 402 });
    },
  });
  expect(report.verdict).toBe(condition === "paid redirect" ? "payment_refused" : "unpaid_by_rule");
  expect(calls).toHaveLength(condition === "paid redirect" ? 2 : 1);
  expect(calls.every(call => call.url === target && call.redirect === "manual")).toBe(true);
  expect(await Promise.all(calls.map(call => call.text()))).toEqual(calls.map(() => body));
  expect(report.request_evidence?.body_sha256).toBe(await digest(body));
});
