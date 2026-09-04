import { env, SELF } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  listRecentBountyEvents,
  readBountyLedger,
  readMonthLedger,
} from "@/lib/metrics";
import { PORCH_EXACT, porchSurface, porchSurfaceKind } from "@/lib/porch-surface";
import { porchByKind } from "@/pages/admin/office-page";
import {
  moneyOutAllTime,
  outstandingPayouts,
  renderBountiesPage,
} from "@/pages/admin/bounties-page";
import { readFieldWallet } from "@/services/field-wallet";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";
const AUTH = {
  Authorization: `Basic ${btoa(`keeper:${testEnv.ADMIN_PASSWORD}`)}`,
};

/**
 * MONEY OUT, BOOKED (2026-09-04).
 *
 * The bounty walker's letter found the sanctions screen refusing
 * every claim for ninety minutes, and the desk had shown nothing: a
 * refused claim left its 400 and no row. The keeper's ruling was
 * that bounties, the claims against them and the wallet that pays
 * them belong in admin the same way purchases do. These hold that.
 */
describe("every claim presented at the board leaves a row", () => {
  it("books a refused claim with its reason, and the desk reads it back", async () => {
    const bountyId = `bty_test_${crypto.randomUUID().slice(0, 8)}`;
    const response = await SELF.fetch(`${BASE}/api/bounty-claim`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "bounty-ledger-test/1.0",
      },
      body: JSON.stringify({
        bounty_id: bountyId,
        tx_hash: `0x${"ab".repeat(32)}`,
        payer: `0x${"11".repeat(20)}`,
        payout_to: `0x${"22".repeat(20)}`,
      }),
    });
    expect(response.status).toBe(400);

    const rows = await listRecentBountyEvents(testEnv, 50);
    const row = rows.find((event) => event.item === `bounty:${bountyId}`);
    expect(row, "the refused claim left no row").toBeTruthy();
    expect(row!.kind).toBe("bounty");
    expect(row!.note?.startsWith("refused: ")).toBe(true);
    expect(row!.user_agent).toBe("bounty-ledger-test/1.0");

    const ledger = await readBountyLedger(testEnv);
    expect(ledger.refused + ledger.refusedHouse).toBeGreaterThan(0);

    const page = await SELF.fetch(`${BASE}/admin/bounties`, { headers: AUTH });
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain(bountyId);
    expect(html).toContain("refused");
    expect(html).toContain("The paying wallet");
  });

  it("books a body that was not JSON, under no bounty id", async () => {
    const response = await SELF.fetch(`${BASE}/api/bounty-claim`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    expect(response.status).toBe(400);
    const rows = await listRecentBountyEvents(testEnv, 50);
    expect(rows.some((event) => event.item === "bounty:(no id)")).toBe(true);
  });

  it("keeps the bounty counters out of the shelf's item rows", async () => {
    // readMonthLedger treats unknown kinds as items; a bounty counter
    // falling through would mint a shelf item called "refused".
    const ledger = await readMonthLedger(testEnv);
    expect(Object.keys(ledger.items)).not.toContain("refused");
    expect(Object.keys(ledger.items)).not.toContain("paid");
  });
});

describe("the paying wallet, read off the chain", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("says plainly when there is no wallet on this deployment", async () => {
    const reading = await readFieldWallet({ ...testEnv, FIELD_WALLET_KEY: undefined } as Env);
    expect(reading.provisioned).toBe(false);
    expect(reading.usdc).toBeNull();
    expect(reading.problem).toContain("FIELD_WALLET_KEY");
  });

  it("reads balanceOf through the RPC ladder and reports USDC, not atomic units", async () => {
    const calls: Array<{ to: string; data: string }> = [];
    vi.stubGlobal(
      "fetch",
      (async (_input: RequestInfo | URL, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as {
          method: string;
          params: [{ to: string; data: string }, string];
        };
        expect(body.method).toBe("eth_call");
        calls.push(body.params[0]);
        // 1,234,567 atomic = $1.234567
        return new Response(
          JSON.stringify({ result: `0x${(1_234_567).toString(16).padStart(64, "0")}` }),
          { status: 200 },
        );
      }) as typeof fetch,
    );
    const reading = await readFieldWallet({
      ...testEnv,
      FIELD_WALLET_KEY: `0x${"01".repeat(32)}`,
    } as Env);
    expect(reading.provisioned).toBe(true);
    expect(reading.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(reading.usdc).toBeCloseTo(1.234567, 6);
    expect(reading.problem).toBeUndefined();
    // balanceOf(address) on the USDC contract, the address padded in.
    expect(calls[0]?.to.toLowerCase()).toBe("0x833589fcd6edb6e08f4c7c32d4f71b54bda02913");
    expect(calls[0]?.data.startsWith("0x70a08231")).toBe(true);
    expect(calls[0]?.data).toContain(reading.address!.slice(2).toLowerCase());
  });

  it("reports a balance it could not read as not read, never as zero", async () => {
    vi.stubGlobal(
      "fetch",
      (async () => new Response("rate limited", { status: 429 })) as typeof fetch,
    );
    const reading = await readFieldWallet({
      ...testEnv,
      FIELD_WALLET_KEY: `0x${"01".repeat(32)}`,
    } as Env);
    expect(reading.usdc).toBeNull();
    expect(reading.problem).toContain("could not be read");
  });
});

describe("the bounty page's arithmetic and the desk's line", () => {
  it("counts only paid bounties whose authorization can still be redeemed", () => {
    const now = "2026-09-04T12:00:00.000Z";
    const nowSeconds = Math.floor(new Date(now).getTime() / 1000);
    const bounty = (status: "open" | "paid" | "expired", validBefore: number, reward: number) => ({
      bounty_id: "bty_x",
      target_url: "https://door.example/api",
      domain: "door.example",
      pay_to: "0x1111111111111111111111111111111111111111",
      amount_atomic: "5000",
      amount_usd: 0.005,
      reward_usd: reward,
      opened_at: now,
      opened_block: 1,
      expires_at: now,
      status,
      ...(status === "paid"
        ? {
            claim: {
              tx_hash: "0xab",
              payer: "0x1",
              payout_to: "0x2",
              claimed_at: now,
              authorization_nonce: "0x0",
              authorization_valid_before: String(validBefore),
            },
          }
        : {}),
    });
    const board = {
      bounties: [
        bounty("paid", nowSeconds + 3600, 0.25),
        bounty("paid", nowSeconds - 1, 0.25),
        bounty("open", 0, 0.1),
      ],
      open_count: 1,
      week: "2026-W36",
      weekly_budget_usd: 10,
      spent_this_week_usd: 0.5,
      payouts_enabled: true,
    };
    expect(outstandingPayouts(board, now)).toEqual({ count: 1, usd: 0.25 });
    // All-time: both paid bounties count, to the same wallet, credit owed read.
    expect(moneyOutAllTime(board, 1_500_000n)).toEqual({
      paid_bounties: 2,
      paid_usd: 0.5,
      walkers: 1,
      walker_payers: 1,
      credit_owed_usd: 1.5,
    });
    expect(moneyOutAllTime(null, 0n)).toBeNull();

    const html = renderBountiesPage({
      board,
      wallet: {
        provisioned: true,
        address: "0x3333333333333333333333333333333333333333",
        usdc: 0.1,
        chain: "eip155:8453",
        read_at: now,
      },
      ledger: null,
      attempts: [],
      funnel: { room: 10, board_json: 40, claim_read: 4, claims_presented: 2 },
      allTime: moneyOutAllTime(board, 1_500_000n),
      now,
      loadNotes: [],
    });
    // Promised more than it holds: said in red, not hidden in a sum.
    expect(html).toContain("Short.");
    expect(html).toContain("$0.10 USDC");
    // The funnel and the all-time mirror are on the page.
    expect(html).toContain("presented a claim");
    expect(html).toContain("$0.50");
    expect(html).toContain("$1.50");
  });

  it("puts money out on the desk without waiting on the chain", async () => {
    const page = await SELF.fetch(`${BASE}/admin`, { headers: AUTH });
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain("Money out:");
    expect(html).toContain("/admin/bounties");
  });
});

describe("the interactive doors and free resources have a porch line", () => {
  it("names the ones the keeper asked about", () => {
    const cases: Array<[string, string, string]> = [
      ["/bounties", "GET", "bounties"],
      ["/api/bounties", "GET", "bounties.json"],
      ["/api/bounty-claim", "POST", "bounty-claim"],
      ["/api/bounty-claim", "GET", "bounty-claim:read"],
      ["/api/letter", "POST", "letter:write"],
      ["/api/letter/letter_abc123", "GET", "letter:pickup"],
      ["/api/preflight", "POST", "preflight"],
      ["/api/preflight/batch", "POST", "preflight:batch"],
      ["/api/before-you-pay", "POST", "before-you-pay"],
      ["/api/look", "POST", "look"],
      ["/api/credit/0xabc", "GET", "credit:read"],
      ["/api/credit/redeem", "POST", "credit:redeem"],
      ["/credit", "GET", "credit"],
      ["/try", "GET", "try"],
      ["/menu", "GET", "menu"],
      ["/developers", "GET", "developers"],
      ["/api/launch-check/lc_1", "GET", "artifact:read"],
      ["/api/service-audit/sa_1", "GET", "artifact:read"],
      ["/api/order/ord_1", "GET", "order:read"],
    ];
    for (const [path, method, surface] of cases) {
      expect(porchSurface(path, method), `${method} ${path}`).toBe(surface);
    }
  });

  it("sorts every surface into a kind, so instruments and doors read apart", () => {
    // Every listed surface, and the dynamic ones, land somewhere named.
    for (const surface of PORCH_EXACT.values()) {
      expect(["storefront", "instrument", "door", "evidence", "room"]).toContain(
        porchSurfaceKind(surface),
      );
    }
    expect(porchSurfaceKind("preflight")).toBe("instrument");
    expect(porchSurfaceKind("preflight:batch")).toBe("instrument");
    expect(porchSurfaceKind("conformance:mcp")).toBe("instrument");
    expect(porchSurfaceKind("mcp:tool:preflight_endpoint")).toBe("instrument");
    expect(porchSurfaceKind("bounty-claim")).toBe("door");
    expect(porchSurfaceKind("letter:write")).toBe("door");
    expect(porchSurfaceKind("credit:redeem")).toBe("door");
    expect(porchSurfaceKind("corpus:host")).toBe("evidence");
    expect(porchSurfaceKind("artifact:read")).toBe("evidence");
    expect(porchSurfaceKind("item:small_blessing")).toBe("storefront");
    expect(porchSurfaceKind("try")).toBe("room");

    const sums = porchByKind({
      surfaces: {
        preflight: { organic: 4 },
        look: { organic: 2, house: 9 },
        "bounty-claim": { organic: 1 },
        privacy: { organic: 3 },
      },
      organicVisits: 10,
      porchToPurchase: null,
      truncated: false,
    });
    expect(sums[0]).toEqual(["instrument", 6]);
    expect(sums).toContainEqual(["door", 1]);
    expect(sums).toContainEqual(["room", 3]);
  });

  it("still leaves the verify door and the noise to their own instruments", () => {
    // /api/verify books its own row; counting it here would double it.
    expect(porchSurface("/api/verify/cert_abc", "GET")).toBeUndefined();
    expect(porchSurface("/health", "GET")).toBeUndefined();
    expect(porchSurface("/robots.txt", "GET")).toBeUndefined();
    // A junk id never mints a key: the bucket is the surface.
    expect(porchSurface("/api/letter/../../etc", "GET")).toBe("letter:pickup");
  });
});
