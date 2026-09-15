import { env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ALERT_CONDITIONS, listAlerts, sendAlert } from "@/lib/alerts";
import { listMutes, muteAlarm, unmuteAlarm } from "@/lib/alert-mutes";
import type { Env } from "@/types";

/**
 * TURNING OFF ONE ALARM WITHOUT TURNING OFF THE ALARM.
 *
 * The keeper, 2026-09-15, holding a `worker_health` page about a note
 * this desk had sent to one host: "I don't want to get this
 * particular alarm anymore." The two things that must both be true
 * afterwards are the whole of this file — the email stops, and the
 * store does not go quiet. Every prior alerting defect here was the
 * second half failing while the first half looked fine.
 */

const testEnv = { ...env, RESEND_API_KEY: "test-key", ALERT_EMAIL: "keeper@example.com" } as unknown as Env;

/** The alarm the keeper was actually holding when he asked. */
const NOTE_AUDIT_KEY = "note-audit:look:delvorn.site";
const NOTE_AUDIT_IDENTITY = `worker_health:${NOTE_AUDIT_KEY}`;

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

async function raiseNoteAudit(detail = "A note this desk sent to delvorn.site no longer holds."): Promise<void> {
  await sendAlert(testEnv, {
    condition: "worker_health",
    key: NOTE_AUDIT_KEY,
    detail,
  });
}

describe("the alarm the keeper asked to stop", () => {
  it("pages until it is muted, and not after", async () => {
    await raiseNoteAudit();
    expect(sends).toHaveLength(1);

    await clearAlerts();
    sends = [];
    await muteAlarm(testEnv, { scope: "alarm", target: NOTE_AUDIT_IDENTITY }, ALERT_CONDITIONS);
    await raiseNoteAudit();
    expect(sends).toHaveLength(0);
  });

  it("still writes its row, still counts its repeats, and says the mail was held", async () => {
    await muteAlarm(testEnv, { scope: "alarm", target: NOTE_AUDIT_IDENTITY }, ALERT_CONDITIONS);
    await raiseNoteAudit();
    await raiseNoteAudit();
    const [row, ...rest] = await listAlerts(testEnv, 50);
    expect(rest).toHaveLength(0);
    expect(row!.repeats).toBe(2);
    expect(row!.email_muted).toBe("alarm");
    // A muted store must never be a silent one: the trail is the
    // delivery now, so the row has to carry the whole fact.
    expect(row!.detail).toContain("delvorn.site");
  });

  it("carries the name the page needs to offer the lever", async () => {
    await raiseNoteAudit();
    expect((await listAlerts(testEnv, 50))[0]!.identity).toBe(NOTE_AUDIT_IDENTITY);
  });
});

describe("what a mute must NOT silence", () => {
  it("leaves the same condition at another key paging", async () => {
    await muteAlarm(testEnv, { scope: "alarm", target: NOTE_AUDIT_IDENTITY }, ALERT_CONDITIONS);
    await raiseNoteAudit();
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
    await muteAlarm(testEnv, { scope: "condition", target: "worker_health" }, ALERT_CONDITIONS);
    await raiseNoteAudit();
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
    await muteAlarm(testEnv, { scope: "condition", target: "worker_health" }, ALERT_CONDITIONS);
    await raiseNoteAudit();
    await sendAlert(testEnv, {
      condition: "worker_health",
      key: "note-audit:look:other.example",
      detail: "another note no longer holds",
    });
    expect(sends).toHaveLength(0);
    const rows = await listAlerts(testEnv, 50);
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.email_muted === "condition")).toBe(true);
  });
});

describe("lifting a mute", () => {
  it("pages on the very next raise — the backoff window was never spent", async () => {
    await muteAlarm(testEnv, { scope: "alarm", target: NOTE_AUDIT_IDENTITY }, ALERT_CONDITIONS);
    await raiseNoteAudit();
    await raiseNoteAudit();
    expect(sends).toHaveLength(0);

    await unmuteAlarm(testEnv, NOTE_AUDIT_IDENTITY);
    await raiseNoteAudit();
    // Six hours of dedupe would have eaten this one if a muted raise
    // had set the page key on its way past.
    expect(sends).toHaveLength(1);
  });

  it("clears the MUTED stamp on the row it left behind", async () => {
    await muteAlarm(testEnv, { scope: "alarm", target: NOTE_AUDIT_IDENTITY }, ALERT_CONDITIONS);
    await raiseNoteAudit();
    await unmuteAlarm(testEnv, NOTE_AUDIT_IDENTITY);
    await raiseNoteAudit();
    expect((await listAlerts(testEnv, 50))[0]!.email_muted).toBeUndefined();
  });
});

describe("the mute list, which is what keeps a mute from being a cut wire", () => {
  it("lists what is silenced, with the keeper's reason", async () => {
    await muteAlarm(
      testEnv,
      { scope: "alarm", target: NOTE_AUDIT_IDENTITY, reason: "known, on the desk" },
      ALERT_CONDITIONS,
    );
    const { mutes, truncated } = await listMutes(testEnv);
    const [mute, ...rest] = mutes;
    expect(truncated).toBe(false);
    expect(rest).toHaveLength(0);
    expect(mute).toMatchObject({
      scope: "alarm",
      target: NOTE_AUDIT_IDENTITY,
      condition: "worker_health",
      reason: "known, on the desk",
    });
  });

  it("is empty again once the mute is lifted", async () => {
    await muteAlarm(testEnv, { scope: "alarm", target: NOTE_AUDIT_IDENTITY }, ALERT_CONDITIONS);
    await unmuteAlarm(testEnv, NOTE_AUDIT_IDENTITY);
    expect((await listMutes(testEnv)).mutes).toHaveLength(0);
  });
});

describe("a mute that would silence nothing", () => {
  it("is refused rather than written", async () => {
    const result = await muteAlarm(
      testEnv,
      { scope: "alarm", target: "worker-health:note-audit:delvorn.site" },
      ALERT_CONDITIONS,
    );
    expect("refused" in result && result.refused).toContain("not one of the conditions");
    expect((await listMutes(testEnv)).mutes).toHaveLength(0);
  });

  it("refuses a condition mute keyed to something narrower than a condition", async () => {
    const result = await muteAlarm(
      testEnv,
      { scope: "condition", target: NOTE_AUDIT_IDENTITY },
      ALERT_CONDITIONS,
    );
    expect("refused" in result).toBe(true);
  });
});

describe("the email that arrives when nothing is muted", () => {
  it("names the lever and the alarm's own identity, because that is what the keeper is holding", async () => {
    await raiseNoteAudit();
    expect(sends[0]).toContain("/admin/reconciliation#alarms");
    expect(sends[0]).toContain(NOTE_AUDIT_IDENTITY);
  });
});
