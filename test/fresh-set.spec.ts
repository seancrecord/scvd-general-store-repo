import { SELF, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { KV_KEYS } from "@/lib/kv-keys";
import { buildFreshSet } from "@/services/fresh-set";
import type { WardHostResult, WardRound } from "@/services/ward-round";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";

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

function round(hosts: WardHostResult[], extra: Partial<WardRound> = {}): WardRound {
  return {
    week: "2026-W34",
    at: "2026-08-19T17:00:00.000Z",
    listed_resources: hosts.length,
    coverage_suspect: false,
    capped: false,
    our_search_presence: true,
    hosts,
    ...extra,
  };
}

async function seed(r: WardRound): Promise<void> {
  await testEnv.COUNTERS.put(KV_KEYS.wardRoundLatest, JSON.stringify(r));
}

/**
 * THE FRESH SET holds two lines older than itself, and the tests pin
 * both: names appear only on the ready side (the registry bargain),
 * and a row is a dated observation, never a score (rule 43).
 */
describe("the fresh set names only the doors that answered", () => {
  it("serves ready doors with offers and evidence, failures as counts", async () => {
    await seed(
      round([
        host("beta.example", "ready", {
          offer: {
            networks: ["eip155:8453", "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"],
            schemes: ["exact"],
            min_usdc: 0.05,
          },
        }),
        host("alpha.example", "ready"),
        host("broken.example", "not_ready", { failed: ["no accepts"] }),
        host("gone.example", "unreachable"),
        host("homepage.example", "not_probed"),
      ]),
    );
    const set = (await buildFreshSet(testEnv))!;

    expect(set.rows.map((row) => row.host)).toEqual([
      "alpha.example",
      "beta.example",
    ]);
    // The failing and unreachable doors are arithmetic, never rows —
    // and not_probed homepages stay out of the denominator entirely.
    expect(set.aggregates).toEqual({
      listed_resources: 5,
      probed: 4,
      ready: 2,
      not_ready: 1,
      unreachable: 1,
    });
    expect(JSON.stringify(set.rows)).not.toContain("broken.example");
    expect(JSON.stringify(set.rows)).not.toContain("gone.example");

    // A row carries what the door's own 402 offered and cites the
    // signed per-host history — the evidence, not our say-so.
    const beta = set.rows.find((row) => row.host === "beta.example")!;
    expect(beta.rails).toContain("eip155:8453");
    expect(beta.min_usdc).toBe(0.05);
    expect(beta.history_url).toBe(
      `${BASE}/corpus/host/beta.example.json`,
    );
    // A door whose challenge did not parse still rows — ready is the
    // verdict, the offer block is a bonus.
    const alpha = set.rows.find((row) => row.host === "alpha.example")!;
    expect(alpha.rails).toBeUndefined();

    expect(set.what_this_is_not).toContain("Not a ranking");
    expect(set.what_this_is_not).toContain("never named");
  });

  it("says when the walk did not finish, instead of posing as complete", async () => {
    await seed(
      round([host("a.example", "ready")], {
        capped: true,
        walk: {
          roster: 5000,
          walked: 1200,
          batches: 12,
          started_at: "2026-08-17T00:00:00.000Z",
        },
      }),
    );
    const set = (await buildFreshSet(testEnv))!;
    expect(set.coverage.walk).toEqual({ roster: 5000, walked: 1200 });
    expect(set.coverage.capped).toBe(true);
  });

  it("returns null before any round exists", async () => {
    await testEnv.COUNTERS.delete(KV_KEYS.wardRoundLatest);
    expect(await buildFreshSet(testEnv)).toBeNull();
  });
});

describe("the door serves both dialects", () => {
  it("gives agents the full JSON set", async () => {
    await seed(
      round([
        host("pay.example", "ready", {
          offer: { networks: ["eip155:8453"], schemes: ["exact"], min_usdc: 1 },
        }),
        host("broken.example", "not_ready"),
      ]),
    );
    const response = await SELF.fetch(`${BASE}/fresh-set`, {
      headers: { Accept: "application/json" },
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      rows: { host: string }[];
      aggregates: { ready: number };
      evidence: { corpus_url: string };
    };
    expect(body.rows.map((row) => row.host)).toEqual(["pay.example"]);
    expect(body.aggregates.ready).toBe(1);
    expect(body.evidence.corpus_url).toBe(`${BASE}/corpus`);
  });

  it("gives eyes the page, holding the registry bargain in words", async () => {
    await seed(round([host("pay.example", "ready"), host("broken.example", "not_ready")]));
    const response = await SELF.fetch(`${BASE}/fresh-set`, {
      headers: { Accept: "text/html" },
    });
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("pay.example");
    expect(html).not.toContain("broken.example");
    expect(html).toContain("names appear only on the ready side");
    expect(html).toContain("Not a ranking");
    // The Dataset node, so the most routable thing we serve is citable.
    expect(html).toContain('"@type":"Dataset"');
  });

  it("answers honestly before the first round, in both dialects", async () => {
    await testEnv.COUNTERS.delete(KV_KEYS.wardRoundLatest);
    const json = await SELF.fetch(`${BASE}/fresh-set`, {
      headers: { Accept: "application/json" },
    });
    expect(json.status).toBe(200);
    const body = (await json.json()) as { rows: unknown[]; note: string };
    expect(body.rows).toEqual([]);
    expect(body.note).toContain("No census round");

    const html = await SELF.fetch(`${BASE}/fresh-set`, {
      headers: { Accept: "text/html" },
    });
    expect(await html.text()).toContain("No round yet");
  });
});
