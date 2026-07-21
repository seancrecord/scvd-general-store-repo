import { Hono } from "hono";
import { listGuestbook, signGuestbook } from "@/services/guestbook";
import { VOICE } from "@/store";
import { isRecord, type HonoEnv } from "@/types";

/**
 * GET/POST /api/guestbook — free to sign, capped at 500 characters,
 * every signer gets the visitor sticker.
 */
export const guestbookRoutes = new Hono<HonoEnv>();

guestbookRoutes.get("/api/guestbook", async (c) => {
  const entries = await listGuestbook(c.env, 25);
  return c.json({
    entries: entries.map(({ id, name, message, date }) => ({
      id,
      name,
      message,
      date,
    })),
    note: "Sign it yourself: POST { name, message }. Free, always.",
  });
});

guestbookRoutes.post("/api/guestbook", async (c) => {
  const body: unknown = await c.req.json().catch(() => null);
  if (!isRecord(body)) {
    return c.json(
      { error: "Send JSON with a name and a message. The pen's right there." },
      400,
    );
  }
  const result = await signGuestbook(c.env, body["name"], body["message"]);
  if (!result) {
    return c.json(
      {
        error:
          "A signature needs a name and a message (500 characters, tops).",
      },
      400,
    );
  }
  return c.json(
    {
      message: VOICE.guestbookThanks,
      entry: result.entry,
      sticker_url: `${c.env.STORE_BASE_URL}/badges/sticker.svg`,
    },
    201,
  );
});
