import { env } from "cloudflare:test";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { app } from "@/index";
import { HANDED_HEADER, doors } from "@/lib/doors-app";
import { markKeeperSeen } from "@/services/shutter";
import type { Env } from "@/types";
import { installFacilitatorMock } from "./helpers/facilitator-mock";

/**
 * THE TWO DOORS THAT WOKE THE STORE FOR NOTHING (2026-09-12).
 *
 * launch_check and opening_day were handed to the store on every
 * knock, because their purchase check asks whether the field wallet
 * exists and only the store holds that key. But a bare probe never
 * reaches that question: it runs checkPurchaseInputSafety, and the
 * field wallet is consulted in checkPurchaseArgs, one knock further
 * in. So the directory's fifteen-minute burst woke a 4.29 MB isolate
 * to answer a 402 the doors Worker had already answered thirty times
 * in the same burst, and the door timed out of its own listing.
 *
 * The parity spec proves the two Workers agree; it cannot prove this,
 * because it runs both apps against ONE env, so a doors Worker that
 * secretly needed a store secret would pass it. This spec takes the
 * secret away — the doors Worker's real condition — and requires the
 * bare probe to be answered anyway, with the same terms, without the
 * binding being touched. A knock that supplies its target still goes
 * to the store, which is the whole reason the hand-over exists.
 */
const testEnv = env as unknown as Env;
const FROZEN = new Date("2026-09-12T18:00:00.000Z");
const BASE = "https://scvd.store";
const HAND_OVER_DOORS = ["launch_check", "opening_day"] as const;

function ctx() {
  const pending: Promise<unknown>[] = [];
  return {
    ctx: { waitUntil: (p: Promise<unknown>) => { pending.push(p); }, passThroughOnException: () => {} } as unknown as ExecutionContext,
    settle: () => Promise.allSettled(pending),
  };
}

const calls: Request[] = [];
/** The store as the doors see it — recorded, and answered by the real store. */
const binding = {
  fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    calls.push(request.clone());
    const { ctx: executionCtx, settle } = ctx();
    const answer = await app.fetch(request, testEnv, executionCtx);
    await settle();
    return answer;
  },
} as unknown as Fetcher;

/** The doors Worker as deployed: no field wallet, because it is the store's. */
let keylessDoorsEnv: Env;

beforeAll(async () => {
  installFacilitatorMock();
  await markKeeperSeen(testEnv);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(FROZEN);
  const withoutWallet = { ...testEnv, STORE: binding } as Env;
  delete (withoutWallet as { FIELD_WALLET_KEY?: string }).FIELD_WALLET_KEY;
  keylessDoorsEnv = withoutWallet;
});

afterAll(() => {
  vi.useRealTimers();
});

async function knock(worker: typeof app | typeof doors, environment: Env, url: string) {
  vi.setSystemTime(FROZEN);
  const { ctx: executionCtx, settle } = ctx();
  const response = await worker.fetch(new Request(url, { headers: { Accept: "application/json" } }), environment, executionCtx);
  const body = await response.text();
  await settle();
  return { status: response.status, body, handed: response.headers.get(HANDED_HEADER), terms: response.headers.get("PAYMENT-REQUIRED") };
}

describe("the doors answer a bare probe without waking the store", () => {
  it("quotes launch_check and opening_day itself, with no field wallet of its own", async () => {
    for (const id of HAND_OVER_DOORS) {
      const before = calls.length;
      const fromDoors = await knock(doors, keylessDoorsEnv, `${BASE}/api/buy/${id}`);
      expect(fromDoors.status, `${id}: a bare probe is answered, not refused for a secret it never holds`).toBe(402);
      expect(calls.length - before, `${id}: the store's isolate stayed asleep`).toBe(0);
      expect(fromDoors.handed, `${id}: nothing was handed over`).toBeNull();
      expect(fromDoors.terms, `${id}: the challenge carries payable terms`).toBeTruthy();
    }
  });

  it("quotes exactly what the store would have quoted", async () => {
    for (const id of HAND_OVER_DOORS) {
      const fromStore = await knock(app, testEnv, `${BASE}/api/buy/${id}`);
      const fromDoors = await knock(doors, keylessDoorsEnv, `${BASE}/api/buy/${id}`);
      expect(fromDoors.status, id).toBe(fromStore.status);
      expect(fromDoors.terms, `${id}: same PAYMENT-REQUIRED`).toBe(fromStore.terms);
      expect(fromDoors.body, `${id}: same body`).toBe(fromStore.body);
    }
  });

  it("still hands over the knock that supplies a target, where the field wallet is asked for", async () => {
    for (const id of HAND_OVER_DOORS) {
      const before = calls.length;
      const answer = await knock(doors, keylessDoorsEnv, `${BASE}/api/buy/${id}?url=${encodeURIComponent("https://your-shop.example/api/buy/thing")}`);
      expect(calls.length - before, `${id}: a composed purchase reaches the store`).toBe(1);
      expect(answer.handed, `${id}: and says so`).toBe("passed");
    }
  });
});
