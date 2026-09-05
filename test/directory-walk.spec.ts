import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import index402Page from "./fixtures/402index/services-page1.json";
import x402scanResources from "./fixtures/x402scan/resources.json";
import x402scanTerms from "./fixtures/x402scan/resources.terms.json";
import { KV_KEYS } from "@/lib/kv-keys";
import { chooseAccept, decodeChallenge, payOnce, type PayOnceOptions } from "@/lib/pay-fetch";
import {
  PASS_FRESH_HOURS,
  X402SCAN_PASS_CAP_USD,
  latestDirectoryPass,
  parse402indexPage,
  parseX402scanPage,
  passForCensus,
  walkDirectory,
  type DirectoryReader,
} from "@/services/directory-walk";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;
const OWN = "scvd.store";

/**
 * THE TWO DIRECTORIES THE ROUND CANNOT READ IN ONE BREATH, and the
 * three promises their walk makes:
 *
 *   The parsers are held to the keeper's captured bytes (PR #482), not
 *   to a shape somebody remembered.
 *   A pass that did not reach the directory's own end is UNREAD to the
 *   census — the population law, applied to a fourth instrument.
 *   The paid one refuses exactly what the launch check refuses, as a
 *   function, before a cent moves: never our own wallet, never an
 *   unscreened payTo (rule 3 fails closed), never over cap, never a
 *   redirect followed with a signed authorization, never a retry.
 */

describe("the parsers, against the captured bodies", () => {
  it("reads 402index's free page: x402 rows only, host per row, stride as echoed", () => {
    const page = parse402indexPage(index402Page, OWN);
    expect(page).not.toBeNull();
    // The capture asked limit=25 offset=0 of total 104,106.
    expect(page?.next).toBe("25");
    for (const host of page?.hosts ?? []) expect(host).toMatch(/^[a-z0-9.-]+$/);
    const rows = (index402Page as { services: { protocol: string }[] }).services;
    const x402Rows = rows.filter((row) => row.protocol === "x402").length;
    expect(page?.hosts.length).toBeLessThanOrEqual(x402Rows);
  });

  it("ends 402index at the directory's own end, not one page past it", () => {
    const last = { services: [{ url: "https://a.example/x", protocol: "x402" }], total: 26, limit: 25, offset: 25 };
    expect(parse402indexPage(last, OWN)?.next).toBeNull();
    const empty = { services: [], total: 104106, limit: 25, offset: 0 };
    expect(parse402indexPage(empty, OWN)?.next).toBeNull();
  });

  it("is unread when 402index's shape moves under us", () => {
    expect(parse402indexPage({ services: [] }, OWN)).toBeNull();
    expect(parse402indexPage({ data: [], total: 1, limit: 1, offset: 0 }, OWN)).toBeNull();
  });

  it("reads x402scan's paid page: host per resource, the indexer's own deprecations left out", () => {
    const page = parseX402scanPage(x402scanResources, OWN);
    expect(page).not.toBeNull();
    // The capture was page 0 of 2 with a next page.
    expect(page?.next).toBe("1");
    expect(page?.hosts.length).toBeGreaterThan(0);
    const deprecated = parseX402scanPage(
      { data: [{ resource: "https://gone.example/x", deprecatedAt: "2026-01-01" }], pagination: { page: 3, has_next_page: false } },
      OWN,
    );
    expect(deprecated?.hosts).toEqual([]);
    expect(deprecated?.next).toBeNull();
  });

  it("reads the price out of the captured challenge, and it is a cent", () => {
    const decoded = (x402scanTerms as { payment_required_decoded: { accepts: unknown[] } }).payment_required_decoded;
    const header = btoa(JSON.stringify(decoded));
    const challenge = decodeChallenge(header);
    const chosen = challenge ? chooseAccept(challenge.accepts) : null;
    expect(chosen?.payTo).toBe("0x2EC4545f96A24876764bF2B04D54E66A1351bE71");
    expect(Number(chosen?.amount) / 1e6).toBe(0.01);
  });
});

/* A reader whose pages are scripted, so the machine can be walked dry. */
type ScriptedPage = null | { hosts: string[]; next: string | null; paidUsd: number };

function scripted(
  source: string,
  pages: ScriptedPage[],
  overrides: Partial<DirectoryReader> = {},
): DirectoryReader & { calls: number } {
  const reader: DirectoryReader & { calls: number } = {
    source,
    pagesPerTick: 2,
    maxPagesPerPass: 100,
    passCapUsd: 0,
    calls: 0,
    async readPage(): Promise<ScriptedPage> {
      const page: ScriptedPage = pages[reader.calls] ?? null;
      reader.calls += 1;
      return page;
    },
    ...overrides,
  };
  return reader;
}

async function clear(source: string): Promise<void> {
  await testEnv.COUNTERS.delete(KV_KEYS.directoryWalk(source));
  await testEnv.COUNTERS.delete(KV_KEYS.directoryPass(source));
}

describe("the walk machine", () => {
  it("reads one tick's worth and keeps its cursor", async () => {
    await clear("t1");
    const reader = scripted("t1", [
      { hosts: ["a.example"], next: "1", paidUsd: 0 },
      { hosts: ["b.example"], next: "2", paidUsd: 0 },
      { hosts: ["c.example"], next: null, paidUsd: 0 },
    ]);
    const first = await walkDirectory(testEnv, reader);
    expect(first.pass).toBeNull();
    expect(first.state.pages_read).toBe(2);
    expect(first.state.cursor).toBe("2");
    const second = await walkDirectory(testEnv, reader);
    expect(second.pass?.hosts_known).toBe(3);
    expect(second.pass?.truncated).toBe(false);
    expect(await passForCensus(testEnv, "t1")).toEqual(["a.example", "b.example", "c.example"]);
  });

  it("an unreadable page ends the tick and holds the cursor, never the pass", async () => {
    await clear("t2");
    const reader = scripted("t2", [
      { hosts: ["a.example"], next: "1", paidUsd: 0 },
      null,
      { hosts: ["b.example"], next: null, paidUsd: 0 },
    ]);
    const first = await walkDirectory(testEnv, reader);
    expect(first.pass).toBeNull();
    expect(first.state.cursor).toBe("1");
    expect(first.state.last_problem).toContain("could not be read");
    const second = await walkDirectory(testEnv, reader);
    expect(second.pass?.hosts_known).toBe(2);
  });

  /**
   * THE LAW. A pass that stopped short is on the record with its hosts
   * and is NULL to the census. A partial enumeration cannot tell a
   * delisting from a page never reached.
   */
  it("a page ceiling truncates the pass, and a truncated pass is unread to the census", async () => {
    await clear("t3");
    const reader = scripted("t3", Array.from({ length: 10 }, (_u, i) => ({ hosts: [`h${i}.example`], next: String(i + 1), paidUsd: 0 })), {
      maxPagesPerPass: 3,
      pagesPerTick: 10,
    });
    const { pass } = await walkDirectory(testEnv, reader);
    expect(pass?.truncated).toBe(true);
    expect(pass?.truncated_why).toContain("ceiling");
    expect(pass?.hosts_known).toBe(3);
    expect(await passForCensus(testEnv, "t3")).toBeNull();
  });

  it("a spend ceiling truncates the paid pass before the page that would cross it", async () => {
    await clear("t4");
    const reader = scripted("t4", Array.from({ length: 10 }, (_u, i) => ({ hosts: [`h${i}.example`], next: String(i + 1), paidUsd: 0.05 })), {
      passCapUsd: 0.12,
      pagesPerTick: 10,
    });
    const { pass } = await walkDirectory(testEnv, reader);
    expect(pass?.truncated).toBe(true);
    expect(pass?.truncated_why).toContain("spend ceiling");
    expect(pass?.spent_usd).toBe(0.1);
    expect(await passForCensus(testEnv, "t4")).toBeNull();
  });

  it("a completed pass goes stale, and stale is unread", async () => {
    await clear("t5");
    const reader = scripted("t5", [{ hosts: ["a.example"], next: null, paidUsd: 0 }]);
    await walkDirectory(testEnv, reader, new Date("2026-08-01T00:00:00Z"));
    expect(await passForCensus(testEnv, "t5", new Date("2026-08-02T00:00:00Z"))).toEqual(["a.example"]);
    const later = new Date(Date.parse("2026-08-01T00:00:00Z") + (PASS_FRESH_HOURS + 1) * 3_600_000);
    expect(await passForCensus(testEnv, "t5", later)).toBeNull();
    expect((await latestDirectoryPass(testEnv, "t5"))?.hosts_known).toBe(1);
  });

  it("the x402scan pass cap is the wallet law's line", () => {
    expect(X402SCAN_PASS_CAP_USD).toBe(1);
  });
});

/* One paid GET, with the door and the signer scripted. */
function door(status: number, headers: Record<string, string> = {}, body = "{}") {
  return new Response(body, { status, headers });
}
const CHALLENGE = btoa(
  JSON.stringify({
    x402Version: 2,
    accepts: [{ scheme: "exact", network: "eip155:8453", amount: "10000", asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", payTo: "0x2EC4545f96A24876764bF2B04D54E66A1351bE71", maxTimeoutSeconds: 300, extra: { name: "USD Coin", version: "2" } }],
  }),
);
function options(over: Partial<PayOnceOptions> & { answers: Response[] }): PayOnceOptions & { seen: Request[] } {
  const seen: Request[] = [];
  const answers = [...over.answers];
  return {
    signer: { address: "0x1111111111111111111111111111111111111111", signTypedData: async () => "0xsig" },
    screen: async () => ({ listed: false, source: "test screen" }),
    perCallCapUsd: 0.05,
    fetchImpl: async (input, init) => {
      seen.push(new Request(input, init));
      return answers.shift() ?? door(500);
    },
    seen,
    ...over,
  };
}

describe("payOnce refuses what the launch check refuses", () => {
  it("returns a free door's body without signing anything", async () => {
    const o = options({ answers: [door(200, {}, '{"ok":true}')] });
    const r = await payOnce("https://d.example/x", o);
    expect(r.paid_usd).toBe(0);
    expect(r.body).toBe('{"ok":true}');
    expect(o.seen.length).toBe(1);
  });

  it("pays a cent, presents it in PAYMENT-SIGNATURE, and reads the title-case header", async () => {
    const o = options({ answers: [door(402, { "Payment-Required": CHALLENGE }), door(200, {}, '{"data":[]}')] });
    const r = await payOnce("https://d.example/x", o);
    expect(r.paid_usd).toBe(0.01);
    expect(r.pay_to).toBe("0x2EC4545f96A24876764bF2B04D54E66A1351bE71");
    expect(r.body).toBe('{"data":[]}');
    expect(o.seen[1]?.headers.get("PAYMENT-SIGNATURE")).toBeTruthy();
  });

  it("never pays its own wallet", async () => {
    const o = options({
      answers: [door(402, { "PAYMENT-REQUIRED": CHALLENGE })],
      signer: { address: "0x2EC4545f96A24876764bF2B04D54E66A1351bE71", signTypedData: async () => "0xsig" },
    });
    const r = await payOnce("https://d.example/x", o);
    expect(r.refusal).toBe("own_wallet");
    expect(r.paid_usd).toBe(0);
    expect(o.seen.length).toBe(1);
  });

  it("never pays over the per-call cap", async () => {
    const o = options({ answers: [door(402, { "PAYMENT-REQUIRED": CHALLENGE })], perCallCapUsd: 0.005 });
    const r = await payOnce("https://d.example/x", o);
    expect(r.refusal).toBe("over_cap");
    expect(o.seen.length).toBe(1);
  });

  it("rule 3 fails closed: a screen that did not answer, or that listed, means no payment", async () => {
    for (const listed of [null, true] as const) {
      const o = options({ answers: [door(402, { "PAYMENT-REQUIRED": CHALLENGE })], screen: async () => ({ listed, source: "test" }) });
      const r = await payOnce("https://d.example/x", o);
      expect(r.refusal).toBe("unscreened");
      expect(r.paid_usd).toBe(0);
      expect(o.seen.length).toBe(1);
    }
  });

  it("does not follow a redirect with a signed authorization in hand", async () => {
    const o = options({ answers: [door(402, { "PAYMENT-REQUIRED": CHALLENGE }), door(302, { location: "https://elsewhere.example/" })] });
    const r = await payOnce("https://d.example/x", o);
    expect(r.refusal).toBe("redirect");
    expect(o.seen.length).toBe(2);
  });

  it("does not retry a paid request the door answered with another 402", async () => {
    const o = options({ answers: [door(402, { "PAYMENT-REQUIRED": CHALLENGE }), door(402, { "PAYMENT-REQUIRED": CHALLENGE })] });
    const r = await payOnce("https://d.example/x", o);
    expect(r.refusal).toBe("refused_paid");
    expect(o.seen.length).toBe(2);
  });

  it("is unread on a 402 with no exact/Base accept", async () => {
    const solanaOnly = btoa(JSON.stringify({ x402Version: 2, accepts: [{ scheme: "exact", network: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp", amount: "10000", payTo: "x" }] }));
    const o = options({ answers: [door(402, { "PAYMENT-REQUIRED": solanaOnly })] });
    expect((await payOnce("https://d.example/x", o)).refusal).toBe("no_terms");
  });
});
