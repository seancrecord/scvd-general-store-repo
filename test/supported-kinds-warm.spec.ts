import { env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  KvWarmFacilitatorClient,
  SUPPORTED_KINDS_KV_KEY,
} from "@/lib/payments";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;

/**
 * THE COLD-START TAX, RETIRED (ledger #51; the keeper's
 * directory-score push, 2026-08-26).
 *
 * Every deploy evicts every isolate, and the first paid request each
 * cold isolate served awaited a facilitator round trip before it
 * could quote a price. Directory probes knock cold almost by
 * definition, so the latency the scoreboards measured was
 * disproportionately this tax. The fuchss snapshot the keeper read
 * today: 792ms average from one EU vantage, p95 1562ms — against a
 * warm histogram whose p50 sits in [100,250).
 *
 * The kinds now warm in KV. These tests exercise the client class
 * directly — seeded cache, empty cache, and the failure edge — and
 * one labeled read pins that the gate actually constructs this
 * client rather than the bare one.
 */

const KINDS = {
  kinds: [{ x402Version: 2, scheme: "exact", network: "eip155:8453" }],
};

function countingFetch(): { fn: typeof fetch; calls: () => number } {
  let n = 0;
  const fn = (async (input: RequestInfo | URL) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.endsWith("/supported")) {
      n += 1;
      return Response.json(KINDS);
    }
    return new Response("unexpected", { status: 500 });
  }) as typeof fetch;
  return { fn, calls: () => n };
}

beforeEach(async () => {
  await testEnv.COUNTERS.delete(SUPPORTED_KINDS_KV_KEY);
});
afterEach(() => vi.unstubAllGlobals());

describe("a cold isolate quotes without phoning the facilitator", () => {
  it("serves seeded kinds while the facilitator hangs — the caller never waits on the wire", async () => {
    await testEnv.COUNTERS.put(SUPPORTED_KINDS_KV_KEY, JSON.stringify(KINDS));
    /*
     * THE DISCRIMINATOR IS A HUNG NETWORK, not a call count. The
     * detached background refresh may legitimately fire, so counting
     * calls cannot tell "served from cache" apart from "awaited the
     * wire" — and the first draft of this test proved it by staying
     * green when the cache read was mutated away. A fetch that never
     * resolves can: if getSupported returns at all, nothing awaited
     * the network.
     */
    vi.stubGlobal(
      "fetch",
      (() => new Promise<Response>(() => {})) as unknown as typeof fetch,
    );
    const client = new KvWarmFacilitatorClient(
      { url: "https://facilitator.example" },
      testEnv.COUNTERS,
    );
    const supported = await Promise.race([
      client.getSupported(),
      new Promise<"hung">((resolve) =>
        setTimeout(() => resolve("hung"), 2000),
      ),
    ]);
    expect(supported).not.toBe("hung");
    expect(supported).toMatchObject(KINDS);
  });

  it("pays the round trip exactly once when KV is empty, then banks it", async () => {
    const counter = countingFetch();
    vi.stubGlobal("fetch", counter.fn);

    const client = new KvWarmFacilitatorClient(
      { url: "https://facilitator.example" },
      testEnv.COUNTERS,
    );
    const supported = await client.getSupported();
    // The SDK normalizes (extensions etc.); the kinds are the claim.
    expect(supported).toMatchObject(KINDS);
    expect(counter.calls()).toBe(1);

    // What was banked is exactly what the caller got — so the next
    // cold isolate serves the same object this one did.
    const banked = await testEnv.COUNTERS.get(SUPPORTED_KINDS_KV_KEY, "json");
    expect(banked).toEqual(supported);
  });

  it("falls through to the network when the cached copy is unreadable", async () => {
    // Rule 52's shape again: a cache that cannot be read must not
    // become an answer. Garbage in KV means the real call happens.
    await testEnv.COUNTERS.put(SUPPORTED_KINDS_KV_KEY, "not json{{");
    const counter = countingFetch();
    vi.stubGlobal("fetch", counter.fn);

    const client = new KvWarmFacilitatorClient(
      { url: "https://facilitator.example" },
      testEnv.COUNTERS,
    );
    const supported = await client.getSupported();
    expect(supported).toMatchObject(KINDS);
    expect(counter.calls()).toBe(1);
  });

  it("a hung facilitator on the empty-cache path costs the supported budget, not the settle deadline", async () => {
    /*
     * THE LAST COLD CORNER (the keeper's latency prompt, 2026-08-27).
     * The KV warm covers every isolate except the one that has NEVER
     * banked the kinds — and that one used to wait on the library's
     * default deadline, which is sized for settle, where money is in
     * flight. Quoting a price is not that: getSupported now runs on
     * its own short lane (SUPPORTED_TIMEOUT_MS in production; squeezed
     * here so the suite stays fast), so a dead facilitator becomes a
     * bounded, honest refusal instead of a half-minute hang in front
     * of a buyer's first-ever 402.
     */
    // The hang honors the abort signal, as real fetch does — the
    // library's deadline works by AbortSignal, so a stub that ignores
    // it would prove nothing about the budget.
    vi.stubGlobal(
      "fetch",
      ((_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(
              Object.assign(new Error("The operation was aborted"), {
                name: "AbortError",
              }),
            ),
          );
        })) as unknown as typeof fetch,
    );
    const client = new KvWarmFacilitatorClient(
      { url: "https://facilitator.example" },
      testEnv.COUNTERS,
      undefined,
      120,
    );
    const outcome = await Promise.race([
      client.getSupported().then(
        () => "answered",
        () => "refused",
      ),
      new Promise<"still-waiting">((resolve) =>
        setTimeout(() => resolve("still-waiting"), 2000),
      ),
    ]);
    expect(outcome).toBe("refused");
    // And a refusal banks NOTHING. A cached failure would outlive the
    // outage it recorded; the next isolate must ask fresh.
    expect(await testEnv.COUNTERS.get(SUPPORTED_KINDS_KV_KEY)).toBeNull();
  });

  it("never banks a failure even when the facilitator answers garbage", async () => {
    vi.stubGlobal(
      "fetch",
      (async () =>
        new Response("bad gateway", { status: 502 })) as unknown as typeof fetch,
    );
    const client = new KvWarmFacilitatorClient(
      { url: "https://facilitator.example" },
      testEnv.COUNTERS,
    );
    await expect(client.getSupported()).rejects.toThrow();
    expect(await testEnv.COUNTERS.get(SUPPORTED_KINDS_KV_KEY)).toBeNull();
  });

  it("is the client the gate actually constructs — read, and labeled as a read", async () => {
    const source = (
      await import("../src/lib/payments.ts?raw")
    ).default as unknown as string;
    const site = source.slice(source.indexOf("function getPaymentStack"));
    expect(site).toContain("new KvWarmFacilitatorClient(");
    expect(site).not.toContain("new HTTPFacilitatorClient(");
  });
});
