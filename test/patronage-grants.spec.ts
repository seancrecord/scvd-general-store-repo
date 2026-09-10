import { env, runInDurableObject } from "cloudflare:test";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createOrRenewPass, getPass, preparePatronage } from "@/services/patronage";
import { PatronageRecoveryStore, patronageCoordinator, type PatronageGrantInput } from "@/services/patronage-recovery";
import { KV_KEYS } from "@/lib/kv-keys";
import type { Env } from "@/types";

const e = env as unknown as Env;
const at = new Date("2026-09-09T12:00:00Z");
beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(at); });
afterEach(() => vi.useRealTimers());

it("distinct simultaneous renewals each add one grant; old retries retain their own term", async () => {
  const prepared = await preparePatronage(e, undefined, "SCVD-E2E-grants-α"), input = { patronNumber: 9 };
  const first = await createOrRenewPass(e, input, { prepared, certId: "first" });
  const renewal = await preparePatronage(e, first.pass.pass_id);
  const results = await Promise.all(["second", "third"].map(certId => createOrRenewPass(e, input, { prepared: renewal, certId })));
  expect(results.map(row => row.pass.renewals).sort()).toEqual([1, 2]);
  const latest = (await getPass(e, first.pass.pass_id))!;
  expect(Date.parse(latest.expires_at) - at.getTime()).toBe(90 * 86400_000);
  await e.PATRONS.delete(KV_KEYS.patronagePass(first.pass.pass_id));
  vi.setSystemTime(new Date(at.getTime() + 100 * 86400_000));
  const replay = await createOrRenewPass(e, input, { prepared, certId: "first" });
  expect(replay).toEqual(first);
  expect(await e.PATRONS.get(KV_KEYS.patronagePass(first.pass.pass_id), "json")).toEqual(latest);
});

for (const point of ["grant", "current", "alarm"]) for (const after of [false, true]) {
  it(`atomic ${point} ${after ? "acknowledgement" : "write"} failure cannot leave an untracked extension`, async () => {
    const prepared = await preparePatronage(e);
    const stub = patronageCoordinator(e, prepared.passId);
    await runInDurableObject(stub, async (_instance, state) => {
      let fail = true;
      const storage = new Proxy(state.storage, { get(target, method) {
        if (method === "transaction") return (callback: (txn: DurableObjectTransaction) => Promise<unknown>) => target.transaction(txn => callback(new Proxy(txn, {
          get(inner, property) {
            if (property === "put") return async (key: string, value: unknown) => {
              const match = point === "grant" ? key.startsWith("patronage:grant:") : point === "current" && key === "patronage:current";
              if (fail && match && !after) throw new Error("fixture write failed");
              await inner.put(key, value);
              if (fail && match && after) throw new Error("fixture acknowledgement lost");
            };
            if (property === "setAlarm") return async (time: number) => {
              if (fail && point === "alarm" && !after) throw new Error("fixture alarm failed");
              await inner.setAlarm(time);
              if (fail && point === "alarm" && after) throw new Error("fixture alarm acknowledgement lost");
            };
            const member = Reflect.get(inner, property);
            return typeof member === "function" ? member.bind(inner) : member;
          },
        })));
        const member = Reflect.get(target, method);
        return typeof member === "function" ? member.bind(target) : member;
      } });
      const input: PatronageGrantInput = { prepared, certId: "original", patronNumber: 9 };
      await expect(new PatronageRecoveryStore(storage, e).grant(input)).rejects.toThrow();
      fail = false;
      const recovered = await new PatronageRecoveryStore(storage, e).grant(input);
      expect(recovered.pass.renewals).toBe(0);
      expect(await new PatronageRecoveryStore(storage, e).grant(input)).toEqual(recovered);
      await expect(new PatronageRecoveryStore(storage, e).grant({ ...input, patronNumber: 99 })).rejects.toThrow("mismatch");
    });
  });
}

it("an expired renewal extends from its original purchase time, never from a late repair", async () => {
  const first = await createOrRenewPass(e, { patronNumber: 9 });
  vi.setSystemTime(new Date(at.getTime() + 40 * 86400_000));
  const prepared = await preparePatronage(e, first.pass.pass_id);
  vi.setSystemTime(new Date(at.getTime() + 100 * 86400_000));
  const result = await createOrRenewPass(e, { patronNumber: 9 }, { prepared, certId: "renewal" });
  expect(result.pass.expires_at).toBe(new Date(at.getTime() + 70 * 86400_000).toISOString());
});

it("a missing current journal cannot return a delivered grant without a retrievable pass", async () => {
  const prepared = await preparePatronage(e), input = { prepared, certId: "original", patronNumber: 1 };
  const stub = patronageCoordinator(e, prepared.passId);
  await stub.grantPatronage(input);
  await runInDurableObject(stub, async (_instance, state) => state.storage.delete("patronage:current"));
  await e.PATRONS.delete(KV_KEYS.patronagePass(prepared.passId));
  await expect((async () => await stub.grantPatronage(input))()).rejects.toThrow("incomplete");
});
