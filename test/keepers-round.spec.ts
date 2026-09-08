import { SELF, env } from "cloudflare:test";
import { afterEach, describe, expect, it } from "vitest";
import { KV_KEYS } from "@/lib/kv-keys";
import { buildRegistryWeek } from "@/services/registry-pulse";
import { missingWeeks, readKeepersRound } from "@/services/keepers-round";
import type { WardHostResult, WardRound } from "@/services/ward-round";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";
const AUTH = {
  Authorization: `Basic ${btoa(`keeper:${testEnv.ADMIN_PASSWORD}`)}`,
};
const BROWSER = { ...AUTH, Accept: "text/html" };
const NOW = new Date("2026-09-08T12:00:00.000Z");

/**
 * THE ROUND (2026-09-08). The office had every number and no answer to
 * the two questions a keeper opens it with: is anything stuck, and
 * what do I owe. These tests hold the two properties that make the
 * answer worth trusting.
 *
 * ONE: SILENCE IS NEVER RENDERED AS HEALTH. A machine that never ran,
 * and a shelf that would not load, must both be legible AS THAT — not
 * as a zero, not as a blank, and never as "fresh". A summary page that
 * gets this wrong is worse than no summary page, because it is the
 * page that stops anybody looking further.
 *
 * TWO: A PRESS CARRIES ITS REASON. Every line under "what you owe"
 * names the figure that produced it, so the keeper is never asked to
 * take the page's word for the work.
 */

function host(name: string, verdict: WardHostResult["verdict"]): WardHostResult {
  return {
    host: name,
    url: `https://${name}/api/x`,
    verdict,
    failed: [],
    advisories: [],
  };
}

function round(week: string, at: string): WardRound {
  return {
    week,
    at,
    listed_resources: 2,
    coverage_suspect: false,
    capped: false,
    our_search_presence: true,
    hosts: [host("a.example", "ready"), host("dead.example", "unreachable")],
  };
}

async function clear(): Promise<void> {
  for (const key of [
    KV_KEYS.wardRoundLatest,
    KV_KEYS.wardRoundPrevious,
    KV_KEYS.registryPulse,
    KV_KEYS.mcpWalkState,
    KV_KEYS.longWalkState,
  ]) {
    await testEnv.COUNTERS.delete(key);
  }
  const bounties = await testEnv.COUNTERS.list({ prefix: "bounty" });
  for (const key of bounties.keys) await testEnv.COUNTERS.delete(key.name);
}

afterEach(clear);

describe("the round says what ran and what is owed", () => {
  it("renders an empty store as never-ran, never as healthy zeros", async () => {
    const reading = await readKeepersRound(testEnv, NOW);
    expect(reading.rows.length).toBeGreaterThan(5);
    for (const row of reading.rows) {
      expect(
        ["never", "unknown", "due", "late"],
        `${row.name} reads as fresh on an empty store`,
      ).toContain(row.state);
      expect(row.detail.length, row.name).toBeGreaterThan(0);
    }
    // And the room renders that reading rather than an empty table.
    const html = await (
      await SELF.fetch(`${BASE}/admin/round`, { headers: BROWSER })
    ).text();
    expect(html).toContain("The round");
    expect(html).toContain("never ran");
  });

  /**
   * THE KEEPER'S OWN COMPLAINT, 2026-09-08: "the registry posted w35 to
   * the site but then i go in and only see w37 available for publish…
   * now we have a gap. whys that not updated automatically… i guess it
   * backfills". It does not backfill: publishRegistryWeek builds from
   * the LATEST round only, so a week nobody published cannot be
   * published later from the market page at all. The round has to say
   * that in the same breath as the gap, or the next reader guesses the
   * flattering answer again.
   */
  it("names the registry gap by week, and says a missed week cannot be pressed later", async () => {
    await testEnv.COUNTERS.put(
      KV_KEYS.wardRoundLatest,
      JSON.stringify(round("2026-W37", "2026-09-06T11:00:00.000Z")),
    );
    await testEnv.COUNTERS.put(
      KV_KEYS.registryPulse,
      JSON.stringify({
        version: 1,
        weeks: [
          buildRegistryWeek(
            round("2026-W35", "2026-08-23T11:00:00.000Z"),
            "2026-08-23T12:00:00.000Z",
          ),
        ],
      }),
    );
    const reading = await readKeepersRound(testEnv, NOW);
    const press = reading.presses.find((entry) =>
      entry.what.includes("registry week"),
    );
    expect(press, "no press was raised for the unpublished week").toBeTruthy();
    expect(press?.why).toContain("2026-W36");
    expect(press?.why).toContain("cannot be published");
    expect(press?.urgent).toBe(true);

    const registry = reading.rows.find((row) => row.name.includes("registry"));
    expect(registry?.detail).toContain("2026-W35");
    expect(registry?.detail).toContain("2026-W37");
    expect(registry?.state).toBe("due");
  });

  it("counts the weeks between two publishes, and stops at a year", () => {
    expect(missingWeeks("2026-W35", "2026-W37")).toEqual(["2026-W36"]);
    expect(missingWeeks("2026-W35", "2026-W36")).toEqual([]);
    expect(missingWeeks("2026-W37", "2026-W35")).toEqual([]);
    expect(missingWeeks("nonsense", "2026-W37")).toEqual([]);
    expect(missingWeeks("2024-W01", "2026-W37").length).toBeLessThanOrEqual(52);
  });

  /**
   * "BOUNTY DONE, NEEDS A NEW BOUNTY" — the keeper's actual sentence.
   * An empty board with budget left is work owed, and the press has to
   * carry the money figure or it is a nag.
   */
  it("asks for bounties when the board is empty and the week has budget", async () => {
    const reading = await readKeepersRound(
      { ...testEnv, FIELD_WALLET_KEY: `0x${"01".repeat(32)}` } as Env,
      NOW,
    );
    const board = reading.rows.find((row) => row.name.includes("bounty"));
    expect(board?.detail).toContain("0 open");
    const press = reading.presses.find((entry) =>
      entry.what.toLowerCase().includes("bount"),
    );
    expect(press?.what).toContain("board is empty");
    expect(press?.why).toContain("$");
  });

  it("says payouts are paused rather than showing an idle board", async () => {
    const reading = await readKeepersRound(
      { ...testEnv, FIELD_WALLET_KEY: undefined } as Env,
      NOW,
    );
    const board = reading.rows.find((row) => row.name.includes("bounty"));
    expect(board?.detail).toContain("payouts PAUSED");
    expect(
      reading.presses.some((entry) => entry.what.includes("field wallet")),
    ).toBe(true);
  });

  /**
   * A SHELF THAT THROWS IS NOT A SHELF THAT SAYS ZERO. The whole page
   * exists to make a stopped machine visible; a storage failure that
   * rendered as "nothing to report" would hide exactly what it was
   * built to show.
   */
  it("reads a broken store as unknown, names it, and still renders", async () => {
    const broken = {
      ...testEnv,
      COUNTERS: {
        ...testEnv.COUNTERS,
        get: async () => {
          throw new Error("KV is having a day");
        },
        list: async () => {
          throw new Error("KV is having a day");
        },
      },
    } as unknown as Env;
    const reading = await readKeepersRound(broken, NOW);
    expect(reading.notes.length).toBeGreaterThan(0);
    const unknown = reading.rows.filter((row) => row.state === "unknown");
    expect(unknown.length).toBeGreaterThan(0);
    for (const row of unknown) {
      expect(row.detail, row.name).toContain("not read");
      expect(row.last_at).toBeNull();
    }
    expect(reading.rows.some((row) => row.state === "fresh")).toBe(false);
  });

  it("serves JSON to anything that polls and the room to a browser", async () => {
    const json = await SELF.fetch(`${BASE}/admin/round`, { headers: AUTH });
    expect(json.status).toBe(200);
    const body = (await json.json()) as { rows: unknown[]; presses: unknown[] };
    expect(Array.isArray(body.rows)).toBe(true);
    expect(Array.isArray(body.presses)).toBe(true);
    const html = await SELF.fetch(`${BASE}/admin/round`, { headers: BROWSER });
    expect((await html.text()).startsWith("<!DOCTYPE html>")).toBe(true);
    // And the door is shut, like every other room in the office.
    expect(
      (await SELF.fetch(`${BASE}/admin/round`, {
        headers: { "CF-Connecting-IP": "192.0.2.201" },
      })).status,
    ).toBe(401);
  });
});
