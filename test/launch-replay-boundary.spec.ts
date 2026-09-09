import { env } from "cloudflare:test";
import { expect, it } from "vitest";
import { fieldSignerFromKey, performLaunchCheck } from "@/services/launch-check";
import type { Env } from "@/types";

it("caps the replay body instead of consuming a seller's entire oversized response", async () => {
  let paidRequests = 0, chunksRead = 0, cancelled = false;
  const report = await performLaunchCheck(env as unknown as Env, "https://fixture.example/paid", {
    signer: await fieldSignerFromKey(`0x${"01".repeat(32)}`),
    screen: async () => ({ listed: false, source: "local clear screen" }),
    fetch: async (_url, init) => {
      if (!new Headers(init?.headers).has("PAYMENT-SIGNATURE")) return Response.json({ accepts: [{ scheme: "exact", network: "eip155:8453", amount: "10000", asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", payTo: "0x2222222222222222222222222222222222222222", maxTimeoutSeconds: 60 }] }, { status: 402 });
      paidRequests++;
      if (paidRequests === 1) return Response.json({ good: "fixture" });
      // Finite local fixture: the old implementation drains all four MiB.
      return new Response(new ReadableStream({ pull(controller) {
        if (chunksRead === 16) { controller.close(); return; }
        chunksRead++; controller.enqueue(new Uint8Array(256 * 1024).fill(120));
      }, cancel() { cancelled = true; } }));
    },
  });
  expect(paidRequests).toBe(2);
  expect(cancelled).toBe(true);
  expect(chunksRead).toBeLessThan(16);
  expect(report.replay_served).toBe(true);
  expect(report.stages.find(stage => stage.stage === "replay")?.detail).toContain("response truncated");
});
