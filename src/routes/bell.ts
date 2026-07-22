import { Hono } from "hono";
import { sanitizeText } from "@/lib/sanitize";
import { ringBell } from "@/services/bell";
import { isRecord, type HonoEnv } from "@/types";

/**
 * POST /api/bell — increment the global bell counter.
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
  const result = await ringBell(c.env, who);
  return c.json(result);
});
