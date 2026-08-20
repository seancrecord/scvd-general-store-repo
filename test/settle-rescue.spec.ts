import { SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { AUTHORIZATION_USED_TOPIC } from "@/lib/base-rpc";
import { installFacilitatorMock } from "./helpers/facilitator-mock";
import type { FacilitatorMockState } from "./helpers/facilitator-mock";
import { buildPaymentSignature } from "./helpers/payment";

const BASE = "https://scvd.store";

let facilitator: FacilitatorMockState;
beforeAll(() => {
  facilitator = installFacilitatorMock();
});

/**
 * THE AMBIGUOUS-SETTLE RESCUE — the 2026-08-07 13:05 incident,
 * replayed as a test. A real buyer's three purchases each 502'd on
 * BOTH settle attempts, booked as declines, and had all landed
 * on-chain: told no three times, paid three times, refunded by hand
 * ten hours later (tx 0xa6819600a1f141783d7a463046a0a62e45a8f18e5a21
 * c9b577721001a3669c19). The fix: when the retry also dies, ask the
 * chain whether the authorization burned before booking anything.
 *
 * The RPC answerer layers over the facilitator mock exactly as the
 * sheaf's test does — exact origin, never a prefix.
 */
function answerChain(options: { burned: boolean }): {
  getLogsCalls: () => number;
} {
  let getLogsCalls = 0;
  const inner = globalThis.fetch;
  vi.stubGlobal(
    "fetch",
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      let origin = "";
      try {
        origin = new URL(url).origin;
      } catch {
        origin = "";
      }
      if (origin === "https://mainnet.base.org") {
        const body = JSON.parse(String(init?.body ?? "null")) as {
          id: number;
          method: string;
          params?: unknown[];
        };
        if (body.method === "eth_blockNumber") {
          return Response.json({ jsonrpc: "2.0", id: body.id, result: "0x2f5cbb2" });
        }
        if (body.method === "eth_getLogs") {
          getLogsCalls += 1;
          // The filter must ask the exact question: AuthorizationUsed,
          // this authorizer, this nonce — indexed, so the node answers
          // the question and nothing else.
          const filter = (body.params?.[0] ?? {}) as { topics?: string[] };
          expect(filter.topics?.[0]).toBe(AUTHORIZATION_USED_TOPIC);
          expect(filter.topics?.[1]).toMatch(/^0x0{24}[0-9a-f]{40}$/);
          expect(filter.topics?.[2]).toMatch(/^0x[0-9a-f]{64}$/);
          return Response.json({
            jsonrpc: "2.0",
            id: body.id,
            result: options.burned
              ? [{ transactionHash: `0x${"ab".repeat(32)}` }]
              : [],
          });
        }
        return Response.json({ jsonrpc: "2.0", id: body.id, result: null });
      }
      return inner(input as never, init as never);
    },
  );
  return { getLogsCalls: () => getLogsCalls };
}

async function payAfterOutage(): Promise<Response> {
  const challenge = await SELF.fetch(`${BASE}/api/buy/small_blessing`);
  expect(challenge.status).toBe(402);
  const headerName = [...challenge.headers.keys()].find(
    (name) => name.toLowerCase() === "payment-required",
  )!;
  const required = JSON.parse(atob(challenge.headers.get(headerName)!)) as {
    accepts: Array<Record<string, unknown>>;
  };
  // The outage shape: BOTH settle attempts die as bare 502s — the
  // exact live failure, byte for byte, that the mock models.
  facilitator.settleTransient502s = 2;
  return SELF.fetch(`${BASE}/api/buy/small_blessing`, {
    headers: {
      "PAYMENT-SIGNATURE": buildPaymentSignature(required.accepts[0] as never),
    },
  });
}

describe("the ambiguous-settle rescue", () => {
  it("delivers the sale when both settles 502 but the chain says the nonce burned", async () => {
    const chain = answerChain({ burned: true });
    const paid = await payAfterOutage();
    expect(paid.status).toBe(200);
    const body = (await paid.json()) as Record<string, any>;
    // The certificate names the transaction the CHAIN reported — the
    // receipt that survives a dead facilitator origin.
    expect(body.certificate.settlement_tx).toBe(`0x${"ab".repeat(32)}`);
    expect(body.deliverable).toBeTruthy();
    // One look, no polling.
    expect(chain.getLogsCalls()).toBe(1);
  }, 30_000);

  it("books the decline unchanged when the chain says the nonce never burned", async () => {
    answerChain({ burned: false });
    const declined = await payAfterOutage();
    // Money failed closed, exactly as before the rescue existed.
    expect(declined.status).toBe(402);
    const body = (await declined.json()) as Record<string, any>;
    expect(body.payment_declined.reason).toContain("502");
  }, 30_000);
});
