import { SELF, env } from "cloudflare:test";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  canonicalizeProbe,
  readWatch,
  startWatch,
  sweepStandingWatches,
  WATCH_DURATION_HOURS,
  type StandingWatchRecord,
} from "@/services/standing-watch";
import { KV_KEYS } from "@/lib/kv-keys";
import { installFacilitatorMock } from "./helpers/facilitator-mock";
import {
  buildPaymentSignature,
  decodePaymentRequired,
} from "./helpers/payment";
import type { Env } from "@/types";
import { captureWatchEvidence } from "@/services/watch-evidence";

/**
 * THE STANDING WATCH: seller-pays monitoring as a signed artifact.
 * The design constraints under test are the ones that made it
 * buildable at all (PROBLEMS.md, 2026-08-03): consent is the purchase
 * (no watch on anyone who didn't buy it, no watch on ourselves),
 * every probe row is individually signed and quotable alone, and the
 * hours WE miss are derived into the record at read time — the
 * watcher's naps are part of the history, not edited out of it.
 */

const BASE = "https://scvd.store";
const testEnv = env as unknown as Env;

function watch402(challenge: Record<string, unknown>): Response {
  return new Response("{}", {
    status: 402,
    headers: { "PAYMENT-REQUIRED": btoa(JSON.stringify(challenge)) },
  });
}

const GOOD_CHALLENGE = {
  x402Version: 2,
  accepts: [
    {
      scheme: "exact",
      network: "eip155:8453",
      amount: "10000",
      asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      payTo: "0x1111111111111111111111111111111111111111",
    },
  ],
};

describe("buying a watch", () => {
  beforeAll(() => {
    installFacilitatorMock();
  });

  async function buy(url?: string): Promise<Response> {
    const target = url ? `?url=${encodeURIComponent(url)}` : "";
    const buyUrl = `${BASE}/api/buy/standing_watch${target}`;
    const challenge = await SELF.fetch(buyUrl, {
      headers: { "PAYMENT-SIGNATURE": "probe-for-price" },
    });
    if (challenge.status !== 402) {
      return challenge;
    }
    const required = decodePaymentRequired(challenge);
    return SELF.fetch(buyUrl, {
      headers: { "PAYMENT-SIGNATURE": buildPaymentSignature(required.accepts[0]!) },
    });
  }

  it("no url, no charge", async () => {
    const response = await buy();
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toContain("No target, no charge");
  });

  it("refuses to watch ourselves, with the reason", async () => {
    const response = await buy(`${BASE}/api/buy/hello`);
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toContain("cannot fetch");
  });

  it("a real purchase returns the watch and its free history door", async () => {
    const response = await buy("https://example-shop.test/api/buy/thing");
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(String(body["watch_id"])).toMatch(/^watch_/);
    expect(String(body["history_url"])).toContain("/api/watch/watch_");
    // The week is stated, not implied.
    const ends = Date.parse(String(body["ends_at"]));
    const hours = (ends - Date.now()) / 3600_000;
    expect(hours).toBeGreaterThan(WATCH_DURATION_HOURS - 1);
    expect(hours).toBeLessThan(WATCH_DURATION_HOURS + 1);
  });
});

describe("the sweep", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("probes an active watch once, signs the row, and the signature is real", async () => {
    const { record } = await startWatch(testEnv, "https://watched.example/api/buy/x");
    vi.stubGlobal("fetch", async () => watch402(GOOD_CHALLENGE));
    const probed = await sweepStandingWatches(testEnv);
    expect(probed).toBeGreaterThanOrEqual(1);

    const stored = await testEnv.ORDERS.get<StandingWatchRecord>(
      KV_KEYS.standingWatch(record.watch_id),
      "json",
    );
    expect(stored!.probes.length).toBe(1);
    const probe = stored!.probes[0]!;
    expect(probe.verdict).toBe("ready");
    expect(probe.failed).toEqual([]);

    // The row's signature verifies over the documented canonical form —
    // the how_to_verify promise, executed rather than believed.
    const { verifyMessageSignature } = await import("@/lib/signing");
    const canonical = canonicalizeProbe(record.watch_id, record.url, probe);
    expect(
      await verifyMessageSignature(canonical, probe.signature, probe.public_key),
    ).toBe(true);
  });

  it("stores the response evidence the verdict came from, inside the signed row", async () => {
    const { record } = await startWatch(
      testEnv,
      "https://evidence.example/api/buy/x",
    );
    const challengeBytes = btoa(JSON.stringify(GOOD_CHALLENGE));
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response("watch-body", {
          status: 402,
          headers: {
            "PAYMENT-REQUIRED": challengeBytes,
            "Content-Type": "application/x402+json",
            "X-Unrelated": "must-not-be-stored",
          },
        }),
    );

    await sweepStandingWatches(testEnv);
    const stored = await testEnv.ORDERS.get<StandingWatchRecord>(
      KV_KEYS.standingWatch(record.watch_id),
      "json",
    );
    const probe = stored!.probes[0]!;
    const evidence = (
      probe as typeof probe & {
        evidence?: {
          challenge_bytes: string | null;
          headers: Record<string, string>;
          body_sha256: string | null;
          body_bytes: number;
          body_truncated: boolean;
          tls?: string;
        };
      }
    ).evidence;

    /*
     * 3.1 added `tls` to the capture — a stated non-observation, not
     * a value: this vantage cannot reach a certificate fingerprint
     * and the row says so rather than letting a reader assume we
     * looked. The pin moves deliberately; the preimage law is
     * asserted separately below (old rows carrying no tls
     * canonicalize without one, byte-identical forever).
     */
    expect(evidence).toEqual({
      tls: "unavailable-from-this-vantage",
      challenge_bytes: challengeBytes,
      headers: {
        "content-type": "application/x402+json",
        "payment-required": challengeBytes,
      },
      body_sha256:
        "faf6fdc3fa6f93829d0cc582a8d20666d2bb311a8ef0303bfd23cbbcc80e0866",
      body_bytes: 10,
      body_truncated: false,
    });

    // Evidence beside a signature is decoration unless changing it
    // breaks that signature. The row must bind what it saw, not only
    // the verdict it drew from it.
    const { verifyMessageSignature } = await import("@/lib/signing");
    const tampered = {
      ...probe,
      evidence: {
        ...evidence!,
        body_sha256: "0".repeat(64),
      },
    };
    expect(
      await verifyMessageSignature(
        canonicalizeProbe(record.watch_id, record.url, tampered),
        probe.signature,
        probe.public_key,
      ),
    ).toBe(false);
  });

  it("a doubled cron tick does not double-probe the hour", async () => {
    const { record } = await startWatch(testEnv, "https://watched2.example/api/buy/x");
    vi.stubGlobal("fetch", async () => watch402(GOOD_CHALLENGE));
    await sweepStandingWatches(testEnv);
    await sweepStandingWatches(testEnv);
    const stored = await testEnv.ORDERS.get<StandingWatchRecord>(
      KV_KEYS.standingWatch(record.watch_id),
      "json",
    );
    expect(stored!.probes.length).toBe(1);
  });

  it("an ended watch is left exactly as it finished", async () => {
    const { record } = await startWatch(testEnv, "https://watched3.example/api/buy/x");
    const key = KV_KEYS.standingWatch(record.watch_id);
    const stored = (await testEnv.ORDERS.get<StandingWatchRecord>(key, "json"))!;
    stored.ends_at = new Date(Date.now() - 60_000).toISOString();
    await testEnv.ORDERS.put(key, JSON.stringify(stored));
    let fetched = 0;
    vi.stubGlobal("fetch", async () => {
      fetched += 1;
      return watch402(GOOD_CHALLENGE);
    });
    await sweepStandingWatches(testEnv);
    expect(fetched).toBe(0);
  });

  it("an unreachable endpoint is a signed observation too", async () => {
    const { record } = await startWatch(testEnv, "https://gone.example/api/buy/x");
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("connection refused");
    });
    await sweepStandingWatches(testEnv);
    const stored = await testEnv.ORDERS.get<StandingWatchRecord>(
      KV_KEYS.standingWatch(record.watch_id),
      "json",
    );
    expect(stored!.probes[0]!.verdict).toBe("unreachable");
    expect(stored!.probes[0]!.signature).toBeTruthy();
  });
});

describe("the watch evidence boundary", () => {
  it("does not publish a partial-body hash as though it covered the whole response", async () => {
    const evidence = await captureWatchEvidence(
      new Response("five!", {
        headers: { "Content-Type": "text/plain", "X-Unrelated": "drop me" },
      }),
      4,
    );
    expect(evidence.body_truncated).toBe(true);
    expect(evidence.body_sha256).toBeNull();
    expect(evidence.body_bytes).toBeGreaterThan(4);
    expect(evidence.headers).toEqual({ "content-type": "text/plain" });
  });

  it("keeps the exact preimage of rows issued before evidence capture", () => {
    expect(
      canonicalizeProbe("watch_legacy", "https://legacy.example/paid", {
        at: "2026-08-24T12:00:00.000Z",
        verdict: "ready",
        status: 402,
        latency_ms: 12,
        failed: [],
      }),
    ).toBe(
      '{"watch_id":"watch_legacy","url":"https://legacy.example/paid","at":"2026-08-24T12:00:00.000Z","verdict":"ready","status":402,"latency_ms":12,"failed":[]}',
    );
  });
});

describe("the history door", () => {
  it("derives OUR gaps at read time instead of storing a politer number", async () => {
    const { record } = await startWatch(testEnv, "https://gappy.example/api/buy/x");
    const key = KV_KEYS.standingWatch(record.watch_id);
    const stored = (await testEnv.ORDERS.get<StandingWatchRecord>(key, "json"))!;
    // Five hours old, two probes recorded: three hours nobody watched.
    stored.started_at = new Date(Date.now() - 5 * 3600_000).toISOString();
    stored.probes = [0, 1].map((i) => ({
      at: new Date(Date.now() - (4 - i) * 3600_000).toISOString(),
      verdict: "ready" as const,
      status: 402,
      latency_ms: 100,
      failed: [],
      signature: "unchecked-here",
      public_key: "unchecked-here",
    }));
    await testEnv.ORDERS.put(key, JSON.stringify(stored));

    const history = await readWatch(testEnv, record.watch_id);
    expect(history!.summary.hours_elapsed).toBe(5);
    expect(history!.summary.probes_recorded).toBe(2);
    expect(history!.summary.hours_unprobed).toBe(3);
    expect(history!.what_this_is_not).toContain("our gaps");
  });

  it("serves free over HTTP with verify instructions in-band", async () => {
    const { record } = await startWatch(testEnv, "https://served.example/api/buy/x");
    const response = await SELF.fetch(`${BASE}/api/watch/${record.watch_id}`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(String(body["how_to_verify"])).toContain("ed25519_verify");
    expect(body["complete"]).toBe(false);
  });

  it("404s an unknown id without inventing a watch", async () => {
    const response = await SELF.fetch(`${BASE}/api/watch/watch_nope`);
    expect(response.status).toBe(404);
  });
});

describe("the shelf integration is derived, not curated", () => {
  it("standing_watch is not Front Counter (required input), and its schema requires url", async () => {
    const { MENU_ITEMS } = await import("@/store");
    const item = MENU_ITEMS.find((entry) => entry.id === "standing_watch")!;
    expect(item).toBeTruthy();
    const { isFrontCounter } = await import("@/lib/front-counter");
    expect(isFrontCounter(item)).toBe(false);
    const { buyInputSchema } = await import("@/lib/bazaar-discovery");
    const schema = buyInputSchema(item);
    expect(schema.required).toContain("url");
  });
});

describe("who pays, and what the payment does not buy", () => {
  /**
   * The Night Watch runs on the same inverted consent as the
   * Conformance Watch — the watched party buys it — so it carries the
   * same immunity clause, guarded in the same way. The clause is only
   * worth anything if it rides the artifact: a reader learns the terms
   * from the history in front of them, not from a page they will never
   * open.
   */
  it("ships the clause on the hourly history too", async () => {
    const { record } = await startWatch(testEnv, "https://merchant.example/api/buy/clause");
    const history = await readWatch(testEnv, record.watch_id);
    const clause = history!.who_pays_and_what_it_buys;
    expect(clause).toContain("payment buys FREQUENCY AND PERMANENCE, never outcome");
    expect(clause).toContain("degrades while its operator is paying");
  });
});
