import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { declineMatches, filterIsActive, readDeclines, traceClient } from "@/lib/declines";
import type { MetricEvent } from "@/lib/metrics";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;

let seq = 0;
async function seedIndexRow(event: MetricEvent): Promise<void> {
  seq += 1;
  // Inverted timestamp: newest first, the order the desk reads in.
  const stamp = Date.parse(event.at);
  const inverted = String(10_000_000_000_000 - stamp).padStart(14, "0");
  await testEnv.COUNTERS.put(
    `declevt:${inverted}:${seq.toString(36).padStart(6, "0")}`,
    JSON.stringify(event),
  );
}

function decline(partial: Partial<MetricEvent>): MetricEvent {
  return {
    kind: "decline",
    item: "hello",
    channel: "direct",
    house: false,
    at: "2026-09-16T12:00:00.000Z",
    ...partial,
  };
}

beforeEach(async () => {
  for (const prefix of ["declevt:", "evt:"]) {
    const listed = await testEnv.COUNTERS.list({ prefix });
    for (const key of listed.keys) await testEnv.COUNTERS.delete(key.name);
  }
});

/**
 * THE DAY THE DESK OUTGREW ITS OWN CAP. The index solved a cap spent
 * on corpus reads; it does not solve a cap spent on DECLINES. When one
 * day books more of them than the scan reads, everything older sits
 * beyond reach — and the burst the keeper wants is always the older
 * one, because that is what a burst becomes.
 */
describe("reaching a burst that sits behind a newer flood", () => {
  it("walks past the flood to the rows that were asked for", async () => {
    // The flood: newer, numerous, and not what anyone asked about.
    for (let i = 0; i < 60; i += 1) {
      await seedIndexRow(
        decline({
          at: `2026-09-16T12:${String(i % 60).padStart(2, "0")}:00.000Z`,
          item: "spot_check",
          note: "local:input_missing:host",
          user_agent: "some-monitor/1.0",
        }),
      );
    }
    // The burst: older, and behind all of it.
    for (let i = 0; i < 3; i += 1) {
      await seedIndexRow(
        decline({
          at: `2026-09-15T04:07:${String(20 + i).padStart(2, "0")}.000Z`,
          item: "small_blessing",
          note: "local:requirement_mismatch:amount",
          user_agent: "node",
        }),
      );
    }

    // A cap too small to reach yesterday unaided.
    const blind = await readDeclines(testEnv, 10);
    expect(blind.declines.some((row) => row.user_agent === "node")).toBe(false);

    // The same small cap, with the question asked.
    const found = await readDeclines(testEnv, 10, { ua: "node" });
    expect(found.declines).toHaveLength(3);
    for (const row of found.declines) {
      expect(row.item).toBe("small_blessing");
    }
  });

  it("narrows by item, reason and date window", async () => {
    await seedIndexRow(
      decline({ at: "2026-09-15T04:07:30.000Z", item: "small_blessing", note: "local:requirement_mismatch:amount", user_agent: "node" }),
    );
    await seedIndexRow(
      decline({ at: "2026-09-16T09:00:00.000Z", item: "hello", note: "invalid_payload", user_agent: "node" }),
    );

    expect((await readDeclines(testEnv, 50, { item: "small_blessing" })).declines).toHaveLength(1);
    expect((await readDeclines(testEnv, 50, { reason: "invalid_payload" })).declines).toHaveLength(1);
    expect(
      (await readDeclines(testEnv, 50, { before: "2026-09-16T00:00:00.000Z" })).declines,
    ).toHaveLength(1);
    expect(
      (await readDeclines(testEnv, 50, { since: "2026-09-16T00:00:00.000Z" })).declines,
    ).toHaveLength(1);
  });

  /**
   * NOT FOUND AND NOT REACHED ARE DIFFERENT ANSWERS — the sentence
   * this desk already lives by, applied to the filter.
   */
  it("reports how far it reached, so an empty result is not a denial", async () => {
    await seedIndexRow(decline({ at: "2026-09-16T09:00:00.000Z", user_agent: "node" }));
    const report = await readDeclines(testEnv, 50, { ua: "nobody-here" });
    expect(report.declines).toHaveLength(0);
    // It saw the row; it just did not match. Reach is still recorded.
    expect(report.oldest_row_seen).toBe("2026-09-16T09:00:00.000Z");
    expect(report.filter).toEqual({ ua: "nobody-here" });
  });

  it("leaves the unfiltered desk exactly as it was", async () => {
    await seedIndexRow(decline({ at: "2026-09-16T09:00:00.000Z", user_agent: "node" }));
    const report = await readDeclines(testEnv);
    expect(report.filter).toBeUndefined();
    expect(report.declines).toHaveLength(1);
  });
});

describe("what counts as a match", () => {
  const row = {
    item: "small_blessing",
    at: "2026-09-15T04:07:30.000Z",
    user_agent: "node",
    note: "local:requirement_mismatch:amount",
  };

  it("an absent field never narrows", () => {
    expect(filterIsActive(undefined)).toBe(false);
    expect(filterIsActive({})).toBe(false);
    expect(declineMatches(row, {})).toBe(true);
  });

  it("matches the client and reason on substring, case-insensitively", () => {
    expect(declineMatches(row, { ua: "NODE" })).toBe(true);
    expect(declineMatches(row, { reason: "MISMATCH" })).toBe(true);
    expect(declineMatches(row, { ua: "python" })).toBe(false);
  });

  it("matches the item exactly, so one door is not another's prefix", () => {
    expect(declineMatches(row, { item: "small_blessing" })).toBe(true);
    expect(declineMatches(row, { item: "small" })).toBe(false);
  });

  it("finds the bare no-user-agent row by name", () => {
    expect(declineMatches({ ...row, user_agent: undefined }, { ua: "no user-agent" })).toBe(true);
  });

  it("treats the window as since-inclusive and before-exclusive", () => {
    expect(declineMatches(row, { since: "2026-09-15T04:07:30.000Z" })).toBe(true);
    expect(declineMatches(row, { before: "2026-09-15T04:07:30.000Z" })).toBe(false);
  });
});

/**
 * THE TRACE IS WHAT ACTUALLY COULD NOT REACH. The desk reads the
 * index, where 37 declines fit in any cap. The trace reads the raw
 * stream, where a decline is one row in thousands of openapi.json
 * reads — about two hours on a store being walked at catalogue speed.
 */
describe("tracing one client back past a day of catalogue traffic", () => {
  async function seedRaw(event: MetricEvent): Promise<void> {
    seq += 1;
    const inverted = String(10_000_000_000_000 - Date.parse(event.at)).padStart(14, "0");
    await testEnv.COUNTERS.put(
      `evt:${inverted}:${seq.toString(36).padStart(6, "0")}`,
      JSON.stringify(event),
    );
  }

  it("walks past today's noise to yesterday's burst", async () => {
    // Today: the catalogue walk that eats a flat cap.
    for (let i = 0; i < 40; i += 1) {
      await seedRaw({
        kind: "challenge",
        item: "openapi.json",
        channel: "direct",
        house: false,
        at: `2026-09-16T13:${String(i % 60).padStart(2, "0")}:00.000Z`,
        user_agent: "node",
      } as MetricEvent);
    }
    // Yesterday: what the keeper is actually looking for.
    await seedRaw({
      kind: "challenge",
      item: "small_blessing",
      channel: "direct",
      house: false,
      at: "2026-09-15T04:07:00.000Z",
      user_agent: "node",
    } as MetricEvent);

    // The flat trace returns the whole trail — today's noise included,
    // which is what buries the day you wanted at real volume. (The cap
    // itself is not simulable here: one KV list page holds far more
    // rows than a test seeds, so the scan completes before it bites.)
    const flat = await traceClient(testEnv, "node", 10);
    expect(flat.events.length).toBeGreaterThan(40);
    expect(flat.window).toBeUndefined();

    const windowed = await traceClient(testEnv, "node", 10, {
      since: "2026-09-15T00:00:00.000Z",
      before: "2026-09-16T00:00:00.000Z",
    });
    expect(windowed.events).toHaveLength(1);
    expect(windowed.events[0]!.item).toBe("small_blessing");
  });

  /**
   * Stopping at the window is not running out of budget, and a page
   * that conflates them claims a reach it never had.
   */
  it("does not report a windowed stop as a cap", async () => {
    await seedRaw({
      kind: "challenge", item: "hello", channel: "direct", house: false,
      at: "2026-09-16T13:00:00.000Z", user_agent: "node",
    } as MetricEvent);
    await seedRaw({
      kind: "challenge", item: "hello", channel: "direct", house: false,
      at: "2026-09-14T13:00:00.000Z", user_agent: "node",
    } as MetricEvent);

    const windowed = await traceClient(testEnv, "node", 5000, {
      since: "2026-09-15T00:00:00.000Z",
    });
    expect(windowed.capped).toBe(false);
    expect(windowed.window).toEqual({ since: "2026-09-15T00:00:00.000Z" });
    // The older row is outside the window and must not appear.
    expect(windowed.events).toHaveLength(1);
  });

  it("leaves the bare trace exactly as it was", async () => {
    await seedRaw({
      kind: "challenge", item: "hello", channel: "direct", house: false,
      at: "2026-09-16T13:00:00.000Z", user_agent: "node",
    } as MetricEvent);
    const bare = await traceClient(testEnv, "node");
    expect(bare.window).toBeUndefined();
    expect(bare.events).toHaveLength(1);
  });
});
