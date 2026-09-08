import { Hono } from "hono";
import { cadenceFor } from "@/lib/cadence";
import { KV_KEYS } from "@/lib/kv-keys";
import { sanitizeText } from "@/lib/sanitize";
import {
  LETTER_CAP,
  getLetter,
  letterThread,
  submitLetter,
} from "@/services/letters";
import { isRecord, type HonoEnv } from "@/types";
import { kvGet, kvPut } from "@/lib/kv-retry";

/**
 * The Mailbox, public side. POST /api/letter, free, one per visitor
 * per day. GET /api/letter/:id, status and the signed reply if one
 * exists. The letter itself never comes back out: private means the
 * box only opens from the keeper's side.
 */
export const letterRoutes = new Hono<HonoEnv>();

const DAY_SECONDS = 86400;

letterRoutes.post("/api/letter", async (c) => {
  const body: unknown = await c.req.json().catch(() => null);
  if (!isRecord(body)) {
    return c.json(
      {
        error:
          'Send JSON: { "letter": "...", "from_name": "(optional)", "verified_identity": "(optional)" }. Paper and ink are on us.',
      },
      400,
    );
  }

  // One letter per visitor per day, same easy arithmetic as the bell.
  const fromName = sanitizeText(body["from_name"], 80);
  const who =
    fromName ||
    c.req.header("CF-Connecting-IP") ||
    c.req.header("X-Forwarded-For") ||
    "a-mysterious-correspondent";
  const today = new Date().toISOString().slice(0, 10);
  const sentKey = KV_KEYS.letterSent(who.toLowerCase(), today);
  if (await kvGet(c.env.COUNTERS, sentKey)) {
    return c.json(
      {
        error:
          "One letter a day, friend. The box is small and the keeper reads slow, on purpose. Tomorrow's mail goes out tomorrow.",
        ...(cadenceFor("letter") ? { cadence: cadenceFor("letter") } : {}),
      },
      429,
    );
  }

  const submitted = await submitLetter(c.env, {
    letter: body["letter"],
    fromName: body["from_name"],
    verifiedIdentity: sanitizeText(body["verified_identity"], 300) || undefined,
  });
  if (!submitted) {
    return c.json(
      {
        error: `A letter needs words in it. ${LETTER_CAP} characters, tops, it's a mailbox, not a manuscript drawer.`,
      },
      400,
    );
  }
  await kvPut(c.env.COUNTERS, sentKey, "1", { expirationTtl: DAY_SECONDS });

  return c.json(
    {
      message:
        "Letter's in the box. The keeper reads Sundays and replies when he has something to say, which is not always. Check your pickup URL, no news is also an answer, just a slower one.",
      letter_id: submitted.record.letter_id,
      pickup_url: submitted.pickupUrl,
      privacy:
        "Letters are private. Nothing you wrote appears on any public surface, ever, the storefront counts letters; it doesn't quote them.",
      ...(cadenceFor("letter") ? { cadence: cadenceFor("letter") } : {}),
      ...(submitted.record.verified_identity
        ? {
            identity_note:
              "We wrote your identity down exactly as you gave it, and marked it unverified, because we haven't. Honest walls only.",
          }
        : {}),
    },
    201,
  );
});

letterRoutes.get("/api/letter/:letter_id", async (c) => {
  const record = await getLetter(c.env, c.req.param("letter_id"));
  if (!record) {
    return c.json(
      { error: "No letter by that id in the box. Check the pickup slip." },
      404,
    );
  }
  /*
   * THE THREAD DECIDES, NOT THE STATUS (2026-09-08). Two things were
   * wrong with reading `record.status` here.
   *
   * FILING USED TO DESTROY THE ANSWER. "archived" was reported as
   * "read" — right, since how the keeper files his box is nobody
   * else's business — but the reply was served only when the status
   * read exactly "replied". So the moment he archived a letter he had
   * already answered, the correspondent's pickup URL went back to
   * saying nobody had written, and the signed reply they were told to
   * come and collect was gone. Housekeeping is not a retraction.
   *
   * A letter that HAS answers reports "replied" and serves them,
   * whatever the keeper has since done with his copy; a letter with
   * none still never leaks whether it was filed.
   */
  const thread = letterThread(record);
  const answered = thread.length > 0;
  const first = thread[0];
  const response: Record<string, unknown> = {
    letter_id: record.letter_id,
    status: answered ? "replied" : record.status === "archived" ? "read" : record.status,
    received: record.date,
    note: !answered
      ? "The keeper reads Sundays and replies when he has something to say, which is not always."
      : thread.length === 1
        ? "The keeper wrote back. The reply below is signed, verify it against the key at /.well-known/scvd-signing-key."
        : `The keeper wrote back ${thread.length} times. Every answer is under "replies", oldest first, each signed on its own — verify them against the key at /.well-known/scvd-signing-key. The "reply" field stays the FIRST answer, unchanged, so nothing this store has published ever changes meaning under you. Each signature covers its own reply; it does not prove the list is complete.`,
  };
  if (first) {
    response["reply"] = first.reply;
    response["reply_signature"] = first.signature;
    response["reply_public_key"] = first.public_key;
    response["replied_at"] = first.replied_at;
    response["replies"] = thread;
  }
  return c.json(response);
});
