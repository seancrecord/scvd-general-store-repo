import { SELF, env } from "cloudflare:test";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { KV_KEYS } from "@/lib/kv-keys";
import {
  catalogAgreementOf,
  catalogTermsFromRow,
  compareCatalogToDoor,
  differingHosts,
} from "@/services/catalog-agreement";
import { takeCorpusSnapshot } from "@/services/corpus";
import { longWalkPass, readLongWalk } from "@/services/long-walk";
import { latestWardRound, runWardRound, type WardHostResult } from "@/services/ward-round";
import type { Env } from "@/types";

/**
 * THE CATALOG AGAINST THE DOOR (roadmap S8 Tier C, 2026-09-02). The
 * census already pulls the discovery index and the live 402 for every
 * probed host; this column compares the two and costs no new read.
 * What this file holds:
 *
 *   - the comparison itself, by rail, with the named legitimate
 *     differences built in (tiers on one rail agree; silence is not
 *     disagreement; a bare row is not comparable);
 *   - the one-shot round writes the column on every probed row and
 *     the counts with their denominator on the round; the seal keeps
 *     it in the signed snapshot;
 *   - the long walk freezes the catalog's terms with the roster, so a
 *     door knocked on Tuesday is compared against the copy read on
 *     Sunday;
 *   - the per-host read and the weekly brief surface it, the brief
 *     without naming a host;
 *   - our own doors' copy is read against the shelf minimum.
 */

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const PAY_TO = "0x1111111111111111111111111111111111111111";

function accept(amount: string, payTo = PAY_TO, network = "eip155:8453"): Record<string, unknown> {
  return { scheme: "exact", network, amount, asset: USDC, payTo };
}

function door402(accepts: Record<string, unknown>[]): Response {
  return new Response("{}", {
    status: 402,
    headers: { "PAYMENT-REQUIRED": btoa(JSON.stringify({ x402Version: 2, accepts })) },
  });
}

describe("the comparison, by rail", () => {
  const terms = catalogTermsFromRow({
    resourceUrl: "https://door.example/api/x",
    accepts: [accept("1000")],
    lastUpdated: "2026-08-30T00:00:00Z",
  })!;

  it("reads a row's terms, including the older maxAmountRequired spelling, and a bare row as null", () => {
    expect(terms.accepts).toEqual([{ network: "eip155:8453", asset: USDC.toLowerCase(), pay_to: PAY_TO, amount: "1000" }]);
    expect(terms.last_updated).toBe("2026-08-30T00:00:00Z");
    const v1 = catalogTermsFromRow({ accepts: [{ network: "base", asset: USDC, payTo: PAY_TO, maxAmountRequired: "5" }] })!;
    expect(v1.accepts[0]!.amount).toBe("5");
    expect(catalogTermsFromRow({ resourceUrl: "https://bare.example/x" })).toBeNull();
    expect(catalogTermsFromRow({ accepts: [] })).toBeNull();
  });

  it("agrees when the door offers the catalog's payTo and amount on that rail, even among other tiers", () => {
    const reading = compareCatalogToDoor(terms, [accept("5000"), accept("1000"), accept("2000")], true);
    expect(reading).toEqual({ state: "agrees", last_updated: "2026-08-30T00:00:00Z" });
  });

  it("names the amount, the payTo, or the rail that differs", () => {
    expect(compareCatalogToDoor(terms, [accept("2000"), accept("3000")], true)).toMatchObject({
      state: "differs",
      fields: ["amount on eip155:8453: catalog 1000, door 2000, 3000"],
    });
    expect(compareCatalogToDoor(terms, [accept("1000", "0x2222222222222222222222222222222222222222")], true).fields).toEqual([
      `payTo on eip155:8453: catalog ${PAY_TO}, door 0x2222222222222222222222222222222222222222`,
    ]);
    expect(compareCatalogToDoor(terms, [accept("1000", PAY_TO, "eip155:137")], true).fields).toEqual([
      "rail eip155:8453: the catalog lists it, the door does not offer it",
    ]);
  });

  it("never compares across rails, and never reads silence as disagreement", () => {
    const twoRails = catalogTermsFromRow({
      accepts: [accept("1000"), accept("990000", PAY_TO, "eip155:137")],
    })!;
    expect(compareCatalogToDoor(twoRails, [accept("1000"), accept("990000", PAY_TO, "eip155:137")], true).state).toBe("agrees");
    expect(compareCatalogToDoor(null, [accept("1000")], true)).toMatchObject({ state: "not_comparable" });
    expect(compareCatalogToDoor(terms, null, true)).toMatchObject({ state: "not_comparable", last_updated: "2026-08-30T00:00:00Z" });
    expect(compareCatalogToDoor(terms, [accept("1000")], false)).toEqual({ state: "not_listed" });
  });

  it("counts with the denominator, and names the differing hosts only for the keeper", () => {
    const rows = [
      { host: "a.example", catalog: { state: "agrees" } },
      { host: "b.example", catalog: { state: "differs", fields: ["amount on eip155:8453: catalog 1, door 2"] } },
      { host: "c.example", catalog: { state: "not_comparable", reason: "bare" } },
      { host: "d.example", catalog: { state: "not_listed" } },
      { host: "e.example" },
    ] as unknown as WardHostResult[];
    expect(catalogAgreementOf(rows)).toEqual({ compared: 2, agrees: 1, differs: 1, not_listed: 1, not_comparable: 1 });
    expect(differingHosts(rows)).toEqual(["b.example"]);
  });
});

describe("on the census", () => {
  beforeAll(async () => {
    const ed25519 = await import("@noble/ed25519");
    const seed = new Uint8Array(32).fill(0x42);
    const publicKey = await ed25519.getPublicKeyAsync(seed);
    const both = new Uint8Array(64);
    both.set(seed);
    both.set(publicKey, 32);
    testEnv.CDP_API_KEY_ID = "test-key-id";
    testEnv.CDP_API_KEY_SECRET = btoa(String.fromCharCode(...both));
  });

  beforeEach(async () => {
    await testEnv.COUNTERS.delete(KV_KEYS.wardRoundLatest);
    await testEnv.COUNTERS.delete(KV_KEYS.longWalkState);
    const listed = await testEnv.COUNTERS.list({ prefix: KV_KEYS.corpusPrefix });
    await Promise.all(listed.keys.map((key) => testEnv.COUNTERS.delete(key.name)));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const rows = [
    { resourceUrl: "https://agrees.example/api/x", accepts: [accept("1000")], lastUpdated: "2026-08-30T00:00:00Z" },
    { resourceUrl: "https://differs.example/api/x", accepts: [accept("2000")], lastUpdated: "2026-08-01T00:00:00Z" },
    { resourceUrl: "https://bare.example/api/x" },
    { resourceUrl: "https://silent.example/api/x", accepts: [accept("1000")] },
  ];

  function stubWorld(options: { walk?: boolean } = {}) {
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const url = String(input instanceof Request ? input.url : input);
      // Matched by parsed host, never by substring: CodeQL's standing
      // finding on this repo's own stubs, and a real one.
      const { host, pathname } = new URL(url);
      if (host === "api.cdp.coinbase.com") {
        if (pathname.endsWith("/discovery/search")) {
          return Response.json({
            items: [
              { resourceUrl: `${BASE}/api/buy/hello`, accepts: [accept("500000")] },
              { resourceUrl: `${BASE}/api/buy/service_audit`, accepts: [accept("100000")] },
            ],
          });
        }
        const requested = Number(new URL(url).searchParams.get("offset") ?? 0);
        return Response.json(
          options.walk
            ? { items: rows.slice(requested, requested + 100), pagination: { limit: 100, offset: requested, total: rows.length } }
            : { items: rows },
        );
      }
      if (host === "silent.example") {
        // No answer at all: the probe's fetch throws, which is the one
        // path that reads unreachable (a 503 is a door answering badly).
        throw new Error("connection refused");
      }
      if (host === "agent402.tools" || host === "x402.fuchss.app") {
        return new Response("gone", { status: 503 });
      }
      return door402([accept("1000")]);
    });
  }

  it("writes the column on every probed row, the counts on the round, and seals both", async () => {
    stubWorld();
    const round = await runWardRound(testEnv);
    const byHost = new Map(round.hosts.map((host) => [host.host, host]));
    expect(byHost.get("agrees.example")?.catalog).toEqual({ state: "agrees", last_updated: "2026-08-30T00:00:00Z" });
    expect(byHost.get("differs.example")?.catalog).toEqual({
      state: "differs",
      fields: ["amount on eip155:8453: catalog 2000, door 1000"],
      last_updated: "2026-08-01T00:00:00Z",
    });
    expect(byHost.get("bare.example")?.catalog).toMatchObject({ state: "not_comparable" });
    expect(byHost.get("silent.example")?.verdict).toBe("unreachable");
    expect(byHost.get("silent.example")?.catalog).toMatchObject({ state: "not_comparable" });
    expect(round.catalog_agreement).toEqual({ compared: 2, agrees: 1, differs: 1, not_listed: 0, not_comparable: 2 });
    // Ours: hello's shelf minimum is 500000 atomic; service_audit's is not 100000.
    expect(round.our_doors?.catalog_differs).toEqual(["service_audit"]);

    const stored = await latestWardRound(testEnv);
    expect(stored?.catalog_agreement).toEqual(round.catalog_agreement);

    // The snapshot carries the rows verbatim, so the column is signed.
    const pass = await takeCorpusSnapshot(testEnv, {
      calendars: ["https://calendar.test"],
      fetch: (async () => new Response(new Uint8Array([1, 2, 3]))) as unknown as typeof fetch,
      now: new Date(Date.UTC(2026, 8, 6, 12)),
    });
    expect(pass.taken).toBe(true);
    const hostRead = (await (await SELF.fetch(`${BASE}/corpus/host/differs.example.json`)).json()) as {
      timeline: { catalog?: unknown }[];
    };
    expect(hostRead.timeline.find((entry) => entry.catalog)?.catalog).toMatchObject({ state: "differs" });

    const brief = (await (await SELF.fetch(`${BASE}/corpus/brief`)).json()) as Record<string, unknown>;
    expect(brief["catalog"]).toMatchObject({ compared: 2, agrees: 1, differs: 1, not_listed: 0, not_comparable: 2 });
    expect(String((brief["catalog"] as Record<string, unknown>)["what_this_is"])).toContain("Attributed to the catalog");
    // The brief counts; it never names the door whose copy differs.
    expect(JSON.stringify(brief)).not.toContain("differs.example");
  });

  it("freezes the catalog's terms with the long walk's roster and compares them when the door is knocked on", async () => {
    stubWorld({ walk: true });
    const started = await longWalkPass(testEnv);
    expect(started.phase).toBe("started");
    const state = await readLongWalk(testEnv);
    const roster = state!.roster.find((entry) => entry.host === "differs.example");
    expect(roster?.catalog).toMatchObject({ accepts: [{ amount: "2000" }], last_updated: "2026-08-01T00:00:00Z" });
    expect(state!.roster.find((entry) => entry.host === "bare.example")?.catalog).toBeNull();
    const walked = await longWalkPass(testEnv);
    expect(walked.phase).toBe("walked");
    const after = await readLongWalk(testEnv);
    const result = after!.results.find((entry) => entry.host === "differs.example");
    expect(result?.catalog).toMatchObject({ state: "differs", fields: ["amount on eip155:8453: catalog 2000, door 1000"] });
  });
});
