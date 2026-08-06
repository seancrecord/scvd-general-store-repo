import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { KV_KEYS } from "@/lib/kv-keys";
import { readVisitorsRegister } from "@/lib/register";
import { sweepPhantomChecks, readPhantomCheck } from "@/services/phantom";
import { treatsThisWeek } from "@/services/porch";
import type { Env, PhantomCheckRecord } from "@/types";

const testEnv = env as unknown as Env;

/**
 * THE WALKS THAT STOPPED READING ONE KEY AT A TIME.
 *
 * CI had been red on main since 2026-08-05 — not on the suite, which
 * was green, but on the store's own scalability audit: a dozen
 * list-then-read-each loops against a budget of ten. A budget raised
 * to make a red light green is a budget that means nothing, so three
 * of the loops were converted to bulk reads instead.
 *
 * A refactor of a hot path deserves the check the refactor could
 * break, and none of these three had one. What matters is not that the
 * reads are bulk — that is what the audit measures — but that the
 * ANSWERS did not move: the same bearers, in the same order, with the
 * same weeks; the same treat total across a week; the same checks
 * observed and, more importantly, the same ones left alone.
 */
describe("bulk reads return exactly what the per-key loops did", () => {
  it("reads every named card in the register, in list order, weeks intact", async () => {
    await testEnv.PATRONS.put(
      KV_KEYS.stampCard("ada-lovelace"),
      JSON.stringify(["2026-W30", "2026-W31"]),
    );
    await testEnv.PATRONS.put(KV_KEYS.stampCard("grace-hopper"), JSON.stringify([]));
    // A row that is not valid JSON has always degraded to "no weeks"
    // rather than failing the page. Read as text so it still does.
    await testEnv.PATRONS.put(KV_KEYS.stampCard("bad-row"), "{not json");

    const register = await readVisitorsRegister(testEnv);
    const names = register.bearers.map((bearer) => bearer.name);
    // The order is the key listing's, which a bulk read must not
    // scramble — the register is read top to bottom by a person.
    expect(names).toEqual(["ada lovelace", "bad row", "grace hopper"]);

    const ada = register.bearers.find((bearer) => bearer.name === "ada lovelace");
    expect(ada?.weeks).toEqual(["2026-W30", "2026-W31"]);
    const broken = register.bearers.find((bearer) => bearer.name === "bad row");
    expect(broken?.weeks).toEqual([]);
  });

  it("sums the week's treats across days, counting a missing day as none", async () => {
    const day = (daysBack: number): string => {
      const date = new Date();
      date.setUTCDate(date.getUTCDate() - daysBack);
      return date.toISOString().slice(0, 10);
    };
    await testEnv.COUNTERS.put(KV_KEYS.porchTreats(day(0)), "2");
    await testEnv.COUNTERS.put(KV_KEYS.porchTreats(day(3)), "5");
    // Day 6 is inside the window and unwritten; day 7 is outside it and
    // must not be counted however large it is.
    await testEnv.COUNTERS.put(KV_KEYS.porchTreats(day(7)), "99");

    expect(await treatsThisWeek(testEnv)).toBe(7);
  });

  it("observes the checks that came due and leaves every other one alone", async () => {
    const write = async (
      id: string,
      dueAt: string,
      status: PhantomCheckRecord["status"],
    ): Promise<void> => {
      const record: PhantomCheckRecord = {
        check_id: id,
        target: "http://127.0.0.1:1/nothing",
        purchased_at: new Date(Date.now() - 86400_000).toISOString(),
        due_at: dueAt,
        status,
      };
      await testEnv.ORDERS.put(
        KV_KEYS.phantomCheck(id),
        JSON.stringify(record),
      );
    };
    const hourAgo = new Date(Date.now() - 3600_000).toISOString();
    const nextWeek = new Date(Date.now() + 7 * 86400_000).toISOString();
    await write("due-now", hourAgo, "scheduled");
    await write("not-yet", nextWeek, "scheduled");
    await write("already-done", hourAgo, "observed");

    const observed = await sweepPhantomChecks(testEnv);
    expect(observed).toBe(1);

    // The due one was walked and signed. Whether the door answered is
    // not the claim — an unreachable target is a real observation and
    // the record says so either way.
    const due = await readPhantomCheck(testEnv, "due-now");
    expect(due?.status).toBe("observed");
    expect(due?.observation?.note).toBeTruthy();
    expect(due?.signature).toBeTruthy();

    // The one that has not come due is untouched: a walk that observed
    // it early would be signing for something it never saw.
    const early = await readPhantomCheck(testEnv, "not-yet");
    expect(early?.status).toBe("scheduled");
    expect(early?.observation).toBeUndefined();

    // And an already-observed check is never walked twice.
    const done = await readPhantomCheck(testEnv, "already-done");
    expect(done?.observation).toBeUndefined();
  });
});
