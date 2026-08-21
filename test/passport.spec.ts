import { SELF, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { KV_KEYS } from "@/lib/kv-keys";
import { verifyMessageSignature } from "@/lib/signing";
import { jcsCanonicalize } from "@/lib/jcs";
import { freshnessOf } from "@/services/passport";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";

/**
 * THE PASSPORT holds three lines: freshness decays by arithmetic an
 * agent can re-run, names appear only on the ready side, and both
 * signatures verify like every other scvd artifact (dual-discipline
 * for new artifact classes — the JCS ruling).
 */
describe("freshness is arithmetic, not opinion", () => {
  const now = new Date("2026-08-21T00:00:00.000Z");
  it("walks fresh -> aging -> expired on age, broken on verdict, indeterminate on nothing", () => {
    expect(freshnessOf("2026-08-18T00:00:00Z", "ready", now)).toBe("fresh");
    expect(freshnessOf("2026-08-10T00:00:00Z", "ready", now)).toBe("aging");
    expect(freshnessOf("2026-07-20T00:00:00Z", "ready", now)).toBe("expired");
    expect(freshnessOf("2026-08-20T00:00:00Z", "not_ready", now)).toBe("broken");
    expect(freshnessOf(null, undefined, now)).toBe("indeterminate");
  });
});

/** Seed one corpus entry so subjectHistory has a chain to read. The
 * corpus stores full records in KV when no R2 binding is present. */
async function seedCorpusRound(
  hosts: { host: string; verdict: string }[],
): Promise<void> {
  const snapshot = {
    version: 1,
    sequence: 1,
    taken_at: "2026-08-19T17:00:00.000Z",
    previous_digest: null,
    source: "ward_round",
    week: "2026-W34",
    round: {
      week: "2026-W34",
      at: "2026-08-19T17:00:00.000Z",
      listed_resources: hosts.length,
      coverage_suspect: false,
      capped: false,
      our_search_presence: true,
      hosts: hosts.map((h) => ({
        host: h.host,
        url: `https://${h.host}/api/x`,
        verdict: h.verdict,
        failed: [],
        advisories: [],
      })),
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

describe("the passport door", () => {
  it("issues a dual-signed passport for a ready host, and both signatures verify", async () => {
    await seedCorpusRound([
      { host: "ready.example", verdict: "ready" },
      { host: "broken.example", verdict: "not_ready" },
    ]);
    const response = await SELF.fetch(`${BASE}/passport/ready.example`, {
      headers: { Accept: "application/json" },
    });
    expect(response.status).toBe(200);
    const passport = (await response.json()) as {
      payload: Record<string, unknown> & { host: string; freshness: string };
      signed_payload: string;
      signature: string;
      signature_jcs: string;
      public_key: string;
    };
    expect(passport.payload.host).toBe("ready.example");
    // Primary: declared order over the served payload, byte-exact.
    expect(passport.signed_payload).toBe(JSON.stringify(passport.payload));
    expect(
      await verifyMessageSignature(
        passport.signed_payload,
        passport.signature,
        passport.public_key,
      ),
    ).toBe(true);
    // Interop: RFC 8785 over the same payload, same key.
    expect(
      await verifyMessageSignature(
        jcsCanonicalize(passport.payload),
        passport.signature_jcs,
        passport.public_key,
      ),
    ).toBe(true);
    expect(String(passport.payload["not_a_guarantee"])).toContain(
      "not endorsement",
    );
  });

  it("refuses a failing host with the reason, never a public row", async () => {
    await seedCorpusRound([
      { host: "ready.example", verdict: "ready" },
      { host: "broken.example", verdict: "not_ready" },
    ]);
    const response = await SELF.fetch(`${BASE}/passport/broken.example`, {
      headers: { Accept: "application/json" },
    });
    expect(response.status).toBe(403);
    const body = (await response.json()) as { reason: string; detail: string };
    expect(body.reason).toBe("not-ready");
    expect(body.detail).toContain("names only on the ready side");
    // The refusal never restates what failed — that reading is private.
    expect(body.detail).not.toContain("failed");
  });

  it("404s an unobserved host toward the free self-check", async () => {
    await seedCorpusRound([{ host: "ready.example", verdict: "ready" }]);
    const response = await SELF.fetch(`${BASE}/passport/nobody.example`, {
      headers: { Accept: "application/json" },
    });
    expect(response.status).toBe(404);
    const body = (await response.json()) as { reason: string; detail: string };
    expect(body.reason).toBe("never-observed");
    expect(body.detail).toContain("/api/preflight");
  });

  it("serves the self-passport labeled self-observed on the landing", async () => {
    const json = (await (
      await SELF.fetch(`${BASE}/passport`, {
        headers: { Accept: "application/json" },
      })
    ).json()) as { the_example: { payload: { observer: string; host: string } } };
    expect(json.the_example.payload.host).toBe("scvd.store");
    expect(json.the_example.payload.observer).toContain("SELF-OBSERVED");

    const html = await (
      await SELF.fetch(`${BASE}/passport`, { headers: { Accept: "text/html" } })
    ).text();
    expect(html).toContain("self-observed");
    expect(html).toContain("/passport/{host}");
  });
});
