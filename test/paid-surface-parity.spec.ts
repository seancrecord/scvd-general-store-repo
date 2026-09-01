import { SELF, env } from "cloudflare:test";
import { describe, expect, it, vi } from "vitest";
import { KV_KEYS } from "@/lib/kv-keys";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";

vi.mock("@/services/ward-round", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/services/ward-round")>();
  return {
    ...original,
    probeHost: vi.fn(async () => ({
      verdict: "ready" as const,
      failed: [],
      advisories: [],
    })),
  };
});

/**
 * THE PAID SURFACE MUST NOT SAY LESS THAN THE FREE ONE (2026-09-01).
 *
 * When /passport learned to render the summary block it had been
 * signing since 2026-08-27, /profiles/{host} did not — so the free
 * page out-answered the $21 STANDING page, the one URL an operator
 * hands to a counterparty. A reader there got a bare freshness noun
 * and a link, and had to click through to learn what was observed,
 * what failed, what was never looked at, and when the evidence dies.
 *
 * That is correction #114's shape a second time — two surfaces over
 * the same evidence, each rendering it separately — so the guard is
 * the shape of the fix rather than a list of strings: the profile
 * shows the passport's OWN card, and the newest-wins comparison
 * happens in exactly one function that both callers use.
 */

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
            {
              host,
              url: `https://${host}/api/x`,
              verdict,
              failed: [],
              advisories: [],
            },
          ],
        },
      },
      digest: "0".repeat(64),
      signature: "0".repeat(128),
      public_key: "0".repeat(64),
    }),
  );
}

describe("the commissioned page shows the whole passport", () => {
  it("renders the same card /passport serves, not a bare freshness word", async () => {
    const { performTrustProfile } = await import("@/services/trust-profile");
    await seedCensus("shown.example", "ready", "2026-08-19T00:00:00.000Z");
    await testEnv.COUNTERS.delete(KV_KEYS.passportRefresh("shown.example"));
    await performTrustProfile(testEnv, "https://shown.example/api/x");

    const html = await (
      await SELF.fetch(`${BASE}/profiles/shown.example`, {
        headers: { Accept: "text/html" },
      })
    ).text();
    const visible = html.replace(/<pre>[\s\S]*?<\/pre>/g, "");

    // The compressed read, on the paid page, without a click.
    expect(visible).toContain("data-decision=");
    for (const field of [
      "status",
      "observed_at",
      "valid_until",
      "evidence_age",
      "failed",
      "not_observed",
    ]) {
      expect(visible, `paid page is missing summary field ${field}`).toContain(
        field,
      );
    }
    expect(visible).toContain("What this does not prove");

    // Still a commissioned page, not a copy of /passport.
    expect(visible).toContain("term ends");
    expect(visible).toContain("commission record");
  });

  it("says the same decision word the passport and the chip say", async () => {
    const { performTrustProfile } = await import("@/services/trust-profile");
    await seedCensus("agree.example", "ready", "2026-08-19T00:00:00.000Z");
    await testEnv.COUNTERS.delete(KV_KEYS.passportRefresh("agree.example"));
    await performTrustProfile(testEnv, "https://agree.example/api/x");

    const passport = (await (
      await SELF.fetch(`${BASE}/passport/agree.example`, {
        headers: { Accept: "application/json" },
      })
    ).json()) as { payload: { summary: { decision: string } } };
    const profile = (await (
      await SELF.fetch(`${BASE}/profiles/agree.example`, {
        headers: { Accept: "application/json" },
      })
    ).json()) as { decision: string };
    const chip = await (
      await SELF.fetch(`${BASE}/badges/passport/agree.example.svg`)
    ).text();

    expect(profile.decision).toBe(passport.payload.summary.decision);
    // The chip draws three states and the passport decides four; its
    // accessible label carries the passport's word so the two cannot
    // be quoted against each other.
    expect(chip).toContain(passport.payload.summary.decision);
  });

  it("a break mid-term renders as a decision on the paid page, not as an absence", async () => {
    const { performPassportRefresh } = await import(
      "@/services/passport-refresh"
    );
    const { performTrustProfile } = await import("@/services/trust-profile");
    const { probeHost } = await import("@/services/ward-round");
    await seedCensus("broke.example", "ready", "2026-08-19T00:00:00.000Z");
    await testEnv.COUNTERS.delete(KV_KEYS.passportRefresh("broke.example"));
    await performTrustProfile(testEnv, "https://broke.example/api/x");

    (probeHost as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      verdict: "not_ready",
      failed: ["amount-atomic"],
      advisories: [],
    });
    await performPassportRefresh(testEnv, "https://broke.example/api/x");

    const html = await (
      await SELF.fetch(`${BASE}/profiles/broke.example`, {
        headers: { Accept: "text/html" },
      })
    ).text();

    // The page survives the verdict turning — the term was paid for —
    // but it says NOT_READY in the same words every other surface uses.
    expect(html).toContain('data-decision="NOT_READY"');
    expect(html).toContain("term ends");
    expect(html).not.toContain('data-decision="READY"');
  });
});

describe("the newest-wins fold lives in one place", () => {
  /*
   * Correction #114 was two surfaces performing the same comparison
   * separately, and the fix then was to make the second copy MATCH.
   * A matching copy is not a mechanism — it matches until somebody
   * edits one of them. This asserts the copy is gone: the comparison
   * exists in `effectiveObservation` and every surface over host
   * evidence calls it rather than reaching for the refresh record and
   * re-deciding which observation is newer.
   */
  const sources = import.meta.glob("/src/**/*.ts", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;

  /** The fold's own file, and the writer that records a refresh. */
  const MAY_READ_THE_REFRESH = [
    "/src/services/passport.ts",
    "/src/services/passport-refresh.ts",
  ];

  it("no surface re-derives which observation is newest", () => {
    const offenders = Object.entries(sources)
      .filter(([path]) => !MAY_READ_THE_REFRESH.includes(path))
      .filter(([, body]) => body.includes("readPassportRefresh"))
      .map(([path]) => path);
    expect(
      offenders,
      `these read the refresh record directly instead of calling effectiveObservation: ${offenders.join(", ")}`,
    ).toEqual([]);
  });

  it("the fold is exported, so calling it is the easy path", async () => {
    const passport = await import("@/services/passport");
    expect(typeof passport.effectiveObservation).toBe("function");
  });
});

/**
 * WHERE OUR LOOKING STOPS, LEGIBLE TO A PERSON (2026-09-01).
 *
 * The coverage matrix has been derived and honest since M1 — `none`
 * stated rather than omitted — and served only as JSON at a .json URL.
 * The store's clearest statement of its own limits was readable by
 * indexers and invisible to the operator deciding whether to trust it.
 */
describe("the coverage matrix has a room a person can read", () => {
  it("renders every class and every known chain, with none stated not omitted", async () => {
    const { coverageMatrix } = await import("@/evidence/coverage");
    const { KNOWN_CHAINS } = await import("@/evidence/subject");

    const html = await (
      await SELF.fetch(`${BASE}/coverage`, { headers: { Accept: "text/html" } })
    ).text();

    for (const row of coverageMatrix()) {
      expect(html, `class ${row.class_id} missing`).toContain(row.class_id);
    }
    for (const chain of KNOWN_CHAINS) {
      expect(html, `chain ${chain} missing`).toContain(chain);
    }
    // The discipline itself, on the page: absence is a value.
    expect(html).toContain("none");
    expect(html).toContain("Absence is stated, never implied");
    expect(html).toContain("What this does not prove");
  });

  it("states no coverage fact the JSON does not — same source, both doors", async () => {
    const json = (await (
      await SELF.fetch(`${BASE}/coverage`, {
        headers: { Accept: "application/json" },
      })
    ).json()) as Record<string, unknown>;
    const canonical = (await (
      await SELF.fetch(`${BASE}/coverage.json`)
    ).json()) as Record<string, unknown>;
    expect(json).toEqual(canonical);
  });
});
