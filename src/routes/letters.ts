import { Hono } from "hono";
import { KV_KEYS } from "@/lib/kv-keys";
import { sanitizeText } from "@/lib/sanitize";
import { getLetter, LETTER_CAP, submitLetter } from "@/services/letters";
import { isRecord, type HonoEnv } from "@/types";

/**
 * The Mailbox, public side. POST /api/letter — free, one per visitor
 * per day. GET /api/letter/:id — status and the signed reply if one
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

  // One letter per visitor per day — same easy arithmetic as the bell.
  const fromName = sanitizeText(body["from_name"], 80);
  const who =
    fromName ||
    c.req.header("CF-Connecting-IP") ||
    c.req.header("X-Forwarded-For") ||
    "a-mysterious-correspondent";
  const today = new Date().toISOString().slice(0, 10);
  const sentKey = KV_KEYS.letterSent(who.toLowerCase(), today);
  if (await c.env.COUNTERS.get(sentKey)) {
    return c.json(
      {
        error:
          "One letter a day, friend. The box is small and the keeper reads slow, on purpose. Tomorrow's mail goes out tomorrow.",
      },
      429,
    );
  }

  const submitted = await submitLetter(c.env, {
    letter: body["letter"],
    fromName: body["from_name"],
    verifiedIdentity:
      sanitizeText(body["verified_identity"], 300) || undefined,
  });
  if (!submitted) {
    return c.json(
      {
        error: `A letter needs words in it. ${LETTER_CAP} characters, tops — it's a mailbox, not a manuscript drawer.`,
      },
      400,
    );
  }
  await c.env.COUNTERS.put(sentKey, "1", { expirationTtl: DAY_SECONDS });

  return c.json(
    {
      message:
        "Letter's in the box. The keeper reads Sundays and replies when he has something to say, which is not always. Check your pickup URL — no news is also an answer, just a slower one.",
      letter_id: submitted.record.letter_id,
      pickup_url: submitted.pickupUrl,
      privacy:
        "Letters are private. Nothing you wrote appears on any public surface, ever — the storefront counts letters; it doesn't quote them.",
      ...(submitted.record.verified_identity
        ? {
            identity_note:
              "We wrote your identity down exactly as you gave it, and marked it unverified — because we haven't. Honest walls only.",
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
  const response: Record<string, unknown> = {
    letter_id: record.letter_id,
    status: record.status === "archived" ? "read" : record.status,
    received: record.date,
    note:
      record.status === "replied"
        ? "The keeper wrote back. The reply below is signed — verify it against the key at /.well-known/scvd-signing-key."
        : "The keeper reads Sundays and replies when he has something to say, which is not always.",
  };
  if (record.status === "replied" && record.reply) {
    response["reply"] = record.reply;
    response["reply_signature"] = record.reply_signature;
    response["reply_public_key"] = record.reply_public_key;
    response["replied_at"] = record.replied_at;
  }
  return c.json(response);
});
