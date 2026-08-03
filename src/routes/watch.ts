import { Hono } from "hono";
import { readWatch } from "@/services/standing-watch";
import type { HonoEnv } from "@/types";

/**
 * GET /api/watch/:watch_id — a standing watch's history. Free forever,
 * like every verification surface here: the buyer paid for the
 * WATCHING, and reading what was seen costs nobody anything. Each
 * probe row carries its own signature, so any single row survives
 * being quoted alone, and the summary counts the hours WE missed
 * (rule 5b — the watcher's gaps are part of the record).
 */
export const watchRoutes = new Hono<HonoEnv>();

watchRoutes.get("/api/watch/:watch_id", async (c) => {
  const history = await readWatch(c.env, c.req.param("watch_id"));
  if (!history) {
    return c.json(
      { error: "No watch by that id. Watch ids start with watch_ and come from the purchase response." },
      404,
    );
  }
  return c.json(history, 200, { "Cache-Control": "no-store" });
});
