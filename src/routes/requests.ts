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
  return c.json({ message: VOICE.waitlist, entry }, 201);
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
  return c.json({ message: VOICE.requestReceived, request }, 201);
});
