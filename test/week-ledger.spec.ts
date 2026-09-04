import { describe, expect, it } from "vitest";
import { deriveFindings, deriveLedger } from "@/services/week-ledger";
import type { WeeklyBrief } from "@/services/weekly-brief";
import type { SourceRegister } from "@/services/source-liveness";

/**
 * THE LEDGER'S ONE PROMISE: it structures, it never interprets.
 *
 * Every sentence it emits has to be traceable to a field it names, and
 * every rule has to either fire with its numbers or not fire at all. A
 * page that fills a quiet week with prose is how a measurement project
 * starts publishing vibes, and it would be a much easier failure to
 * commit here than anywhere else in the store — the whole point of the
 * room is readable sentences.
 *
 * So the tests below care about two things above all: that no finding
 * exists without its `derived_from`, and that the GAPS fire. A ledger
 * that reports a good week by staying silent about what it missed is
 * worse than no ledger, because it reads like reassurance.
 */

function brief(overrides: Partial<WeeklyBrief> = {}): WeeklyBrief {
  return {
    artifact: "weekly_brief",
    name: "The Week's Doors",
    week: "2026-W36",
    taken_at: "2026-09-06T11:00:00.000Z",
    sequence: 9,
    digest: "deadbeef",
    doors: {
      listed: 1000,
      probed: 750,
      payable: 500,
      not_payable: 200,
      unreachable: 50,
      offers_seen: 640,
    },
    networks: { base: 400 },
    defects: [
      { id: "eip712-domain-extra", title: "Missing EIP-712 domain", count: 120 },
      { id: "testnet-network", title: "Testnet rail", count: 12 },
    ],
    our_gaps: { not_probed: 250, observer_degraded: 0, coverage_suspect: false },
    not_a_ranking: "…",
    how_to_rederive: "…",
    every_door: "https://scvd.store/doors",
    ...overrides,
  } as WeeklyBrief;
}

function register(
  statuses: { source: string; status: string }[],
): SourceRegister {
  return {
    artifact: "source_register",
    at: "2026-09-06T12:00:00.000Z",
    newest_round: { week: "2026-W36", at: "2026-09-06T11:00:00.000Z" },
    rounds_read: 4,
    history_truncated: false,
    sources: statuses.map((entry) => ({
      source: entry.source,
      home: "https://example.com",
      what: "…",
      status: entry.status,
      last_successful_read: null,
      last_successful_week: null,
      hosts_on_last_read: null,
      rounds_since_answer: null,
      consecutive_failures: 0,
      rounds_seen: 4,
      roster_disagrees: false,
    })),
    what_this_is_not: "…",
    how_to_rederive: "…",
  } as unknown as SourceRegister;
}

describe("every finding names where it came from", () => {
  it("never emits a sentence without its fields", () => {
    const findings = deriveFindings(brief(), null, register([]), [], []);
    expect(findings.length).toBeGreaterThan(0);
    for (const finding of findings) {
      expect(finding.derived_from.length).toBeGreaterThan(0);
      expect(finding.headline.length).toBeGreaterThan(10);
      expect(finding.detail.length).toBeGreaterThan(20);
      expect(finding.id).toMatch(/^[a-z-]+$/);
    }
  });

  it("takes reach over doors named, and says both numbers", () => {
    const reach = deriveFindings(brief(), null, null, [], []).find(
      (f) => f.id === "reach",
    );
    expect(reach?.headline).toContain("750");
    expect(reach?.headline).toContain("1,000");
    expect(reach?.headline).toContain("75%");
  });

  /**
   * The denominator discipline again, on the surface most likely to
   * blur it: "payable" is a share of doors that ANSWERED, never of
   * doors we knocked on and never of doors a feed named.
   */
  it("takes the payable share over doors that answered", () => {
    const payable = deriveFindings(brief(), null, null, [], []).find(
      (f) => f.id === "payable",
    );
    // 500 of the 700 that answered, not of 750 probed or 1000 listed.
    expect(payable?.headline).toContain("700");
    expect(payable?.headline).not.toContain("of the 1,000");
  });
});

describe("the gaps fire, because a silent gap reads as reassurance", () => {
  it("reports doors named and never knocked on", () => {
    const gap = deriveFindings(brief(), null, null, [], []).find(
      (f) => f.id === "not-probed",
    );
    expect(gap?.kind).toBe("gap");
    expect(gap?.headline).toContain("250");
  });

  it("reports our own degraded vantage as ours, not as their rot", () => {
    const findings = deriveFindings(
      brief({ our_gaps: { not_probed: 0, observer_degraded: 7, coverage_suspect: false } }),
      null,
      null,
      [],
      [],
    );
    const gap = findings.find((f) => f.id === "observer-degraded");
    expect(gap?.kind).toBe("gap");
    expect(gap?.detail).toContain("blindness is not their rot");
  });

  it("reports a round that doubted its own coverage", () => {
    const findings = deriveFindings(
      brief({ our_gaps: { not_probed: 0, observer_degraded: 0, coverage_suspect: true } }),
      null,
      null,
      [],
      [],
    );
    expect(findings.find((f) => f.id === "coverage-suspect")?.kind).toBe("gap");
  });

  it("names the sources that were not answering", () => {
    const findings = deriveFindings(
      brief(),
      null,
      register([
        { source: "fuchss", status: "live" },
        { source: "agentic_market", status: "never_answered" },
        { source: "x402_list", status: "stale" },
      ]),
      [],
      [],
    );
    const gap = findings.find((f) => f.id === "sources-quiet");
    expect(gap?.headline).toContain("agentic_market");
    expect(gap?.headline).toContain("x402_list");
    expect(gap?.headline).not.toContain("fuchss");
  });

  it("names weeks the chain does not hold at all", () => {
    const findings = deriveFindings(brief(), null, null, ["2026-W34"], []);
    const gap = findings.find((f) => f.id === "weeks-missing");
    expect(gap?.kind).toBe("gap");
    expect(gap?.headline).toContain("2026-W34");
    expect(gap?.detail).toContain("not a quiet week");
  });

  /**
   * A clean week must produce NO gap findings rather than a
   * reassuring one. The page says "no gap fired" in its own words;
   * the deriver must not manufacture a sentence to fill the section.
   */
  it("emits no gap at all on a week with nothing missing", () => {
    const clean = brief({
      doors: { listed: 750, probed: 750, payable: 700, not_payable: 40, unreachable: 10, offers_seen: 700 },
      our_gaps: { not_probed: 0, observer_degraded: 0, coverage_suspect: false },
    });
    const findings = deriveFindings(clean, null, register([{ source: "fuchss", status: "live" }]), [], []);
    expect(findings.filter((f) => f.kind === "gap")).toEqual([]);
  });
});

describe("a week the chain does not hold is a refusal, not a guess", () => {
  it("returns no ledger and names the weeks it does hold", () => {
    const { ledger, known_weeks } = deriveLedger([], "https://scvd.store", null, "2026-W01");
    expect(ledger).toBeNull();
    expect(known_weeks).toEqual([]);
  });
});

describe("reach is a gap, not a finding, when most doors went unknocked", () => {
  it("changes kind on the number rather than on an editor's judgement", () => {
    const thin = brief({
      doors: { listed: 1000, probed: 100, payable: 80, not_payable: 15, unreachable: 5, offers_seen: 80 },
    });
    expect(deriveFindings(thin, null, null, [], []).find((f) => f.id === "reach")?.kind).toBe("gap");
    expect(deriveFindings(brief(), null, null, [], []).find((f) => f.id === "reach")?.kind).toBe(
      "finding",
    );
  });
});
