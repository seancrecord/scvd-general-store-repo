import { SELF, env } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AUTHORIZATION_USED_TOPIC } from "@/lib/base-rpc";
import { runMcpPayment } from "@/lib/mcp-payment";
import {
  AGE_OUT_DAYS,
  SETTLEMENT_UNKNOWN_PREFIX,
  listSettlementUnknowns,
  resolveSettlementUnknowns,
  type SettlementUnknownRow,
} from "@/services/settlement-unknown";
import { getOpenDeliveryIntent } from "@/services/delivery-audit";
import { installFacilitatorMock } from "./helpers/facilitator-mock";
import type { FacilitatorMockState } from "./helpers/facilitator-mock";
import {
  buildPaymentSignature,
  decodePaymentRequired,
} from "./helpers/payment";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";

/**
 * MACHINE 1 (task #56): a settle that ended with NO VERDICT stops
 * being rendered as a decline the till could not actually make. The
 * row keeps the question open; the hourly resolver asks the chain
 * where a chain can answer; and a row nothing can answer closes as
 * "we could not answer" — never as "no". The 2026-08-07 incident
 * (three landed transfers booked as declines, found by hand ten hours
 * later) is the failure this machine renders mechanical, and Cairn's
 * validator-drift finding (2026-08-26) is the outside-view twin: from
 * outside, "facilitator validator moved" is byte-identical to "door
 * rejects valid payments", and a till that cannot tell them apart
 * must say unknown.
 */

let facilitator: FacilitatorMockState;
beforeAll(() => {
  facilitator = installFacilitatorMock();
});

async function clearRows(): Promise<void> {
  const listed = await testEnv.COUNTERS.list({
    prefix: SETTLEMENT_UNKNOWN_PREFIX,
  });
  for (const key of listed.keys) await testEnv.COUNTERS.delete(key.name);
}

beforeEach(clearRows);

function nonceHex(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return `0x${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

/**
 * The chain answerer, layered over the facilitator mock. `burns`
 * controls eth_getLogs; when null, the RPC itself dies — the state
 * Machine 1 exists for.
 */
function answerChain(options: { burned: boolean } | null): void {
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
        if (options === null) {
          return new Response("bad gateway", { status: 502 });
        }
        const body = JSON.parse(String(init?.body ?? "null")) as {
          id: number;
          method: string;
          params?: unknown[];
        };
        if (body.method === "eth_blockNumber") {
          return Response.json({ jsonrpc: "2.0", id: body.id, result: "0x2f5cbb2" });
        }
        if (body.method === "eth_getLogs") {
          const filter = (body.params?.[0] ?? {}) as { topics?: string[] };
          expect(filter.topics?.[0]).toBe(AUTHORIZATION_USED_TOPIC);
          return Response.json({
            jsonrpc: "2.0",
            id: body.id,
            result: options.burned
              ? [{ transactionHash: `0x${"cd".repeat(32)}` }]
              : [],
          });
        }
        return Response.json({ jsonrpc: "2.0", id: body.id, result: null });
      }
      return inner(input as never, init as never);
    },
  );
}

async function paymentHeaderFor(item: string): Promise<string> {
  const challenge = await SELF.fetch(`${BASE}/api/buy/${item}`);
  const required = decodePaymentRequired(challenge);
  return buildPaymentSignature(required.accepts[0]!, nonceHex());
}

describe("capture: the ambiguous seam writes the row, the answered one does not", () => {
  it("HTTP door: a transport-dead settle with no chain answer opens a row", async () => {
    answerChain(null); // both instruments dark — the genuinely unknown state
    facilitator.settleTransient502s = 2;
    const header = await paymentHeaderFor("small_blessing");
    const declined = await SELF.fetch(`${BASE}/api/buy/small_blessing`, {
      headers: { "PAYMENT-SIGNATURE": header },
    });
    expect(declined.status).toBe(402);

    const { rows } = await listSettlementUnknowns(testEnv);
    expect(rows).toHaveLength(1);
    const row = rows[0]!.row;
    expect(row.state).toBe("open");
    expect(row.door).toBe("http");
    expect(row.network).toBe("eip155:8453");
    // The join keys the resolver stands on, extracted at capture.
    expect(row.nonce).toMatch(/^0x[0-9a-f]{64}$/);
    expect(row.payer).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(row.valid_before).toBeGreaterThan(0);
  }, 30_000);

  it("MCP door: same seam, same row", async () => {
    answerChain(null);
    const challenge = await SELF.fetch(`${BASE}/api/buy/hello`);
    const payment = JSON.parse(
      atob(buildPaymentSignature(decodePaymentRequired(challenge).accepts[0]!, nonceHex())),
    ) as Record<string, unknown>;
    const outcome = await runMcpPayment(
      testEnv,
      "hello",
      payment,
      { userAgent: "settlement-unknown-spec" },
    );
    expect(outcome.kind).toBe("authorized");
    if (outcome.kind !== "authorized") return;
    facilitator.settleTransient502s = 2;
    await expect(outcome.pending.settle()).rejects.toThrow();

    const { rows } = await listSettlementUnknowns(testEnv);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.row.door).toBe("mcp");
  }, 30_000);

  it("a verdict decline is ANSWERED and writes no row", async () => {
    facilitator.settleShouldFail = true;
    try {
      const header = await paymentHeaderFor("small_blessing");
      const declined = await SELF.fetch(`${BASE}/api/buy/small_blessing`, {
        headers: { "PAYMENT-SIGNATURE": header },
      });
      expect(declined.status).toBe(402);
    } finally {
      facilitator.settleShouldFail = false;
    }
    expect((await listSettlementUnknowns(testEnv)).rows).toHaveLength(0);
  }, 30_000);
});

async function seedRow(overrides: Partial<SettlementUnknownRow>): Promise<string> {
  const key = `${SETTLEMENT_UNKNOWN_PREFIX}manual:${Math.random().toString(36).slice(2, 8)}`;
  const row: SettlementUnknownRow = {
    version: 1,
    state: "open",
    path: "/api/buy/hello",
    door: "http",
    reason: "settle:Facilitator settle failed (502): error code: 502",
    at: new Date().toISOString(),
    network: "eip155:8453",
    nonce: nonceHex(),
    payer: "0x2222222222222222222222222222222222222222",
    ...overrides,
  };
  await testEnv.COUNTERS.put(key, JSON.stringify(row));
  return key;
}

describe("the resolver's three honest endings", () => {
  it("settled_late: the chain shows the burn, and the existing desk takes over", async () => {
    answerChain({ burned: true });
    await seedRow({ quoted_usdc: 0.005 });

    const { resolved } = await resolveSettlementUnknowns(testEnv);
    expect(resolved).toBe(1);

    const { rows } = await listSettlementUnknowns(testEnv);
    expect(rows[0]!.row.state).toBe("settled_late");
    expect(rows[0]!.row.transaction).toBe(`0x${"cd".repeat(32)}`);
    // Money moved, goods did not: the delivery-intent desk — the one
    // the keeper already works — holds the case, not a second surface.
    const open = await getOpenDeliveryIntent(testEnv, `0x${"cd".repeat(32)}`);
    expect(open).not.toBeNull();
  });

  it("expired_unused: window covered, validBefore past — the decline was right", async () => {
    answerChain({ burned: false });
    const nowSeconds = Math.floor(Date.now() / 1000);
    await seedRow({
      at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
      valid_before: nowSeconds - 20 * 60,
    });

    await resolveSettlementUnknowns(testEnv);
    const { rows } = await listSettlementUnknowns(testEnv);
    expect(rows[0]!.row.state).toBe("expired_unused");
  });

  it("aged_out_unresolved: what nothing can answer says so, never 'no'", async () => {
    // A Solana row: no EVM chain to ask, and this resolver never
    // pretends otherwise (rule 52).
    await seedRow({
      network: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
      at: new Date(Date.now() - (AGE_OUT_DAYS + 1) * 86_400_000).toISOString(),
    });
    await resolveSettlementUnknowns(testEnv);
    const { rows } = await listSettlementUnknowns(testEnv);
    expect(rows[0]!.row.state).toBe("aged_out_unresolved");
  });

  it("a dead RPC resolves nothing: the row stays open", async () => {
    answerChain(null);
    await seedRow({});
    const { resolved } = await resolveSettlementUnknowns(testEnv);
    expect(resolved).toBe(0);
    const { rows } = await listSettlementUnknowns(testEnv);
    expect(rows[0]!.row.state).toBe("open");
  });
});
