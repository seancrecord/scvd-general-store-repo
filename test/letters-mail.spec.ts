import { SELF, env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readEmailAddress } from "@/lib/keeper-mail";
import { STORE_CONTACT_EMAIL } from "@/store/metadata";
import {
  addFollowUp,
  getLetter,
  letterEvents,
  replyToLetter,
  submitLetter,
} from "@/services/letters";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";
const KEEPER = {
  Authorization: `Basic ${btoa(`keeper:${testEnv.ADMIN_PASSWORD}`)}`,
};

/**
 * HOW THE INDIVIDUAL GETS IT (2026-09-28, the keeper's question).
 *
 * A reply used to exist only at a pickup URL. An agent polls one; a
 * person who wrote once does not, so the first human team to write
 * in would have waited on an answer that was already signed. Now a
 * letter may carry an address, each signed reply is mailed there
 * with the keeper copied, and the keeper hears a letter land instead
 * of finding it on Sunday.
 *
 * The record is still the pickup URL: mail is the courtesy copy, and
 * every branch here holds that the reply stands whether or not the
 * wire does.
 */

interface Sent {
  to: string[];
  cc?: string[];
  reply_to?: string;
  subject: string;
  text: string;
}
let sends: Sent[] = [];
let wireDown = false;

beforeEach(() => {
  sends = [];
  wireDown = false;
  testEnv.RESEND_API_KEY = "re_test";
  testEnv.ALERT_EMAIL = "keeper@example.test";
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url !== "https://api.resend.com/emails") {
      throw new Error(`unexpected outbound fetch: ${url}`);
    }
    if (wireDown) throw new Error("connection reset");
    sends.push(JSON.parse(String(init?.body)) as Sent);
    return new Response(JSON.stringify({ id: "re_1" }), { status: 200 });
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  delete testEnv.RESEND_API_KEY;
  delete testEnv.ALERT_EMAIL;
});

describe("an address on a letter", () => {
  it("is kept, never served back, and said so in the receipt", async () => {
    const response = await SELF.fetch(`${BASE}/api/letter`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        letter: "Ten URLs to follow.",
        from_name: `mail-kept-${Date.now()}`,
        reply_to: "  team@globallyfluent.example ",
      }),
    });
    expect(response.status).toBe(201);
    const body = (await response.json()) as Record<string, unknown>;
    expect(String(body["reply_to"])).toMatch(/^Kept/);
    const letterId = String(body["letter_id"]);

    const record = await getLetter(testEnv, letterId);
    expect(record?.reply_to).toBe("team@globallyfluent.example");

    const pickup = JSON.stringify(
      await (await SELF.fetch(`${BASE}/api/letter/${letterId}`)).json(),
    );
    expect(pickup).not.toContain("globallyfluent");
  });

  it("refuses a value that is not an address, keeps nothing, and says which", async () => {
    const response = await SELF.fetch(`${BASE}/api/letter`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        letter: "No address really.",
        from_name: `mail-refused-${Date.now()}`,
        reply_to: "call me maybe",
      }),
    });
    expect(response.status).toBe(201);
    const body = (await response.json()) as Record<string, unknown>;
    expect(String(body["reply_to"])).toMatch(/did not read as an email address/);
    const record = await getLetter(testEnv, String(body["letter_id"]));
    expect(record?.reply_to).toBeUndefined();
  });

  it("tells a sender with no address that the pickup URL is the only place the answer will be", async () => {
    const response = await SELF.fetch(`${BASE}/api/letter`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ letter: "Just polling.", from_name: `mail-none-${Date.now()}` }),
    });
    const body = (await response.json()) as Record<string, unknown>;
    expect(String(body["reply_to"])).toMatch(/only at the pickup URL/);
  });

  it("reads the shape and nothing stricter", () => {
    expect(readEmailAddress("a@b.co")).toBe("a@b.co");
    expect(readEmailAddress(" keeper+tag@sub.example.org ")).toBe("keeper+tag@sub.example.org");
    expect(readEmailAddress("no-at-sign")).toBeNull();
    expect(readEmailAddress("two@@x.y")).toBeNull();
    expect(readEmailAddress("space in@x.y")).toBeNull();
    expect(readEmailAddress("a@b")).toBeNull();
    expect(readEmailAddress(`${"x".repeat(250)}@a.bc`)).toBeNull();
    expect(readEmailAddress(42)).toBeNull();
  });
});

describe("the keeper's reply goes out by mail, the keeper copied", () => {
  it("mails each signed reply to the address, cc the keeper, reply-to the keeper, pickup URL inside", async () => {
    const submitted = await submitLetter(testEnv, {
      letter: "Where does the reply go?",
      fromName: "Curious",
      replyTo: "curious@example.test",
    });
    expect(submitted.ok).toBe(true);
    if (!submitted.ok) return;
    sends = []; // the arrival nudge is its own case below
    const letterId = submitted.record.letter_id;

    const record = await replyToLetter(testEnv, letterId, "It goes here.");
    expect(sends).toHaveLength(1);
    const mail = sends[0]!;
    expect(mail.to).toEqual(["curious@example.test"]);
    expect(mail.cc).toEqual([STORE_CONTACT_EMAIL]);
    expect(mail.reply_to).toBe(STORE_CONTACT_EMAIL);
    expect(mail.subject).toContain(letterId);
    expect(mail.text.startsWith("It goes here.")).toBe(true);
    expect(mail.text).toContain(`${BASE}/api/letter/${letterId}`);
    expect(mail.text).toContain("/.well-known/scvd-signing-key");
    expect(record?.replies?.[0]?.mailed).toBe("sent");

    // The keeper's box says the copy went.
    const events = letterEvents(record!);
    const answered = events.find((event) => event.who === "keeper");
    expect(answered && "mailed" in answered ? answered.mailed : undefined).toBe("sent");
  });

  it("never touches the wire for a letter with no address", async () => {
    const submitted = await submitLetter(testEnv, { letter: "Polling is fine.", fromName: "Agent" });
    if (!submitted.ok) throw new Error("not stored");
    sends = [];
    const record = await replyToLetter(testEnv, submitted.record.letter_id, "Noted.");
    expect(sends).toHaveLength(0);
    expect(record?.replies?.[0]?.mailed).toBeUndefined();
  });

  it("fails open: a dead wire leaves the signed reply standing at the pickup URL and says the mail failed", async () => {
    const submitted = await submitLetter(testEnv, {
      letter: "Wire test.",
      fromName: "Unlucky",
      replyTo: "unlucky@example.test",
    });
    if (!submitted.ok) throw new Error("not stored");
    wireDown = true;
    const record = await replyToLetter(testEnv, submitted.record.letter_id, "Still answered.");
    expect(record?.replies?.[0]?.mailed).toBe("failed");
    expect(record?.reply).toBe("Still answered.");
    const pickup = (await (
      await SELF.fetch(`${BASE}/api/letter/${submitted.record.letter_id}`)
    ).json()) as Record<string, unknown>;
    expect(pickup["status"]).toBe("replied");
    expect(pickup["reply"]).toBe("Still answered.");
    expect(JSON.stringify(pickup)).not.toContain("unlucky@");

    const box = await (await SELF.fetch(`${BASE}/admin/counter`, { headers: KEEPER })).text();
    expect(box).toContain("MAIL FAILED");
  });

  it("says so when the key is unset, and still answers", async () => {
    delete testEnv.RESEND_API_KEY;
    const submitted = await submitLetter(testEnv, {
      letter: "No key.",
      fromName: "Keyless",
      replyTo: "keyless@example.test",
    });
    if (!submitted.ok) throw new Error("not stored");
    const record = await replyToLetter(testEnv, submitted.record.letter_id, "Answered anyway.");
    expect(sends).toHaveLength(0);
    expect(record?.replies?.[0]?.mailed).toBe("unconfigured");
  });

  it("takes an address given on a follow-up, and mails the next reply there", async () => {
    const submitted = await submitLetter(testEnv, { letter: "First, no address.", fromName: "Later" });
    if (!submitted.ok) throw new Error("not stored");
    await replyToLetter(testEnv, submitted.record.letter_id, "Who are you?");
    sends = [];
    const added = await addFollowUp(
      testEnv,
      submitted.record.letter_id,
      "Here is where to write.",
      "later@example.test",
    );
    expect(added.ok).toBe(true);
    sends = [];
    const record = await replyToLetter(testEnv, submitted.record.letter_id, "Got it.");
    expect(sends).toHaveLength(1);
    expect(sends[0]!.to).toEqual(["later@example.test"]);
    expect(record?.replies?.[1]?.mailed).toBe("sent");
    expect(record?.replies?.[0]?.mailed).toBeUndefined();
  });
});

describe("the keeper hears a letter land", () => {
  it("mails the alarm address on arrival, words and address inside, and again on a follow-up", async () => {
    const submitted = await submitLetter(testEnv, {
      letter: "Hi Sean, ten doors.",
      fromName: "Globally Fluent Team",
      replyTo: "team@example.test",
    });
    if (!submitted.ok) throw new Error("not stored");
    expect(sends).toHaveLength(1);
    expect(sends[0]!.to).toEqual(["keeper@example.test"]);
    expect(sends[0]!.subject).toContain(submitted.record.letter_id);
    expect(sends[0]!.subject).toContain("Globally Fluent Team");
    expect(sends[0]!.text).toContain("Hi Sean, ten doors.");
    expect(sends[0]!.text).toContain("team@example.test");
    expect(sends[0]!.text).toContain(`${BASE}/admin`);

    await replyToLetter(testEnv, submitted.record.letter_id, "Post ten.");
    sends = [];
    await addFollowUp(testEnv, submitted.record.letter_id, "Here are ten.");
    expect(sends).toHaveLength(1);
    expect(sends[0]!.subject).toMatch(/follow-up/);
    expect(sends[0]!.text).toContain("Here are ten.");
  });

  it("says when no address was left", async () => {
    const submitted = await submitLetter(testEnv, { letter: "Anonymous.", fromName: "Nobody" });
    if (!submitted.ok) throw new Error("not stored");
    expect(sends[0]!.text).toContain("No address left");
  });

  it("stores the letter exactly as before when the alarm address is unset", async () => {
    delete testEnv.ALERT_EMAIL;
    const submitted = await submitLetter(testEnv, { letter: "Quiet.", fromName: "Quiet" });
    expect(submitted.ok).toBe(true);
    expect(sends).toHaveLength(0);
  });
});
