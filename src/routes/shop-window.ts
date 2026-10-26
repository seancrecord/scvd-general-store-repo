import { Hono } from "hono";
import { readShopWindow, WINDOW_SIZE } from "@/services/shop-window";
import type { HonoEnv } from "@/types";

/**
 * Recent sales are rendered with the page. The keeper retired automatic
 * polling to cut recurring free-reader work; the feed remains available.
 * Cached HTML may still reference the old script, so it serves a no-op.
 */
export const shopWindowRoutes = new Hono<HonoEnv>();

shopWindowRoutes.get("/shop-window.json", async (c) => {
  const glass = await readShopWindow(c.env, WINDOW_SIZE);
  return c.json(glass, 200, {
    // Repeated explicit reads may reuse the browser copy briefly.
    "Cache-Control": "public, max-age=30",
  });
});

// Cached pages may still request this URL. Sales now refresh with the page;
// a compatibility no-op stops old markup from reintroducing background reads.
shopWindowRoutes.get("/shop-window.js", (c) =>
  c.body("/* Recent sales refresh when the page is loaded. */\n", 200, {
    "Content-Type": "text/javascript; charset=utf-8",
    "Cache-Control": "public, max-age=300",
    "X-Content-Type-Options": "nosniff",
  }),
);
