import { SELF, env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { KV_KEYS } from "@/lib/kv-keys";
import {
  PROFILE_TERM_DAYS,
  performTrustProfile,
  readTrustProfile,
} from "@/services/trust-profile";
import type { Env } from "@/types";

/**
 * THE HOSTED TRUST PROFILE (keeper-ruled 2026-08-21, $19 ⚑): the
 * store's first recurring door. The laws under test, each its own
 * case: the term extends latest-wins in the renewal direction, the
 * ready gate refuses failing doors BEFORE money, our own hostname is
 * refused, and the index holds the consent line — in-term AND
 * ready-side, both required, page and index diverging on purpose.
 */

const testEnv = env as unknown as Env;

/** One corpus round so the passport gate has a chain to read — the
 * same seeding shape test/passport.spec.ts uses. Recent on purpose:
 * the profile's live view should read FRESH, not aging. */
async function seedReadyHost(host: string, takenAt: string) {
  const snapshot = {
    version: 1,
    sequence: 1,
    taken_at: takenAt,
    previous_digest: null,
    source: "ward_round",
    week: "2026-W34",
    round: {
      week: "2026-W34",
      at: takenAt,
      listed_resources: 1,
      coverage_suspect: false,
      capped: false,
      our_search_presence: true,
      hosts: [
        {
          host,
          url: `https://${host}/api/x`,
          verdict: "ready",
          failed: [],
          advisories: [],
        },
      ],
    },
  };
  await testEnv.COUNTERS.put(
    `${KV_KEYS.corpusPrefix}000000001`,
    JSON.stringify({
      snapshot,
      digest: "0".repeat(64),
      signature: "0".repeat(128),
      public_key: "0".repeat(64),
    }),
  );
}

describe("the hosted trust profile", () => {
  beforeEach(async () => {
    for (const host of ["ready-door.example", "other-door.example"]) {
      await testEnv.COUNTERS.delete(KV_KEYS.trustProfile(host));
      await testEnv.COUNTERS.delete(KV_KEYS.passportRefresh(host));
    }
  });

  it("mints a 30-day term for a ready host, and a renewal EXTENDS it", async () => {
    const host = "ready-door.example";
    await seedReadyHost(host, new Date().toISOString());
    const first = await performTrustProfile(
      testEnv,
      `https://${host}/api/thing`,
    );
    expect(first.record.renewals).toBe(1);
    const termMs =
      new Date(first.record.expires).getTime() -
      new Date(first.record.commissioned_at).getTime();
    expect(termMs).toBe(PROFILE_TERM_DAYS * 86_400_000);

    // Renewing WELL BEFORE expiry: the new term stacks on the old
    // end, so early renewal never burns days — the law on the shelf.
    const second = await performTrustProfile(
      testEnv,
      `https://${host}/api/thing`,
    );
    expect(second.record.renewals).toBe(2);
    expect(second.record.active_since).toBe(first.record.active_since);
    expect(new Date(second.record.expires).getTime()).toBe(
      new Date(first.record.expires).getTime() +
        PROFILE_TERM_DAYS * 86_400_000,
    );

    const stored = await readTrustProfile(testEnv, host);
    expect(stored?.record.renewals).toBe(2);
  });

  it("refuses a never-observed host at the mint — nothing to profile", async () => {
    await expect(
      performTrustProfile(testEnv, "https://other-door.example/api/thing"),
    ).rejects.toThrow(/never been probed|Nothing charged/);
  });

  it("refuses our own hostname before the 402, with the house reason", async () => {
    const response = await SELF.fetch(
      "https://scvd.store/api/buy/trust_profile?url=https://scvd.store/api/buy/hello",
      { headers: { "x-payment": "attempt" } },
    );
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toContain("/trust");
  });

  it("refuses a not-ready host at the door, free, with the passport's reason", async () => {
    // Never observed → the gate's never-observed refusal, pre-402.
    const response = await SELF.fetch(
      "https://scvd.store/api/buy/trust_profile?url=https://other-door.example/api/thing",
      { headers: { "x-payment": "attempt" } },
    );
    expect(response.status).toBe(403);
    const body = (await response.json()) as { error: string };
    expect(body.error).toContain("Nothing charged");
  });

  it("holds the consent line on the index and serves the page honestly", async () => {
    const host = "ready-door.example";
    await seedReadyHost(host, new Date().toISOString());
    await performTrustProfile(testEnv, `https://${host}/api/thing`);

    const index = await SELF.fetch("https://scvd.store/profiles", {
      headers: { Accept: "application/json" },
    });
    expect(index.status).toBe(200);
    const listed = (await index.json()) as {
      profiles: Array<{ host: string }>;
    };
    expect(listed.profiles.map((p) => p.host)).toContain(host);

    const page = await SELF.fetch(`https://scvd.store/profiles/${host}`, {
      headers: { Accept: "application/json" },
    });
    expect(page.status).toBe(200);
    const view = (await page.json()) as { state: string; in_term: boolean };
    expect(view.in_term).toBe(true);
    expect(view.state).toBe("active");

    // No commission → 404 with the pointer, never an empty page.
    const none = await SELF.fetch(
      "https://scvd.store/profiles/other-door.example",
      { headers: { Accept: "application/json" } },
    );
    expect(none.status).toBe(404);
  });
});
