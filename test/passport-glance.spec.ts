import { SELF, env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { KV_KEYS } from "@/lib/kv-keys";
import { BASIS_LEGEND, BASIS_MARK, becauseText, probeStrip, tickOutcome } from "@/pages/passport-card";
import { DECISION_RULE } from "@/services/passport";
import { escapeHtml } from "@/lib/sanitize";
import { subjectHistory } from "@/services/subject-history";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";
const HTML = { headers: { Accept: "text/html" } };
const JSON_ACCEPT = { headers: { Accept: "application/json" } };
const HOST = "glance.example";

/**
 * THE PASSPORT'S FACE, RE-CUT (2026-09-17) after reading an outside
 * observatory's record page beside ours
 * (research/robinsaige-read-2026-09-17.md, items 1, 2, 3, 6, 7). All
 * five are views over the signed payload; none adds a field to it.
 * What this file holds:
 *
 *   - the because-line: the decision never appears alone, every
 *     clause read off the summary and wearing its basis mark, ending
 *     with what was not observed; the same text rides the JSON;
 *   - the glance: the decision, tier, rails, ask and age as cells
 *     above the prose, each with its basis;
 *   - the probe strip: one tick per round on the chain, oldest first,
 *     the missed week drawn as a gap with its reason, on the passport
 *     page and the history page alike, with the table still under it;
 *   - the basis column: every summary row says observed, derived or
 *     reported, and the legend explains the marks;
 *   - the per-host page stops re-explaining: the decision rule lives
 *     on the landing and the host page links to it.
 */

const AT = ["2026-08-05T17:00:00.000Z", "2026-08-12T17:00:00.000Z", "2026-08-19T17:00:00.000Z"];

async function seedRound(sequence: number, week: string, takenAt: string, previous: string | null, digest: string, hosts: { host: string; verdict: string; failed?: string[] }[]) {
  const snapshot = {
    version: 1,
    sequence,
    taken_at: takenAt,
    previous_digest: previous,
    source: "ward_round",
    week,
    round: {
      week,
      at: takenAt,
      listed_resources: hosts.length,
      coverage_suspect: false,
      capped: false,
      our_search_presence: true,
      hosts: hosts.map((h) => ({
        host: h.host,
        url: `https://${h.host}/api/x`,
        verdict: h.verdict,
        failed: h.failed ?? [],
        advisories: [],
        offer: { networks: ["eip155:8453"], schemes: ["exact"], min_usdc: 0.001, max_usdc: 0.001 },
      })),
    },
  };
  await testEnv.COUNTERS.put(
    `${KV_KEYS.corpusPrefix}${String(sequence).padStart(9, "0")}`,
    JSON.stringify({ snapshot, digest, signature: "0".repeat(128), public_key: "0".repeat(64) }),
  );
}

beforeAll(async () => {
  // Round 1 ready, round 2 the host is missing from the walk (a gap,
  // not a verdict), round 3 ready again.
  await seedRound(1, "2026-W32", AT[0]!, null, "a".repeat(64), [{ host: HOST, verdict: "ready" }]);
  await seedRound(2, "2026-W33", AT[1]!, "a".repeat(64), "b".repeat(64), [{ host: "other.example", verdict: "not_ready", failed: ["402_shape"] }]);
  await seedRound(3, "2026-W34", AT[2]!, "b".repeat(64), "c".repeat(64), [{ host: HOST, verdict: "ready" }]);
});

type PassportJson = {
  payload: { summary: { decision: string; status: string; not_observed: string[]; networks?: string[] }; tier?: { tier: string; fraction: { ready: number; rounds: number } } };
  signed_payload: string;
  because: string;
};

describe("the because-line", () => {
  it("never shows the decision alone: every clause wears its basis, and the gaps close the line", async () => {
    const body = (await (await SELF.fetch(`${BASE}/passport/${HOST}`, JSON_ACCEPT)).json()) as PassportJson;
    const { decision, not_observed, networks } = body.payload.summary;
    expect(body.because.startsWith(`${decision} — because `)).toBe(true);
    expect(body.because).toContain(`answered 402 and every check in the battery passed ${BASIS_MARK.observed}`);
    expect(body.because).toContain(`rails ${networks!.join(", ")} ${BASIS_MARK.reported}`);
    expect(body.because).toContain(`asks 0.001 USDC ${BASIS_MARK.reported}`);
    expect(body.because).toContain(`tier ${body.payload.tier!.tier} — ready ${body.payload.tier!.fraction.ready} of ${body.payload.tier!.fraction.rounds} rounds`);
    expect(body.because).toContain(BASIS_MARK.derived);
    expect(body.because).toContain(not_observed.length === 0 ? "declares no gaps" : `${not_observed.length} thing`);
    expect(body.because).toContain("never delivery");
    // Additive, outside the signature.
    expect(body.signed_payload).not.toContain("because");
    // The page prints the same derivation under the decision word.
    const page = await (await SELF.fetch(`${BASE}/passport/${HOST}`, HTML)).text();
    expect(page).toContain('<p class="because"><strong>because</strong>');
    expect(page).toContain("answered 402 and every check in the battery passed");
  });
});

describe("the glance", () => {
  it("puts decision, tier, rail, ask and age above the prose, each with a basis mark", async () => {
    const page = await (await SELF.fetch(`${BASE}/passport/${HOST}`, HTML)).text();
    for (const key of ["decision", "tier", "rails", "price", "observed"]) {
      expect(page, key).toContain(`data-glance="${key}"`);
    }
    expect(page).toContain('data-glance="decision" data-decision="');
    expect(page.indexOf('class="glance"')).toBeLessThan(page.indexOf('class="decision"'));
    expect(page.indexOf('class="glance"')).toBeLessThan(page.indexOf("observer:"));
    expect(page).toContain("eip155:8453");
    expect(page).toContain("0.001 USDC");
  });
});

describe("the probe strip", () => {
  it("draws every round on the chain, oldest first, with the missed week as a gap that names its reason", async () => {
    const history = await subjectHistory(testEnv, HOST, BASE);
    expect(history.timeline.map(tickOutcome)).toEqual(["ready", "gap", "ready"]);
    const strip = probeStrip(history.timeline, HOST);
    const ticks = [...strip.matchAll(/<a class="tick" data-outcome="([a-z_]+)" data-week="([^"]+)"[^>]*title="([^"]+)"/g)];
    expect(ticks.map((m) => m[1])).toEqual(["ready", "gap", "ready"]);
    expect(ticks.map((m) => m[2])).toEqual(["2026-W32", "2026-W33", "2026-W34"]);
    expect(ticks[1]![3]).toContain("not walked");
    expect(ticks[1]![3]).toContain(history.timeline[1]!.gap);
    expect(strip).toContain("2 probed of 3");
    expect(strip).toContain("A gap is a fact about our cadence, not about the door.");
    // Each tick links the snapshot the row sits in.
    expect(ticks.length).toBe(3);
    expect(strip).toContain(`href="${BASE}/corpus/2.json"`);
  });

  it("is on the passport page and the history page, with the full table still under it", async () => {
    const passport = await (await SELF.fetch(`${BASE}/passport/${HOST}`, HTML)).text();
    expect(passport).toContain(`<section class="probe-strip" data-host="${HOST}">`);
    // Three round ticks; the key under the strip uses spans, not links.
    expect(passport.split('<a class="tick" data-outcome=').length - 1).toBe(3);
    const history = await (await SELF.fetch(`${BASE}/corpus/host/${HOST}`, HTML)).text();
    expect(history).toContain(`<section class="probe-strip" data-host="${HOST}">`);
    expect(history).toContain("Every round, including the ones we missed");
    expect(history.indexOf('class="probe-strip"')).toBeLessThan(history.indexOf("<table>"));
    expect(history).toContain(".tick[data-outcome=");
  });

  it("is absent from the self passport, which has no chain rounds", async () => {
    const page = await (await SELF.fetch(`${BASE}/passport/scvd.store`, HTML)).text();
    expect(page).not.toContain('class="probe-strip"');
    const body = (await (await SELF.fetch(`${BASE}/passport/scvd.store`, JSON_ACCEPT)).json()) as PassportJson;
    expect(body.because.startsWith(`${body.payload.summary.decision} — because `)).toBe(true);
    expect(body.because).toContain("SELF-OBSERVED".length > 0 ? "not observed" : "");
  });
});

describe("the basis column", () => {
  it("marks every summary row observed, derived or reported, and prints the legend", async () => {
    const page = await (await SELF.fetch(`${BASE}/passport/${HOST}`, HTML)).text();
    expect(page).toContain(BASIS_LEGEND);
    const rows = [...page.matchAll(/<tr data-basis="(observed|derived|reported)"><td>([a-z_]+)<\/td>/g)].map((m) => [m[2], m[1]]);
    const byField = Object.fromEntries(rows) as Record<string, string>;
    expect(byField["status"]).toBe("derived");
    expect(byField["verdict"]).toBe("observed");
    expect(byField["observed_at"]).toBe("observed");
    expect(byField["valid_until"]).toBe("derived");
    expect(byField["tier"]).toBe("derived");
    expect(byField["networks"]).toBe("reported");
    expect(byField["price"]).toBe("reported");
    expect(byField["failed"]).toBe("observed");
  });
});

describe("the per-host page stops re-explaining", () => {
  it("links the decision rule on the landing instead of pasting it, and the landing carries the anchor", async () => {
    const page = await (await SELF.fetch(`${BASE}/passport/${HOST}`, HTML)).text();
    expect(page).toContain('href="/passport#decision"');
    // The rule still rides the signed payload (summary.decision_rule)
    // and the QAPage node; what is gone is the paste under the word.
    const decision = page.slice(page.indexOf('<section class="decision"'), page.indexOf("</section>", page.indexOf('<section class="decision"')));
    expect(decision).not.toContain(escapeHtml(DECISION_RULE));
    expect(decision).toContain("Derived from <code>status:");
    // The protocol rule is still on the page, folded rather than gone.
    expect(page).toContain('<details class="protocol-rule">');
    const landing = await (await SELF.fetch(`${BASE}/passport`, HTML)).text();
    expect(landing).toContain('<section id="decision">');
    expect(landing).toContain(escapeHtml(DECISION_RULE));
  });
});

describe("pure", () => {
  it("becauseText reads only the summary, so a passport with no tier and no offer still derives a line", () => {
    const line = becauseText({
      payload: {
        summary: { decision: "NOT_READY", status: "broken", verdict: "not_ready", observed_at: "2026-08-01T00:00:00.000Z", valid_until: "2026-08-17T00:00:00.000Z", failed: ["402_shape"], not_observed: [] },
        issued_at: "2026-08-03T00:00:00.000Z",
      },
    } as never);
    expect(line).toBe(`NOT_READY — because failed 402_shape ●; observed 2 days ago, broken until 2026-08-17 ◐. Not observed: the cited evidence declares no gaps; never delivery, never anything after payment.`);
  });
});
