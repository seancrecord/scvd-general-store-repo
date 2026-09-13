import { SELF, env } from "cloudflare:test";
import { beforeAll, expect, it } from "vitest";
import { BASE_EVM } from "@/lib/base-rpc";
import { fieldSignerFromKey, performLaunchCheck, type FieldSigner } from "@/services/launch-check";
import type { Env } from "@/types";

const tx = `0x${"ab".repeat(32)}`;
let signer: FieldSigner;
beforeAll(async () => { signer = await fieldSignerFromKey(`0x${"01".repeat(32)}`); });
async function walk(first: () => Response, replay: () => Response) {
  const payments: string[] = [];
  const report = await performLaunchCheck(env as Env, "https://fixture.example/paid", {
    signer, now: new Date("2026-09-13T18:15:00Z"),
    screen: async () => ({ listed: false, source: "local fixture" }),
    fetch: async (_url, init) => {
      const payment = new Headers(init?.headers).get("PAYMENT-SIGNATURE");
      if (!payment) return Response.json({ accepts: [{ scheme: "exact", network: BASE_EVM.caip2,
        asset: BASE_EVM.usdc, payTo: `0x${"22".repeat(20)}`, amount: "5000", maxTimeoutSeconds: 60 }] }, { status: 402 });
      payments.push(payment);
      return payments.length === 1 ? first() : replay();
    },
  });
  expect(payments).toHaveLength(2);
  expect(payments[1]).toBe(payments[0]);
  return report;
}
const response = (body: string | Uint8Array, named = false, status = 200) => () => new Response(body, {
  status, headers: named ? { "PAYMENT-RESPONSE": btoa(JSON.stringify({ transaction: tx })) } : {},
});

it("recognizes identical complete goods without requiring a transaction reference", async () => {
  const report = await walk(response('{"artifact":"original"}'), response('{"artifact":"original"}'));
  expect(report.replay).toMatchObject({ outcome: "redelivered", body_comparison: "identical" });
  expect(report.replay_served).toBe(false);
});
it("does not mistake the same transaction reference for the same delivery", async () => {
  const report = await walk(response('{"artifact":"first"}', true), response('{"artifact":"second"}', true));
  expect(report.replay).toMatchObject({ outcome: "changed_response", names_settlement: true, body_comparison: "different" });
  expect(report.replay_served).toBeNull();
});
it("does not call a changed wrapper fresh fulfillment", async () => {
  const report = await walk(response('{"artifact":"same","time":1}'), response('{"artifact":"same","time":2}'));
  expect(report.replay).toMatchObject({ outcome: "changed_response", body_comparison: "different" });
  expect(report.replay_served).toBeNull();
});
it("compares raw bytes even when invalid UTF-8 decodes to identical text", async () => {
  const report = await walk(response(new Uint8Array([0xff]), true), response(new Uint8Array([0xfe]), true));
  expect(report.replay).toMatchObject({ outcome: "changed_response", body_comparison: "different" });
});
it("does not infer identical goods from matching capped prefixes", async () => {
  const prefix = "x".repeat(1_048_576);
  const report = await walk(response(prefix + "a", true), response(prefix + "b", true));
  expect(report.replay).toMatchObject({ outcome: "unknown", body_comparison: "incomplete" });
  expect(report.replay_served).toBeNull();
});
it("does not count empty success responses as recovered goods or money moved", async () => {
  const report = await walk(response("", true), response("", true));
  expect(report.replay).toMatchObject({ outcome: "unknown", body_comparison: "empty" });
  expect(report.replay_served).toBeNull();
  expect(report.stages.find(s => s.stage === "delivery")?.detail).not.toContain("Money moved");
});
it.each([500, 503, 408, 429, 302])("keeps HTTP %s replay failures unknown", async status => {
  const report = await walk(response("good", true), response("retry later", false, status));
  expect(report.replay).toMatchObject({ outcome: "unknown", status });
  expect(report.replay_served).toBeNull();
  expect(report.stages.find(s => s.stage === "replay")?.ok).toBe(false);
});
it("does not claim a second charge or spent nonce merely from a new challenge", async () => {
  const report = await walk(response("good"), response('{"accepts":[]}', false, 402));
  expect(report.replay).toMatchObject({ outcome: "rechallenged" });
  expect(report.stages.find(s => s.stage === "replay")?.detail).not.toMatch(/already.settled|already bought|pay — again/);
  expect(report.scope).not.toContain("identical already-settled payment");
});

it("keeps a body-read failure unknown without discarding the original observation", async () => {
  const report = await walk(response("original-good"), () => new Response(new ReadableStream({ start(controller) {
    controller.error(new Error("fixture connection lost"));
  } })));
  expect(report.verdict).toBe("settled");
  expect(report.replay).toMatchObject({ outcome: "unknown", status: 200 });
  expect(report.stages.find(s => s.stage === "delivery")?.detail).toContain("sha256");
});

it.each(["rechallenged", "served_again", "changed_response"])("keeps the delivery note honest for %s", async outcome => {
  const { launchCheckNote } = await import("@/store/copy/deliverables");
  const note = launchCheckNote("settled", outcome === "served_again", "confirmed_on_chain", outcome);
  expect(note).not.toMatch(/took our money|took it again|second charge for goods|delivered your product for free/);
  expect(note).toContain("payment_attempt");
});


it.each(["/defects.json", "/defects.md", "/defects", "/defects/replay-accepted"])("qualifies historical replay mappings at %s", async path => {
  const response = await SELF.fetch(`https://scvd.store${path}`);
  expect(response.status).toBe(200);
  expect(await response.text()).toContain("Transaction references alone do not establish redelivery");
});

it.each(["launch_check", "opening_day"])("states the exact-payment and replay limits in %s artifact scope", async id => {
  const { ARTIFACT_CLASSES } = await import("@/store/attestation-spec");
  const artifact = ARTIFACT_CLASSES.find(entry => entry.id === id)!;
  expect(artifact.signs).toContain("payment_attempt");
  expect(artifact.does_not_prove).toContain("byte recovery");
});
