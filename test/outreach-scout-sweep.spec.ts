import { env } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { KV_KEYS } from "@/lib/kv-keys";
import {
  SCOUT_CAP,
  SCOUT_SWEEP_CAP,
  scoutContacts,
  scoutSweep,
  writeOutreachLedger,
} from "@/services/outreach";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;

/**
 * SCOUTING ON A CLOCK (2026-09-10). The keeper: "its taking me fucking
 * forever to manually press 25 at a time and then ill re run a walk
 * and number will go up".
 *
 * The second clause is the real defect, and it is why a hand could
 * never finish: the unscouted pile is re-derived from the latest round
 * on every read, and the long walk keeps adding hosts to that round.
 * A keeper pressing 25 was racing a number that grows on its own.
 *
 * These hold the two properties that make the clock safe to trust: a
 * pass resumes with no cursor to lose, and it never re-knocks a host
 * it has already read.
 */

async function clear(): Promise<void> {
  await testEnv.COUNTERS.delete(KV_KEYS.outreachLedger);
  await testEnv.COUNTERS.delete(KV_KEYS.wardRoundLatest);
}

afterEach(clear);

describe("the contact scout runs itself", () => {
  it("returns nothing rather than inventing work when no round exists", async () => {
    expect(await scoutSweep(testEnv)).toBeNull();
  });

  /**
   * NO CURSOR, AND THAT IS THE DESIGN. `scouted_at` has always been
   * the durable done-marker, so a pass resumes wherever the last one
   * stopped with no state to keep, corrupt or reset — and a host read
   * once is never paid for twice.
   */
  it("skips hosts already carrying a scouted_at, so passes resume for free", async () => {
    const ledger = {
      version: 1 as const,
      hosts: {
        "done.example": { scouted_at: "2026-09-01T00:00:00.000Z" },
      },
    };
    /*
     * scoutContacts filters BEFORE any fetch, so an already-scouted
     * host must not reach the slice at all. The stub would record a
     * knock if one happened; none should.
     */
    const knocked: string[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      knocked.push(String(input));
      return new Response("", { status: 404 });
    });
    try {
      const report = await scoutContacts(
        testEnv,
        [{ host: "done.example" }],
        ledger,
        SCOUT_SWEEP_CAP,
      );
      expect(report.looked).toBe(0);
      expect(report.remaining).toBe(0);
      expect(knocked).toEqual([]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("never reads more in one pass than a keeper's own press would", () => {
    // The unattended pass may be gentler than a press, never greedier:
    // the ceiling was always the invocation's budget, not caution.
    expect(SCOUT_SWEEP_CAP).toBeLessThanOrEqual(SCOUT_CAP);
    expect(SCOUT_SWEEP_CAP).toBeGreaterThan(0);
  });

  /**
   * THE CAP IS A CEILING, NOT A TARGET. A caller asking for more than
   * a press's worth is clamped rather than obeyed, so no future caller
   * can turn one tick into a thousand outbound knocks.
   *
   * The knock is stubbed: this asserts how many hosts the scout
   * DECIDES to read, which is the property under test. Letting it
   * resolve real names would test the network instead.
   */
  it("clamps a caller that asks for more than the press ceiling", async () => {
    const knocked: string[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      knocked.push(String(input));
      return new Response("", { status: 404 });
    });
    try {
      const rows = Array.from({ length: 200 }, (_unused, index) => ({
        host: `h${index}.example`,
      }));
      const report = await scoutContacts(
        testEnv,
        rows,
        { version: 1, hosts: {} },
        10_000,
      );
      expect(report.looked).toBe(SCOUT_CAP);
      expect(report.remaining).toBe(rows.length - SCOUT_CAP);
      // Two paths per host at most, and never a host beyond the slice.
      expect(new Set(knocked.map((url) => new URL(url).host)).size).toBe(
        SCOUT_CAP,
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("counts a host once even when both queues name it", async () => {
    vi.stubGlobal("fetch", async () => new Response("", { status: 404 }));
    try {
      const report = await scoutContacts(
        testEnv,
        [{ host: "dup.example" }, { host: "dup.example" }],
        { version: 1, hosts: {} },
        SCOUT_SWEEP_CAP,
      );
      expect(report.looked).toBe(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
