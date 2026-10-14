import { SELF, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { verifyMessageSignature } from "@/lib/signing";
import { getLetter, letterThread, standingLetterReply } from "@/services/letters";
import { findTip } from "@/services/tips";
import { hearConfession } from "@/services/confessions";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";
const STANDING_LETTER_REPLY = standingLetterReply(testEnv);
const KEEPER = {
  Authorization: `Basic ${btoa(`keeper:${testEnv.ADMIN_PASSWORD}`)}`,
};

/**
 * THE COUNTER'S HOUSEKEEPING (2026-10-02, the keeper's list).
 *
 * Four complaints from one sitting. Letters that say "1" or "test"
 * each wanted a hand-typed reply; every button on the counter threw
 * him back to the desk; the drawer's stocking form stood open on a
 * shelf that closed in August; and the tip jar had no way to pour out
 * the tests. Each fix here has a line that goes red without it.
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

async function postTip(tip: string): Promise<string> {
  const response = await SELF.fetch(`${BASE}/api/tip`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tip }),
  });
  expect(response.status).toBe(201);
  const body = (await response.json()) as Record<string, unknown>;
  return String(body["tip_id"]);
}

/**
 * The letter door takes one letter a day per name (nameless senders
 * share one digest), so every junk letter here signs a different
 * throwaway name — the way a fleet of test agents actually arrives.
 */
let junkSeq = 0;
const junk = (letter: string) => postLetter(`junk-${++junkSeq}-${Date.now()}`, letter);

/** A browser pressing a form on an admin page: form-encoded, with the page it stood on. */
function press(path: string, fields: Record<string, string | string[]>, from = `${BASE}/admin/counter`) {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(fields)) {
    for (const one of Array.isArray(value) ? value : [value]) body.append(key, one);
  }
  return SELF.fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      ...KEEPER,
      Accept: "text/html",
      "Content-Type": "application/x-www-form-urlencoded",
      Referer: from,
    },
    body: body.toString(),
    redirect: "manual",
  });
}

const counterPage = async () =>
  (await SELF.fetch(`${BASE}/admin/counter`, { headers: KEEPER })).text();

describe("a form goes back to the page it was pressed on", () => {
  it("answers a letter and lands on the counter's mailbox, not the desk", async () => {
    const letterId = await postLetter("Returner", "Where do I land after this?");
    const response = await press(`/admin/letters/${letterId}/reply`, { reply: "Right here." });
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/admin/counter#mailbox");
  });

  it("a tip pressed from the counter returns to the counter", async () => {
    const tipId = await postTip("A tip about where buttons go.");
    const response = await press(`/admin/tips/${tipId}/reject`, {});
    expect(response.headers.get("Location")).toBe("/admin/counter#queues");
  });

  it("the week note pressed from the counter stays on the counter", async () => {
    const response = await press("/admin/note", { week_note: "Still here." });
    expect(response.headers.get("Location")).toBe("/admin/counter");
  });

  it("with no page to go back to, the desk is still the fallback", async () => {
    const letterId = await postLetter("Nowhere", "No referer on this one.");
    const response = await SELF.fetch(`${BASE}/admin/letters/${letterId}/archive`, {
      method: "POST",
      headers: KEEPER,
      redirect: "manual",
    });
    expect(response.headers.get("Location")).toBe("/admin#mailbox");
  });

  it("never follows a referer off the office", async () => {
    const letterId = await postLetter("Elsewhere", "Sent from a strange page.");
    const response = await press(`/admin/letters/${letterId}/archive`, {}, "https://evil.example/admin/counter");
    expect(response.headers.get("Location")).toBe("/admin/counter#mailbox");
    const second = await press(`/admin/letters/${letterId}/archive`, {}, `${BASE}/gazette`);
    expect(second.headers.get("Location")).toBe("/admin#mailbox");
  });
});

describe("the standing reply, by the handful", () => {
  it("answers every ticked letter with the same signed words and files them", async () => {
    const one = await junk("1");
    const two = await junk("test");
    const kept = await postLetter("A Real Correspondent", "Do you commission endpoint walks?");

    const response = await press("/admin/letters/bulk", {
      letter_ids: [one, two],
      action: "standing_reply_archive",
    });
    expect(response.status).toBe(303);
    const location = response.headers.get("Location") ?? "";
    expect(location.startsWith("/admin/counter?did=")).toBe(true);
    expect(location.endsWith("#mailbox")).toBe(true);

    for (const id of [one, two]) {
      const record = await getLetter(testEnv, id);
      expect(record?.status).toBe("archived");
      const thread = letterThread(record!);
      expect(thread).toHaveLength(1);
      expect(thread[0]?.reply).toBe(STANDING_LETTER_REPLY);
      // Signed like any other answer: the pickup URL verifies it.
      expect(
        await verifyMessageSignature(
          JSON.stringify({ letter_id: id, reply: thread[0]!.reply, replied_at: thread[0]!.replied_at }),
          thread[0]!.signature,
          thread[0]!.public_key,
        ),
      ).toBe(true);
    }
    // The letter he did not tick is exactly as it was.
    const untouched = await getLetter(testEnv, kept);
    expect(untouched?.status).toBe("received");
    expect(letterThread(untouched!)).toHaveLength(0);

    // The notice says what happened; the counter shows it.
    const page = await (
      await SELF.fetch(`${BASE}${location}`, { headers: KEEPER })
    ).text();
    expect(page).toContain("Standing reply sent on 2 letters");
  });

  it("can send the reply and leave the letters in the box, or file without a word", async () => {
    const replied = await junk("hello?");
    const filed = await junk("asdf");
    await press("/admin/letters/bulk", { letter_ids: replied, action: "standing_reply" });
    await press("/admin/letters/bulk", { letter_ids: filed, action: "archive" });
    const stillInBox = await getLetter(testEnv, replied);
    expect(stillInBox?.status).toBe("replied");
    expect(letterThread(stillInBox!)[0]?.reply).toBe(STANDING_LETTER_REPLY);
    const quiet = await getLetter(testEnv, filed);
    expect(quiet?.status).toBe("archived");
    expect(letterThread(quiet!)).toHaveLength(0);
  });

  it("refuses an empty tick list and an unknown action, with words", async () => {
    const nothing = await press("/admin/letters/bulk", { action: "standing_reply" });
    expect(nothing.status).toBe(400);
    expect(await nothing.text()).toContain("Tick");
    const id = await junk("x");
    const odd = await press("/admin/letters/bulk", { letter_ids: id, action: "burn" });
    expect(odd.status).toBe(400);
    expect((await getLetter(testEnv, id))?.status).toBe("received");
  });

  it("the mailbox carries a tick per letter, one bulk form, and the words it will send", async () => {
    const id = await postLetter("Ticked", "Show me the box.");
    const page = await counterPage();
    expect(page).toContain(`name="letter_ids" value="${id}" form="letters-bulk"`);
    expect(page).toContain('id="letters-bulk"');
    expect(page).toContain('action="/admin/letters/bulk"');
    expect(page).toContain(STANDING_LETTER_REPLY.split("\n")[0]!);
  });
});

describe("pouring the tests out of the tip jar", () => {
  it("rejects every ticked tip and takes the rejected out of sight", async () => {
    const junk = await postTip("test");
    const junk2 = await postTip("1");
    const real = await postTip("The Base facilitator answers settle in under a second on weekdays.");
    const response = await press("/admin/tips/bulk", {
      tip_ids: [junk, junk2],
      action: "reject",
    });
    expect(response.status).toBe(303);
    expect((response.headers.get("Location") ?? "").endsWith("#queues")).toBe(true);
    expect((await findTip(testEnv, junk))?.record.status).toBe("rejected");
    expect((await findTip(testEnv, junk2))?.record.status).toBe("rejected");
    expect((await findTip(testEnv, real))?.record.status).toBe("pending_review");

    const page = await counterPage();
    expect(page).toContain(real);
    expect(page).not.toContain(junk);
    expect(page).not.toContain(junk2);
    expect(page).toContain(`name="tip_ids" value="${real}" form="tips-bulk"`);
    expect(page).toContain('action="/admin/tips/bulk"');
  });
});

describe("closed shelves fold away", () => {
  it("the drawer's stocking form is gone from the counter; the shelf is retired", async () => {
    const page = await counterPage();
    expect(page).not.toContain("Stocked shelf: the_drawer");
    expect(page).not.toContain('action="/admin/stock/the_drawer"');
    expect(page).toContain("Closed shelves");
    expect(page).toContain("retired 2026-08-20");
  });
});

describe("the second sweep (2026-10-02, 'go ahead and do all those')", () => {
  it("opening the counter reads the mail; there is no Mark read button and no route for it", async () => {
    const letterId = await postLetter("Read On Sight", "Did you see this?");
    expect((await getLetter(testEnv, letterId))?.status).toBe("received");
    const page = await counterPage();
    expect(page).not.toContain("Mark read");
    expect(page).not.toContain("/read\"");
    expect((await getLetter(testEnv, letterId))?.status).toBe("read");
    // Read is not answered: it still asks for his hands.
    expect(page).toContain(letterId);
    const gone = await press(`/admin/letters/${letterId}/read`, {});
    expect(gone.status).toBe(404);
  });

  it("the confession drawer's approve button says what approval does now", async () => {
    const { record } = await hearConfession(testEnv, "I told my operator the retry was fine.");
    const page = await counterPage();
    const card = page.slice(page.indexOf(record.id));
    expect(card).toContain(`/admin/confessions/${record.id}/approve`);
    expect(card).not.toContain("cleared for public use");
    expect(card).toContain("no Gazette press is running");
  });

  it("an empty commission ledger folds; the Gazette rack files, not the desk; the trial label is gone", async () => {
    const counter = await counterPage();
    expect(counter).toContain("<summary>Commission requests (0)</summary>");
    const desk = await (await SELF.fetch(`${BASE}/admin`, { headers: { ...KEEPER, Accept: "text/html" } })).text();
    expect(desk).not.toContain("Gazette rack");
    expect(desk).toContain("Buyer signals");
    expect(desk).not.toContain("Buyer signals (trial)");
    const files = await (await SELF.fetch(`${BASE}/admin/files`, { headers: KEEPER })).text();
    expect(files).toContain("The Gazette rack");
  });
});
