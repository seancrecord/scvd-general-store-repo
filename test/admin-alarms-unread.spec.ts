import { SELF, env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { sendAlert } from "@/lib/alerts";
import { KV_KEYS } from "@/lib/kv-keys";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;

/**
 * "HAVE I ALREADY SEEN THIS ONE?"
 *
 * The keeper's actual words, and the reason this exists: "how do i
 * know if its something ive seen or not without having to like eyeball
 * it thats too much work for me."
 *
 * He is right, and the failure mode is not cosmetic. A trail you have
 * to re-read end to end to use is a trail that stops getting used —
 * which is how a live undelivered sale went unnoticed long enough to
 * need 3am forensics against a transaction hash.
 *
 * The rule being pinned: NEW means FIRST FIRED since his last visit.
 * Not last-raised. A standing problem he has already read about is not
 * news again every six hours; that would be the re-dating bug wearing
 * a different hat.
 */

async function clearAlerts(): Promise<void> {
  for (const prefix of ["alert_log:", "alert_open:", "alert_sent:"]) {
    const listed = await testEnv.COUNTERS.list({ prefix });
    for (const key of listed.keys) await testEnv.COUNTERS.delete(key.name);
  }
  await testEnv.COUNTERS.delete(KV_KEYS.alarmsLastRead);
}

function look(): Promise<Response> {
  return SELF.fetch("https://scvd.store/admin/reconciliation", {
    headers: {
      Authorization: `Basic ${btoa(`keeper:${testEnv.ADMIN_PASSWORD}`)}`,
    },
  });
}

beforeEach(clearAlerts);

describe("the unread mark on the alarm trail", () => {
  it("marks nothing on a first look, and says so", async () => {
    /*
     * The store has no idea what he read before the watermark existed.
     * Flagging the whole list as NEW would be a lie the size of the
     * list, and worse than no marker at all — the first thing he'd
     * learn is that the marker cannot be trusted.
     */
    await sendAlert(testEnv, {
      condition: "worker_health",
      detail: "something from before the mark existed",
    });
    const html = await (await look()).text();
    expect(html).toContain("First look at this trail");
    expect(html).not.toContain("[NEW]");
  });

  it("marks an alarm that fired after the last visit", async () => {
    await look(); // sets the mark
    await new Promise((resolve) => setTimeout(resolve, 10));
    await sendAlert(testEnv, {
      condition: "worker_health",
      detail: "this one is genuinely new",
    });

    const html = await (await look()).text();
    expect(html).toContain("[NEW]");
    expect(html).toContain("1 NEW since you last looked");
  });

  it("does not re-mark an alarm he has already read", async () => {
    await sendAlert(testEnv, {
      condition: "worker_health",
      detail: "seen it",
    });
    await look(); // he reads it; the mark moves past it

    const html = await (await look()).text();
    expect(html).not.toContain("[NEW]");
    expect(html).toContain("Nothing new since you last looked");
  });

  it("does not make a STANDING problem new again every time it repeats", async () => {
    /*
     * The distinction the whole design turns on. An undelivered sale
     * that has been re-raised forty times is ONE problem he has
     * already seen, and if the marker cries NEW on every repeat it is
     * back to eyeballing — plus it would bury a genuinely new alarm
     * in a list where everything is flagged.
     */
    await sendAlert(testEnv, {
      condition: "undelivered_sale",
      detail: "settled and nothing went out",
      key: "ord_standing",
    });
    await look();

    await new Promise((resolve) => setTimeout(resolve, 10));
    await sendAlert(testEnv, {
      condition: "undelivered_sale",
      detail: "still nothing went out",
      key: "ord_standing",
    });

    const html = await (await look()).text();
    expect(html).not.toContain("[NEW]");
    // Still visibly ongoing — the repeat count is how that gets said.
    expect(html).toContain("still being raised");
  });

  it("separates the new one from the standing one in the same list", async () => {
    await sendAlert(testEnv, {
      condition: "undelivered_sale",
      detail: "the old standing problem",
      key: "ord_old",
    });
    await look();

    await new Promise((resolve) => setTimeout(resolve, 10));
    await sendAlert(testEnv, {
      condition: "undelivered_sale",
      detail: "the old standing problem, again",
      key: "ord_old",
    });
    await sendAlert(testEnv, {
      condition: "worker_health",
      detail: "a brand new failure",
    });

    const html = await (await look()).text();
    expect(html).toContain("1 NEW since you last looked");
    // Exactly one badge, on exactly one row.
    expect(html.match(/\[NEW\]/g) ?? []).toHaveLength(1);
    const badged = /\[NEW\]<\/strong>[^<]*<strong>([^<]+)<\/strong>/.exec(html);
    expect(badged?.[1]).toBe("worker_health");
  });

  it("advances the mark on load, so 'new' keeps meaning new", async () => {
    await look();
    const first = await testEnv.COUNTERS.get(KV_KEYS.alarmsLastRead);
    expect(first).toBeTruthy();

    await new Promise((resolve) => setTimeout(resolve, 10));
    await look();
    const second = await testEnv.COUNTERS.get(KV_KEYS.alarmsLastRead);
    expect(second).not.toBe(first);
    expect(new Date(second!).getTime()).toBeGreaterThan(
      new Date(first!).getTime(),
    );
  });
});
