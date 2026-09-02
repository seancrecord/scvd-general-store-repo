import { SELF, env } from "cloudflare:test";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { KV_KEYS } from "@/lib/kv-keys";
import { buyInputSchema } from "@/lib/bazaar-discovery";
import {
  MAX_BLOCKS_PER_PASS,
  OPERATOR_PASS_HOURS,
  OPERATOR_STATEMENT_TERM_DAYS,
  operatorStatementHistoryOf,
  readOperatorStatement,
  sweepOperatorStatements,
  type OperatorStatementRecord,
} from "@/services/operator-statement";
import { sweepWatches } from "@/services/watch-sweep";
import { getMenuItem } from "@/store";
import { CAPABILITY_QUERY, NOVELTY_ONLY, SPEC_RETURNS, SPEC_WHY_USE, USE_WHEN } from "@/store/spec";
import type { Env } from "@/types";
import { installFacilitatorMock } from "./helpers/facilitator-mock";
import { buildPaymentSignature, decodePaymentRequired } from "./helpers/payment";

/**
 * THE OPERATOR'S STATEMENT (roadmap S10; the keeper's name, price and
 * cadence, 2026-09-02). What this file holds:
 *
 *   - the row is a 30-day term at his price, chain_read, wallet in;
 *   - the door refuses a bad address or an unknown rail before money;
 *   - a purchase opens the term from the block after the head and
 *     answers with a history URL that already reads;
 *   - the sweep takes one bounded pass every six hours from the block
 *     after the last, stitches the month into one range, tallies the
 *     payers, and the summary re-derives distinct payers and the
 *     largest payer as counts beside the totals;
 *   - an unreadable window is a signed pass that the next pass reads
 *     again rather than skipping; a head that jumped past the ceiling
 *     leaves blocks_unread counted against us;
 *   - the sweep's budget holds; an ended term is left alone and its
 *     history carries the_next_month as a purchase, never a renewal.
 */

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";
const WALLET = "0x843b544bf5f0aa6cbf13e94563874878c98cc4a7";
const A = "0x1111111111111111111111111111111111111111";
const B = "0x2222222222222222222222222222222222222222";
const C = "0x3333333333333333333333333333333333333333";

interface Row {
  tx: string;
  from: string;
  amount: bigint;
  block: number;
}

/** A fake node that honours the block range asked for, so stitched passes count right. */
function fakeChain(state: { head: number; inbound: Row[]; outbound: Row[]; refuseLogs?: boolean }): typeof fetch {
  const pad = (addr: string) => `0x${addr.toLowerCase().slice(2).padStart(64, "0")}`;
  return (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as {
      method: string;
      params: Array<{ topics?: Array<string | null>; fromBlock?: string; toBlock?: string }>;
    };
    if (body.method === "eth_blockNumber") {
      return new Response(JSON.stringify({ result: `0x${state.head.toString(16)}` }), { status: 200 });
    }
    if (body.method === "eth_getLogs") {
      if (state.refuseLogs) {
        return new Response(JSON.stringify({ error: { code: -32005, message: "range too large" } }), { status: 429 });
      }
      const filter = body.params[0]!;
      const from = Number.parseInt(filter.fromBlock ?? "0x0", 16);
      const to = Number.parseInt(filter.toBlock ?? "0xffffffff", 16);
      const inbound = filter.topics?.[2] != null;
      const rows = (inbound ? state.inbound : state.outbound).filter((row) => row.block >= from && row.block <= to);
      return new Response(
        JSON.stringify({
          result: rows.map((row) => ({
            transactionHash: row.tx,
            topics: ["0xtransfer", inbound ? pad(row.from) : pad(WALLET), inbound ? pad(WALLET) : pad(row.from)],
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

/** Route RPC bodies to the fake chain and everything else (the facilitator) to the mock underneath. */
function useChain(chain: typeof fetch): void {
  installFacilitatorMock();
  const inner = globalThis.fetch;
  vi.stubGlobal("fetch", (async (input: RequestInfo | URL, init?: RequestInit) => {
    const bodyText = String(init?.body ?? "");
    if (bodyText.includes("eth_blockNumber") || bodyText.includes("eth_getLogs")) {
      return chain(input as never, init as never);
    }
    return inner(input as never, init as never);
  }) as typeof fetch);
}

async function paid(path: string): Promise<Response> {
  const challenge = await SELF.fetch(`${BASE}${path}`);
  expect(challenge.status).toBe(402);
  const accepts = decodePaymentRequired(challenge).accepts as Parameters<typeof buildPaymentSignature>[0][];
  return SELF.fetch(`${BASE}${path}`, { headers: { "PAYMENT-SIGNATURE": buildPaymentSignature(accepts[0]!) } });
}

async function clearTerms(): Promise<void> {
  const listed = await testEnv.ORDERS.list({ prefix: KV_KEYS.operatorStatementPrefix });
  await Promise.all(listed.keys.map((key) => testEnv.ORDERS.delete(key.name)));
}

beforeAll(installFacilitatorMock);
beforeEach(clearTerms);
afterEach(() => {
  vi.unstubAllGlobals();
  installFacilitatorMock();
});

describe("the row", () => {
  const item = getMenuItem("operator_statement")!;
  it("is a 30-day term at the keeper's price, reading chain state, the address in", () => {
    expect(item.price_usdc).toBe(21);
    expect(item.cadence).toBe("term");
    expect(item.term_days).toBe(OPERATOR_STATEMENT_TERM_DAYS);
    expect(item.reads).toBe("chain_read");
    expect(item.fulfillment).toBe("instant");
    expect(item.subtitle).toBeTruthy();
    const schema = buyInputSchema(item);
    expect(schema.required).toContain("wallet");
    expect(CAPABILITY_QUERY["operator_statement"]).toBeTruthy();
    expect(SPEC_WHY_USE["operator_statement"]!.length).toBeLessThan(320);
    expect(SPEC_RETURNS["operator_statement"]).toContain("never a renewal");
    expect(NOVELTY_ONLY).not.toContain("operator_statement");
    expect(USE_WHEN.some((entry) => entry.items.includes("operator_statement"))).toBe(true);
  });

  it("never promises a share, a rate or a rating", () => {
    const copy = [item.description, item.note_402, ...(item.constraints ?? []), SPEC_WHY_USE["operator_statement"], SPEC_RETURNS["operator_statement"]].join(" ").toLowerCase();
    for (const forbidden of ["percent", " share of", "rating", "score", "ranking"]) {
      expect(copy, `the row promises a ${forbidden}`).not.toContain(forbidden);
    }
    expect(copy).toContain("never a renewal");
  });
});

describe("the door", () => {
  it("refuses a missing address and an unknown rail before any money moves", async () => {
    const bare = await paid("/api/buy/operator_statement");
    expect(bare.status).toBe(400);
    expect(((await bare.json()) as Record<string, unknown>)["charged"]).toBe(false);
    const rail = await paid(`/api/buy/operator_statement?wallet=${WALLET}&network=eip155:1`);
    expect(rail.status).toBe(400);
    expect(String(((await rail.json()) as Record<string, unknown>)["error"])).toContain("network");
  });

  it("opens the term from the block after the head and answers with a history that already reads", async () => {
    useChain(fakeChain({ head: 1_000_000, inbound: [], outbound: [] }));
    const response = await paid(`/api/buy/operator_statement?wallet=${WALLET}`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    const id = String(body["statement_id"]);
    expect(id.startsWith("ostmt_")).toBe(true);
    expect(String(body["history_url"])).toBe(`${BASE}/api/operator-statement/${id}`);
    const record = await readOperatorStatement(testEnv, id);
    expect(record?.wallet).toBe(WALLET);
    expect(record?.opened_at_block).toBe(1_000_001);
    expect(record?.passes).toEqual([]);
    expect(record?.cert_id).toBeTruthy();
    const history = (await (await SELF.fetch(`${BASE}/api/operator-statement/${id}`)).json()) as Record<string, any>;
    expect(history.summary.passes_taken).toBe(0);
    expect(history.complete).toBe(false);
    expect(history.the_next_month.ended).toBe(false);
    expect(String(history.the_next_month.buy_url)).toContain(`wallet=${WALLET}`);
    expect(String(history.the_next_month.the_rule)).toContain("never renews itself");
    expect(String(history.certificate)).toContain("/api/verify/");
  });
});

function seedTerm(overrides: Partial<OperatorStatementRecord> = {}): Promise<OperatorStatementRecord> {
  const now = Date.now();
  const record: OperatorStatementRecord = {
    statement_id: `ostmt_test${Math.random().toString(36).slice(2, 8)}`,
    wallet: WALLET,
    chain: "eip155:8453",
    asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    started_at: new Date(now - 60_000).toISOString(),
    ends_at: new Date(now + OPERATOR_STATEMENT_TERM_DAYS * 86_400_000).toISOString(),
    opened_at_block: 1_000_001,
    passes: [],
    ...overrides,
  };
  return testEnv.ORDERS.put(KV_KEYS.operatorStatement(record.statement_id), JSON.stringify(record)).then(() => record);
}

describe("the sweep, pass by pass", () => {
  it("stitches passes from the block after the last, tallies payers, and the summary re-derives the counts", async () => {
    const term = await seedTerm();
    const state = {
      head: 1_000_100,
      inbound: [
        { tx: "0xa1", from: A, amount: 5_000_000n, block: 1_000_010 },
        { tx: "0xb1", from: B, amount: 1_000_000n, block: 1_000_050 },
        { tx: "0xa2", from: A, amount: 2_000_000n, block: 1_000_090 },
      ],
      outbound: [{ tx: "0xo1", from: C, amount: 250_000n, block: 1_000_020 }],
    };
    useChain(fakeChain(state));
    const t0 = Date.now();
    expect(await sweepOperatorStatements(testEnv, t0)).toBe(1);
    let record = (await readOperatorStatement(testEnv, term.statement_id))!;
    expect(record.passes).toHaveLength(1);
    const first = record.passes[0]!;
    expect(first.from_block).toBe(1_000_001);
    expect(first.to_block).toBe(1_000_100);
    expect(first.coverage).toBe("complete");
    expect(first.inflows.count).toBe(3);
    expect(first.inflows.total_usdc).toBeCloseTo(8, 6);
    expect(first.outflows.count).toBe(1);
    expect(first.payers[A]).toMatchObject({ transfers: 2, total_usdc: 7 });
    expect(first.payers[B]).toMatchObject({ transfers: 1, total_usdc: 1 });
    expect(first.signature).toMatch(/^[0-9a-f]{128}$/);

    // Too soon: the floor between passes holds.
    expect(await sweepOperatorStatements(testEnv, t0 + 3600_000)).toBe(0);

    // Six hours on, the chain moved: the next pass starts one block after the last.
    state.head = 1_000_200;
    state.inbound.push({ tx: "0xc1", from: C, amount: 3_000_000n, block: 1_000_150 });
    expect(await sweepOperatorStatements(testEnv, t0 + OPERATOR_PASS_HOURS * 3600_000)).toBe(1);
    record = (await readOperatorStatement(testEnv, term.statement_id))!;
    expect(record.passes[1]!.from_block).toBe(1_000_101);
    expect(record.passes[1]!.to_block).toBe(1_000_200);
    expect(record.passes[1]!.inflows.count).toBe(1);

    const history = operatorStatementHistoryOf(record, t0 + OPERATOR_PASS_HOURS * 3600_000);
    expect(history.summary).toMatchObject({
      passes_taken: 2,
      passes_missed: 0,
      blocks_covered: 200,
      blocks_since_open: 200,
      blocks_unread: 0,
      windows_unreadable: 0,
      inflows: { count: 4, total_usdc: 11 },
      outflows: { count: 1, total_usdc: 0.25 },
      distinct_payers: 3,
      largest_payer: { address: A, transfers: 2, total_usdc: 7 },
      payer_tally_capped: false,
    });
    expect(JSON.stringify(history)).not.toMatch(/"pct"|"percent|_rate"|"share"/);
  });

  it("signs an unreadable window and reads the same range again next time; a head past the ceiling leaves blocks unread, counted against us", async () => {
    const term = await seedTerm();
    const state = { head: 1_000_100, inbound: [] as Row[], outbound: [] as Row[], refuseLogs: true };
    useChain(fakeChain(state));
    const t0 = Date.now();
    await sweepOperatorStatements(testEnv, t0);
    let record = (await readOperatorStatement(testEnv, term.statement_id))!;
    expect(record.passes[0]!.coverage).toBe("window_unreadable");
    expect(record.passes[0]!.from_block).toBe(1_000_001);

    state.refuseLogs = false;
    // blocks since open = head − opened_at_block + 1 = ceiling + 5,000.
    state.head = 1_000_000 + MAX_BLOCKS_PER_PASS + 5_000;
    await sweepOperatorStatements(testEnv, t0 + OPERATOR_PASS_HOURS * 3600_000);
    record = (await readOperatorStatement(testEnv, term.statement_id))!;
    const second = record.passes[1]!;
    expect(second.from_block).toBe(1_000_001);
    expect(second.to_block).toBe(1_000_001 + MAX_BLOCKS_PER_PASS - 1);
    const history = operatorStatementHistoryOf(record, t0 + OPERATOR_PASS_HOURS * 3600_000);
    expect(history.summary.windows_unreadable).toBe(1);
    expect(history.summary.blocks_covered).toBe(MAX_BLOCKS_PER_PASS);
    expect(history.summary.blocks_unread).toBe(5_000);
    expect(String(history.what_this_is_not)).toContain("our gaps");
  });

  it("leaves an ended term alone, and its history says the next month is a purchase", async () => {
    const term = await seedTerm({
      started_at: new Date(Date.now() - 2 * 86_400_000).toISOString(),
      ends_at: new Date(Date.now() - 60_000).toISOString(),
    });
    useChain(fakeChain({ head: 1_000_100, inbound: [], outbound: [] }));
    expect(await sweepOperatorStatements(testEnv)).toBe(0);
    const history = (await (await SELF.fetch(`${BASE}/api/operator-statement/${term.statement_id}`)).json()) as Record<string, any>;
    expect(history.complete).toBe(true);
    expect(history.the_next_month.ended).toBe(true);
    expect(String(history.the_next_month.what_now)).toContain("starts a new history");
    expect(history.summary.passes_missed).toBeGreaterThan(0);
  });

  it("the shared sweep honours a per-tick budget", async () => {
    const prefix = "sweep-budget-test:";
    for (const id of ["a", "b", "c"]) {
      await testEnv.ORDERS.put(`${prefix}${id}`, JSON.stringify({ ends_at: new Date(Date.now() + 86_400_000).toISOString(), entries: [] }));
    }
    const worked = await sweepWatches<{ ends_at: string; entries: { at: string }[] }, { at: string }>({
      kv: testEnv.ORDERS,
      prefix,
      scanCap: 10,
      minSpacingMs: 1000,
      budget: 2,
      entriesOf: (record) => record.entries,
      observe: async () => ({ at: new Date().toISOString() }),
    });
    expect(worked).toBe(2);
  });
});
