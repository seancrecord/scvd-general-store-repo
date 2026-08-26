import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import {
  FRESHNESS_COHERENCE_CLASS,
  freshnessFromA2a,
  freshnessFromX402,
  freshnessRowVerdict,
  normalizeStamp,
} from "@/discovery";
import { isRecord } from "@/types";

const ABOUT = "https://scvd.store";

/**
 * FRESHNESS COHERENCE (landscape §11 #6), catalog-only.
 *
 * Dated fields two catalogs both stated. A planted lastUpdated
 * mismatch is a conflict. A date one side never wrote is
 * not_observed. No live probe. No scores.
 */

async function fetchJson(path: string): Promise<unknown> {
  const response = await SELF.fetch(`${ABOUT}${path}`);
  expect(response.status, `${path} did not serve`).toBe(200);
  return response.json();
}

describe("freshness_coherence is a registered class, not a score", () => {
  it("names the join class the registry already carries", () => {
    expect(FRESHNESS_COHERENCE_CLASS).toBe("freshness_coherence");
  });
});

describe("stamp spellings collapse to one instant", () => {
  it("treats lastUpdated and unix seconds as the same clock", () => {
    expect(normalizeStamp("2026-08-25T00:00:00.000Z")).toBe(
      "2026-08-25T00:00:00.000Z",
    );
    expect(normalizeStamp(1787616000)).toBe("2026-08-25T00:00:00.000Z");
    expect(normalizeStamp("not-a-date")).toBeNull();
  });
});

describe("as_of joins on payment catalogs", () => {
  it("agrees when two x402 surfaces publish the same lastUpdated", () => {
    const body = { lastUpdated: "2026-08-25T00:00:00Z" };
    const verdict = freshnessRowVerdict([
      {
        surface: "x402_catalog",
        claim: freshnessFromX402(body, ABOUT, ABOUT, "x402_catalog")!,
      },
      {
        surface: "x402_thin",
        claim: freshnessFromX402(body, ABOUT, ABOUT, "x402_thin")!,
      },
    ]);
    expect(verdict.derived).toBe("agree");
    expect(verdict.disagreements).toEqual([]);
  });

  it("conflicts when a planted lastUpdated disagrees", () => {
    const verdict = freshnessRowVerdict([
      {
        surface: "x402_catalog",
        claim: freshnessFromX402(
          { lastUpdated: "2026-08-25T00:00:00Z" },
          ABOUT,
          ABOUT,
          "x402_catalog",
        )!,
      },
      {
        surface: "x402_thin",
        claim: freshnessFromX402(
          { lastUpdated: "2026-08-01T00:00:00Z" },
          ABOUT,
          ABOUT,
          "x402_thin",
        )!,
      },
    ]);
    expect(verdict.derived).toBe("conflict");
    expect(verdict.disagreements.map((row) => row.field)).toContain("as_of");
  });

  it("treats a date the other catalog never stated as not_observed", () => {
    const verdict = freshnessRowVerdict([
      {
        surface: "x402_catalog",
        claim: freshnessFromX402(
          { lastUpdated: "2026-08-25T00:00:00Z" },
          ABOUT,
          ABOUT,
          "x402_catalog",
        )!,
      },
      {
        surface: "a2a_agent_card",
        claim: freshnessFromA2a({ name: "scvd.store" }, ABOUT, ABOUT)!,
      },
    ]);
    expect(verdict.derived).toBe("agree");
    expect(verdict.not_observed.map((row) => row.field)).toContain("as_of");
  });
});

describe("our own catalogs agree on the dates they both state", () => {
  it("the two x402 documents do not fight on as_of", async () => {
    const rich = await fetchJson("/.well-known/x402.json");
    const thin = await fetchJson("/.well-known/x402");
    expect(isRecord(rich)).toBe(true);
    expect(isRecord(thin)).toBe(true);
    const verdict = freshnessRowVerdict([
      {
        surface: "x402_catalog",
        claim: freshnessFromX402(rich, ABOUT, `${ABOUT}/.well-known/x402.json`)!,
      },
      {
        surface: "x402_thin",
        claim: freshnessFromX402(
          thin,
          ABOUT,
          `${ABOUT}/.well-known/x402`,
          "x402_thin",
        )!,
      },
    ]);
    expect(verdict.derived, JSON.stringify(verdict.disagreements)).toBe("agree");
    expect(JSON.stringify(verdict)).not.toMatch(/score|confidence|rating|rank/i);
  });
});
