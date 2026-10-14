import { env, runInDurableObject } from "cloudflare:test";
import { beforeEach, expect, it, vi } from "vitest";
import { LaunchCheckStore } from "@/services/launch-check-recovery";
import type { LaunchCheckCore, LaunchCheckRequest } from "@/services/launch-check";
import { BASE_EVM } from "@/lib/base-rpc";
import { runLaunchPilot, type LaunchPilotInput } from "@/services/launch-pilot";
import type { Env } from "@/types";

const testEnv = env as Env;
const target = "https://fixture.example/paid";
const body = '{"pair":"USDG","tax":1}';
let calls: Array<{ method: string; body: unknown; paid: boolean }> = [];
let walks = 0;
vi.mock("@/services/launch-check", async load => {
  const actual = await load<typeof import("@/services/launch-check")>();
  return { ...actual, performLaunchCheck: async (...args: Parameters<typeof actual.performLaunchCheck>) => {
    walks++;
    return actual.performLaunchCheck(args[0], args[1], { ...args[2],
      now: new Date("2026-09-28T16:30:00Z"),
      signer: { address: `0x${"11".repeat(20)}`, signTypedData: async () => `0x${"ab".repeat(65)}` },
      screen: async () => ({ listed: false, source: "offline fixture" }),
      fetch: async (_url, init) => {
        const paid = new Headers(init?.headers).has("PAYMENT-SIGNATURE");
        calls.push({ method: init?.method ?? "GET", body: init?.body, paid });
        return paid ? Response.json({ goods: "fixture" }) : Response.json({ accepts: [{
          scheme: "exact", network: BASE_EVM.caip2, asset: BASE_EVM.usdc,
          payTo: `0x${"22".repeat(20)}`, amount: "5000", maxTimeoutSeconds: 60,
        }] }, { status: 402 });
      },
    });
  } };
});
beforeEach(() => { calls = []; walks = 0; });
const request = (): LaunchCheckRequest => ({ method: "POST", body });
function stub() { return testEnv.PAID_RECOVERIES!.getByName(`pilot-journal-test:${crypto.randomUUID()}`); }
// RPC results are pipeline-capable thenables. Await into a native Promise
// before Vitest inspects a rejection, or matcher introspection creates orphan RPCs.
async function invoke(pilot: LaunchPilotInput) { return await stub().prepareLaunchPilot(pilot); }

it("binds the supplied request before queueing, and coalesces concurrent duplicate invocations", async () => {
  await runInDurableObject(stub(), async (_instance, state) => {
    const journal = new LaunchCheckStore(state.storage, testEnv);
    const input = request();
    const first = journal.run("pilot", "fixture-id", target, input);
    input.body = '{"pair":"CHANGED","tax":2}';
    const second = journal.run("pilot", "fixture-id", target, request());
    const reports = await Promise.all([first, second]);
    expect(reports[0]).toEqual(reports[1]);
    expect(walks).toBe(1);
    expect(calls).toHaveLength(3);
    expect(calls.every(call => call.method === "POST" && call.body === body)).toBe(true);
    expect(reports[0]!.request_evidence?.body_bytes).toBe(new TextEncoder().encode(body).byteLength);
    for (const changed of [undefined, { method: "POST" as const, body: body + " " }, { method: "POST" as const, body: '{"pair":"USDG","tax":2}' }]) {
      await expect(journal.run("pilot", "fixture-id", target, changed)).rejects.toThrow("mismatch");
    }
    expect(calls).toHaveLength(3);
    expect(JSON.stringify([...await state.storage.list()])).not.toContain(body);
  });
});

for (const point of ["launch:identity", "launch:attempt", "launch:observation", "launch:report"]) for (const after of [false, true]) {
  it(`retains pilot inputs across ${point} ${after ? "acknowledgement" : "write"} failure`, async () => {
    await runInDurableObject(stub(), async (_instance, state) => {
      let fail = true;
      const storage = new Proxy(state.storage, { get(target, method) {
        if (method === "put") return async (key: string, value: unknown) => {
          if (fail && key === point && !after) throw new Error("fixture interruption");
          await target.put(key, value);
          if (fail && key === point && after) throw new Error("fixture interruption");
        };
        const member = Reflect.get(target, method);
        return typeof member === "function" ? member.bind(target) : member;
      } });
      await expect(new LaunchCheckStore(storage, testEnv).run("pilot", "fixture-id", target, request())).rejects.toThrow("fixture interruption");
      const priorPaid = calls.filter(call => call.paid).length;
      fail = false;
      const recovered = await new LaunchCheckStore(storage, testEnv).run("pilot", "fixture-id", target, request());
      expect(recovered.request_evidence?.body_bytes).toBe(new TextEncoder().encode(body).byteLength);
      const canStart = point === "launch:identity" || (point === "launch:attempt" && !after);
      expect(calls.filter(call => call.paid)).toHaveLength(canStart ? 2 : priorPaid);
      expect(calls.every(call => call.method === "POST" && call.body === body)).toBe(true);
      await expect(new LaunchCheckStore(storage, testEnv).run("pilot", "fixture-id", target, { method: "POST", body: body + " " })).rejects.toThrow("mismatch");
    });
  });
}

it("refuses a retained pilot attempt whose request evidence is missing", async () => {
  await runInDurableObject(stub(), async (_instance, state) => {
    const journal = new LaunchCheckStore(state.storage, testEnv);
    await journal.run("pilot", "fixture-id", target, request());
    const core = (await state.storage.get<LaunchCheckCore>("launch:attempt"))!;
    delete core.request_evidence;
    await state.storage.put("launch:attempt", core);
    await state.storage.delete(["launch:report", "launch:observation"]);
    await expect(new LaunchCheckStore(state.storage, testEnv).run("pilot", "fixture-id", target, request())).rejects.toThrow("request evidence");
    expect(walks).toBe(1);
  });
});

it.each([false, true])("refuses missing pilot identity with report retained=%s", async keepReport => {
  await runInDurableObject(stub(), async (_instance, state) => {
    await new LaunchCheckStore(state.storage, testEnv).run("pilot", "fixture-id", target, request());
    await state.storage.delete("launch:identity");
    if (!keepReport) await state.storage.delete(["launch:report", "launch:observation"]);
    await expect(new LaunchCheckStore(state.storage, testEnv).run("pilot", "fixture-id", target, request())).rejects.toThrow("identity unavailable");
    expect(walks).toBe(1);
    expect(await state.storage.get("launch:identity")).toBeUndefined();
  });
});

it("invokes one durable pilot by its fixed id through the real binding", async () => {
  const pilot = { id: `fixture-${crypto.randomUUID()}`, url: target, request: request() };
  const [first, second] = await Promise.all([runLaunchPilot(testEnv, pilot), runLaunchPilot(testEnv, pilot)]);
  expect(first).toEqual(second);
  expect(first.request_evidence?.body_bytes).toBe(new TextEncoder().encode(body).byteLength);
  expect(walks).toBe(1);
  expect(calls).toHaveLength(3);
  expect(calls.every(call => call.method === "POST" && call.body === body)).toBe(true);
  await expect(runLaunchPilot(testEnv, { ...pilot, request: { method: "POST", body: body + " " } })).rejects.toThrow("mismatch");
  await expect(runLaunchPilot(testEnv, { ...pilot, url: target + "?changed=1" })).rejects.toThrow("mismatch");
  expect(walks).toBe(1);
});

it.each(["http://fixture.example/", "https://127.0.0.1/", "https://scvd.store/", "https://user:pass@fixture.example/", target + "#fragment"])("refuses invalid pilot target before invoking a walk: %s", async url => {
  const pilot = { id: `fixture-${crypto.randomUUID()}`, url, request: request() };
  await expect(runLaunchPilot(testEnv, pilot)).rejects.toThrow("Launch pilot");
  await expect(invoke(pilot)).rejects.toThrow("Launch pilot");
  expect(walks).toBe(0);
});

it.each([
  { id: "", url: target, request: request() },
  { id: "UPPER", url: target, request: request() },
  { id: "fixture", url: target },
  { id: "fixture", url: target, request: { method: "POST", body: "[]" } },
  { id: "fixture", url: target, request: request(), maxSpendUsd: 0 },
].map((input, index) => ({ input, index })))("rejects invalid or unsupported invocation fields $index before walking", async ({ input }) => {
  await expect(runLaunchPilot(testEnv, input as LaunchPilotInput)).rejects.toThrow();
  await expect(invoke(input as LaunchPilotInput)).rejects.toThrow();
  expect(walks).toBe(0);
});

it("does not bypass durable storage when the binding is absent", async () => {
  await expect(runLaunchPilot({ ...testEnv, PAID_RECOVERIES: undefined }, {
    id: "fixture", url: target, request: request(),
  })).rejects.toThrow("storage unavailable");
  expect(walks).toBe(0);
});
