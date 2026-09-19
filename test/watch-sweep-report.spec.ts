import { env } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { sweepWatches, watchSweepGaps, type WatchSweepReport } from "@/services/watch-sweep";
import type { Env } from "@/types";

/**
 * WHAT A PASS SAW, NOT ONLY WHAT IT DID (rule 52).
 *
 * The shared sweep returned one number and the cron dropped it, so a
 * pass that observed nothing because nothing was due, one whose shelf
 * listing hit its cap, one whose every record was unreadable and one
 * that ran out of budget all read the same from outside — and only a
 * throw alerted. Three paid term services ride it. This holds each
 * outcome to its own line of the report, and holds the alert to the
 * two lines that are the store's gap and never to the two that are
 * the design working.
 */
const fault = vi.hoisted(() => ({ truncated: false }));
vi.mock("@/lib/kv-list", async (original) => {
  const actual = await original<typeof import("@/lib/kv-list")>();
  return { ...actual, listKeys: async (...args: Parameters<typeof actual.listKeys>) => {
    const result = await actual.listKeys(...args);
    return fault.truncated && args[1].prefix === PREFIX ? { ...result, truncated: true } : result;
  } };
});

const testEnv = env as unknown as Env;
const PREFIX = "sweep-report-test:";
interface Row { ends_at: string; entries: { at: string }[] }
const NOW = Date.parse("2026-09-19T03:00:00.000Z");
const iso = (offsetMs: number) => new Date(NOW + offsetMs).toISOString();

async function seed(rows: Record<string, Row | string>) {
  for (const [name, row] of Object.entries(rows)) {
    await testEnv.ORDERS.put(PREFIX + name, typeof row === "string" ? row : JSON.stringify(row));
  }
}
async function clear() {
  const listed = await testEnv.ORDERS.list({ prefix: PREFIX });
  for (const key of listed.keys) await testEnv.ORDERS.delete(key.name);
}
afterEach(async () => { fault.truncated = false; await clear(); });

function sweep(options: { budget?: number } = {}) {
  return sweepWatches<Row, { at: string }>({
    kv: testEnv.ORDERS, prefix: PREFIX, scanCap: 100, minSpacingMs: 3_600_000, now: NOW,
    entriesOf: (row) => row.entries,
    observe: async () => ({ at: iso(0) }),
    ...options,
  });
}

describe("the sweep reports what it could not see", () => {
  it("counts the due, the ended, the recently observed and the unreadable on their own lines", async () => {
    await seed({
      due: { ends_at: iso(86_400_000), entries: [] },
      ended: { ends_at: iso(-1), entries: [] },
      recent: { ends_at: iso(86_400_000), entries: [{ at: iso(-60_000) }] },
      garbage: "not json at all",
    });
    const report = await sweep();
    expect(report).toEqual<WatchSweepReport>({ worked: 1, listed: 4, truncated: false, unreadable: 1, ended: 1, spaced: 1, budget_stopped: false });
    // The unreadable key was skipped, not worked and not rewritten.
    expect(await testEnv.ORDERS.get(PREFIX + "garbage")).toBe("not json at all");
  });

  it("says when the budget stopped it with due records still unread", async () => {
    await seed({ a: { ends_at: iso(86_400_000), entries: [] }, b: { ends_at: iso(86_400_000), entries: [] } });
    const report = await sweep({ budget: 1 });
    expect(report.worked).toBe(1);
    expect(report.budget_stopped).toBe(true);
  });

  it("says when the shelf walk hit its cap", async () => {
    await seed({ a: { ends_at: iso(86_400_000), entries: [] } });
    fault.truncated = true;
    expect((await sweep()).truncated).toBe(true);
  });
});

describe("the cron pages on the store's gaps and never on the design working", () => {
  const whole: WatchSweepReport = { worked: 3, listed: 5, truncated: false, unreadable: 0, ended: 1, spaced: 1, budget_stopped: false };
  it("a whole pass is no alert, and neither is a spent budget or a spacing skip", () => {
    expect(watchSweepGaps("standing watch", whole)).toBeNull();
    expect(watchSweepGaps("operator statement", { ...whole, budget_stopped: true, spaced: 40 })).toBeNull();
    expect(watchSweepGaps("standing watch", { ...whole, worked: 0 })).toBeNull();
  });
  it("a truncated walk and an unreadable record each page, deduped by kind and gap", () => {
    const truncated = watchSweepGaps("standing watch", { ...whole, truncated: true });
    expect(truncated?.key).toBe("watch-sweep-standing watch-truncated");
    expect(truncated?.detail).toContain("hit its cap at 5 keys");
    const unreadable = watchSweepGaps("conformance watch", { ...whole, unreadable: 2 });
    expect(unreadable?.key).toBe("watch-sweep-conformance watch-unreadable");
    expect(unreadable?.detail).toContain("2 of 5 listed records could not be read");
    expect(unreadable?.detail).toContain("days_unchecked");
    const both = watchSweepGaps("operator statement", { ...whole, truncated: true, unreadable: 1 });
    expect(both?.key).toBe("watch-sweep-operator statement-truncatedunreadable");
  });
});
