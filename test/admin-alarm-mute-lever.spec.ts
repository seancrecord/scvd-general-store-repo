import { SELF, env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { sendAlert } from "@/lib/alerts";
import { listMutes } from "@/lib/alert-mutes";
import { KV_KEYS } from "@/lib/kv-keys";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;

/**
 * THE LEVER, PRESSED. The mute is only worth anything if the keeper
 * can reach it from the page he is already on with the alarm in front
 * of him — "I don't want to get this particular alarm anymore" is a
 * sentence said while holding the email, not while writing code.
 */

const NOTE_AUDIT_IDENTITY = "worker_health:note-audit:look:delvorn.site";

async function clearAlerts(): Promise<void> {
  for (const prefix of ["alert_log:", "alert_open:", "alert_sent:", "alert_mute:"]) {
    const listed = await testEnv.COUNTERS.list({ prefix });
    for (const key of listed.keys) await testEnv.COUNTERS.delete(key.name);
  }
  await testEnv.COUNTERS.delete(KV_KEYS.alarmsLastRead);
}

const auth = (): Record<string, string> => ({
  Authorization: `Basic ${btoa(`keeper:${testEnv.ADMIN_PASSWORD}`)}`,
});

function look(): Promise<Response> {
  return SELF.fetch("https://scvd.store/admin/reconciliation", { headers: auth() });
}

function press(path: string, body: Record<string, string>): Promise<Response> {
  return SELF.fetch(`https://scvd.store${path}`, {
    method: "POST",
    redirect: "manual",
    headers: { ...auth(), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  });
}

beforeEach(clearAlerts);

describe("the mute lever on the alarm trail", () => {
  it("offers the row its own name to be silenced by", async () => {
    await sendAlert(testEnv, {
      condition: "worker_health",
      key: "note-audit:look:delvorn.site",
      detail: "A note this desk sent to delvorn.site no longer holds.",
    });
    const html = await (await look()).text();
    expect(html).toContain("Stop emailing this one");
    expect(html).toContain(NOTE_AUDIT_IDENTITY);
    // Nothing muted yet, and the page says so rather than saying nothing.
    expect(html).toContain("every condition that pages is paging");
  });

  it("writes the mute when pressed, and then shows it standing", async () => {
    await sendAlert(testEnv, {
      condition: "worker_health",
      key: "note-audit:look:delvorn.site",
      detail: "A note this desk sent to delvorn.site no longer holds.",
    });
    const response = await press("/admin/alerts/mute", {
      scope: "alarm",
      identity: NOTE_AUDIT_IDENTITY,
      reason: "on the desk already",
    });
    expect(response.status).toBe(302);
    expect((await listMutes(testEnv)).mutes).toHaveLength(1);

    const html = await (await look()).text();
    expect(html).toContain("1 alarm sends you no email");
    expect(html).toContain("on the desk already");
    expect(html).toContain("Email me this again");
  });

  it("lifts it when pressed again", async () => {
    await press("/admin/alerts/mute", { scope: "alarm", identity: NOTE_AUDIT_IDENTITY });
    await press("/admin/alerts/unmute", { target: NOTE_AUDIT_IDENTITY });
    expect((await listMutes(testEnv)).mutes).toHaveLength(0);
  });

  it("marks the row MUTED at the counter, so a quiet phone is never a missing wire", async () => {
    await press("/admin/alerts/mute", { scope: "alarm", identity: NOTE_AUDIT_IDENTITY });
    await sendAlert(testEnv, {
      condition: "worker_health",
      key: "note-audit:look:delvorn.site",
      detail: "A note this desk sent to delvorn.site no longer holds.",
    });
    const html = await (
      await SELF.fetch("https://scvd.store/admin/counter", { headers: auth() })
    ).text();
    expect(html).toContain("[MUTED]");
  });

  it("offers a desk finding no lever, and says why, rather than a press that does nothing", async () => {
    await sendAlert(testEnv, {
      condition: "note_audit",
      key: "look:delvorn.site",
      detail: "A note this desk sent to delvorn.site no longer holds.",
    });
    const html = await (await look()).text();
    expect(html).toContain("Desk only");
    expect(html).not.toContain("Stop emailing every &quot;note_audit&quot;");
    const counter = await (
      await SELF.fetch("https://scvd.store/admin/counter", { headers: auth() })
    ).text();
    expect(counter).toContain("[DESK]");
  });

  it("refuses a press that names no condition, rather than writing a mute that silences nothing", async () => {
    const response = await press("/admin/alerts/mute", {
      scope: "alarm",
      identity: "not_a_condition:whatever",
    });
    expect(response.status).toBe(400);
    expect((await listMutes(testEnv)).mutes).toHaveLength(0);
  });
});
