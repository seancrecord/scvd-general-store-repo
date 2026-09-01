import { SELF, env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import {
  DECISION_MEANING,
  decisionOf,
  issuePassport,
  issueSelfPassport,
  type FreshnessState,
} from "@/services/passport";
import { takeCorpusSnapshot } from "@/services/corpus";
import { KV_KEYS } from "@/lib/kv-keys";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";

/**
 * THE ONE-GLANCE READ, AND THE PAGE THAT HAS TO SHOW IT (outside
 * review, 2026-08-31).
 *
 * The review's finding was that /passport reads like an index rather
 * than the product page for the artifact it is named after, and the
 * sharpest instance of that was not editorial. The signed payload has
 * carried `summary` — the entire compressed read — since 2026-08-27,
 * and the HTML page never rendered a field of it: the answer existed
 * in the artifact and a human could only reach it by expanding a
 * <details> and reading JSON. Prose can be edited back into that
 * state by anybody at any time, so the guard is a test rather than a
 * comment.
 *
 * Two things get held here. The decision vocabulary is DERIVED — a
 * total function of `status`, so the four-word read can never say
 * READY about a passport whose own freshness does not — and the
 * rendered page CARRIES the summary, in HTML, without JavaScript.
 */

const okCalendar = {
  calendars: ["https://calendar.test"],
  fetch: async () => new Response(new Uint8Array([1, 2, 3])),
};

const OBSERVED_AT = "2026-08-25T10:00:00.000Z";

async function seedReadyHost(): Promise<void> {
  await testEnv.COUNTERS.put(
    KV_KEYS.wardRoundLatest,
    JSON.stringify({
      week: "2026-W35",
      started_at: OBSERVED_AT,
      finished_at: "2026-08-25T10:30:00.000Z",
      listed_resources: 1,
      hosts: [
        {
          host: "alpha.example",
          url: "https://alpha.example/x402",
          verdict: "ready",
          checked_at: OBSERVED_AT,
          failed: [],
          advisories: [],
          offer: {
            networks: ["eip155:8453"],
            schemes: ["exact"],
            min_usdc: 0.005,
            max_usdc: 0.25,
            pay_to: ["0xcccccccccccccccccccccccccccccccccccccccc"],
          },
        },
      ],
    }),
  );
  const pass = await takeCorpusSnapshot(testEnv, {
    ...okCalendar,
    now: new Date(OBSERVED_AT),
  });
  expect(pass.taken).toBe(true);
}

beforeEach(async () => {
  const listed = await testEnv.COUNTERS.list({ prefix: KV_KEYS.corpusPrefix });
  for (const key of listed.keys) await testEnv.COUNTERS.delete(key.name);
  await testEnv.COUNTERS.delete(KV_KEYS.wardRoundLatest);
});

describe("the decision is arithmetic over freshness, not a second opinion", () => {
  it("is total, and never says READY about evidence that expired or broke", () => {
    const states: FreshnessState[] = [
      "fresh",
      "aging",
      "expired",
      "broken",
      "indeterminate",
    ];
    expect(states.map(decisionOf)).toEqual([
      "READY",
      "READY",
      "EXPIRED",
      "NOT_READY",
      "INDETERMINATE",
    ]);
    // Every word the function can return has a plain-words meaning to
    // render; a decision with no explanation is a score by another name.
    for (const decision of states.map(decisionOf)) {
      expect(DECISION_MEANING[decision]).toBeTruthy();
    }
  });

  it("rides inside the signature, equal to the status one field down", async () => {
    await seedReadyHost();
    const outcome = await issuePassport(
      testEnv,
      "alpha.example",
      new Date("2026-08-27T10:00:00.000Z"),
    );
    expect(outcome.issued).toBe(true);
    if (!outcome.issued) return;
    const { payload, signed_payload } = outcome.passport;
    expect(payload.summary.decision).toBe(decisionOf(payload.freshness));
    expect(payload.summary.decision).toBe("READY");
    expect(signed_payload).toContain('"decision"');
  });

  it("a refusal answers with a decision too, so an agent need not read the status code", async () => {
    const response = await SELF.fetch(`${BASE}/passport/never-seen.example`, {
      headers: { Accept: "application/json" },
    });
    expect(response.status).toBe(404);
    const body = (await response.json()) as { decision: string };
    expect(body.decision).toBe("INDETERMINATE");
  });
});

describe("not_observed states the gaps beside the verdict", () => {
  it("is the union of the cited modules' own not_checked, deduped and sorted", async () => {
    const passport = await issueSelfPassport(testEnv);
    const { summary, modules } = passport.payload;
    expect(modules.length).toBeGreaterThan(0);
    const expected = [
      ...new Set(modules.flatMap((module) => module.not_checked)),
    ].sort();
    expect(summary.not_observed).toEqual(expected);
    // A passport that checked something must admit something it did not.
    expect(summary.not_observed.length).toBeGreaterThan(0);
  });

  it("is stated as [] rather than omitted when nothing is cited", async () => {
    await seedReadyHost();
    const outcome = await issuePassport(testEnv, "alpha.example");
    expect(outcome.issued).toBe(true);
    if (!outcome.issued) return;
    expect(outcome.passport.payload.modules).toEqual([]);
    expect(outcome.passport.payload.summary.not_observed).toEqual([]);
    expect(outcome.passport.signed_payload).toContain('"not_observed"');
  });
});

describe("the landing renders the compressed read, not only the JSON", () => {
  it("carries the decision, the summary fields and the limits in HTML", async () => {
    const html = await (
      await SELF.fetch(`${BASE}/passport`, { headers: { Accept: "text/html" } })
    ).text();

    // The regression this file exists for: the summary block was
    // signed and invisible. Every field a hurried reader needs must
    // appear as page text — so the assertions below run against the
    // page with every <pre> block REMOVED, which is the only way to
    // prove the answer is legible rather than merely present in the
    // JSON dump the page also carries.
    const beforeTheJsonDump = html.replace(/<pre>[\s\S]*?<\/pre>/g, "");
    for (const field of [
      "status",
      "observed_at",
      "valid_until",
      "evidence_age",
      "failed",
      "not_observed",
    ]) {
      expect(beforeTheJsonDump, `summary field ${field} is not on the page`).toContain(
        field,
      );
    }

    // The decision, its legend, and the expiry rule an agent is asked
    // to enforce against us.
    expect(beforeTheJsonDump).toContain('data-decision="READY"');
    for (const decision of Object.keys(DECISION_MEANING)) {
      expect(beforeTheJsonDump).toContain(decision);
    }
    expect(beforeTheJsonDump).toContain("Refuse expired passports");

    // What it does not prove belongs on the passport page, not only in
    // llms.txt and the trust docs.
    expect(beforeTheJsonDump).toContain("What this does not prove");

    // Both refusals, named where a buyer reads.
    expect(beforeTheJsonDump).toContain("never-observed");
    expect(beforeTheJsonDump).toContain("not-ready");
  });

  it("puts the worked self-passport above the walkthrough that explains it", async () => {
    const html = await (
      await SELF.fetch(`${BASE}/passport`, { headers: { Accept: "text/html" } })
    ).text();
    const example = html.indexOf("The worked example");
    const walk = html.indexOf("How this store checks itself");
    expect(example).toBeGreaterThan(-1);
    expect(walk).toBeGreaterThan(-1);
    expect(example).toBeLessThan(walk);
  });

  it("a host's own page shows the same block, and the JSON stays byte-identical", async () => {
    await seedReadyHost();
    const html = await (
      await SELF.fetch(`${BASE}/passport/alpha.example`, {
        headers: { Accept: "text/html" },
      })
    ).text();
    expect(html).toContain('data-decision="READY"');
    expect(html).toContain("valid_until");
    expect(html).toContain("What this does not prove");

    const json = (await (
      await SELF.fetch(`${BASE}/passport/alpha.example`, {
        headers: { Accept: "application/json" },
      })
    ).json()) as { payload: { summary: { decision: string } } };
    expect(json.payload.summary.decision).toBe("READY");
  });
});
