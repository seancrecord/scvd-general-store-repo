import { SELF, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { KV_KEYS } from "@/lib/kv-keys";
import { buildRegistryWeek } from "@/services/registry-pulse";
import type { WardHostResult, WardRound } from "@/services/ward-round";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";

/**
 * STATE OF THE REGISTRY — the two rules these tests exist to hold:
 * NO NAMES ever reach the public record (enforced in the builder, so
 * a page edit cannot leak them), and no row lands without the
 * keeper's press (rule 30 — the publish is an admin POST, never a
 * cron).
 */

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

function round(week: string, hosts: WardHostResult[]): WardRound {
  return {
    week,
    at: "2026-08-19T17:00:00.000Z",
    listed_resources: hosts.length,
    coverage_suspect: false,
    capped: false,
    our_search_presence: true,
    hosts,
  };
}

describe("the builder strips every name before anything is stored", () => {
  it("carries counts and quartiles, never a host or operator string", () => {
    const entry = buildRegistryWeek(
      round("2026-W34", [
        host("secret-operator.example", "ready", {
          offer: {
            networks: ["eip155:8453"],
            schemes: ["exact"],
            min_usdc: 0.5,
          },
        }),
        host("one.big-farm.example", "ready", {
          advisories: ["no-signed-offers"],
        }),
        host("two.big-farm.example", "not_ready", { failed: ["status-402"] }),
        host("gone.example", "unreachable"),
      ]),
      "2026-08-19T18:00:00.000Z",
    );
    const serialized = JSON.stringify(entry);
    expect(serialized).not.toContain("secret-operator");
    expect(serialized).not.toContain("big-farm");
    expect(serialized).not.toContain("example");
    // The numbers themselves survive.
    expect(entry.probed).toBe(4);
    expect(entry.rot.dead_doors).toBe(2);
    expect(entry.operators).toBe(3);
    expect(entry.price_usdc?.median).toBe(0.5);
  });
});

describe("the public room and the keeper's press", () => {
  const auth = {
    Authorization: `Basic ${btoa(`keeper:${testEnv.ADMIN_PASSWORD}`)}`,
  };

  it("serves an honest empty tally before any press", async () => {
    const page = await SELF.fetch(`${BASE}/registry`, {
      headers: { Accept: "text/html" },
    });
    expect(page.status).toBe(200);
    const text = await page.text();
    expect(text).toContain("State of the registry");
    expect(text).toContain("No weeks published yet");
    // The mirror is there even before the numbers are.
    expect(text).toContain("/api/preflight");
  });

  it("publishes a week only by the admin press, then serves it publicly", async () => {
    await testEnv.COUNTERS.put(
      KV_KEYS.wardRoundLatest,
      JSON.stringify(
        round("2026-W34", [
          host("a.example", "ready"),
          host("dead.example", "unreachable"),
        ]),
      ),
    );

    // The press is behind the login.
    expect(
      (
        await SELF.fetch(`${BASE}/admin/market/publish-registry`, {
          method: "POST",
        })
      ).status,
    ).toBe(401);

    const press = await SELF.fetch(`${BASE}/admin/market/publish-registry`, {
      method: "POST",
      headers: auth,
    });
    expect(press.status).toBe(200);
    const report = (await press.json()) as {
      published: string;
      weeks_on_tally: number;
      replaced_existing_row: boolean;
    };
    expect(report.published).toBe("2026-W34");
    expect(report.weeks_on_tally).toBe(1);
    expect(report.replaced_existing_row).toBe(false);

    // Now the public page carries the row and its readings.
    const page = await SELF.fetch(`${BASE}/registry`, {
      headers: { Accept: "text/html" },
    });
    const text = await page.text();
    expect(text).toContain("2026-W34");
    expect(text).toContain("The running tally");
    expect(text).not.toContain("a.example");
    expect(text).not.toContain("dead.example");

    // JSON twin, same anonymity.
    const json = await SELF.fetch(`${BASE}/registry`, {
      headers: { Accept: "application/json" },
    });
    const body = (await json.json()) as { weeks: { week: string }[] };
    expect(body.weeks).toHaveLength(1);
    expect(JSON.stringify(body)).not.toContain("example");

    // A re-press replaces the week's row instead of duplicating it.
    const again = await SELF.fetch(`${BASE}/admin/market/publish-registry`, {
      method: "POST",
      headers: auth,
    });
    const rereport = (await again.json()) as {
      weeks_on_tally: number;
      replaced_existing_row: boolean;
    };
    expect(rereport.weeks_on_tally).toBe(1);
    expect(rereport.replaced_existing_row).toBe(true);
  });

  it("refuses to publish from nothing", async () => {
    await testEnv.COUNTERS.delete(KV_KEYS.wardRoundLatest);
    const press = await SELF.fetch(`${BASE}/admin/market/publish-registry`, {
      method: "POST",
      headers: auth,
    });
    expect(press.status).toBe(404);
  });
});

/**
 * THE WEEK NOBODY PRESSED (2026-09-09, the keeper: "the registry
 * posted w35 to the site but then i go in and only see w37 available
 * for publish… now we have a gap. whys that not updated automatically
 * … i guess it backfills").
 *
 * It did not. The press built from latestWardRound and nothing else,
 * so the next Sunday overwrote the only round it could reach and the
 * missed week became a permanent hole in a public tally — made by
 * nobody pressing a button. The corpus had frozen that exact round,
 * signed, the whole time.
 */
describe("a missed week is filled from the corpus, not lost", () => {
  const auth = {
    Authorization: `Basic ${btoa(`keeper:${testEnv.ADMIN_PASSWORD}`)}`,
  };

  async function seedCorpusWeek(week: string, at: string, sequence = 1) {
    await testEnv.COUNTERS.put(
      `${KV_KEYS.corpusPrefix}${String(sequence).padStart(6, "0")}`,
      JSON.stringify({
        snapshot: {
          version: 1,
          sequence,
          taken_at: at,
          previous_digest: null,
          source: "ward_round",
          week,
          round: { ...round(week, [host("a.example", "ready")]), at },
        },
        digest: "d".repeat(64),
        signature: "s".repeat(128),
        public_key: "p".repeat(64),
      }),
    );
  }

  it("publishes the frozen round, dated when it was walked", async () => {
    await testEnv.COUNTERS.delete(KV_KEYS.registryPulse);
    await seedCorpusWeek("2026-W36", "2026-08-30T11:00:00.000Z");
    const { publishRegistryWeekFromCorpus, readRegistryPulse, unpublishedCorpusWeeks } =
      await import("@/services/registry-pulse");

    expect(await unpublishedCorpusWeeks(testEnv)).toContain("2026-W36");
    const result = await publishRegistryWeekFromCorpus(testEnv, "2026-W36");
    expect(result.ok).toBe(true);
    if (result.ok) {
      // Walked then, rescued now: the row says both, and neither is a guess.
      expect(result.entry.week).toBe("2026-W36");
      expect(result.entry.observed_at).toBe("2026-08-30T11:00:00.000Z");
      expect(result.entry.published_at > "2026-09-01").toBe(true);
    }
    expect((await readRegistryPulse(testEnv)).weeks.map((w) => w.week)).toEqual([
      "2026-W36",
    ]);
    // Filled, so it is no longer outstanding.
    expect(await unpublishedCorpusWeeks(testEnv)).not.toContain("2026-W36");
    await testEnv.COUNTERS.delete(`${KV_KEYS.corpusPrefix}000001`);
    await testEnv.COUNTERS.delete(KV_KEYS.registryPulse);
  });

  it("refuses a week the corpus never froze, and names what it holds", async () => {
    await seedCorpusWeek("2026-W36", "2026-08-30T11:00:00.000Z");
    const { publishRegistryWeekFromCorpus } = await import("@/services/registry-pulse");
    const result = await publishRegistryWeekFromCorpus(testEnv, "2026-W20");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.refusal).toContain("2026-W36");
    await testEnv.COUNTERS.delete(`${KV_KEYS.corpusPrefix}000001`);
  });

  it("is behind the gate, and takes an ISO week or nothing", async () => {
    expect(
      (
        await SELF.fetch(`${BASE}/admin/market/publish-registry-week`, {
          method: "POST",
          headers: { "CF-Connecting-IP": "192.0.2.77" },
        })
      ).status,
    ).toBe(401);
    const bad = await SELF.fetch(`${BASE}/admin/market/publish-registry-week`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ week: "last tuesday" }),
    });
    expect(bad.status).toBe(400);
  });
});
