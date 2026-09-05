import { env } from "cloudflare:test";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { app } from "@/index";
import { HANDED_HEADER, doors, doorsReady } from "@/lib/doors-app";
import { edgeMiddleware } from "@/lib/edge";
import { doorChecks } from "@/routes/door-checks";
import { markKeeperSeen } from "@/services/shutter";
import { MENU_ITEMS } from "@/store";
import { RETIRED_ITEMS } from "@/store/retired";
import type { Env } from "@/types";
import { installFacilitatorMock } from "./helpers/facilitator-mock";

/**
 * THE DOORS ANSWER AS THE STORE ANSWERS (2026-09-05, the doors Worker).
 *
 * A second Worker now takes the unpaid knock on /api/buy/*: a script a
 * quarter of the store's size, so a cold isolate costs a buyer and the
 * directory tens of milliseconds instead of hundreds
 * (research/x402-list-latency-2026-09-05.md). The one promise that
 * makes it safe is that nobody can tell which Worker answered. This
 * file holds that promise three ways:
 *
 *   1. BYTE PARITY. Every paid door, and every edge a knock can arrive
 *      on — HEAD, a trailing slash, a trailing dot, a browser's Accept,
 *      an unknown slug, a retired one, a required argument missing, a
 *      CORS preflight, a POST with no payment, plain http — is knocked
 *      on in both Workers under one frozen clock, and the status, the
 *      body and every header but the isolate's own clock must match.
 *   2. HAND-OVER. A knock with a payment on it never meets the doors'
 *      checks: it reaches the store's binding exactly as it came,
 *      method, URL, headers and body, and the store's answer comes
 *      back untouched but for one header that says why. A knock with
 *      nothing to pay never reaches the binding at all. A doors Worker
 *      without its secrets hands everything over; one without the
 *      binding says so in a 503 and never guesses.
 *   3. THE SAME FUNCTIONS IN THE SAME ORDER. Both routers are asked
 *      what they would run for a door, and the store's sequence up to
 *      its delivery handler must be the doors' sequence exactly, by
 *      reference. A middleware added to one entry file and not the
 *      other fails here before it can fail on the wire.
 */

const testEnv = env as unknown as Env;
const FROZEN = new Date("2026-09-05T18:00:00.000Z");

/** Headers the isolate's own clock writes; everything else must match. */
const CLOCK_HEADERS = new Set(["server-timing", "date", HANDED_HEADER.toLowerCase()]);

interface Handed {
  calls: Request[];
  answer: () => Response;
  sentinel?: (() => Response) | null;
}
const SENTINEL = () => new Response("the store would deliver", { status: 299, headers: { "X-Sentinel": "store" } });

/**
 * The store's binding as the doors see it. By default it IS the store —
 * the same app, the same env — so a knock the doors hand over comes
 * back with the store's real answer and byte parity can be asked of
 * it too; every hand-over is recorded. A hand-over test swaps in a
 * sentinel for the duration to prove nothing between the binding and
 * the caller was touched.
 */
function storeBinding(): { binding: Fetcher; handed: Handed } {
  const handed: Handed = {
    calls: [],
    answer: () => {
      throw new Error("the sentinel is set per test");
    },
  };
  let sentinel: (() => Response) | null = null;
  handed.answer = (() => {
    throw new Error("use handed.sentinel");
  }) as never;
  const binding = {
    fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = input instanceof Request ? input : new Request(input, init);
      handed.calls.push(request.clone());
      if (sentinel) return sentinel();
      const { ctx: executionCtx, settle } = ctx();
      const answer = await app.fetch(request, testEnv, executionCtx);
      await settle();
      return answer;
    },
  } as unknown as Fetcher;
  Object.defineProperty(handed, "sentinel", {
    get: () => sentinel,
    set: (value: (() => Response) | null) => {
      sentinel = value;
    },
  });
  return { binding, handed };
}

function ctx() {
  const pending: Promise<unknown>[] = [];
  return {
    ctx: {
      waitUntil: (p: Promise<unknown>) => {
        pending.push(p);
      },
      passThroughOnException: () => {},
    } as unknown as ExecutionContext,
    settle: () => Promise.allSettled(pending),
  };
}

async function knock(
  worker: { fetch: (r: Request, e: Env, c: ExecutionContext) => Response | Promise<Response> },
  environment: Env,
  url: string,
  init: RequestInit = {},
): Promise<{ status: number; body: string; headers: Record<string, string> }> {
  const { ctx: executionCtx, settle } = ctx();
  const response = await worker.fetch(new Request(url, init), environment, executionCtx);
  const body = await response.text();
  await settle();
  const headers: Record<string, string> = {};
  for (const [name, value] of response.headers) {
    if (!CLOCK_HEADERS.has(name.toLowerCase())) headers[name.toLowerCase()] = value;
  }
  return { status: response.status, body, headers };
}

let doorsEnv: Env;
let handed: Handed;

beforeAll(async () => {
  installFacilitatorMock();
  await markKeeperSeen(testEnv);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(FROZEN);
  const bound = storeBinding();
  handed = bound.handed;
  doorsEnv = { ...testEnv, STORE: bound.binding };
});

afterAll(() => {
  vi.useRealTimers();
});

const BASE = "https://scvd.store";
const JSON_ACCEPT = { Accept: "application/json" };

/**
 * The same knock at both Workers, one clock. By default the doors must
 * answer it THEMSELVES — a hand-over would mean the store's isolate
 * woke, which is the cost the split exists to remove. A knock the
 * store's own handler answers rather than its gate (an unpaid HEAD,
 * an OPTIONS with no CORS surface) is allowed to be handed over, and
 * the answer must still be the store's, byte for byte, marked as
 * handed.
 */
async function bothAnswerAlike(path: string, init: RequestInit = {}, allow: { handOver?: "passed" } = {}) {
  vi.setSystemTime(FROZEN);
  const fromStore = await knock(app, testEnv, `${BASE}${path}`, init);
  vi.setSystemTime(FROZEN);
  const before = handed.calls.length;
  const { ctx: executionCtx, settle } = ctx();
  const raw = await doors.fetch(new Request(`${BASE}${path}`, init), doorsEnv, executionCtx);
  const handedAs = raw.headers.get(HANDED_HEADER);
  const body = await raw.text();
  await settle();
  const headers: Record<string, string> = {};
  for (const [name, value] of raw.headers) {
    if (!CLOCK_HEADERS.has(name.toLowerCase())) headers[name.toLowerCase()] = value;
  }
  const fromDoors = { status: raw.status, body, headers };
  expect(fromDoors.status, `${path}: status`).toBe(fromStore.status);
  expect(fromDoors.headers, `${path}: headers`).toEqual(fromStore.headers);
  expect(fromDoors.body, `${path}: body`).toBe(fromStore.body);
  if (allow.handOver) {
    expect(handedAs, `${path}: handed to the store as`).toBe(allow.handOver);
    expect(handed.calls.length, `${path}: handed once`).toBe(before + 1);
  } else {
    expect(handedAs, `${path}: answered by the doors themselves`).toBeNull();
    expect(handed.calls.length, `${path}: the store's binding was never asked`).toBe(before);
  }
  return fromStore;
}

describe("byte parity: the unpaid knock", () => {
  it("is ready under the test environment, so parity is the doors' own answer", () => {
    expect(doorsReady(doorsEnv)).toBe(true);
    expect(doorsReady(testEnv)).toBe(false);
  });

  it("every paid door answers the same 402, header for header, byte for byte", async () => {
    let challenged = 0;
    for (const item of MENU_ITEMS) {
      const answer = await bothAnswerAlike(`/api/buy/${item.id}`, { headers: JSON_ACCEPT });
      if (answer.status === 402) {
        challenged += 1;
        expect(answer.headers["payment-required"], item.id).toBeTruthy();
        expect(answer.headers["x-robots-tag"], item.id).toBe("noindex");
      }
    }
    // The shelf can hold sold-out or shuttered doors that answer
    // something other than 402; the walk still compares them. But a
    // walk that challenged nothing would be comparing refusals only.
    expect(challenged).toBeGreaterThan(0);
  });

  it("HEAD, a trailing slash, a trailing dot and a browser's Accept", async () => {
    const [first] = MENU_ITEMS;
    expect(first).toBeDefined();
    const door = `/api/buy/${first!.id}`;
    // An unpaid HEAD passes the gate (x402 requires payment of a GET)
    // and the store's own handler answers it; the doors hand it over.
    await bothAnswerAlike(door, { method: "HEAD", headers: JSON_ACCEPT }, { handOver: "passed" });
    await bothAnswerAlike(`${door}/`, { headers: JSON_ACCEPT });
    await bothAnswerAlike(`${door}.`, { headers: JSON_ACCEPT, redirect: "manual" });
    await bothAnswerAlike(door, { headers: { Accept: "text/html,application/xhtml+xml", "User-Agent": "Mozilla/5.0" } });
    await bothAnswerAlike(door, { headers: { ...JSON_ACCEPT, "Accept-Encoding": "gzip" } });
  });

  it("an unknown slug, a retired one, and the store's own 404 shape", async () => {
    await bothAnswerAlike("/api/buy/no_such_door", { headers: JSON_ACCEPT });
    for (const retired of RETIRED_ITEMS) {
      await bothAnswerAlike(`/api/buy/${retired.id}`, { headers: JSON_ACCEPT });
    }
  });

  it("a required argument missing, a stray query, a porch signal", async () => {
    await bothAnswerAlike("/api/buy/graffiti_on_a_train", { headers: JSON_ACCEPT });
    await bothAnswerAlike("/api/buy/graffiti_on_a_train?tag=SIGNED%20NOW", { headers: JSON_ACCEPT });
    await bothAnswerAlike("/api/buy/hello?src=doors-parity&house=test", { headers: JSON_ACCEPT });
    await bothAnswerAlike("/api/buy/settlement_attestation?tx_hash=not-a-hash", { headers: JSON_ACCEPT });
  });

  it("a CORS preflight, a POST with nothing to pay, and plain http", async () => {
    // No CORS surface on a paid door: the preflight passes every check
    // and the store's router answers it. The doors hand it over.
    await bothAnswerAlike(
      "/api/buy/hello",
      { method: "OPTIONS", headers: { Origin: "https://example.test", "Access-Control-Request-Method": "GET" } },
      { handOver: "passed" },
    );
    // A POST with nothing to pay passes the gate the same way and meets
    // the store's method answer (405 with Allow); handed over, as HEAD is.
    await bothAnswerAlike(
      "/api/buy/hello",
      { method: "POST", headers: { ...JSON_ACCEPT, "Content-Type": "application/json" }, body: "{}" },
      { handOver: "passed" },
    );
    const fromStore = await knock(app, testEnv, "http://scvd.store/api/buy/hello", { redirect: "manual" });
    const fromDoors = await knock(doors, doorsEnv, "http://scvd.store/api/buy/hello", { redirect: "manual" });
    expect(fromStore.status).toBe(301);
    expect(fromDoors).toEqual(fromStore);
  });

  it("an empty payment header is no payment, in both", async () => {
    await bothAnswerAlike("/api/buy/hello", { headers: { ...JSON_ACCEPT, "PAYMENT-SIGNATURE": "" } });
  });
});

describe("hand-over: what the doors never touch", () => {
  const paid = { ...JSON_ACCEPT, "PAYMENT-SIGNATURE": "eyJub3QiOiJyZWFsIn0=", "X-Trace": "keep-me" };

  it("a knock with a payment reaches the store as it came, and the answer comes back as it was", async () => {
    handed.sentinel = SENTINEL;
    const before = handed.calls.length;
    const { ctx: executionCtx } = ctx();
    const response = await doors.fetch(
      new Request(`${BASE}/api/buy/hello?tag=x`, { method: "POST", headers: { ...paid, "Content-Type": "text/plain" }, body: "the body" }),
      doorsEnv,
      executionCtx,
    );
    expect(handed.calls.length).toBe(before + 1);
    const seen = handed.calls[before]!;
    expect(seen.method).toBe("POST");
    expect(seen.url).toBe(`${BASE}/api/buy/hello?tag=x`);
    expect(seen.headers.get("PAYMENT-SIGNATURE")).toBe(paid["PAYMENT-SIGNATURE"]);
    expect(seen.headers.get("X-Trace")).toBe("keep-me");
    expect(await seen.text()).toBe("the body");
    expect(response.status).toBe(299);
    expect(response.headers.get("X-Sentinel")).toBe("store");
    expect(response.headers.get(HANDED_HEADER)).toBe("paid");
    expect(await response.text()).toBe("the store would deliver");
    handed.sentinel = null;
  });

  it("the v1 alias X-PAYMENT is a payment too", async () => {
    handed.sentinel = SENTINEL;
    const before = handed.calls.length;
    const response = await doors.fetch(
      new Request(`${BASE}/api/buy/hello`, { headers: { ...JSON_ACCEPT, "X-PAYMENT": "eyJub3QiOiJyZWFsIn0=" } }),
      doorsEnv,
      ctx().ctx,
    );
    expect(handed.calls.length).toBe(before + 1);
    expect(response.headers.get(HANDED_HEADER)).toBe("paid");
    handed.sentinel = null;
  });

  it("a store answer with a body, a 402 and its own headers passes through byte for byte", async () => {
    const body = JSON.stringify({ error: "Payment declined", payment_declined: { reason: "test" } });
    handed.sentinel = () =>
      new Response(body, {
        status: 402,
        headers: { "Content-Type": "application/json; charset=utf-8", "PAYMENT-REQUIRED": "eyJ4NDAyVmVyc2lvbiI6Mn0=", Vary: "Accept" },
      });
    try {
      const response = await doors.fetch(new Request(`${BASE}/api/buy/hello`, { headers: paid }), doorsEnv, ctx().ctx);
      expect(response.status).toBe(402);
      expect(response.headers.get("PAYMENT-REQUIRED")).toBe("eyJ4NDAyVmVyc2lvbiI6Mn0=");
      expect(response.headers.get("Vary")).toBe("Accept");
      expect(await response.text()).toBe(body);
    } finally {
      handed.sentinel = null;
    }
  });

  it("an unpaid knock with a body that passes every check reaches the store with its body intact", async () => {
    handed.sentinel = SENTINEL;
    const before = handed.calls.length;
    const response = await doors.fetch(
      new Request(`${BASE}/api/buy/hello`, { method: "POST", headers: { ...JSON_ACCEPT, "Content-Type": "application/json" }, body: '{"kept":true}' }),
      doorsEnv,
      ctx().ctx,
    );
    expect(response.headers.get(HANDED_HEADER)).toBe("passed");
    expect(handed.calls.length).toBe(before + 1);
    expect(await handed.calls[before]!.text()).toBe('{"kept":true}');
    handed.sentinel = null;
  });

  it("a real payment that the store declines comes back as the store's own 402, through the doors", async () => {
    // No sentinel: the binding is the store. A garbage payment is
    // declined by the store's gate, and the doors carry that answer.
    const before = handed.calls.length;
    const response = await doors.fetch(new Request(`${BASE}/api/buy/hello`, { headers: paid }), doorsEnv, ctx().ctx);
    expect(handed.calls.length).toBe(before + 1);
    expect(response.headers.get(HANDED_HEADER)).toBe("paid");
    expect(response.status).toBe(402);
    expect(response.headers.get("PAYMENT-REQUIRED")).toBeTruthy();
  });

  it("a knock outside the doors' own paths is the store's, whatever the route pattern says", async () => {
    const before = handed.calls.length;
    const response = await doors.fetch(new Request(`${BASE}/menu`, { headers: JSON_ACCEPT }), doorsEnv, ctx().ctx);
    expect(handed.calls.length).toBe(before + 1);
    expect(response.headers.get(HANDED_HEADER)).toBe("elsewhere");
    const own = await app.fetch(new Request(`${BASE}/menu`, { headers: JSON_ACCEPT }), testEnv, ctx().ctx);
    expect(response.status).toBe(own.status);
  });

  it("on a hostname that is not the store's, a page is refused and never proxied; a door still answers", async () => {
    const before = handed.calls.length;
    const page = await doors.fetch(new Request("https://scvd-doors.example.workers.dev/menu", { headers: JSON_ACCEPT }), doorsEnv, ctx().ctx);
    expect(page.status).toBe(404);
    expect(page.headers.get("X-Robots-Tag")).toBe("noindex");
    expect(page.headers.get(HANDED_HEADER)).toMatch(/^refused/);
    expect(handed.calls.length).toBe(before);
    const door = await doors.fetch(new Request("https://scvd-doors.example.workers.dev/api/buy/hello", { headers: JSON_ACCEPT }), doorsEnv, ctx().ctx);
    expect(door.status).toBe(402);
    expect(door.headers.get("PAYMENT-REQUIRED")).toBeTruthy();
    expect(handed.calls.length).toBe(before);
  });

  it("without its secrets the doors hand every knock over, unpaid ones included", async () => {
    handed.sentinel = SENTINEL;
    const before = handed.calls.length;
    const unready = { ...doorsEnv, SIGNING_KEY: "" };
    expect(doorsReady(unready)).toBe(false);
    const response = await doors.fetch(new Request(`${BASE}/api/buy/hello`, { headers: JSON_ACCEPT }), unready, ctx().ctx);
    expect(handed.calls.length).toBe(before + 1);
    expect(response.headers.get(HANDED_HEADER)).toBe("not-ready");
    expect(response.status).toBe(299);
    handed.sentinel = null;
  });

  it("without the binding the doors say so, and never mint a 402 on their own", async () => {
    const { STORE: _store, ...unbound } = doorsEnv;
    void _store;
    const response = await doors.fetch(new Request(`${BASE}/api/buy/hello`, { headers: JSON_ACCEPT }), unbound as Env, ctx().ctx);
    expect(response.status).toBe(503);
    expect(response.headers.get(HANDED_HEADER)).toMatch(/^unbound/);
    expect(response.headers.get("PAYMENT-REQUIRED")).toBeNull();
    const body = (await response.json()) as { error: string };
    expect(body.error).toMatch(/not bound to the store/);
  });
});

describe("the same functions in the same order", () => {
  type Matched = unknown;
  function handlersFor(worker: { router: { match: (m: string, p: string) => Matched } }, path: string): Function[] {
    const result = worker.router.match("GET", path) as unknown[];
    const first = result[0] as unknown[];
    const out: Function[] = [];
    for (const entry of first) {
      // Hono's router answers [[handler, route], params][]; take the handler.
      let node: unknown = entry;
      while (Array.isArray(node)) node = node[0];
      if (typeof node === "function") out.push(node);
    }
    return out;
  }

  it("the store's sequence up to delivery is the doors' sequence, by reference", () => {
    const fromStore = handlersFor(app as never, "/api/buy/hello");
    const fromDoors = handlersFor(doors as never, "/api/buy/hello");
    expect(fromStore.length).toBe(edgeMiddleware.length + doorChecks.length + 1);
    const storeBeforeDelivery = fromStore.slice(0, -1);
    // doors: [handOverFirst, ...edge, ...checks, handOverPassed, handOverElsewhere]
    expect(fromDoors.slice(1, 1 + storeBeforeDelivery.length)).toEqual(storeBeforeDelivery);
    expect(fromDoors.length).toBe(storeBeforeDelivery.length + 3);
    // and the delivery handler itself is not in the doors at all
    expect(fromDoors).not.toContain(fromStore[fromStore.length - 1]);
  });

  it("a check that throws falls off the same shelf in both Workers", () => {
    const errorHandlerOf = (worker: unknown) => (worker as { errorHandler: unknown }).errorHandler;
    expect(errorHandlerOf(doors)).toBe(errorHandlerOf(app));
    expect(typeof errorHandlerOf(app)).toBe("function");
  });

  it("the lists both entries register are the lists the store runs", () => {
    const fromStore = handlersFor(app as never, "/api/buy/hello");
    expect(fromStore.slice(0, edgeMiddleware.length)).toEqual([...edgeMiddleware]);
    expect(fromStore.slice(edgeMiddleware.length, edgeMiddleware.length + doorChecks.length)).toEqual([...doorChecks]);
  });
});
