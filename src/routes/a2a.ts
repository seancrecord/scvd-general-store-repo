import { Hono } from "hono";
import { a2aDoc, handleA2aRequest } from "@/services/a2a-evidence";
import type { HonoEnv } from "@/types";

/**
 * /a2a — the evidence agent's task endpoint (2026-09-03, roadmap A2).
 * GET serves the door's own document; POST is JSON-RPC 2.0,
 * message/send only. See services/a2a-evidence.ts for the tasks, the
 * artifact and the card.
 */
export const a2aRoutes = new Hono<HonoEnv>();

a2aRoutes.get("/a2a", (c) => c.json(a2aDoc(c.env.STORE_BASE_URL)));

a2aRoutes.post("/a2a", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error: the body must be JSON-RPC 2.0." } }, 400);
  }
  const answer = await handleA2aRequest(c.env, body);
  return c.json(answer.body, answer.status as 200, { "Cache-Control": "no-store" });
});
