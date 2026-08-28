import { SELF, env } from "cloudflare:test";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { AUTHORIZATION_USED_TOPIC } from "@/lib/base-rpc";
import { runMcpPayment } from "@/lib/mcp-payment";
import { SettlementDeclined } from "@/lib/payments";
import { installFacilitatorMock } from "./helpers/facilitator-mock";
import type { FacilitatorMockState } from "./helpers/facilitator-mock";
import {
  buildPaymentSignature,
  decodePaymentRequired,
} from "./helpers/payment";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;
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

async function payAfterDuplicateAnswer(): Promise<Response> {
  const challenge = await SELF.fetch(`${BASE}/api/buy/small_blessing`);
  expect(challenge.status).toBe(402);
  const headerName = [...challenge.headers.keys()].find(
    (name) => name.toLowerCase() === "payment-required",
  )!;
  const required = JSON.parse(atob(challenge.headers.get(headerName)!)) as {
    accepts: Array<Record<string, unknown>>;
  };
  // The V1 duplicate shape: the facilitator ANSWERS, with a 400 whose
  // body names the original transaction. errorReason is
  // invalid_payload — not transient, so before #55 this booked a
  // decline with the landed tx sitting unread in the response.
  facilitator.settleDuplicateAnswers = 1;
  return SELF.fetch(`${BASE}/api/buy/small_blessing`, {
    headers: {
      "PAYMENT-SIGNATURE": buildPaymentSignature(required.accepts[0] as never),
    },
  });
}

/**
 * TASK #55 — THE V1 ANSWER, WIRED. CV settled the same confirmed
 * authorization twice against the real CDP facilitator (2026-08-25,
 * Base Sepolia): the duplicate came back 400 "invalid_payload",
 * "authorization nonce already submitted; transaction already
 * on-chain" — WITH the original tx hash on the failed response. In
 * production that is what a settle retry gets when the first attempt
 * landed but its response was lost, and until now the till read only
 * the reason string, saw "not transient", and booked a paying buyer
 * as declined — the 2026-08-07 sin with the answer in hand.
 *
 * The wiring discriminates on STRUCTURE, never prose: a populated
 * `transaction` on a failed settle triggers the SAME chain rescue the
 * transport-dead case earned — the chain stays the judge, because V1
 * proved only the duplicate-after-confirmation case, and a failure
 * naming a reverted transaction must still fail closed. V2 (in-flight
 * race), V3 (abort-then-retry) and the mainnet confirmation remain
 * open; nothing here assumes them.
 */
describe("a settle refusal that names the landed transaction (#55)", () => {
  it("delivers when the chain confirms the named authorization burned", async () => {
    const chain = answerChain({ burned: true });
    const paid = await payAfterDuplicateAnswer();
    expect(paid.status).toBe(200);
    const body = (await paid.json()) as Record<string, any>;
    expect(body.certificate.settlement_tx).toBe(`0x${"ab".repeat(32)}`);
    expect(body.deliverable).toBeTruthy();
    expect(chain.getLogsCalls()).toBe(1);
  }, 30_000);

  it("still fails closed when the named transaction's authorization never burned", async () => {
    // The reverted-tx edge V1 did not test: a hash on the failure is a
    // CLAIM, and the chain not showing the burn means no money moved.
    answerChain({ burned: false });
    const declined = await payAfterDuplicateAnswer();
    expect(declined.status).toBe(402);
    const body = (await declined.json()) as Record<string, any>;
    expect(body.payment_declined.reason).toContain("invalid_payload");
  }, 30_000);
});

/**
 * THE SAME RESCUE, THE OTHER DOOR. The delivery-intent work (task #85)
 * named the pattern "fix-that-looks-shared-and-isn't": the same mint
 * runs behind both doors, yet door-level fixes kept landing on HTTP
 * alone. The rescue was one of them — the MCP till had NO rescue at
 * all, so an MCP settle that died in transport or answered with the
 * duplicate shape booked a paying buyer as declined with no chain
 * question asked. These pin both doors to the same law.
 */
describe("the MCP till rescues too", () => {
  function nonceHex(): string {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    return `0x${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
  }

  async function mcpPaymentFor(item: string): Promise<Record<string, unknown>> {
    const challenge = decodePaymentRequired(
      await SELF.fetch(`${BASE}/api/buy/${item}`),
    );
    return JSON.parse(
      atob(buildPaymentSignature(challenge.accepts[0]!, nonceHex())),
    ) as Record<string, unknown>;
  }

  async function settleThroughMcp(): Promise<{ transaction: string }> {
    const outcome = await runMcpPayment(
      testEnv,
      "hello",
      await mcpPaymentFor("hello"),
      { userAgent: "settle-rescue-spec" },
      undefined,
      "asked_for=rescue",
    );
    expect(outcome.kind).toBe("authorized");
    if (outcome.kind !== "authorized") throw new Error("unreachable");
    facilitator.settleDuplicateAnswers = 1;
    return outcome.pending.settle();
  }

  it("delivers the duplicate-answer sale when the chain confirms the burn", async () => {
    answerChain({ burned: true });
    const settled = await settleThroughMcp();
    expect(settled.transaction).toBe(`0x${"ab".repeat(32)}`);
  }, 30_000);

  it("still fails closed when the chain never saw the burn", async () => {
    answerChain({ burned: false });
    await expect(settleThroughMcp()).rejects.toThrow(SettlementDeclined);
  }, 30_000);
});

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
