import { env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ALERT_CONDITIONS,
  ALL_CONDITIONS,
  DESK_CONDITIONS,
  listAlerts,
  pagesTheKeeper,
  sendAlert,
} from "@/lib/alerts";
import { listMutes, muteAlarm } from "@/lib/alert-mutes";
import type { Env } from "@/types";

/**
 * "I DON'T WANT ANY OF THOSE TYPE OF ALARMS, NOT FOR THAT SPECIFIC
 * COMPANY." The keeper, 2026-09-15, after one note-audit page about
 * one host — correcting a mute that had been aimed at the host when
 * the thing he objected to was the INSTRUMENT being in the paging
 * channel at all.
 *
 * What must be true afterwards, and what this file pins: no note
 * audit mails him about any host, ever, and every one of them is
 * still on the trail where the desk can answer it. A store that went
 * quiet about its own stale notes would have traded one complaint for
 * a defect this codebase has already fixed four times.
 */

const testEnv = { ...env, RESEND_API_KEY: "test-key", ALERT_EMAIL: "keeper@example.com" } as unknown as Env;

async function clearAlerts(): Promise<void> {
  for (const prefix of ["alert_log:", "alert_open:", "alert_sent:", "alert_mute:"]) {
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

async function raiseNoteAudit(host: string, call: "ours" | "look" = "look"): Promise<void> {
  await sendAlert(testEnv, {
    condition: "note_audit",
    key: `${call}:${host}`,
    detail: `A note this desk sent to ${host} no longer holds.`,
  });
}

describe("a note audit", () => {
  it("mails nobody, for any host, on either finding", async () => {
    await raiseNoteAudit("delvorn.site");
    await raiseNoteAudit("other.example");
    await raiseNoteAudit("third.example", "ours");
    expect(sends).toHaveLength(0);
  });

  it("still writes its row, one per host and call, with its repeats", async () => {
    await raiseNoteAudit("delvorn.site");
    await raiseNoteAudit("delvorn.site");
    await raiseNoteAudit("delvorn.site", "ours");
    const rows = await listAlerts(testEnv, 50);
    expect(rows).toHaveLength(2);
    const stale = rows.find((row) => row.identity === "note_audit:look:delvorn.site");
    expect(stale?.repeats).toBe(2);
    expect(stale?.detail).toContain("delvorn.site");
  });

  it("says on the row that no mail was ever coming", async () => {
    await raiseNoteAudit("delvorn.site");
    const [row] = await listAlerts(testEnv, 50);
    expect(row!.desk_only).toBe(true);
    // Not a mute. The keeper must never go looking for a lever to
    // lift on a channel this alarm was never in.
    expect(row!.email_muted).toBeUndefined();
  });
});

describe("what the desk list must NOT take with it", () => {
  it("leaves worker_health paging — the sweep breaking is still the Worker breaking", async () => {
    await sendAlert(testEnv, {
      condition: "worker_health",
      key: "note-audit-sweep-failed",
      detail: "The re-read of doors we wrote to failed: nothing is being checked.",
    });
    expect(sends).toHaveLength(1);
    expect(sends[0]).toContain("re-read of doors");
  });

  it("keeps the email's count honest — it counts what pages, not what is raised", async () => {
    await sendAlert(testEnv, {
      condition: "worker_health",
      detail: "the scheduled handler threw",
    });
    expect(sends[0]).toContain(`One of the ${ALERT_CONDITIONS.length} conditions that page you`);
    // The desk conditions are raised but never counted as paging ones.
    expect(ALL_CONDITIONS.length).toBe(ALERT_CONDITIONS.length + DESK_CONDITIONS.length);
    for (const condition of DESK_CONDITIONS) {
      expect(ALERT_CONDITIONS as readonly string[]).not.toContain(condition);
      expect(pagesTheKeeper(condition)).toBe(false);
    }
  });
});

describe("muting something that never mails", () => {
  it("is refused with the reason, not written as a mute that does nothing", async () => {
    const result = await muteAlarm(
      testEnv,
      { scope: "condition", target: "note_audit" },
      ALL_CONDITIONS,
      ALERT_CONDITIONS,
    );
    expect("refused" in result && result.refused).toContain("never emails you");
    expect((await listMutes(testEnv)).mutes).toHaveLength(0);
  });
});
