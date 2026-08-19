import { SELF, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { KV_KEYS } from "@/lib/kv-keys";
import {
  marketAggregates,
  offerFacts,
  operatorOf,
} from "@/services/market";
import type { WardHostResult, WardRound } from "@/services/ward-round";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";

/**
 * THE MARKET DESK — keeping what the probes already paid for. These
 * tests hold the desk's honesty rules: prices only in USDC we
 * recognize, operators collapsed by a NAMED heuristic (platform
 * subdomains are operators, farms are not fifty sellers), and every
 * aggregate recomputable from the round's own rows.
 */

function challenge(accepts: Record<string, unknown>[]): Response {
  return new Response("{}", {
    status: 402,
    headers: {
      "PAYMENT-REQUIRED": btoa(JSON.stringify({ x402Version: 2, accepts })),
    },
  });
}

const BASE_USDC_ADDR = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const SOL_USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

describe("offerFacts reads the 402 the probe already fetched", () => {
  it("keeps rails, schemes, and the cheapest USDC ask", () => {
    const facts = offerFacts(
      challenge([
        {
          scheme: "exact",
          network: "eip155:8453",
          asset: BASE_USDC_ADDR,
          amount: "500000",
        },
        {
          scheme: "exact",
          network: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
          asset: SOL_USDC,
          amount: "250000",
        },
      ]),
    )!;
    expect(facts.networks).toEqual([
      "eip155:8453",
      "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
    ]);
    expect(facts.schemes).toEqual(["exact"]);
    // The cheapest ask across accepts, in whole USDC.
    expect(facts.min_usdc).toBe(0.25);
  });

  it("prices nothing it does not recognize as USDC", () => {
    const facts = offerFacts(
      challenge([
        {
          scheme: "exact",
          network: "eip155:8453",
          asset: "0x9999999999999999999999999999999999999999",
          amount: "500000",
        },
      ]),
    )!;
    expect(facts.min_usdc).toBeUndefined();
    expect(facts.networks).toEqual(["eip155:8453"]);
  });

  it("returns null on responses with no parseable challenge", () => {
    expect(offerFacts(new Response("nope", { status: 200 }))).toBeNull();
    expect(
      offerFacts(
        new Response("{}", {
          status: 402,
          headers: { "PAYMENT-REQUIRED": "not-base64!!!" },
        }),
      ),
    ).toBeNull();
  });
});

describe("operators, by the named heuristic", () => {
  it("collapses subdomain farms and splits platform tenants", () => {
    // A farm is one operator however many subdomains it deploys.
    expect(operatorOf("supply.lonestaroracle.xyz")).toBe("lonestaroracle.xyz");
    expect(operatorOf("whale.lonestaroracle.xyz")).toBe("lonestaroracle.xyz");
    // On a shared platform the deploying subdomain IS the operator.
    expect(operatorOf("hl-tool.darren-pi.workers.dev")).toBe(
      "darren-pi.workers.dev",
    );
    expect(operatorOf("x402-seller.onrender.com")).toBe(
      "x402-seller.onrender.com",
    );
    // Two-part country TLDs keep three labels.
    expect(operatorOf("centry.cybercentry.co.uk")).toBe("cybercentry.co.uk");
  });
});

function host(
  name: string,
  verdict: WardHostResult["verdict"],
  extra: Partial<WardHostResult> = {},
): WardHostResult {
  return {
    host: name,
    url: `https://${name}/api/x`,
    verdict,
    failed: [],
    advisories: [],
    ...extra,
  };
}

describe("the aggregates, recomputable from the rows", () => {
  const rows: WardHostResult[] = [
    host("a.example", "ready", {
      advisories: ["no-signed-offers"],
      offer: { networks: ["eip155:8453"], schemes: ["exact"], min_usdc: 0.01 },
    }),
    host("b.example", "ready", {
      // The rare door actually serving signed offers.
      offer: {
        networks: ["eip155:8453", "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"],
        schemes: ["exact"],
        min_usdc: 1,
      },
    }),
    host("one.farm.example", "ready", {
      advisories: ["no-signed-offers"],
      offer: {
        networks: ["solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"],
        schemes: ["exact"],
        min_usdc: 0.1,
      },
    }),
    host("two.farm.example", "not_ready", { failed: ["status-402"] }),
    host("dead.example", "unreachable"),
    host("homepage.example", "not_probed", { source: "leaderboard" }),
  ];

  it("counts rot, rails, prices, signed offers and concentration honestly", () => {
    const market = marketAggregates(rows, ["resourceUrl", "type"]);
    // not_probed rows are population, never market rows.
    expect(market.probed).toBe(5);
    expect(market.ready).toBe(3);
    // Rot: the status-402 failure and the unreachable door.
    expect(market.rot.dead_doors).toBe(2);
    expect(market.rot.pct).toBe(40);
    // Signed offers: 1 of 3 ready doors.
    expect(market.signed_offers).toEqual({ serving: 1, of_ready: 3, pct: 33 });
    // Rails among the three parseable doors.
    expect(market.rails.both).toBe(1);
    expect(market.rails.base_only).toBe(1);
    expect(market.rails.solana_only).toBe(1);
    // Prices: 0.01, 0.1, 1 — median is the middle ask.
    expect(market.price_usdc?.sample).toBe(3);
    expect(market.price_usdc?.median).toBe(0.1);
    expect(market.price_usdc?.min).toBe(0.01);
    expect(market.price_usdc?.max).toBe(1);
    // The farm's two hosts are ONE operator.
    expect(market.concentration.hosts).toBe(5);
    expect(market.concentration.operators).toBe(4);
    expect(market.discovery_fields_seen).toEqual(["resourceUrl", "type"]);
  });

  it("prices nothing when no door quoted recognizable USDC", () => {
    const market = marketAggregates([host("x.example", "ready")]);
    expect(market.price_usdc).toBeNull();
    expect(market.rails.of).toBe(0);
  });
});

describe("the page and its door", () => {
  it("stays behind the keeper's login", async () => {
    expect((await SELF.fetch(`${BASE}/admin/market`)).status).toBe(401);
  });

  it("serves meanings for eyes and aggregates for scripts", async () => {
    const round: WardRound = {
      week: "2026-W34",
      at: "2026-08-19T17:00:00.000Z",
      listed_resources: 10,
      coverage_suspect: false,
      capped: false,
      our_search_presence: true,
      hosts: [
        host("a.example", "ready", { advisories: ["no-signed-offers"] }),
        host("dead.example", "unreachable"),
      ],
    };
    await testEnv.COUNTERS.put(KV_KEYS.wardRoundLatest, JSON.stringify(round));
    const auth = {
      Authorization: `Basic ${btoa(`keeper:${testEnv.ADMIN_PASSWORD}`)}`,
    };
    const html = await SELF.fetch(`${BASE}/admin/market`, {
      headers: { ...auth, Accept: "text/html" },
    });
    expect(html.status).toBe(200);
    const text = await html.text();
    expect(text).toContain("what the round's numbers mean");
    expect(text).toContain("Registry rot");
    // A pre-desk round derives honestly: verdict aggregates present,
    // offer-dependent ones say "not captured yet".
    expect(text).toContain("no offer facts captured yet");

    const json = await SELF.fetch(`${BASE}/admin/market`, {
      headers: { ...auth, Accept: "application/json" },
    });
    const body = (await json.json()) as { market: { rot: { dead_doors: number } } };
    expect(body.market.rot.dead_doors).toBe(1);
  });
});
