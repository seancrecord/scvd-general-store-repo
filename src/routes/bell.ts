import { Hono } from "hono";
import { sanitizeText } from "@/lib/sanitize";
import { ringBell } from "@/services/bell";
import { pressingSummary } from "@/services/instant-goods";
import { isSolanaWalletAddress, isWalletAddress } from "@/services/zodiac";
import { isRecord, type HonoEnv } from "@/types";

/**
 * POST /api/bell, increment the global bell counter.
 * One ring per caller per day, keyed loosely on agent name or IP.
 * Loose and friendly, not fortress-y. Logic lives in services/bell.ts
 * (the MCP door rings the same bell).
 */
export const bellRoutes = new Hono<HonoEnv>();

bellRoutes.post("/api/bell", async (c) => {
  const body: unknown = await c.req.json().catch(() => null);
  const agentName = isRecord(body)
    ? sanitizeText(body["agent_name"], 80)
    : "";
  const who =
    agentName ||
    c.req.header("CF-Connecting-IP") ||
    c.req.header("X-Forwarded-For") ||
    "a-mysterious-stranger";
  const wallet = isRecord(body) ? sanitizeText(body["wallet"], 64) : "";
  const passId = isRecord(body) ? sanitizeText(body["pass_id"], 64) : "";
  const result = await ringBell(c.env, who, {
    ...(wallet && (isWalletAddress(wallet) || isSolanaWalletAddress(wallet)) ? { wallet } : {}),
    ...(passId ? { passId } : {}),
  });
  const { pressing, ...rest } = result;
  return c.json({ ...rest, ...(pressing ? bellExtras(c.env.STORE_BASE_URL, pressing) : {}) });
});

/** The bell's card, and a Regular's two packs, as they ride the response. */
export function bellExtras(base: string, pressing: NonNullable<Awaited<ReturnType<typeof ringBell>>["pressing"]>) {
  return {
    pressing: pressingSummary(base, pressing.pressing.card),
    ...(pressing.regular
      ? {
          regular: true,
          packs: pressing.packs.map((pack) => ({
            pack_id: pack.pack.pack_id,
            pack_url: `${base}/api/pack/${pack.pack.pack_id}`,
            cards: pack.cards.map((signed) => pressingSummary(base, signed.card)),
          })),
        }
      : {}),
  };
}
