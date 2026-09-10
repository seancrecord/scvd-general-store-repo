import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { app } from "@/index";
import { afterEach, describe, expect, it, vi } from "vitest";
import { sendAlert } from "@/lib/alerts";
import { KV_KEYS } from "@/lib/kv-keys";
import { replyToLetter, submitLetter } from "@/services/letters";
import { paintTag, setTagStatus } from "@/services/train";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";
const KEEPER = {
  Authorization: `Basic ${btoa(`keeper:${testEnv.ADMIN_PASSWORD}`)}`,
};

/**
 * THE GLANCE STANDS DOWN (2026-09-04, the keeper, about his own
 * counter): "i have no way to remove these notifications... on the
 * letter, i responded but it still says it needs my hands. i dont want
 * it to go away, but i dont have anything to do."
 *
 * The failure is not cosmetic. A top line that keeps naming work
 * already done is a top line you stop reading, and the whole point of
 * it is that a glance is enough. Three rules land here, and each one
 * keeps the RECORD while dropping the NAG: an answered letter stays in
 * the box and out of the count, a decided tag stays reversible on its
 * own drawer and off the glance, and an alarm stays on the trail and
 * stops shouting once he has stood at the counter with it showing.
 */

afterEach(() => vi.useRealTimers());

async function counter(): Promise<string> {
  // Share the fixture clock with the alert producer as well as the reader.
  const ctx = createExecutionContext();
  const page = await app.fetch(new Request(`${BASE}/admin/counter`, { headers: KEEPER }), testEnv, ctx);
  await waitOnExecutionContext(ctx);
  expect(page.status).toBe(200);
  return page.text();
}

describe("an answered letter is done, filed or not", () => {
  it("asks for hands until the reply, then keeps the letter without asking", async () => {
    const submitted = await submitLetter(testEnv, {
      letter: "Is the door at example.test yours?",
      fromName: "a reader",
    });
    expect(submitted.ok).toBe(true);
    const letterId = (submitted as { record: { letter_id: string } }).record
      .letter_id;

    const waiting = await counter();
    expect(waiting).toContain("need");
    expect(waiting).toContain("1 letter to answer");

    await replyToLetter(testEnv, letterId, "It is; here is what we saw.");

    const answered = await counter();
    // The count lets go the moment the work is done — archiving is
    // housekeeping, not the job.
    expect(answered).not.toContain("letter to answer");
    expect(answered).toContain("Nothing needs your hands.");
    // And the letter itself has not gone anywhere.
    expect(answered).toContain(letterId);
    expect(answered).toContain("1 in the box, all answered");
  });
});

describe("the alarms stay on the wall and stop shouting", () => {
  it("names them once, then goes quiet until one he has not met", async () => {
    const firstAt = new Date("2026-09-09T12:00:00.000Z");
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(firstAt);
    // No watermark yet: this is the state every keeper is in the first
    // time the counter loads after this shipped.
    await testEnv.COUNTERS.delete(KV_KEYS.alarmsSeenAtCounter);
    await sendAlert(testEnv, {
      condition: "worker_health",
      detail: "the first thing the alarms had to say",
    });

    // First look: the store has never recorded him standing here, so
    // it says so rather than inventing a "new".
    const first = await counter();
    expect(first).toContain("recent alarm");
    expect(first).toContain("first look");
    expect(first).not.toContain("[NEW]");

    // Second look: the same alarm is met, and the top line is quiet —
    // while the alarm itself is still listed below.
    const second = await counter();
    expect(second).not.toContain("since you last stood here");
    expect(second).not.toContain("first look");
    expect(second).toContain("all seen");
    expect(second).toContain("worker_health");

    // This event is after the prior visit, independent of machine speed.
    vi.setSystemTime(new Date(firstAt.getTime() + 1));
    // A new alarm gets one shout, and only that one.
    await sendAlert(testEnv, {
      condition: "order_sla",
      detail: "something he has not met",
    });
    const third = await counter();
    expect(third).toContain("1 new alarm");
    expect(third).toContain("since you last stood here");
    expect(third).toContain("[NEW]");

    const fourth = await counter();
    expect(fourth).not.toContain("since you last stood here");
    expect(fourth).toContain("all seen");
  });
});

describe("a decision already made is not work", () => {
  it("keeps a held tag off the glance and reversible on the train's drawer", async () => {
    const painted = await paintTag(testEnv, {
      tag: "held tag, glance test",
      certId: "cert_glance_held",
      patronNumber: 990101,
    });
    const waiting = await counter();
    // Waiting IS work, and says so at the top.
    expect(waiting).toContain("1 tag waiting");

    await setTagStatus(testEnv, painted.record.id, "declined");
    const decided = await counter();
    expect(decided).toContain("Nothing needs your hands.");
    // The glance no longer carries the decision...
    expect(decided).not.toContain("reversible any time");
    // ...but the drawer still holds it, and the reversal is one press.
    expect(decided).toContain("held off the wall — reversible here");
    expect(decided).toContain("Put it up after all");
  });
});
