import { Hono } from "hono";
import { readWatch } from "@/services/standing-watch";
import { readConformanceWatch } from "@/services/conformance-watch";
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

/**
 * GET /api/conformance-watch/:watch_id — a conformance watch's week,
 * same contract as its hourly sibling: free forever, each daily pass
 * signed alone, the days WE missed derived at read and counted
 * against us, and drift stated as recomputable arithmetic.
 */
watchRoutes.get("/api/conformance-watch/:watch_id", async (c) => {
  const history = await readConformanceWatch(c.env, c.req.param("watch_id"));
  if (!history) {
    return c.json(
      { error: "No conformance watch by that id. Ids start with cwatch_ and come from the purchase response." },
      404,
    );
  }
  return c.json(history, 200, { "Cache-Control": "no-store" });
});
