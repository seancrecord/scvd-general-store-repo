import { env } from "cloudflare:test";
import { afterEach, describe, expect, it } from "vitest";
import { getBlockNumber, getReceipt, getReceiptsBatch } from "@/lib/base-rpc";
import { observeSettlement } from "@/services/attestation";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;
const TX = `0x${"ab".repeat(32)}`;

/**
 * THE UNDELIVERED SALES, AND WHERE THEY ACTUALLY CAME FROM.
 *
 * Four items read the chain AFTER the money has settled and BEFORE the
 * certificate is minted: settlement_attestation, attestation_bundle,
 * service_audit and settlement_reconciliation. Production runs against
 * the PUBLIC Base RPC, which rate-limits. There was no retry. A single
 * 429 in that window was money taken with nothing delivered.
 *
 * The live evidence that pinned it: one buyer, two purchases minutes
 * apart, same rail, same receiving address. small_blessing delivered —
 * it reads no chain. settlement_attestation dropped — it reads the
 * chain twice. Per-item, not per-buyer and not per-chain, which is the
 * shape of a dependency rather than of a payment bug.
 *
 * THE LINE THESE TESTS DEFEND. Retrying a provider that will not
 * answer is not the same as re-asking the chain until it says
 * something nicer. `result: null` is an ANSWER — the honest NOT_FOUND
 * somebody paid for — and it must be returned the first time, always.
 * If that ever starts being retried, the store is polling and calling
 * it an observation.
 */

let originalFetch: typeof globalThis.fetch;

/*
 * THE MOCK DISPATCHES BY METHOD, NOT BY CALL ORDER, and that is not
 * fussiness. observeSettlement fires the receipt read and the head
 * read concurrently through Promise.all, so an order-keyed mock hands
 * the block number to the receipt call and the test starts asserting
 * on nonsense — or worse, passes by luck until the day it does not.
 */
function mockRpc(
  handler: (method: string, callForMethod: number) => Response | Promise<Response>,
): { calls: () => number } {
  originalFetch = globalThis.fetch;
  let total = 0;
  const perMethod = new Map<string, number>();
  globalThis.fetch = (async (_input: unknown, init?: RequestInit) => {
    total += 1;
    const raw: unknown = JSON.parse(String(init?.body ?? "{}"));
    const method = Array.isArray(raw)
      ? "batch"
      : ((raw as { method?: string }).method ?? "unknown");
    const seen = (perMethod.get(method) ?? 0) + 1;
    perMethod.set(method, seen);
    return handler(method, seen);
  }) as typeof fetch;
  return { calls: () => total };
}

const ok = (result: unknown, isBatch = false) =>
  new Response(
    JSON.stringify(isBatch ? result : { jsonrpc: "2.0", id: 1, result }),
    { headers: { "content-type": "application/json" } },
  );

const rateLimited = () => new Response("slow down", { status: 429 });

afterEach(() => {
  if (originalFetch) globalThis.fetch = originalFetch;
});

describe("a provider that will not answer", () => {
  it("retries a 429 and succeeds, instead of dropping a paid delivery", async () => {
    const mock = mockRpc((_method, call) => (call < 3 ? rateLimited() : ok("0x64")));
    expect(await getBlockNumber(testEnv)).toBe(100);
    expect(mock.calls()).toBe(3);
  });

  it("retries a 5xx the same way", async () => {
    const mock = mockRpc((_method, call) =>
      call === 1 ? new Response("bad gateway", { status: 502 }) : ok(null),
    );
    expect(await getReceipt(testEnv, TX)).toBeNull();
    expect(mock.calls()).toBe(2);
  });

  it("retries a socket that dies mid-flight", async () => {
    const mock = mockRpc((_method, call) => {
      if (call === 1) throw new Error("Network connection lost.");
      return ok(null);
    });
    expect(await getReceipt(testEnv, TX)).toBeNull();
    expect(mock.calls()).toBe(2);
  });

  it("gives up eventually, and says how hard it tried", async () => {
    const mock = mockRpc(() => rateLimited());
    await expect(getBlockNumber(testEnv)).rejects.toThrow(/after 3 attempts/);
    expect(mock.calls()).toBe(3);
  });

  it("covers the batch too, which the sheaf reads after settling", async () => {
    // attestation_bundle is in the same family and had the same hole.
    const mock = mockRpc((_method, call) =>
      call === 1
        ? rateLimited()
        : ok([{ jsonrpc: "2.0", id: 0, result: null }], true),
    );
    const receipts = await getReceiptsBatch(testEnv, [TX]);
    expect(receipts.get(TX)).toBeNull();
    expect(mock.calls()).toBe(2);
  });
});

describe("an answer, which is never re-asked", () => {
  it("returns NOT_FOUND on the FIRST call and does not look again", async () => {
    /*
     * The rule this store actually stated: retrying until the answer
     * improves turns an observation into a poll. result:null is the
     * chain answering. One call, one answer, signed.
     */
    const mock = mockRpc(() => ok(null));
    expect(await getReceipt(testEnv, TX)).toBeNull();
    expect(mock.calls()).toBe(1);
  });

  it("keeps a paid attestation's NOT_FOUND verdict to exactly two reads", async () => {
    // observeSettlement reads the receipt and the head. Two calls
    // total for a NOT_FOUND — no hopeful third look.
    const mock = mockRpc((method) =>
      method === "eth_getTransactionReceipt" ? ok(null) : ok("0x64"),
    );
    const observation = await observeSettlement(testEnv, { txHash: TX });
    expect(observation.status).toBe("NOT_FOUND");
    expect(mock.calls()).toBe(2);
  });

  it("survives a rate-limited moment and still signs the honest verdict", async () => {
    /*
     * The whole point, end to end: the provider stumbles, the buyer
     * still gets the artifact they paid for, and the artifact still
     * says NOT_FOUND because that is what the chain said once it
     * answered. The stumble changed the timing, never the finding.
     */
    mockRpc((method, call) => {
      // The receipt read is rate-limited once, then answers honestly.
      if (method === "eth_getTransactionReceipt") {
        return call === 1 ? rateLimited() : ok(null);
      }
      return ok("0x64");
    });
    const observation = await observeSettlement(testEnv, { txHash: TX });
    expect(observation.status).toBe("NOT_FOUND");
    expect(observation.signature).toMatch(/^[0-9a-f]+$/);
  });
});

describe("two providers, and the secret that must never leak", () => {
  it("tries the authenticated endpoint first and falls back to the public one", async () => {
    /*
     * Retrying a rate-limited endpoint against itself helps with a
     * hiccup and not at all with an outage. Two INDEPENDENT providers
     * is the part that actually protects a paid delivery.
     */
    const seen: string[] = [];
    originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: unknown) => {
      const url = String(input);
      seen.push(new URL(url).host);
      return url.includes("paid.example")
        ? new Response("nope", { status: 503 })
        : ok("0x64");
    }) as typeof fetch;

    const twoProviders = {
      ...testEnv,
      BASE_RPC_URL_PRIMARY: "https://paid.example/rpc/secret-token",
      BASE_RPC_URL: "https://public.example/rpc",
    } as unknown as Env;

    expect(await getBlockNumber(twoProviders)).toBe(100);
    // Three attempts at the paid one, then the public one answers.
    expect(seen.filter((host) => host === "paid.example")).toHaveLength(3);
    expect(seen.at(-1)).toBe("public.example");
  });

  it("skips ahead on a 4xx instead of knocking a refused key three times", async () => {
    /*
     * 2026-08-20, read off the egress dashboard: the authenticated
     * primary was answering 429 and each operation still knocked it
     * three times with backoff — 288 refusals for 48 answers — while
     * the secondary sat ready. A quota'd or rejected key is a per-key
     * condition; the fix for it is the NEXT provider, not 450ms of
     * patience. (A 5xx keeps the backoff — see the test above — and
     * so does a 4xx on the LAST endpoint, where instant surrender
     * would drop a paid delivery a burst limit was about to allow.)
     */
    const seen: string[] = [];
    originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: unknown) => {
      const url = String(input);
      seen.push(new URL(url).host);
      return url.includes("paid.example")
        ? new Response("quota", { status: 429 })
        : ok("0x64");
    }) as typeof fetch;

    const twoProviders = {
      ...testEnv,
      BASE_RPC_URL_PRIMARY: "https://paid.example/rpc/secret-token",
      BASE_RPC_URL: "https://public.example/rpc",
    } as unknown as Env;

    expect(await getBlockNumber(twoProviders)).toBe(100);
    // ONE knock on the refused key, then straight to the one that answers.
    expect(seen.filter((host) => host === "paid.example")).toHaveLength(1);
    expect(seen.at(-1)).toBe("public.example");
  });

  it("NEVER puts the endpoint's token in an error, because errors get published", async () => {
    /*
     * A hole I opened in #92 and caught before it met a real secret:
     * the retry error interpolated the full URL. The token lives IN
     * that URL, and error text reaches alert emails, console logs and
     * the service audit's own `unreachable` detail. A credential on a
     * signed artifact is a disclosure, not a typo.
     */
    originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response("nope", { status: 503 })) as typeof fetch;

    const withSecret = {
      ...testEnv,
      BASE_RPC_URL_PRIMARY: "https://paid.example/rpc/super-secret-token",
      BASE_RPC_URL: "https://public.example/rpc",
    } as unknown as Env;

    const error = await getBlockNumber(withSecret).catch((caught: Error) => caught);
    const message = String((error as Error).message);
    expect(message).not.toContain("super-secret-token");
    expect(message).not.toContain("/rpc/");
    // It still says enough to debug: which hosts, how many tries.
    expect(message).toContain("paid.example");
    expect(message).toContain("public.example");
  });

  it("uses one endpoint when no authenticated one is configured", async () => {
    const mock = mockRpc(() => ok("0x64"));
    expect(await getBlockNumber(testEnv)).toBe(100);
    expect(mock.calls()).toBe(1);
  });
});
