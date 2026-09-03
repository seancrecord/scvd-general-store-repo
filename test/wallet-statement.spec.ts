import { SELF, env } from "cloudflare:test";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { MENU_ITEMS } from "@/store";
import { buyInputSchema } from "@/lib/bazaar-discovery";
import {
  STATEMENT_LIST_CAP,
  performWalletStatement,
  statementHours,
} from "@/services/wallet-statement";
import type { Env } from "@/types";
import { installFacilitatorMock } from "./helpers/facilitator-mock";
import { buildPaymentSignature } from "./helpers/payment";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";
const WALLET = "0x843b544bf5f0aa6cbf13e94563874878c98cc4a7";
const OTHER = "0x2222222222222222222222222222222222222222";

beforeAll(() => {
  installFacilitatorMock();
});

/**
 * A fake Base node: answers eth_blockNumber with a fixed head and
 * eth_getLogs with transfers whose direction is read off the topics —
 * the same indexed-topic contract the real reads rely on, so the test
 * fails if the service ever queries the wrong topic position.
 */
function fakeChain(opts: {
  head?: number;
  inbound?: Array<{ tx: string; from: string; amount: bigint; block: number }>;
  outbound?: Array<{ tx: string; to: string; amount: bigint; block: number }>;
  refuseLogs?: boolean;
}): typeof fetch {
  const head = opts.head ?? 1_000_000;
  const pad = (addr: string) =>
    `0x${addr.toLowerCase().slice(2).padStart(64, "0")}`;
  return (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as {
      method: string;
      params: Array<{ topics?: Array<string | null> }>;
    };
    if (body.method === "eth_blockNumber") {
      return new Response(
        JSON.stringify({ result: `0x${head.toString(16)}` }),
        { status: 200 },
      );
    }
    if (body.method === "eth_getLogs") {
      if (opts.refuseLogs) {
        return new Response(JSON.stringify({ error: { code: -32005, message: "range too large" } }), {
          status: 429,
        });
      }
      const topics = body.params[0]?.topics ?? [];
      // Position 2 filled = inflows to the wallet; position 1 = outflows.
      const inbound = topics[2] != null;
      const rows = inbound ? (opts.inbound ?? []) : (opts.outbound ?? []);
      return new Response(
        JSON.stringify({
          result: rows.map((row) => ({
            transactionHash: row.tx,
            topics: [
              "0xtransfer",
              inbound ? pad((row as { from: string }).from) : pad(WALLET),
              inbound ? pad(WALLET) : pad((row as { to: string }).to),
            ],
            data: `0x${row.amount.toString(16)}`,
            blockNumber: `0x${row.block.toString(16)}`,
          })),
        }),
        { status: 200 },
      );
    }
    return new Response(JSON.stringify({ result: null }), { status: 200 });
  }) as typeof fetch;
}

function withChain<T>(chain: typeof fetch, run: () => Promise<T>): Promise<T> {
  vi.stubGlobal("fetch", chain);
  return run().finally(() => {
    vi.unstubAllGlobals();
    installFacilitatorMock();
  });
}

describe("the statement, read off the chain", () => {
  it("counts, sums and lists both directions, oldest first, and signs it", async () => {
    const statement = await withChain(
      fakeChain({
        inbound: [
          { tx: "0xaa", from: OTHER, amount: 5000n, block: 999_990 },
          { tx: "0xab", from: OTHER, amount: 1_000_000n, block: 999_980 },
        ],
        outbound: [{ tx: "0xac", to: OTHER, amount: 250_000n, block: 999_985 }],
      }),
      () => performWalletStatement(testEnv, WALLET.toUpperCase(), 6),
    );
    expect(statement.coverage).toBe("complete");
    expect(statement.wallet).toBe(WALLET);
    expect(statement.inflows.count).toBe(2);
    expect(statement.inflows.total_atomic).toBe("1005000");
    expect(statement.inflows.total_usdc).toBeCloseTo(1.005, 6);
    // Oldest first: block 999,980 leads.
    expect(statement.inflows.transfers[0]?.tx_hash).toBe("0xab");
    expect(statement.inflows.transfers[0]?.counterparty).toBe(OTHER);
    expect(statement.outflows.count).toBe(1);
    expect(statement.outflows.transfers[0]?.counterparty).toBe(OTHER);
    expect(statement.window.to_block).toBe(1_000_000);
    expect(statement.window.from_block).toBe(1_000_000 - 6 * 1800);
    expect(statement.signature).toMatch(/^[0-9a-f]{128}$/);
    // The judgment-free rule, pinned: no verdict field exists.
    expect("verdict" in statement).toBe(false);
  });

  it("caps the list, never the counts, and says so on the artifact", async () => {
    const many = Array.from({ length: STATEMENT_LIST_CAP + 30 }, (_, i) => ({
      tx: `0x${i.toString(16)}`,
      from: OTHER,
      amount: 1000n,
      block: 900_000 + i,
    }));
    const statement = await withChain(
      fakeChain({ inbound: many }),
      () => performWalletStatement(testEnv, WALLET, 6),
    );
    expect(statement.inflows.count).toBe(STATEMENT_LIST_CAP + 30);
    expect(statement.inflows.listed).toBe(STATEMENT_LIST_CAP);
    expect(statement.inflows.transfers).toHaveLength(STATEMENT_LIST_CAP);
    expect(statement.list_cap).toBe(STATEMENT_LIST_CAP);
    // The total still covers every transfer, listed or not.
    expect(statement.inflows.total_atomic).toBe(
      String(1000 * (STATEMENT_LIST_CAP + 30)),
    );
  });

  it("a refused read becomes a signed window_unreadable, never a throw", async () => {
    const statement = await withChain(
      fakeChain({ refuseLogs: true }),
      () => performWalletStatement(testEnv, WALLET, 6),
    );
    expect(statement.coverage).toBe("window_unreadable");
    expect(statement.read_error).toBeTruthy();
    expect(statement.inflows.count).toBe(0);
    expect(statement.signature).toMatch(/^[0-9a-f]{128}$/);
    expect(statement.scope).toContain("window_unreadable is a fact about our read");
  });

  it("clamps hours into the published bounds", () => {
    expect(statementHours(undefined)).toBe(6);
    expect(statementHours("2")).toBe(2);
    expect(statementHours("99")).toBe(11);
    expect(statementHours("0")).toBe(1);
    expect(statementHours("garbage")).toBe(6);
  });
});

describe("the statement door", () => {
  const buying = { "PAYMENT-SIGNATURE": "not-a-real-signature" };

  it("sits on the shelf: wallet required, statement-not-judgment stated", async () => {
    const item = MENU_ITEMS.find((entry) => entry.id === "the_statement");
    expect(item?.fulfillment).toBe("instant");
    expect(item?.description).toContain("never a judgment");
    // The constraint moved with the machinery (parity, 2026-08-21):
    // one chain per statement, Base default, Polygon by network param.
    expect(JSON.stringify(item?.constraints)).toContain("USDC on Base by default");
    expect(JSON.stringify(item?.constraints)).toContain("network=eip155:137");
    const schema = buyInputSchema(item!);
    expect(schema.required).toContain("wallet");
  });

  it("refuses a missing or malformed wallet before money", async () => {
    const missing = await SELF.fetch(`${BASE}/api/buy/the_statement`, {
      headers: buying,
    });
    expect(missing.status).toBe(400);
    const malformed = await SELF.fetch(
      `${BASE}/api/buy/the_statement?wallet=DGxcPrAHL9YM3hW7iXuHFJmr87Zr6AMA4jCYHBpuvMgE`,
      { headers: buying },
    );
    expect(malformed.status).toBe(400);
    expect(((await malformed.json()) as { error: string }).error).toContain(
      "Base",
    );
  });

  it("refuses out-of-range hours before money", async () => {
    const response = await SELF.fetch(
      `${BASE}/api/buy/the_statement?wallet=${WALLET}&hours=48`,
      { headers: buying },
    );
    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: string }).error).toContain(
      "1 to 11",
    );
  });

  it("answers a bare probe with a price — the probe rule", async () => {
    const response = await SELF.fetch(`${BASE}/api/buy/the_statement`);
    expect(response.status).toBe(402);
  });

  it("delivers end to end: read, signed, evidence bound, served forever", async () => {
    const chain = fakeChain({
      inbound: [{ tx: "0xdd", from: OTHER, amount: 42_000n, block: 999_999 }],
      outbound: [],
    });
    const inner = globalThis.fetch;
    vi.stubGlobal(
      "fetch",
      (async (input: RequestInfo | URL, init?: RequestInit) => {
        const bodyText = String(init?.body ?? "");
        if (bodyText.includes("eth_blockNumber") || bodyText.includes("eth_getLogs")) {
          return chain(input as never, init as never);
        }
        return inner(input as never, init as never);
      }) as typeof fetch,
    );
    try {
      const challenge = await SELF.fetch(
        `${BASE}/api/buy/the_statement?wallet=${WALLET}&hours=3`,
      );
      expect(challenge.status).toBe(402);
      const headerName = [...challenge.headers.keys()].find(
        (name) => name.toLowerCase() === "payment-required",
      )!;
      const required = JSON.parse(atob(challenge.headers.get(headerName)!)) as {
        accepts: Array<Record<string, unknown>>;
      };
      const paid = await SELF.fetch(
        `${BASE}/api/buy/the_statement?wallet=${WALLET}&hours=3`,
        {
          headers: {
            "PAYMENT-SIGNATURE": buildPaymentSignature(
              required.accepts[0] as never,
            ),
          },
        },
      );
      expect(paid.status).toBe(200);
      const body = (await paid.json()) as Record<string, any>;
      expect(body.coverage).toBe("complete");
      expect(body.statement_id).toMatch(/^stmt_/);
      expect(body.inflow_count).toBe(1);
      expect(body.statement_url).toBe(`/api/statement/${body.statement_id}`);
      expect(body.statement.window.hours_requested).toBe(3);

      // The certificate's attests field IS the record's evidence hash.
      const verify = (await (
        await SELF.fetch(`${BASE}/api/verify/${body.certificate.cert_id}`)
      ).json()) as Record<string, any>;
      expect(verify.valid).toBe(true);
      expect(verify.certificate.attests).toBe(body.statement.evidence_hash);

      // The statement URL serves the record with its honest boundaries.
      const record = (await (
        await SELF.fetch(`${BASE}${body.statement_url}`)
      ).json()) as Record<string, any>;
      expect(record.statement.evidence_hash).toBe(body.statement.evidence_hash);
      expect(record.what_this_is).toContain("never a judgment");
      expect(JSON.stringify(record.how_to_verify)).toContain("eth_getLogs");
    } finally {
      vi.unstubAllGlobals();
      installFacilitatorMock();
    }
  });
});

/**
 * THE THIRD RAIL ON THE STATEMENT (parity ruling, 2026-08-21): one
 * chain per statement, Base unless asked, Polygon by name or CAIP-2,
 * anything else refused before money moves.
 */
describe("the statement's network parameter", () => {
  it("resolves the whole vocabulary, and only the vocabulary", async () => {
    const { statementChain } = await import("@/services/wallet-statement");
    expect(statementChain(undefined)?.caip2).toBe("eip155:8453");
    expect(statementChain("base")?.caip2).toBe("eip155:8453");
    expect(statementChain("eip155:8453")?.caip2).toBe("eip155:8453");
    expect(statementChain("polygon")?.caip2).toBe("eip155:137");
    expect(statementChain("eip155:137")?.caip2).toBe("eip155:137");
    // Solana joined the vocabulary 2026-09-02 (SOLANA_PARITY gap 1).
    expect(statementChain("solana")?.caip2).toBe("solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp");
    expect(statementChain("eip155:1")).toBeNull();
    expect(statementChain("bitcoin")).toBeNull();
  });

  it("stamps the chain it actually read on the artifact", async () => {
    const { statementChain } = await import("@/services/wallet-statement");
    const polygon = statementChain("polygon")!;
    const statement = await withChain(
      fakeChain({
        inbound: [{ tx: "0xpa", from: OTHER, amount: 500_000n, block: 999_990 }],
        outbound: [],
      }),
      () => performWalletStatement(testEnv, WALLET, 6, polygon),
    );
    expect(statement.chain).toBe("eip155:137");
    expect(statement.asset).toBe(
      "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359",
    );
    expect(statement.scope).toContain("Polygon (eip155:137)");
    expect(statement.inflows.count).toBe(1);
  });

  it("refuses an unrecognized network at the door, before money moves", async () => {
    const refused = await SELF.fetch(
      `${BASE}/api/buy/the_statement?wallet=${WALLET}&network=eip155:1`,
      { headers: { "PAYMENT-SIGNATURE": "not-a-real-signature" } },
    );
    expect(refused.status).toBe(400);
    const body = (await refused.json()) as { error: string };
    expect(body.error).toContain("eip155:137");
    expect(body.error).toContain("refused");
  });
});
