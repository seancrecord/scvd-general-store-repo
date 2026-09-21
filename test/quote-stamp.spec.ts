import { SELF, env } from "cloudflare:test";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { x402Client, wrapFetchWithPayment } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import type { MetricEvent } from "@/lib/metrics";
import {
  QUOTE_STAMP_FIELD,
  QUOTE_TO_PAY_CEILING_MS,
  quoteToPayBucket,
  quoteToPayMs,
  quotedAtOf,
  stampQuotedAt,
  withoutQuoteStamp,
} from "@/lib/quote-stamp";
import { readBuyerSignals } from "@/services/buyer-signals";
import { buyInputExample } from "@/lib/bazaar-discovery";
import { getMenuItem } from "@/store";
import type { Env } from "@/types";
import { installMultiPurchaseFacilitatorMock, TEST_PAYER } from "./helpers/facilitator-mock";
import { buildPaymentSignature, decodePaymentRequired } from "./helpers/payment";

/**
 * THE QUOTE STAMP (lib/quote-stamp.ts, 2026-09-21).
 *
 * The 402 stamps its own instant into every offer; the paid retry
 * echoes it; the till books which quote a payment answered and how
 * long the buyer took. Three things are held here that a count of
 * settles could not see: the stamp goes out on both doors, it comes
 * back and is booked with the elapsed time, and the facilitator never
 * receives it.
 */

const BASE = "https://scvd.store";
const testEnv = env as unknown as Env;
let facilitator: ReturnType<typeof installMultiPurchaseFacilitatorMock>;

beforeAll(() => {
  facilitator = installMultiPurchaseFacilitatorMock();
});

afterEach(() => {
  vi.useRealTimers();
});

async function settleRows(marker: string): Promise<MetricEvent[]> {
  const listed = await testEnv.COUNTERS.list({ prefix: "evt:" });
  const rows: MetricEvent[] = [];
  for (const key of listed.keys) {
    const raw = await testEnv.COUNTERS.get(key.name);
    if (raw?.includes(marker)) rows.push(JSON.parse(raw) as MetricEvent);
  }
  return rows;
}

describe("the 402 carries the instant it was minted", () => {
  it("on every offer of the HTTP door, one instant, readable, now", async () => {
    const before = Date.now();
    const response = await SELF.fetch(`${BASE}/api/buy/hello`);
    expect(response.status).toBe(402);
    const challenge = decodePaymentRequired(response);
    expect(challenge.accepts.length).toBeGreaterThan(0);
    const stamps = new Set(challenge.accepts.map((a) => a.extra?.[QUOTE_STAMP_FIELD]));
    expect(stamps.size).toBe(1);
    const [stamp] = [...stamps];
    expect(typeof stamp).toBe("string");
    const issued = Date.parse(stamp as string);
    expect(issued).toBeGreaterThanOrEqual(before - 1000);
    expect(issued).toBeLessThanOrEqual(Date.now() + 1000);
    // The EIP-712 domain fields a client signs against are untouched.
    const evm = challenge.accepts.find((a) => a.network.startsWith("eip155:"))!;
    expect(evm.extra?.["name"]).toBeTruthy();
    expect(evm.extra?.["version"]).toBeTruthy();
  });

  it("on the MCP door's quote too, the same field", async () => {
    const item = getMenuItem("hello")!;
    const response = await SELF.fetch(`${BASE}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "buy_simple", arguments: { item_id: "hello", ...buyInputExample(item) } },
      }),
    });
    const payload = (await response.json()) as { error?: { data?: Record<string, unknown> } };
    const challenge = payload.error?.data?.["x402/payment-required"] as { accepts: { extra?: Record<string, unknown> }[] };
    expect(challenge?.accepts?.length).toBeGreaterThan(0);
    for (const accept of challenge.accepts) {
      expect(typeof accept.extra?.[QUOTE_STAMP_FIELD]).toBe("string");
    }
  });
});

describe("the paid retry brings it back", () => {
  it("a stock client echoes it; the settle row and the buyer signal book the decision time; the facilitator never sees it", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const t0 = new Date("2026-09-21T12:00:00.000Z");
    vi.setSystemTime(t0);
    const signer = { address: TEST_PAYER as `0x${string}`, signTypedData: vi.fn(async () => `0x${"cd".repeat(65)}` as `0x${string}`) };
    const client = new x402Client().register("eip155:8453", new ExactEvmScheme(signer));
    const marker = `stamp-echo-${Math.random().toString(36).slice(2, 8)}`;
    let retries = 0;
    const fetchWithPayment = wrapFetchWithPayment(async (input, init) => {
      const request = new Request(input, init);
      if (request.headers.has("PAYMENT-SIGNATURE")) {
        retries += 1;
        // Seven seconds of deliberation between our quote and its payment.
        vi.setSystemTime(new Date(t0.getTime() + 7_000));
      }
      return SELF.fetch(request);
    }, client);
    const payloadsBefore = facilitator.facilitatorPayloads.length;
    const signalsBefore = (await readBuyerSignals(testEnv)).latency;
    const response = await fetchWithPayment(`${BASE}/api/buy/small_blessing?agent_name=${marker}`, {
      headers: { "User-Agent": `${marker}/1.0` },
    });
    expect(response.status).toBe(200);
    expect(retries).toBe(1);

    // Booked: which quote, and how long.
    const rows = (await settleRows(`${marker}/1.0`)).filter((row) => row.kind === "settle");
    expect(rows.length).toBe(1);
    expect(rows[0]!.quoted_at).toBe(t0.toISOString());
    expect(rows[0]!.quote_to_pay_ms).toBe(7_000);
    const signals = (await readBuyerSignals(testEnv)).latency;
    expect(signals["http:under_30s"] ?? 0).toBe((signalsBefore["http:under_30s"] ?? 0) + 1);

    // Stripped: every payload that crossed to the facilitator on this
    // sale carries the accepted terms without the stamp.
    const crossed = facilitator.facilitatorPayloads.slice(payloadsBefore);
    expect(crossed.map((p) => p.lane)).toEqual(["verify", "settle"]);
    for (const { body } of crossed) {
      const accepted = (body["paymentPayload"] as { accepted?: { extra?: Record<string, unknown> } })?.accepted;
      expect(accepted?.extra, "the facilitator got the accepted terms").toBeTruthy();
      expect(accepted?.extra?.[QUOTE_STAMP_FIELD]).toBeUndefined();
      expect(accepted?.extra?.["name"]).toBeTruthy();
    }
  });

  it("a hand-rolled retry that dropped the stamp still settles, and is booked as unstamped", async () => {
    const marker = `stamp-dropped-${Math.random().toString(36).slice(2, 8)}`;
    const first = await SELF.fetch(`${BASE}/api/buy/small_blessing?agent_name=${marker}`, {
      headers: { "User-Agent": `${marker}/1.0` },
    });
    expect(first.status).toBe(402);
    const evm = decodePaymentRequired(first).accepts.find((a) => a.network === "eip155:8453")!;
    const { [QUOTE_STAMP_FIELD]: _dropped, ...extra } = evm.extra ?? {};
    const signalsBefore = (await readBuyerSignals(testEnv)).latency;
    const paid = await SELF.fetch(`${BASE}/api/buy/small_blessing?agent_name=${marker}`, {
      headers: {
        "User-Agent": `${marker}/1.0`,
        "PAYMENT-SIGNATURE": buildPaymentSignature({ ...evm, extra }),
      },
    });
    expect(paid.status).toBe(200);
    const rows = (await settleRows(`${marker}/1.0`)).filter((row) => row.kind === "settle");
    expect(rows.length).toBe(1);
    expect(rows[0]!.quoted_at).toBeUndefined();
    expect(rows[0]!.quote_to_pay_ms).toBeUndefined();
    const signals = (await readBuyerSignals(testEnv)).latency;
    expect(signals["http:unstamped"] ?? 0).toBe((signalsBefore["http:unstamped"] ?? 0) + 1);
  });

  it("a decline books the quote it followed", async () => {
    const marker = `stamp-decline-${Math.random().toString(36).slice(2, 8)}`;
    const first = await SELF.fetch(`${BASE}/api/buy/hello`, { headers: { "User-Agent": `${marker}/1.0` } });
    const evm = decodePaymentRequired(first).accepts.find((a) => a.network === "eip155:8453")!;
    facilitator.verifyShouldFail = true;
    try {
      const refused = await SELF.fetch(`${BASE}/api/buy/hello`, {
        headers: { "User-Agent": `${marker}/1.0`, "PAYMENT-SIGNATURE": buildPaymentSignature(evm) },
      });
      expect(refused.status).toBe(402);
    } finally {
      facilitator.verifyShouldFail = false;
    }
    const rows = (await settleRows(`${marker}/1.0`)).filter((row) => row.kind === "decline");
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]!.quoted_at).toBe(evm.extra?.[QUOTE_STAMP_FIELD]);
    expect(typeof rows[0]!.quote_to_pay_ms).toBe("number");
  });
});

describe("the readers, on their own", () => {
  it("stamps every accept in the header and the body, and leaves other extra keys alone", () => {
    const header = btoa(JSON.stringify({ x402Version: 2, accepts: [{ scheme: "exact", extra: { name: "USDC" } }, { scheme: "exact" }] }));
    const out = stampQuotedAt({ "PAYMENT-REQUIRED": header }, { accepts: [{ scheme: "exact" }] }, "2026-09-21T00:00:00.000Z");
    const decoded = JSON.parse(atob(out.headers["PAYMENT-REQUIRED"]!)) as { accepts: { extra: Record<string, unknown> }[] };
    expect(decoded.accepts[0]!.extra).toEqual({ name: "USDC", quotedAt: "2026-09-21T00:00:00.000Z" });
    expect(decoded.accepts[1]!.extra).toEqual({ quotedAt: "2026-09-21T00:00:00.000Z" });
    expect((out.body as { accepts: { extra: Record<string, unknown> }[] }).accepts[0]!.extra).toEqual({ quotedAt: "2026-09-21T00:00:00.000Z" });
  });

  it("returns the response untouched when there is nothing to stamp", () => {
    const headers = { "Content-Type": "text/html" };
    const out = stampQuotedAt(headers, "<html>", "2026-09-21T00:00:00.000Z");
    expect(out.headers).toBe(headers);
    expect(out.body).toBe("<html>");
  });

  it("reads only a parseable stamp, and takes it back out without touching the rest", () => {
    const payload = { x402Version: 2, accepted: { scheme: "exact", extra: { name: "USDC", quotedAt: "2026-09-21T00:00:00.000Z" } }, payload: {} };
    expect(quotedAtOf(payload)).toBe("2026-09-21T00:00:00.000Z");
    expect(quotedAtOf({ accepted: { extra: { quotedAt: "not a date" } } })).toBeNull();
    expect(quotedAtOf({ accepted: { extra: { quotedAt: 42 } } })).toBeNull();
    const stripped = withoutQuoteStamp(payload);
    expect(stripped.accepted.extra).toEqual({ name: "USDC" });
    expect(payload.accepted.extra.quotedAt, "never a mutation").toBe("2026-09-21T00:00:00.000Z");
    const bare = { accepted: { scheme: "exact", extra: { quotedAt: "2026-09-21T00:00:00.000Z" } } };
    expect("extra" in withoutQuoteStamp(bare).accepted).toBe(false);
    const untouched = { accepted: { scheme: "exact", extra: { name: "USDC" } } };
    expect(withoutQuoteStamp(untouched)).toBe(untouched);
  });

  it("books a decision time only when the stamp can describe one", () => {
    const issued = Date.parse("2026-09-21T00:00:00.000Z");
    expect(quoteToPayMs("2026-09-21T00:00:00.000Z", issued + 4_000)).toBe(4_000);
    expect(quoteToPayMs("2026-09-21T00:00:00.000Z", issued - 1)).toBeNull();
    expect(quoteToPayMs("2026-09-21T00:00:00.000Z", issued + QUOTE_TO_PAY_CEILING_MS + 1)).toBeNull();
    expect(quoteToPayMs(null, issued)).toBeNull();
    expect(quoteToPayBucket(null)).toBe("unstamped");
    expect(quoteToPayBucket(4_999)).toBe("under_5s");
    expect(quoteToPayBucket(29_999)).toBe("under_30s");
    expect(quoteToPayBucket(119_999)).toBe("under_2m");
    expect(quoteToPayBucket(599_999)).toBe("under_10m");
    expect(quoteToPayBucket(600_000)).toBe("over_10m");
  });
});
