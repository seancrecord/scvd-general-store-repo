import { env, runInDurableObject } from "cloudflare:test";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { LaunchCheckStore } from "@/services/launch-check-recovery";
import { fieldSignerFromKey } from "@/services/launch-check";
import { verifyMessageSignature } from "@/lib/signing";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;
const target = "https://fixture.example/paid?subject=SCVD-E2E-journal";
const key = `0x${"01".repeat(32)}`;
let sends = 0, walks = 0;
let resetBody = false;
let spendableSignature = "";
vi.mock("@/services/launch-check", async load => {
  const actual = await load<typeof import("@/services/launch-check")>();
  return { ...actual, performLaunchCheck: async (...args: Parameters<typeof actual.performLaunchCheck>) => {
    walks++;
    return actual.performLaunchCheck(args[0], args[1], { ...args[2], signer: await fieldSignerFromKey(key),
      screen: async () => ({ listed: false, source: "local clear screen" }),
      fetch: async (_url, init) => {
        if (!new Headers(init?.headers).has("PAYMENT-SIGNATURE")) return Response.json({ accepts: [{ scheme: "exact", network: "eip155:8453", amount: "10000", asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", payTo: "0x2222222222222222222222222222222222222222", maxTimeoutSeconds: 60 }] }, { status: 402 });
        spendableSignature = JSON.parse(atob(new Headers(init?.headers).get("PAYMENT-SIGNATURE")!)).payload.signature;
        sends++;
        if (resetBody) return new Response(new ReadableStream({ pull() { throw new Error("interrupted delivery body"); } }));
        return Response.json({ error: "seller refused" }, { status: 402 });
      },
    });
  } };
});
beforeEach(() => { sends = 0; walks = 0; resetBody = false; spendableSignature = "";
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-09-05T12:00:00Z"));
});
afterEach(() => vi.useRealTimers());

for (const point of ["launch:identity", "launch:attempt", "launch:observation", "launch:report"]) for (const after of [false, true]) {
  it(`durable ${point} ${after ? "acknowledgement" : "write"} failure survives a new journal instance`, async () => {
    const stub = testEnv.PAID_RECOVERIES!.get(testEnv.PAID_RECOVERIES!.idFromName(`launch-test:${crypto.randomUUID()}`));
    await runInDurableObject(stub, async (_instance, state) => {
      let fail = true;
      const storage = new Proxy(state.storage, { get(target, method) {
        if (method === "put") return async (key: string, value: unknown) => {
          if (fail && key === point && !after) throw new Error("write unavailable");
          await target.put(key, value);
          if (fail && key === point && after) throw new Error("acknowledgement lost");
        };
        const member = Reflect.get(target, method);
        return typeof member === "function" ? member.bind(target) : member;
      } });
      await expect(new LaunchCheckStore(storage, testEnv).run("/api/buy/launch_check", "digest", target)).rejects.toThrow();
      const sent = sends; fail = false;
      const report = await new LaunchCheckStore(storage, testEnv).run("/api/buy/launch_check", "digest", target);
      expect(sends).toBe(point === "launch:identity" || (point === "launch:attempt" && !after) ? 1 : sent);
      expect(report.url).toBe(target);
      const { signature, public_key, signature_covers: _covers, ...observation } = report;
      expect(await verifyMessageSignature(JSON.stringify(observation), signature, public_key)).toBe(true);
      expect(report.payment_attempt?.settlement).toBe("unknown");
      const again = await new LaunchCheckStore(storage, testEnv).run("/api/buy/launch_check", "digest", target);
      expect(again).toEqual(report);
      for (const changed of [["/api/buy/opening_day", "digest", target], ["/api/buy/launch_check", "wrong", target], ["/api/buy/launch_check", "digest", `${target}-wrong`]]) {
        await expect(new LaunchCheckStore(storage, testEnv).run(changed[0]!, changed[1]!, changed[2]!)).rejects.toThrow("mismatch");
      }
    });
  });
}
it("a new instance retains an interrupted attempt after expiry, with no second send", async () => {
  const stub = testEnv.PAID_RECOVERIES!.get(testEnv.PAID_RECOVERIES!.idFromName(`launch-test:${crypto.randomUUID()}`));
  await runInDurableObject(stub, async (_instance, state) => {
    resetBody = true;
    await expect(new LaunchCheckStore(state.storage, testEnv).run("/api/buy/launch_check", "digest", target)).rejects.toThrow();
    const attempt = await state.storage.get("launch:attempt");
    resetBody = false;
    vi.setSystemTime(new Date("2026-09-15T12:00:00Z"));
    const recovered = await new LaunchCheckStore(state.storage, testEnv).run("/api/buy/launch_check", "digest", target);
    expect(recovered).toMatchObject(attempt!);
    expect(recovered.stages.at(-1)?.detail).toContain("unknown");
    expect(sends).toBe(1); expect(walks).toBe(1);
    expect(spendableSignature).not.toBe("");
    expect(JSON.stringify([...await state.storage.list()])).not.toContain(spendableSignature);
  });
});
