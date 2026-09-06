import { SELF, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { KV_KEYS } from "@/lib/kv-keys";
import { deriveProspects, deriveWelcomes, draftNote, draftWelcome } from "@/services/outreach";
import type { WardHostResult, WardRound } from "@/services/ward-round";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";

/**
 * ONE OBSERVATION, ONE DATE, EVERYWHERE (2026-09-05).
 *
 * TensorFeed.ai's operator read "On 2026-09-05 our weekly pass" in a
 * note and "observed 2026-09-01" on the passport that note linked,
 * and pointed out that for a shop selling dated observations those
 * want to be the same date. They were two different clocks: the note
 * read the round's SEAL, the passport read the corpus snapshot's.
 * Neither was the knock, and the walk knocks in hourly batches all
 * week.
 *
 * The fix is one field — the probe stamps the row — and this spec is
 * the guard that keeps every surface reading it. A surface that
 * grows its own date again fails here, not in somebody's inbox.
 */

const KNOCKED_AT = "2026-09-01T13:27:08.998Z";
const SEALED_AT = "2026-09-05T17:00:00.000Z";

function row(name: string, verdict: WardHostResult["verdict"], stamped: boolean): WardHostResult {
  return {
    host: name,
    url: `https://${name}/route`,
    verdict,
    failed: verdict === "not_ready" ? ["status-402"] : [],
    advisories: [],
    ...(stamped ? { observed_at: KNOCKED_AT } : {}),
  };
}

function round(hosts: WardHostResult[]): WardRound {
  return {
    week: "2026-W36",
    at: SEALED_AT,
    listed_resources: hosts.length,
    coverage_suspect: false,
    capped: false,
    our_search_presence: true,
    hosts,
  };
}

/** One corpus entry sealed later than the knock, the shape that bit us. */
async function seedCorpus(hosts: WardHostResult[]): Promise<void> {
  await testEnv.COUNTERS.put(
    `${KV_KEYS.corpusPrefix}000000001`,
    JSON.stringify({
      snapshot: {
        version: 1,
        sequence: 1,
        taken_at: SEALED_AT,
        previous_digest: null,
        source: "ward_round",
        week: "2026-W36",
        round: round(hosts),
      },
      digest: "0".repeat(64),
      signature: "0".repeat(128),
      public_key: "0".repeat(64),
    }),
  );
}

describe("the note and the passport it links carry the same date", () => {
  it("both read the knock, not the seal, for a stamped row", async () => {
    const ready = row("stamped.example", "ready", true);
    await seedCorpus([ready]);
    await testEnv.COUNTERS.put(KV_KEYS.wardRoundLatest, JSON.stringify(round([ready])));

    const welcome = deriveWelcomes(round([ready]), null)[0]!;
    const note = draftWelcome(welcome, BASE);
    expect(note).toContain(`On ${KNOCKED_AT.slice(0, 10)} our weekly pass`);
    // The note links this page; the page must not tell another day.
    expect(note).toContain(`${BASE}/passport/stamped.example`);

    const response = await SELF.fetch(`${BASE}/passport/stamped.example`, {
      headers: { Accept: "application/json" },
    });
    expect(response.status).toBe(200);
    const passport = (await response.json()) as {
      payload: { summary: { observed_at: string }; latest: { observed_at: string } };
    };
    expect(passport.payload.summary.observed_at).toBe(KNOCKED_AT);
    expect(passport.payload.latest.observed_at).toBe(KNOCKED_AT);
    // Said the way the operator read it: one calendar day, both places.
    expect(passport.payload.summary.observed_at.slice(0, 10)).toBe(
      note.match(/On (\d{4}-\d{2}-\d{2}) our weekly pass/)![1],
    );
  });

  it("an unstamped legacy row still agrees with itself on the seal", async () => {
    const ready = row("legacy.example", "ready", false);
    await seedCorpus([ready]);
    const welcome = deriveWelcomes(round([ready]), null)[0]!;
    expect(draftWelcome(welcome, BASE)).toContain(`On ${SEALED_AT.slice(0, 10)} our weekly pass`);
    const passport = (await (
      await SELF.fetch(`${BASE}/passport/legacy.example`, { headers: { Accept: "application/json" } })
    ).json()) as { payload: { summary: { observed_at: string } } };
    expect(passport.payload.summary.observed_at).toBe(SEALED_AT);
  });

  it("the broken-door note dates by the knock too", () => {
    const prospect = deriveProspects(round([row("broken.example", "not_ready", true)]), null)[0]!;
    expect(prospect.observed_at).toBe(KNOCKED_AT);
    expect(draftNote(prospect, BASE)).toContain(`On ${KNOCKED_AT.slice(0, 10)} our weekly probe`);
  });
});

describe("no surface can draft a note from a stored row", () => {
  /*
   * THE STRUCTURAL HALF (rule 46: a guard that cannot fail is a guard
   * that argues for the lie). The behavior tests in
   * test/outreach-verify.spec.ts prove the live-reading rule for the
   * paths that exist today; this asserts that no NEW path can quietly
   * reintroduce the old one. `draftNote` is the raw drafter and takes
   * whatever row it is handed — the desk reaches it only through
   * `handDraftFor`, which refuses without a fresh live reading.
   */
  it("the outreach page and its routes reach the drafter only through the live-reading gate", async () => {
    const page = (await import("../src/pages/admin/outreach-page.ts?raw"))
      .default as unknown as string;
    const admin = (await import("../src/routes/admin.ts?raw")).default as unknown as string;
    for (const [name, source] of [["the page", page], ["the routes", admin]] as const) {
      expect(source, `${name} must not draft the broken-door note itself`).not.toContain("draftNote");
      expect(source, `${name} must not read a live reading it did not gate`).not.toContain(
        "entry.live.failed",
      );
    }
    expect(page).toContain("handDraftFor");
    // And the gate is the only door to the wire's own drafter too.
    expect(admin).toContain("verifyProspect");
  });
});
