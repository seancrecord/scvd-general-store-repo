import { SELF, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { KV_KEYS, invertedTimestamp } from "@/lib/kv-keys";
import { verifyMessageSignature } from "@/lib/signing";
import {
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
