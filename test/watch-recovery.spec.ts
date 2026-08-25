import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { KV_KEYS } from "@/lib/kv-keys";
import { startWatch, watchesForPayer } from "@/services/standing-watch";
import { startConformanceWatch } from "@/services/conformance-watch";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;

/**
 * A LOST WATCH ID USED TO COST A SECOND PURCHASE.
 *
 * CV, 2026-08-21, working the corpus against the paid watches: the
 * watch id lives in the purchase RESPONSE and nowhere else. He tried
 * the receipt, the JWS payload, the API root, guessing URL patterns
 * off the cert id, menu.json and llms.txt — every one of which tells
 * you a watch id exists and none of which will give you yours. The
 * store's own shopping run keeps the receipt and drops the body. So
 * he wrote a bespoke purchase script and BOUGHT THE WATCH AGAIN, and
 * that was the only path available.
 *
 * That is the exact journey /api/claims was built for ("the agent
 * whose context reset between paying and reading the response") — and
 * a watch is the purchase most likely to need it, because its value
 * arrives over seven days, long after the response is gone. The door
 * could not help because the watch record did not know who paid.
 *
 * It does now. These tests pin the recovery, and the honesty about
 * watches opened before the field existed.
 */

const PAYER = "0x843b544bf5f0aa6cbf13e94563874878c98cc4a7";
const STRANGER = "0x2222222222222222222222222222222222222222";

describe("a watch remembers who paid for it", () => {
  it("returns both kinds of watch to the wallet that bought them", async () => {
    const standing = await startWatch(testEnv, "https://one.example/api", PAYER);
    const conformance = await startConformanceWatch(
      testEnv,
      "https://two.example/api",
      PAYER,
    );
    const mine = await watchesForPayer(testEnv, PAYER);
    const ids = mine.watches.map((watch) => watch.watch_id);
    expect(ids).toContain(standing.record.watch_id);
    expect(ids).toContain(conformance.record.watch_id);

    const standingRow = mine.watches.find(
      (watch) => watch.watch_id === standing.record.watch_id,
    );
    expect(standingRow?.kind).toBe("standing_watch");
    // The whole point: the permanent history URL, handed back.
    expect(standingRow?.history_path).toBe(
      `/api/watch/${standing.record.watch_id}`,
    );
    const conformanceRow = mine.watches.find(
      (watch) => watch.watch_id === conformance.record.watch_id,
    );
    expect(conformanceRow?.kind).toBe("conformance_watch");
    expect(conformanceRow?.history_path).toBe(
      `/api/conformance-watch/${conformance.record.watch_id}`,
    );
  });

  it("never hands one wallet's watches to another", async () => {
    const mine = await startWatch(testEnv, "https://mine.example/api", PAYER);
    const theirs = await watchesForPayer(testEnv, STRANGER);
    expect(theirs.watches.map((watch) => watch.watch_id)).not.toContain(
      mine.record.watch_id,
    );
  });

  it("matches the wallet whatever case it was written in", async () => {
    const opened = await startWatch(
      testEnv,
      "https://case.example/api",
      PAYER.toUpperCase(),
    );
    const found = await watchesForPayer(testEnv, PAYER.toLowerCase());
    expect(found.watches.map((watch) => watch.watch_id)).toContain(
      opened.record.watch_id,
    );
  });

  it("leaves a watch opened before the field existed unclaimable, not invented", async () => {
    /*
     * Backfilling a payer onto an old watch would be guessing whose
     * money it was, which is the one thing this store will not do
     * with a record. The door says so instead — the history URL still
     * works forever for whoever kept it.
     */
    const legacyId = "watch_legacy0000";
    await testEnv.ORDERS.put(
      KV_KEYS.standingWatch(legacyId),
      JSON.stringify({
        watch_id: legacyId,
        url: "https://old.example/api",
        started_at: "2026-08-01T00:00:00.000Z",
        ends_at: "2026-08-08T00:00:00.000Z",
        probes: [],
      }),
    );
    const found = await watchesForPayer(testEnv, PAYER);
    expect(found.watches.map((watch) => watch.watch_id)).not.toContain(
      legacyId,
    );
  });
});

/**
 * THE WEEK, LEGIBLE. The keeper asked what he would actually SEE on
 * the day a watch completes and sketched an hour-by-hour column of
 * verdicts — which is exactly what the probes are, never rendered.
 * Showing anyone a week of signed observation meant showing them raw
 * JSON until 2026-08-21.
 */
describe("a watch history a person can read", () => {
  it("renders the hours as a table and keeps the four verdicts apart", async () => {
    const { SELF } = await import("cloudflare:test");
    const opened = await startWatch(
      testEnv,
      "https://rendered.example/api",
      PAYER,
    );
    // Two hours of observation, one of them the refusal that is OURS.
    const stored = await testEnv.ORDERS.get<{ probes: unknown[] }>(
      KV_KEYS.standingWatch(opened.record.watch_id),
      "json",
    );
    // Started six hours ago with only two probes recorded, so the
    // watcher's OWN missing hours are real and have to show.
    const startedAt = new Date(Date.now() - 6 * 3600_000).toISOString();
    await testEnv.ORDERS.put(
      KV_KEYS.standingWatch(opened.record.watch_id),
      JSON.stringify({
        ...stored,
        started_at: startedAt,
        probes: [
          {
            at: "2026-08-21T19:00:00.000Z",
            verdict: "ready",
            status: 402,
            latency_ms: 120,
            failed: [],
            signature: "a".repeat(128),
            public_key: "b".repeat(64),
          },
          {
            at: "2026-08-21T20:00:00.000Z",
            verdict: "not_ready",
            status: 200,
            latency_ms: 95,
            failed: ["status-402"],
            signature: "c".repeat(128),
            public_key: "b".repeat(64),
          },
        ],
      }),
    );
    const page = await SELF.fetch(
      `https://scvd.store/api/watch/${opened.record.watch_id}`,
      { headers: { Accept: "text/html" } },
    );
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain("2026-08-21 19:00");
    expect(html).toContain("2026-08-21 20:00");
    expect(html).toContain("ready");
    expect(html).toContain("not ready");
    expect(html).toContain("status-402");
    // The watcher's own gaps ride the page, never only the JSON —
    // a history that hides the watcher's absences is vouching for
    // hours nobody watched.
    expect(html).toContain("nobody probed");
    expect(html).toContain("ours, not the endpoint");
    // And the JSON twin still serves the contract untouched.
    const json = await SELF.fetch(
      `https://scvd.store/api/watch/${opened.record.watch_id}`,
    );
    const body = (await json.json()) as { probes: unknown[] };
    expect(body.probes).toHaveLength(2);
  });

  it("points a lost watch id at the claims door instead of a dead end", async () => {
    const { SELF } = await import("cloudflare:test");
    const missing = await SELF.fetch("https://scvd.store/api/watch/watch_nope");
    expect(missing.status).toBe(404);
    const body = (await missing.json()) as { error: string };
    expect(body.error).toContain("/api/claims");
  });
});
