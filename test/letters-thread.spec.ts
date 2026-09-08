import { SELF, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { KV_KEYS, invertedTimestamp } from "@/lib/kv-keys";
import { verifyMessageSignature } from "@/lib/signing";
import {
  LETTER_CAP,
  LETTER_FOLLOW_UP_CAP,
  letterNeedsReply,
  letterThread,
  replyToLetter,
  setLetterStatus,
} from "@/services/letters";
import type { Env, LetterRecord } from "@/types";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";
const KEEPER = {
  Authorization: `Basic ${btoa(`keeper:${testEnv.ADMIN_PASSWORD}`)}`,
};

/**
 * A CORRESPONDENCE IS NOT ONE SENTENCE EACH WAY (2026-09-08).
 *
 * A visitor wrote in with a scoped offer. The keeper answered, and
 * promised inside that answer to send a list of endpoints. Then he
 * could not: answering a letter replaced the admin reply form with
 * the reply text, so there was no second box to write in, and the
 * promise stood unkept in a signed letter at a public pickup URL.
 *
 * Underneath, the route the vanished form pointed at did something
 * worse than nothing — it overwrote the published signature in place
 * and counted the letter answered twice.
 *
 * Revert any half of the fix and one of these goes red.
 */
async function postLetter(from: string, letter: string): Promise<string> {
  const response = await SELF.fetch(`${BASE}/api/letter`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ letter, from_name: from }),
  });
  expect(response.status).toBe(201);
  const body = (await response.json()) as Record<string, unknown>;
  return String(body["letter_id"]);
}

const pickup = async (letterId: string) =>
  (await (await SELF.fetch(`${BASE}/api/letter/${letterId}`)).json()) as Record<
    string,
    unknown
  >;

const answeredCount = async () =>
  Number((await testEnv.COUNTERS.get(KV_KEYS.lettersAnswered)) ?? "0");

describe("the keeper can write twice, and the first answer never moves", () => {
  it("appends, signs each, pins the first, and counts the letter once", async () => {
    const before = await answeredCount();
    const letterId = await postLetter(
      "Thread One",
      "Are you commissioning independent checks?",
    );

    await replyToLetter(testEnv, letterId, "Yes, in principle. List to follow.");
    const afterFirst = await pickup(letterId);
    const firstReply = String(afterFirst["reply"]);
    const firstSignature = String(afterFirst["reply_signature"]);
    const firstAt = String(afterFirst["replied_at"]);
    expect(firstReply).toContain("List to follow");

    await replyToLetter(testEnv, letterId, "Following up: here are the five.");

    const afterSecond = await pickup(letterId);
    // The published fields are the FIRST answer, byte for byte. A
    // correspondent who already fetched and verified them still can.
    expect(afterSecond["reply"]).toBe(firstReply);
    expect(afterSecond["reply_signature"]).toBe(firstSignature);
    expect(afterSecond["replied_at"]).toBe(firstAt);

    // Both answers are served, oldest first, each signed on its own.
    const replies = afterSecond["replies"] as {
      reply: string;
      signature: string;
      public_key: string;
      replied_at: string;
    }[];
    expect(replies).toHaveLength(2);
    expect(replies[0]?.reply).toBe(firstReply);
    expect(replies[1]?.reply).toContain("here are the five");
    for (const entry of replies) {
      const payload = JSON.stringify({
        letter_id: letterId,
        reply: entry.reply,
        replied_at: entry.replied_at,
      });
      expect(
        await verifyMessageSignature(
          payload,
          entry.signature,
          entry.public_key,
        ),
      ).toBe(true);
    }
    // The note stops describing a single reply once there are two.
    expect(String(afterSecond["note"])).toContain("wrote back 2 times");

    // One letter answered, not two answers counted.
    expect(await answeredCount()).toBe(before + 1);
  });

  it("keeps serving the reply after the keeper files the letter away", async () => {
    const letterId = await postLetter(
      "Thread Two",
      "Does filing a letter retract the answer?",
    );
    await replyToLetter(testEnv, letterId, "It does not. Housekeeping is not a retraction.");
    await setLetterStatus(testEnv, letterId, "archived");

    const filed = await pickup(letterId);
    // Archiving never leaks that the keeper filed it — and never
    // takes back a signed answer he already published.
    expect(filed["status"]).toBe("replied");
    expect(String(filed["reply"])).toContain("not a retraction");
    expect(filed["reply_signature"]).toBeTruthy();
  });

  it("leaves the box open at the counter after an answer, with what was said above it", async () => {
    const letterId = await postLetter(
      "Thread Three",
      "Will you write to me twice?",
    );
    await replyToLetter(testEnv, letterId, "The first thing I have to say.");
    const page = await (
      await SELF.fetch(`${BASE}/admin/counter`, { headers: KEEPER })
    ).text();
    const card = page.slice(page.indexOf(letterId));

    // What he already said is on the card...
    expect(card).toContain("The first thing I have to say.");
    // ...and so is somewhere to say the next thing. This is the exact
    // dead end that left a promise unkept: the form used to vanish.
    expect(card).toContain(`/admin/letters/${letterId}/reply`);
    expect(card).toContain("Reply again, signed");
  });

  it("reads a letter answered before threads existed as the one-reply thread it is", async () => {
    // A record in the shape the store wrote before 2026-09-08: the
    // four top-level fields, no replies array.
    const letterId = "letter_legacyshape01";
    const legacy: LetterRecord = {
      letter_id: letterId,
      letter: "Written under the old shape.",
      date: "2026-09-01T00:00:00.000Z",
      status: "replied",
      reply: "The old single answer.",
      reply_signature: "aa",
      reply_public_key: "bb",
      replied_at: "2026-09-02T00:00:00.000Z",
    };
    const queueKey = KV_KEYS.letter(invertedTimestamp(Date.parse(legacy.date)), letterId);
    await testEnv.ORDERS.put(queueKey, JSON.stringify(legacy));
    await testEnv.ORDERS.put(KV_KEYS.letterById(letterId), queueKey);

    expect(letterThread(legacy)).toEqual([
      {
        reply: "The old single answer.",
        signature: "aa",
        public_key: "bb",
        replied_at: "2026-09-02T00:00:00.000Z",
      },
    ]);

    // And a follow-up appends behind it without disturbing it.
    await replyToLetter(testEnv, letterId, "And the answer that came later.");
    const served = await pickup(letterId);
    expect(served["reply"]).toBe("The old single answer.");
    expect(served["reply_signature"]).toBe("aa");
    const replies = served["replies"] as { reply: string }[];
    expect(replies.map((entry) => entry.reply)).toEqual([
      "The old single answer.",
      "And the answer that came later.",
    ]);
  });
});


/**
 * THE OTHER HALF OF THE CONVERSATION (2026-09-08).
 *
 * Written after reading how the box was actually used: an autonomous
 * agent proposed a piece of work, the keeper accepted a scope and
 * asked for the report to be delivered here, and three things stood
 * between that and a delivered report — the door cut anything over
 * the cap and said 201, every message the agent sent minted an
 * unrelated letter, and the daily refusal told software to come back
 * "tomorrow" without saying when that was.
 */
describe("a letter is a conversation, and nothing in it is quietly dropped", () => {
  it("refuses an over-long letter whole, naming the length, storing nothing", async () => {
    const before = Number(
      (await testEnv.COUNTERS.get(KV_KEYS.lettersReceived)) ?? "0",
    );
    const response = await SELF.fetch(`${BASE}/api/letter`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        letter: "x".repeat(LETTER_CAP + 500),
        from_name: "Over Cap",
      }),
    });
    expect(response.status).toBe(413);
    const body = (await response.json()) as Record<string, unknown>;
    // The sender is told what actually happened and can act on it.
    expect(body["length"]).toBe(LETTER_CAP + 500);
    expect(body["cap"]).toBe(LETTER_CAP);
    expect(String(body["error"])).toContain("Nothing was stored");
    // And nothing was: no half-letter in the box, no count moved.
    expect(
      Number((await testEnv.COUNTERS.get(KV_KEYS.lettersReceived)) ?? "0"),
    ).toBe(before);
  });

  it("keeps the line breaks a report is written with", async () => {
    const report = "door 1: ready\ndoor 2: not_ready\n\nhash: abc123";
    const letterId = await postLetter("Line Breaks", report);
    const stored = (await testEnv.ORDERS.get(
      (await testEnv.ORDERS.get(KV_KEYS.letterById(letterId))) as string,
      "json",
    )) as LetterRecord;
    // Flattening this is what turned a delivered report into a paragraph.
    expect(stored.letter).toBe(report);
  });

  it("says when the box reopens instead of saying tomorrow", async () => {
    await postLetter("Twice Today", "The first of the day.");
    const second = await SELF.fetch(`${BASE}/api/letter`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        letter: "The second of the day.",
        from_name: "Twice Today",
      }),
    });
    expect(second.status).toBe(429);
    // Machine-readable both ways: an agent should never have to parse
    // the word "tomorrow" out of an apology.
    const retryAfter = Number(second.headers.get("Retry-After"));
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(86400);
    const body = (await second.json()) as Record<string, unknown>;
    const reopens = new Date(String(body["next_letter_at"]));
    expect(reopens.getTime()).toBeGreaterThan(Date.now());
    expect(reopens.toISOString()).toContain("T00:00:00.000Z");
  });

  it("hangs a follow-up on the answered letter, past the daily limit, and puts it back on the keeper", async () => {
    const letterId = await postLetter("Follow Up", "Are you commissioning work?");

    // Before he answers there is no thread to add to — otherwise this
    // is an unmetered write channel into his queue.
    const early = await SELF.fetch(`${BASE}/api/letter`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ letter: "Anything?", in_reply_to: letterId }),
    });
    expect(early.status).toBe(409);
    expect(String(((await early.json()) as Record<string, unknown>)["error"]))
      .toContain("no answer yet");

    await replyToLetter(testEnv, letterId, "Yes. Here is the scope.");

    // Now it opens — and the same correspondent, already at their one
    // letter for the day, gets through without waiting.
    const added = await SELF.fetch(`${BASE}/api/letter`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        letter: "Accepted. Report below.",
        from_name: "Follow Up",
        in_reply_to: letterId,
      }),
    });
    expect(added.status).toBe(200);
    const addedBody = (await added.json()) as Record<string, unknown>;
    // Same exchange, same pickup slip — not a new letter.
    expect(addedBody["letter_id"]).toBe(letterId);
    expect(addedBody["follow_ups_sent"]).toBe(1);
    expect(addedBody["follow_ups_left"]).toBe(LETTER_FOLLOW_UP_CAP - 1);

    // The pickup confirms receipt without ever echoing the words back.
    const served = await pickup(letterId);
    expect((served["follow_ups_received"] as string[]).length).toBe(1);
    expect(JSON.stringify(served)).not.toContain("Report below");

    // And it is his turn again: an answered letter that has been
    // written back to is work, not history.
    const record = (await testEnv.ORDERS.get(
      (await testEnv.ORDERS.get(KV_KEYS.letterById(letterId))) as string,
      "json",
    )) as LetterRecord;
    expect(letterNeedsReply(record)).toBe(true);

    // The counter shows both sides of the exchange, in order.
    const page = await (
      await SELF.fetch(`${BASE}/admin/counter`, { headers: KEEPER })
    ).text();
    const card = page.slice(page.indexOf(letterId));
    const theirs = card.indexOf("Are you commissioning work?");
    const his = card.indexOf("Yes. Here is the scope.");
    const later = card.indexOf("Accepted. Report below.");
    expect(theirs).toBeGreaterThan(-1);
    expect(his).toBeGreaterThan(theirs);
    expect(later).toBeGreaterThan(his);
    // Their later words carry the untrusted label too.
    expect(card).toContain("Added by the holder of the pickup id");
  });

  it("refuses a follow-up to a letter that does not exist", async () => {
    const response = await SELF.fetch(`${BASE}/api/letter`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ letter: "Hello?", in_reply_to: "letter_nope" }),
    });
    expect(response.status).toBe(404);
  });
});
