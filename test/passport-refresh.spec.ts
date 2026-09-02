import { SELF, env } from "cloudflare:test";
import { describe, expect, it, vi } from "vitest";
import { KV_KEYS } from "@/lib/kv-keys";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";

vi.mock("@/services/ward-round", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/services/ward-round")>();
  return {
    ...original,
    probeHost: vi.fn(async () => ({
      verdict: "ready" as const,
      failed: [],
      advisories: [],
    })),
  };
});

/** One census round in the corpus so the passport has a chain. */
async function seedCensus(host: string, verdict: string, at: string) {
  await testEnv.COUNTERS.put(
    `${KV_KEYS.corpusPrefix}000000001`,
    JSON.stringify({
      snapshot: {
        version: 1,
        sequence: 1,
        taken_at: at,
        previous_digest: null,
        source: "ward_round",
        week: "2026-W34",
        round: {
          week: "2026-W34",
          at,
          listed_resources: 1,
          coverage_suspect: false,
          capped: false,
          our_search_presence: true,
          hosts: [
            { host, url: `https://${host}/api/x`, verdict, failed: [], advisories: [] },
          ],
        },
      },
      digest: "0".repeat(64),
      signature: "0".repeat(128),
      public_key: "0".repeat(64),
    }),
  );
}

/**
 * THE REFRESH's one law, tested in both directions: the newest
 * observation wins, whatever it says. Payment buys the check, never
 * the grade — a broken finding turns the passport off; a ready
 * finding on a stale passport turns it fresh.
 */
describe("the paid refresh folds in, newest wins, no favor", () => {
  it("a ready refresh on a stale census passport reads fresh, from the paid source", async () => {
    const { performPassportRefresh } = await import(
      "@/services/passport-refresh"
    );
    await seedCensus("stale.example", "ready", "2026-08-01T00:00:00.000Z");
    await testEnv.COUNTERS.delete(KV_KEYS.passportRefresh("stale.example"));

    const before = (await (
      await SELF.fetch(`${BASE}/passport/stale.example`, {
        headers: { Accept: "application/json" },
      })
    ).json()) as { payload: { freshness: string } };
    expect(before.payload.freshness).toBe("expired");

    const record = await performPassportRefresh(
      testEnv,
      "https://stale.example/api/x",
    );
    expect(record.observation.verdict).toBe("ready");
    expect(record.signature).toMatch(/^[0-9a-f]{128}$/);

    const after = (await (
      await SELF.fetch(`${BASE}/passport/stale.example`, {
        headers: { Accept: "application/json" },
      })
    ).json()) as {
      payload: { freshness: string; latest: { source?: string } };
    };
    expect(after.payload.freshness).toBe("fresh");
    expect(after.payload.latest.source).toContain("paid refresh");
    expect(after.payload.latest.source).toContain("no favor");
  });

  it("a broken refresh turns a ready passport OFF and the chip dark", async () => {
    const { performPassportRefresh } = await import(
      "@/services/passport-refresh"
    );
    const { probeHost } = await import("@/services/ward-round");
    await seedCensus("was-fine.example", "ready", "2026-08-19T00:00:00.000Z");
    await testEnv.COUNTERS.delete(KV_KEYS.passportRefresh("was-fine.example"));

    (probeHost as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      verdict: "not_ready",
      failed: ["no accepts entry priced in USDC"],
      advisories: [],
    });
    await performPassportRefresh(testEnv, "https://was-fine.example/api/x");

    const passport = await SELF.fetch(`${BASE}/passport/was-fine.example`, {
      headers: { Accept: "application/json" },
    });
    expect(passport.status).toBe(403);

    const chip = await SELF.fetch(
      `${BASE}/badges/passport/was-fine.example.svg`,
    );
    expect(chip.status).toBe(403);
  });

  it("the $19 standing page and its index fold the refresh too — broken mid-term shows broken that hour", async () => {
    /*
     * The instrument audit (2026-08-28) caught the third surface: the
     * chip and passport folded the refresh; the hosted profile — the
     * one URL an operator hands to counterparties, sold with "a host
     * that breaks mid-term shows broken on its own page" — read the
     * weekly census only, and stayed ready-side for up to a week
     * after a paid refresh recorded the break. Same newest-wins fold
     * now; this is the test the correction cites.
     */
    const { performPassportRefresh } = await import(
      "@/services/passport-refresh"
    );
    const { performTrustProfile } = await import("@/services/trust-profile");
    const { probeHost } = await import("@/services/ward-round");
    await seedCensus("profiled.example", "ready", "2026-08-19T00:00:00.000Z");
    await testEnv.COUNTERS.delete(KV_KEYS.passportRefresh("profiled.example"));
    await performTrustProfile(testEnv, "https://profiled.example/api/x");

    (probeHost as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      verdict: "not_ready",
      failed: ["amount-atomic"],
      advisories: [],
    });
    await performPassportRefresh(testEnv, "https://profiled.example/api/x");

    const page = (await (
      await SELF.fetch(`${BASE}/profiles/profiled.example`)
    ).json()) as { freshness: string; latest_verdict: string | null };
    expect(page.latest_verdict).toBe("not_ready");
    expect(page.freshness).toBe("broken");

    const index = (await (await SELF.fetch(`${BASE}/profiles`)).json()) as {
      profiles: { host: string }[];
    };
    expect(index.profiles.map((row) => row.host)).not.toContain(
      "profiled.example",
    );
  });

  it("refuses to refresh our own hostname, before any money question", async () => {
    const { performPassportRefresh } = await import(
      "@/services/passport-refresh"
    );
    await expect(
      performPassportRefresh(testEnv, `${BASE}/api/buy/hello`),
    ).rejects.toThrow();
  });
});

describe("the chip renders freshness, ready-side only", () => {
  it("serves an SVG chip with the freshness state and the verify link", async () => {
    await seedCensus("chipped.example", "ready", "2026-08-19T00:00:00.000Z");
    await testEnv.COUNTERS.delete(KV_KEYS.passportRefresh("chipped.example"));
    const response = await SELF.fetch(
      `${BASE}/badges/passport/chipped.example.svg`,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("svg");
    expect(response.headers.get("Cache-Control")).toContain("21600");
    const svg = await response.text();
    expect(svg).toContain("chipped.example");
    expect(svg).toContain("/passport/chipped.example");
    expect(svg).toContain("never a ranking");
  });
});
