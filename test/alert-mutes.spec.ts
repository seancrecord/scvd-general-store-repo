import { env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ALERT_CONDITIONS, ALL_CONDITIONS, listAlerts, sendAlert } from "@/lib/alerts";
import { listMutes, muteAlarm, unmuteAlarm } from "@/lib/alert-mutes";
import type { Env } from "@/types";

/**
 * TURNING OFF ONE ALARM WITHOUT TURNING OFF THE ALARM.
 *
 * The keeper, 2026-09-15: "I don't want to get this particular alarm
 * anymore." The two things that must both be true afterwards are the
 * whole of this file — the email stops, and the store does not go
 * quiet. Every prior alerting defect here was the second half failing
 * while the first half looked fine.
 *
 * The alarm he was holding that day has since left the paging channel
 * entirely, which was the better answer for that one
 * (test/desk-conditions.spec.ts pins it). What is pinned HERE is the
 * lever for everything that still pages and still might be one alarm
 * too many on a given morning.
 */

const testEnv = { ...env, RESEND_API_KEY: "test-key", ALERT_EMAIL: "keeper@example.com" } as unknown as Env;

/**
 * A STANDING worker_health ALARM WITH A KEY OF ITS OWN. The note-audit
 * pages that prompted the mute have since left the paging channel
 * altogether (see DESK_CONDITIONS and test/desk-conditions.spec.ts) —
 * the mute is for the alarms that DO page and that the keeper wants
 * quieted one at a time.
 */
const WARD_STALE_KEY = "ward-stale:2026-w37";
const WARD_STALE_IDENTITY = `worker_health:${WARD_STALE_KEY}`;

async function clearAlerts(): Promise<void> {
  for (const prefix of ["alert_log:", "alert_open:", "alert_sent:", "alert_mute:", "alert_email_budget:"]) {
    const listed = await testEnv.COUNTERS.list({ prefix });
    for (const key of listed.keys) await testEnv.COUNTERS.delete(key.name);
  }
}

let sends: string[] = [];

beforeEach(async () => {
  await clearAlerts();
  sends = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
    sends.push(String(init?.body ?? ""));
    return new Response(JSON.stringify({ id: "re_1" }), { status: 200 });
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function raiseWardStale(detail = "The ward round is stale: the Sunday cron missed a pass."): Promise<void> {
  await sendAlert(testEnv, {
    condition: "worker_health",
    key: WARD_STALE_KEY,
    detail,
  });
}

describe("the alarm the keeper asked to stop", () => {
  it("pages until it is muted, and not after", async () => {
    await raiseWardStale();
    expect(sends).toHaveLength(1);

    await clearAlerts();
    sends = [];
    await muteAlarm(testEnv, { scope: "alarm", target: WARD_STALE_IDENTITY }, ALL_CONDITIONS, ALERT_CONDITIONS);
    await raiseWardStale();
    expect(sends).toHaveLength(0);
  });

  it("still writes its row, still counts its repeats, and says the mail was held", async () => {
    await muteAlarm(testEnv, { scope: "alarm", target: WARD_STALE_IDENTITY }, ALL_CONDITIONS, ALERT_CONDITIONS);
    await raiseWardStale();
    await raiseWardStale();
    const [row, ...rest] = await listAlerts(testEnv, 50);
    expect(rest).toHaveLength(0);
    expect(row!.repeats).toBe(2);
    expect(row!.email_muted).toBe("alarm");
    // A muted store must never be a silent one: the trail is the
    // delivery now, so the row has to carry the whole fact.
    expect(row!.detail).toContain("ward round is stale");
  });

  it("carries the name the page needs to offer the lever", async () => {
    await raiseWardStale();
    expect((await listAlerts(testEnv, 50))[0]!.identity).toBe(WARD_STALE_IDENTITY);
  });
});

describe("what a mute must NOT silence", () => {
  it("leaves the same condition at another key paging", async () => {
    await muteAlarm(testEnv, { scope: "alarm", target: WARD_STALE_IDENTITY }, ALL_CONDITIONS, ALERT_CONDITIONS);
    await raiseWardStale();
    expect(sends).toHaveLength(0);

    /*
     * THE REASON THIS IS PER-ALARM AND NOT PER-CONDITION. Deleting the
     * desk item from the code would have taken this page with it, and
     * this page is the Worker saying it is unwell.
     */
    await sendAlert(testEnv, {
      condition: "worker_health",
      detail: "The scheduled handler threw on every tick for an hour.",
    });
    expect(sends).toHaveLength(1);
    expect(sends[0]).toContain("scheduled handler");
  });

  it("does not touch another condition", async () => {
    await muteAlarm(testEnv, { scope: "condition", target: "worker_health" }, ALL_CONDITIONS, ALERT_CONDITIONS);
    await raiseWardStale();
    await sendAlert(testEnv, {
      condition: "undelivered_sale",
      detail: "settled and no goods went out",
      key: "ord_1",
    });
    expect(sends).toHaveLength(1);
    expect(sends[0]).toContain("no goods went out");
  });
});

describe("the whole condition, when that is what was meant", () => {
  it("silences every key under it and stamps the rows with the wider scope", async () => {
    await muteAlarm(testEnv, { scope: "condition", target: "worker_health" }, ALL_CONDITIONS, ALERT_CONDITIONS);
    await raiseWardStale();
    await sendAlert(testEnv, {
      condition: "worker_health",
      key: "ward-stale:2026-w38",
      detail: "the next week is stale too",
    });
    expect(sends).toHaveLength(0);
    const rows = await listAlerts(testEnv, 50);
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.email_muted === "condition")).toBe(true);
  });
});

describe("lifting a mute", () => {
  it("pages on the very next raise — the backoff window was never spent", async () => {
    await muteAlarm(testEnv, { scope: "alarm", target: WARD_STALE_IDENTITY }, ALL_CONDITIONS, ALERT_CONDITIONS);
    await raiseWardStale();
    await raiseWardStale();
    expect(sends).toHaveLength(0);

    await unmuteAlarm(testEnv, WARD_STALE_IDENTITY);
    await raiseWardStale();
    // Six hours of dedupe would have eaten this one if a muted raise
    // had set the page key on its way past.
    expect(sends).toHaveLength(1);
  });

  it("clears the MUTED stamp on the row it left behind", async () => {
    await muteAlarm(testEnv, { scope: "alarm", target: WARD_STALE_IDENTITY }, ALL_CONDITIONS, ALERT_CONDITIONS);
    await raiseWardStale();
    await unmuteAlarm(testEnv, WARD_STALE_IDENTITY);
    await raiseWardStale();
    expect((await listAlerts(testEnv, 50))[0]!.email_muted).toBeUndefined();
  });
});

describe("the mute list, which is what keeps a mute from being a cut wire", () => {
  it("lists what is silenced, with the keeper's reason", async () => {
    await muteAlarm(
      testEnv,
      { scope: "alarm", target: WARD_STALE_IDENTITY, reason: "known, on the desk" },
      ALL_CONDITIONS,
      ALERT_CONDITIONS,
    );
    const { mutes, truncated } = await listMutes(testEnv);
    const [mute, ...rest] = mutes;
    expect(truncated).toBe(false);
    expect(rest).toHaveLength(0);
    expect(mute).toMatchObject({
      scope: "alarm",
      target: WARD_STALE_IDENTITY,
      condition: "worker_health",
      reason: "known, on the desk",
    });
  });

  it("is empty again once the mute is lifted", async () => {
    await muteAlarm(testEnv, { scope: "alarm", target: WARD_STALE_IDENTITY }, ALL_CONDITIONS, ALERT_CONDITIONS);
    await unmuteAlarm(testEnv, WARD_STALE_IDENTITY);
    expect((await listMutes(testEnv)).mutes).toHaveLength(0);
  });
});

describe("a mute that would silence nothing", () => {
  it("is refused rather than written", async () => {
    const result = await muteAlarm(
      testEnv,
      { scope: "alarm", target: "worker-health:ward-stale" },
      ALL_CONDITIONS,
      ALERT_CONDITIONS,
    );
    expect("refused" in result && result.refused).toContain("not a condition this store raises");
    expect((await listMutes(testEnv)).mutes).toHaveLength(0);
  });

  it("refuses a condition mute keyed to something narrower than a condition", async () => {
    const result = await muteAlarm(
      testEnv,
      { scope: "condition", target: WARD_STALE_IDENTITY },
      ALL_CONDITIONS,
      ALERT_CONDITIONS,
    );
    expect("refused" in result).toBe(true);
  });
});

describe("the email that arrives when nothing is muted", () => {
  it("names the lever and the alarm's own identity, because that is what the keeper is holding", async () => {
    await raiseWardStale();
    expect(sends[0]).toContain("/admin/reconciliation#alarms");
    expect(sends[0]).toContain(WARD_STALE_IDENTITY);
  });
});
