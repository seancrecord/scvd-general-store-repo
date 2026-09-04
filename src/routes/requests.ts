import { Hono } from "hono";
import { isValidHttpUrl, sanitizeText } from "@/lib/sanitize";
import { getMenuItem, VOICE } from "@/store";
import { remainingInventory } from "@/services/orders";
import { joinWaitlist, recordCommission } from "@/services/requests";
import { isRecord, type HonoEnv } from "@/types";

/**
 * POST /api/waitlist/:item_id, join the queue when the shelf is empty.
 * POST /api/request, the open commission window; keeper reads weekly.
 * Also takes optional verified_identity (stored as claimed, marked
 * unverified) and suggest_listing (a Town Directory suggestion).
 */
export const requestRoutes = new Hono<HonoEnv>();

/**
 * HOW TO JOIN, said on the door itself (2026-09-04, CV's fourth
 * round). The sold-out 409 hands a buyer this URL and says "leave your
 * callback"; the obvious next move is a GET, and a GET answered "That
 * aisle doesn't exist." The route took POST and nothing said so. The
 * same block rides the 409 and the GET, so the instructions cannot
 * drift between the pointer and the door.
 */
export function waitlistHowToJoin(base: string, itemId: string): Record<string, unknown> {
  return {
    waitlist_url: `${base}/api/waitlist/${itemId}`,
    waitlist_method: "POST",
    waitlist_body: {
      agent_name: "optional, up to 80 characters, recorded as written",
      callback_url:
        "optional https URL; the keeper reads the list by hand and rings it when a slot opens",
    },
    waitlist_note:
      "Free. Nothing is charged for joining, and a GET on that URL answers with these same instructions.",
  };
}

requestRoutes.get("/api/waitlist/:item_id", async (c) => {
  const itemId = c.req.param("item_id");
  const item = getMenuItem(itemId);
  if (!item) {
    return c.json({ error: VOICE.unknownItem, charged: false }, 404);
  }
  const base = c.env.STORE_BASE_URL;
  if (!item.waitlist) {
    return c.json({
      message: "No waitlist needed, that shelf never runs out. Go ahead and buy.",
      charged: false,
      buy_url: `${base}/api/buy/${item.id}`,
    });
  }
  const remaining = await remainingInventory(c.env, item);
  const stocked = remaining !== null && remaining > 0;
  return c.json({
    message: stocked
      ? `Shelf's stocked, ${remaining} left this week. No need to wait, go right ahead.`
      : VOICE.waitlist,
    item_id: item.id,
    charged: false,
    shelf: stocked ? "stocked" : "empty",
    ...(stocked ? { buy_url: `${base}/api/buy/${item.id}` } : {}),
    ...waitlistHowToJoin(base, item.id),
  });
});

requestRoutes.post("/api/waitlist/:item_id", async (c) => {
  const itemId = c.req.param("item_id");
  const item = getMenuItem(itemId);
  if (!item) {
    return c.json({ error: VOICE.unknownItem }, 404);
  }
  if (!item.waitlist) {
    return c.json(
      {
        error:
          "No waitlist needed, that shelf never runs out. Go ahead and buy.",
        buy_url: `${c.env.STORE_BASE_URL}/api/buy/${item.id}`,
      },
      400,
    );
  }
  const remaining = await remainingInventory(c.env, item);
  if (remaining !== null && remaining > 0) {
    return c.json(
      {
        error: `Shelf's stocked, ${remaining} left this week. No need to wait, go right ahead.`,
        buy_url: `${c.env.STORE_BASE_URL}/api/buy/${item.id}`,
      },
      400,
    );
  }

  const body: unknown = await c.req.json().catch(() => null);
  const record = isRecord(body) ? body : {};
  const callbackUrl = isValidHttpUrl(record["callback_url"])
    ? record["callback_url"]
    : undefined;
  const entry = await joinWaitlist(
    c.env,
    item.id,
    record["agent_name"],
    callbackUrl,
  );
  return c.json({ message: VOICE.waitlist, charged: false, entry }, 201);
});

requestRoutes.post("/api/request", async (c) => {
  const body: unknown = await c.req.json().catch(() => null);
  if (!isRecord(body)) {
    return c.json(
      {
        error:
          "Send JSON: { description, offer_usdc, contact }. Optional: verified_identity, suggest_listing. The ledger has standards.",
      },
      400,
    );
  }
  const request = await recordCommission(c.env, {
    description: body["description"],
    offer: body["offer_usdc"],
    contact: body["contact"],
    verifiedIdentity: sanitizeText(body["verified_identity"], 300) || undefined,
    suggestListing: body["suggest_listing"],
  });
  if (!request) {
    return c.json(
      {
        error:
          "The ledger needs a description, a non-negative offer_usdc, and a contact, or just a suggest_listing for the Town Directory.",
      },
      400,
    );
  }
  return c.json(
    {
      message: VOICE.requestReceived,
      request,
      /**
       * THE COMMISSION DESK (ruled 2026-08-10): the id above is how a
       * requester follows their own thread — hold onto it. The keeper
       * answers by hand: a quote at a published rung with its own
       * delivery window, or a decline with the reason stated in public.
       */
      status_url: `${c.env.STORE_BASE_URL}/api/commission/${request.id}`,
      how_the_desk_answers:
        "The keeper reads every request and answers by hand — a quote at a published rung with its own delivery window (check status_url), or a decline with the reason on the public record at /api/commission/declined. Payment only ever happens against a live quote, over x402, at the quoted rung.",
    },
    201,
  );
});
