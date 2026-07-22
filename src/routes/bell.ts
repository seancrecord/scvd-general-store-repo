import { Hono } from "hono";
import { KV_KEYS } from "@/lib/kv-keys";
import { sanitizeText } from "@/lib/sanitize";
import { VOICE, bellLine } from "@/store";
import { isRecord, type HonoEnv } from "@/types";

/**
 * POST /api/bell — increment the global bell counter.
 * One ring per caller per day, keyed loosely on agent name or IP.
 * Loose and friendly, not fortress-y.
 */
export const bellRoutes = new Hono<HonoEnv>();

const DAY_SECONDS = 86400;

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
  const today = new Date().toISOString().slice(0, 10);
  const ringKey = KV_KEYS.bellRing(who.toLowerCase(), today);

  const currentCount = parseInt(
    (await c.env.COUNTERS.get(KV_KEYS.bellCount)) ?? "0",
    10,
  );

  if (await c.env.COUNTERS.get(ringKey)) {
    return c.json({ message: VOICE.bellRungAlready, count: currentCount });
  }

  const count = currentCount + 1;
  await c.env.COUNTERS.put(KV_KEYS.bellCount, String(count));
  await c.env.COUNTERS.put(ringKey, "1", { expirationTtl: DAY_SECONDS });

  return c.json({ message: bellLine(count), count });
});
