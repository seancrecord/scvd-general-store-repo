import { SELF, env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { installFacilitatorMock, TEST_PAYER } from "./helpers/facilitator-mock";
import {
  buildPaymentSignature,
  decodePaymentRequired,
} from "./helpers/payment";
import { HOUSE_FLAG_POLICY } from "@/services/stats";
import { computePulse } from "@/services/pulse";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";

interface PulseWindow {
  month?: string;
  organic_challenges: number;
  organic_settled: number;
  organic_verifies: number;
  conversion_rate: number | null;
}
interface PulseBody {
  computed_at: string;
  house_flag_policy: string;
  all_time: PulseWindow;
  months: PulseWindow[];
  note: string;
}

async function pulse(): Promise<PulseBody> {
  const response = await SELF.fetch(`${BASE}/pulse.json`);
  expect(response.status).toBe(200);
  return (await response.json()) as PulseBody;
}

/**
 * /pulse.json — THE WHOLE FUNNEL, ORGANIC ONLY.
 *
 * The store had been computing organic-against-house challenges,
 * settles and verifies since the meter went in and publishing exactly
 * one number from it: the settled total. That is the win with the
 * denominator left off.
 *
 * The argument for showing the rest, which came out of CV's market
 * research: a competitor publishes their own full funnel and it reads
 * as credible NOT because the numbers are good — they are terrible —
 * but because the shape is whole. "Organic settlements: 0" reads as
 * either a young store or a broken one and there is no way to tell
 * which from outside; "N agents were offered a price and none paid" is
 * a specific, falsifiable claim about a market. The denominator makes
 * the zero stronger.
 */
describe("the public pulse", () => {
  beforeAll(() => {
    installFacilitatorMock();
  });

  it("publishes the denominator, not just the win", async () => {
    const body = await pulse();
    for (const field of [
      "organic_challenges",
      "organic_settled",
      "organic_verifies",
      "conversion_rate",
    ] as const) {
      expect(Object.hasOwn(body.all_time, field), `all_time is missing ${field}`).toBe(
        true,
      );
    }
    expect(Array.isArray(body.months)).toBe(true);
  });

  it("uses the same house policy wording as /stats, not a paraphrase", async () => {
    // Two surfaces describing the same exclusion in two ways is how a
    // policy quietly becomes two policies.
    const body = await pulse();
    expect(body.house_flag_policy).toBe(HOUSE_FLAG_POLICY);
    const stats = (await (
      await SELF.fetch(`${BASE}/stats`)
    ).json()) as Record<string, unknown>;
    expect(body.house_flag_policy).toBe(stats["house_flag_policy"]);
  });

  it("renders a zero-challenge window as null, never NaN and never zero", async () => {
    // A rate over a zero denominator is undefined, not zero. Printing
    // 0% there would be a claim we cannot make — it would say agents
    // were offered a price and declined.
    const body = await pulse();
    const windows = [body.all_time, ...body.months];
    for (const window of windows) {
      if (window.organic_challenges === 0) {
        expect(window.conversion_rate).toBeNull();
      } else {
        expect(Number.isFinite(window.conversion_rate ?? NaN)).toBe(true);
      }
      expect(String(window.conversion_rate)).not.toBe("NaN");
    }
    expect(JSON.stringify(body)).not.toContain("NaN");
  });

  it("never reports more settlements than prices offered", async () => {
    const body = await pulse();
    for (const window of [body.all_time, ...body.months]) {
      expect(
        window.organic_settled,
        `${window.month ?? "all_time"} settled more than it offered`,
      ).toBeLessThanOrEqual(window.organic_challenges);
    }
  });

  it("orders months newest first and keeps the window short", async () => {
    const body = await pulse();
    const months = body.months.map((window) => window.month ?? "");
    expect([...months].sort().reverse()).toEqual(months);
    expect(body.months.length).toBeLessThanOrEqual(6);
  });
});

describe("house traffic never reaches the public funnel", () => {
  beforeAll(() => {
    installFacilitatorMock();
  });

  it("does not count a house-flagged purchase", async () => {
    const before = await pulse();
    const url = `${BASE}/api/buy/hello?house=${testEnv.HOUSE_SECRET}`;
    const challenge = await SELF.fetch(url);
    const accepted = decodePaymentRequired(challenge).accepts[0];
    if (!accepted) {
      throw new Error("No tier offered");
    }
    await SELF.fetch(url, {
      headers: { "PAYMENT-SIGNATURE": buildPaymentSignature(accepted) },
    });
    const after = await pulse();
    // Both halves: the house buy must not appear as a settlement AND
    // must not appear as a 402 in the denominator, or the rate would
    // quietly get worse every time the keeper tested his own till.
    expect(after.all_time.organic_settled).toBe(before.all_time.organic_settled);
    expect(after.all_time.organic_challenges).toBe(
      before.all_time.organic_challenges,
    );
  });

  it("counts an organic one, so the exclusion is not just an empty pipe", async () => {
    // The companion to the test above: proving house is excluded is
    // worthless if nothing is ever counted at all.
    const before = await pulse();
    const url = `${BASE}/api/buy/hello`;
    const challenge = await SELF.fetch(url);
    const accepted = decodePaymentRequired(challenge).accepts[0];
    if (!accepted) {
      throw new Error("No tier offered");
    }
    await SELF.fetch(url, {
      headers: { "PAYMENT-SIGNATURE": buildPaymentSignature(accepted) },
    });
    const after = await pulse();
    expect(after.all_time.organic_settled).toBeGreaterThan(
      before.all_time.organic_settled,
    );
  });
});

describe("the funnel says nothing about any individual", () => {
  it("carries no wallet, user-agent, referrer or raw event anywhere", async () => {
    /**
     * Scan the DATA, not the prose. The note and the policy line both
     * say the words "user-agents" and "referrers" in order to promise
     * there are none — the same trap the visitors' register hit, where
     * a first cut banned the word "leaderboard" and failed on the
     * page's own disclaimer. Testing the copy that disclaims a thing is
     * not testing the thing.
     */
    const body = (await (
      await SELF.fetch(`${BASE}/pulse.json`)
    ).json()) as Record<string, unknown>;
    const { note: _note, house_flag_policy: _policy, ...data } = body;
    const raw = JSON.stringify(data).toLowerCase();

    expect(raw).not.toMatch(/0x[0-9a-f]{40}/); // wallet addresses
    expect(raw).not.toContain(TEST_PAYER.toLowerCase());
    expect(raw).not.toContain("user_agent");
    expect(raw).not.toContain("user-agent");
    expect(raw).not.toContain("referrer");
    expect(raw).not.toContain("referer");
    expect(raw).not.toContain("evt:");
    expect(raw).not.toContain("mozilla");
    expect(raw).not.toContain("curl/");

    // And the promise itself is on the response, where a reader sees it.
    expect(String(body["note"]).toLowerCase()).toContain("no user-agents");
  });

  it("publishes counts and rates only, no nested per-item detail", async () => {
    const body = await pulse();
    for (const window of [body.all_time, ...body.months]) {
      for (const [key, value] of Object.entries(window)) {
        const allowed =
          key === "month"
            ? typeof value === "string"
            : value === null || typeof value === "number";
        expect(allowed, `${key} is not a count, a rate, or a month`).toBe(true);
      }
    }
  });

  it("points at how to check the artifacts it counts", async () => {
    // Tier 3: a number beside the means to verify it beats a number
    // beside a promise that it is true.
    const body = (await (
      await SELF.fetch(`${BASE}/pulse.json`)
    ).json()) as Record<string, unknown>;
    expect(String(body["verify_url"])).toContain("/api/verify/");
    expect(String(body["signing_key"])).toContain("scvd-signing-key");
  });
});

describe("the service, directly", () => {
  it("computes without a request, so the office could reuse it", async () => {
    const computed = await computePulse(testEnv);
    expect(computed.computed_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(computed.note).toContain("whole funnel");
  });
});

/**
 * THE HUMAN PAGE, and the caution it is designed around.
 *
 * A competitor's near-empty leaderboard read as proof AGAINST their
 * pitch rather than as evidence of being early — near-populated, every
 * score near zero. The visitors' register answered that by publishing
 * no total at all.
 *
 * This page answers it differently and the distinction is the design: a
 * leaderboard with empty ranks implies a scale nobody claimed, while a
 * funnel with a zero at the end is a complete sentence — "this many
 * were offered a price, this many paid" — where the zero is the finding
 * rather than the gap.
 */
describe("the pulse has a face", () => {
  it("serves HTML to a person and JSON to everything else", async () => {
    const page = await (
      await SELF.fetch(`${BASE}/pulse`, { headers: { Accept: "text/html" } })
    ).text();
    expect(page).toContain("<table");
    const json = await (await SELF.fetch(`${BASE}/pulse`)).json();
    expect(json).toHaveProperty("all_time");
  });

  it("states the funnel as a sentence, not a scoreboard", async () => {
    const page = await (
      await SELF.fetch(`${BASE}/pulse`, { headers: { Accept: "text/html" } })
    ).text();
    expect(page).toMatch(/offered a price|Nobody has been offered a price/);
    // No ranking shape anywhere: that is the competitor's mistake.
    expect(page).not.toMatch(/\brank(ed|ing)?\b/i);
    expect(page).not.toMatch(/top\s+(agent|buyer|patron)/i);
    expect(page).not.toMatch(/#\s?1\b/);
  });

  it("tells a reader to read the denominator before the rate", async () => {
    const page = await (
      await SELF.fetch(`${BASE}/pulse`, { headers: { Accept: "text/html" } })
    ).text();
    expect(page).toContain("READ THE DENOMINATOR BEFORE THE RATE");
    // The sentence that stops a thin number being read as a market verdict.
    expect(page).toContain("fact about our reach");
    // And why an em dash is not a zero.
    expect(page).toContain("undefined, not zero");
  });

  it("hands over the means to check it, on the page itself", async () => {
    const page = await (
      await SELF.fetch(`${BASE}/pulse`, { headers: { Accept: "text/html" } })
    ).text();
    expect(page).toContain("/house-ledger.json");
    expect(page).toContain("scvd-signing-key");
    expect(page).toContain("/api/verify/");
    // Tier 3: subtract our wallets yourself rather than trusting the split.
    expect(page).toContain("subtract them yourself");
  });

  it("is reachable rather than needing the URL known", async () => {
    const xml = await (await SELF.fetch(`${BASE}/sitemap.xml`)).text();
    expect(xml).toContain(`<loc>${BASE}/pulse</loc>`);
  });

  it("does not appear on the storefront, which is a separate decision", async () => {
    // The keeper's instruction stands until he changes it. A test
    // rather than a note, because "we'll remember" is what failed.
    const front = await (
      await SELF.fetch(BASE, { headers: { Accept: "text/html" } })
    ).text();
    expect(front).not.toContain("/pulse");
  });
});

/**
 * A RATE THAT CONTRADICTS THE ROW IT SITS ON.
 *
 * Found 2026-07-30 by the keeper reading the live payload: organic_settled 1
 * beside conversion_rate 0. The rate rounded to three decimals, which
 * annihilates anything under 0.0005, and one sale against 7,892 challenges
 * is 0.000127. So the page published a zero on a window that had a sale in
 * it — the exact number its own copy swears it will never print, because
 * "0% would say agents were offered something and declined."
 *
 * Third time this store has shipped two correct-looking numbers arranged so
 * they read as a contradiction, after the Sources-versus-event-row report
 * and the recount's drift verdict. The pattern is always the same: a
 * display rule applied to a value it was never sized for.
 */
describe("the conversion rate keeps its three states apart", () => {
  const rateOf = (settled: number, challenges: number): number | null => {
    if (challenges <= 0) return null;
    if (settled === 0) return 0;
    return Number((settled / challenges).toPrecision(3));
  };

  it("never rounds a real sale down to nothing", () => {
    // The live shape, and every shape worse than it.
    for (const [settled, challenges] of [
      [1, 7892],
      [1, 5083],
      [1, 100000],
      [2, 999999],
    ] as const) {
      const value = rateOf(settled, challenges);
      expect(
        value,
        `${settled} of ${challenges} published as ${value}: a sale rounded away`,
      ).toBeGreaterThan(0);
    }
  });

  it("still prints a real zero as zero", () => {
    // The opposite error is worse: a store that cannot say "nobody paid"
    // when nobody paid has stopped publishing a funnel.
    expect(rateOf(0, 5000)).toBe(0);
  });

  it("still prints undefined as null, never as zero", () => {
    expect(rateOf(0, 0)).toBeNull();
  });
});

describe("the rendered rate agrees with the row it is on", () => {
  it("never shows a zero rate beside a settlement", async () => {
    const page = await (
      await SELF.fetch("https://scvd.store/pulse", {
        headers: { Accept: "text/html" },
      })
    ).text();
    const rows = [...page.matchAll(/<tr>[\s\S]*?<\/tr>/g)].map((m) => m[0]);
    for (const row of rows) {
      const cells = [...row.matchAll(/<td>([\s\S]*?)<\/td>/g)].map((m) =>
        m[1]!.replace(/<[^>]*>/g, "").trim(),
      );
      if (cells.length < 6) continue;
      const settled = Number(cells[3]);
      const rate = cells[5] ?? "";
      if (Number.isFinite(settled) && settled > 0) {
        expect(
          rate,
          `a row with ${settled} settled shows rate "${rate}"`,
        ).not.toMatch(/^0(\.0+)?%/);
      }
    }
  });
});
