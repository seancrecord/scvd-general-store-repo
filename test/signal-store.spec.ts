import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { signalStore } from "@/services/signal-store";
import { concentrationHistogram, subjectFormatCounts, subjectTotals } from "@/lib/signal-histogram";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;

/**
 * THE SIGNAL STORE (2026-09-21): one writer, one statement per bump,
 * a cap that returns with the reading, months reaped. And the
 * histogram the public surface derives from it, held to the same
 * rows the admin page reads.
 */

describe("the signal store", () => {
  beforeEach(async () => {
    await signalStore(testEnv)!.reset();
  });

  it("is bound in the suite", () => {
    expect(signalStore(testEnv)).toBeDefined();
  });

  it("counts sixty concurrent bumps as sixty", async () => {
    const store = signalStore(testEnv)!;
    await Promise.all(Array.from({ length: 60 }, () => store.bump({ month: "2026-09", kind: "subjects", entry: "a.example:html" })));
    expect((await store.readKind("2026-09", "subjects"))["a.example:html"]).toBe(60);
  });

  it("keeps a capped map's overflow in other and says so", async () => {
    const store = signalStore(testEnv)!;
    for (let i = 0; i < 5; i++) await store.bump({ month: "2026-09", kind: "referrers", entry: `host-${i}.example`, cap: 3 });
    const map = await store.readKind("2026-09", "referrers");
    expect(Object.keys(map).filter((k) => k !== "other")).toHaveLength(3);
    expect(map["other"]).toBe(2);
    // An existing entry still counts past the cap; only a NEW key overflows.
    await store.bump({ month: "2026-09", kind: "referrers", entry: "host-0.example", cap: 3 });
    expect((await store.readKind("2026-09", "referrers"))["host-0.example"]).toBe(2);
  });

  it("reads a whole month in one call and keeps months apart", async () => {
    const store = signalStore(testEnv)!;
    await store.bump({ month: "2026-09", kind: "pages", entry: "corpus_host:html:browser:none" });
    await store.bump({ month: "2026-08", kind: "pages", entry: "corpus_host:html:browser:none" });
    const month = await store.readMonth("2026-09");
    expect(month["pages"]).toEqual({ "corpus_host:html:browser:none": 1 });
    expect(await store.readMonth("2026-07")).toEqual({});
  });

  it("reaps months past the keep window and nothing inside it", async () => {
    const store = signalStore(testEnv)!;
    await store.bump({ month: "2025-01", kind: "pages", entry: "x" });
    await store.bump({ month: "2026-09", kind: "pages", entry: "x" });
    expect(await store.reap(new Date("2026-09-21T00:00:00Z"))).toBe(1);
    expect(await store.readMonth("2025-01")).toEqual({});
    expect((await store.readMonth("2026-09"))["pages"]).toEqual({ x: 1 });
  });
});

describe("the concentration histogram", () => {
  it("derives totals, formats and thresholds from the per-format map, other kept aside", () => {
    const map = {
      "a.example:html": 1, // one format, one read: a sweep's signature
      "b.example:html": 3,
      "b.example:json": 2, // two formats, five reads
      "c.example:html": 4,
      "c.example:json": 4,
      "c.example:markdown": 4, // three formats, twelve reads
      other: 7,
    };
    expect(subjectTotals(map)).toEqual({ "a.example": 1, "b.example": 5, "c.example": 12, other: 7 });
    expect(subjectFormatCounts(map)).toEqual({ "a.example": 1, "b.example": 2, "c.example": 3 });
    expect(concentrationHistogram(map)).toEqual({
      subjects: 3,
      by_formats: { one: 1, two: 1, three: 1 },
      repeat: { at_least_2: 2, at_least_5: 2, at_least_10: 1 },
      reads: 18,
      overflow: 7,
    });
  });

  it("handles a subject with a port and an empty map", () => {
    expect(subjectTotals({ "a.example:8080:json": 2 })).toEqual({ "a.example:8080": 2 });
    expect(concentrationHistogram({})).toEqual({
      subjects: 0,
      by_formats: { one: 0, two: 0, three: 0 },
      repeat: { at_least_2: 0, at_least_5: 0, at_least_10: 0 },
      reads: 0,
      overflow: 0,
    });
  });
});
