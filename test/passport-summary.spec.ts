import { SELF, env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { issuePassport } from "@/services/passport";
import { takeCorpusSnapshot } from "@/services/corpus";
import { KV_KEYS } from "@/lib/kv-keys";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;

/**
 * THE PASSPORT SUMMARY BLOCK — the one dead-simple read (outside
 * review, 2026-08-27, accepted): an agent deciding whether to rely on
 * a door should get three answers FAST — can it be paid, what
 * evidence says so, and when does that evidence expire — without
 * walking the module list.
 *
 * Two laws hold it honest:
 *
 *   DERIVED, NEVER TYPED TWICE (AT_SCALE rule 1). Every summary value
 *   is computed from the same locals as the payload's authoritative
 *   fields, and this spec asserts the equalities — a summary that
 *   could drift from its own passport would be worse than no summary.
 *
 *   INSIDE THE SIGNED PAYLOAD. A convenience block outside the
 *   signature would be the one part of the passport a tamperer could
 *   rewrite freely — and the part agents actually read. The summary
 *   is signed with everything else.
 */

const okCalendar = {
  calendars: ["https://calendar.test"],
  fetch: async () => new Response(new Uint8Array([1, 2, 3])),
};

const WALLET = "0xcccccccccccccccccccccccccccccccccccccccc";
const OBSERVED_AT = "2026-08-25T10:00:00.000Z";

async function seedChain(): Promise<void> {
  const round = {
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
          pay_to: [WALLET],
        },
      },
    ],
  };
  await testEnv.COUNTERS.put(KV_KEYS.wardRoundLatest, JSON.stringify(round));
  // Pin the snapshot's taken_at: last_observed derives from it, and
  // the age assertion below counts days from this exact instant.
  const pass = await takeCorpusSnapshot(testEnv, {
    ...okCalendar,
    now: new Date(OBSERVED_AT),
  });
  expect(pass.taken).toBe(true);
}

beforeEach(async () => {
  const listed = await testEnv.COUNTERS.list({
    prefix: KV_KEYS.corpusPrefix,
  });
  for (const key of listed.keys) {
    await testEnv.COUNTERS.delete(key.name);
  }
  await testEnv.COUNTERS.delete(KV_KEYS.wardRoundLatest);
});

describe("the summary answers the three questions fast", () => {
  it("carries status, evidence, price and expiry — each equal to its authoritative twin", async () => {
    await seedChain();
    const now = new Date("2026-08-27T10:00:00.000Z");
    const outcome = await issuePassport(testEnv, "alpha.example", now);
    expect(outcome.issued).toBe(true);
    if (!outcome.issued) return;
    const { payload } = outcome.passport;
    const summary = payload.summary;
    expect(summary).toBeDefined();

    // Never typed twice: the summary's values ARE the payload's.
    expect(summary.status).toBe(payload.freshness);
    expect(summary.verdict).toBe(payload.latest?.verdict ?? null);
    expect(summary.observed_at).toBe(payload.latest?.observed_at ?? null);
    expect(summary.valid_until).toBe(payload.expires);

    // Evidence age, derived from the same two instants the payload
    // states — two days between observation and issue here.
    expect(summary.evidence_age_days).toBe(2);

    // "Can it be paid": the door's own declared terms, from the
    // signed round the passport already derives from.
    expect(summary.networks).toEqual(["eip155:8453"]);
    expect(summary.min_usdc).toBe(0.005);
    expect(summary.max_usdc).toBe(0.25);

    // Stated, not implied: a ready-side passport has no failing
    // checks, and the summary says [] rather than omitting the field.
    expect(summary.failed).toEqual([]);

    expect(String(summary.verify)).toMatch(/signed_payload|scvd-signing-key/);
    expect(summary.history_url).toContain("/corpus/host/alpha.example.json");
    expect(String(summary.corrections_url)).toContain("/corrections");

    // The ruling holds here too: no verbatim address in the summary.
    expect(JSON.stringify(summary)).not.toMatch(/0x[0-9a-fA-F]{40}/);
  });

  it("rides INSIDE the signed payload, not beside it", async () => {
    await seedChain();
    const outcome = await issuePassport(testEnv, "alpha.example");
    expect(outcome.issued).toBe(true);
    if (!outcome.issued) return;
    expect(outcome.passport.signed_payload).toContain('"summary"');
  });

  it("the self-passport carries the same block, fresh by construction", async () => {
    const json = (await (
      await SELF.fetch("https://scvd.store/passport", {
        headers: { Accept: "application/json" },
      })
    ).json()) as {
      the_example: {
        payload: {
          expires: string;
          summary: {
            status: string;
            evidence_age_days: number | null;
            valid_until: string;
          };
        };
      };
    };
    const { payload } = json.the_example;
    expect(payload.summary).toBeDefined();
    expect(payload.summary.status).toBe("fresh");
    expect(payload.summary.evidence_age_days).toBe(0);
    expect(payload.summary.valid_until).toBe(payload.expires);
  });
});
