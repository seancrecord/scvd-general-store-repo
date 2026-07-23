import { Hono } from "hono";
import { FAVICON_SVG, faviconIcoBytes } from "@/services/favicon";
import { STORE_METADATA } from "@/store";
import type { HonoEnv } from "@/types";

/**
 * GET /favicon.svg, /favicon.ico, /site.webmanifest.
 * The .ico route also covers every page that never asked: browsers
 * request it by convention, so no page needs its own wiring.
 */
export const faviconRoutes = new Hono<HonoEnv>();

const DAY_CACHE = "public, max-age=86400" as const;

faviconRoutes.get("/favicon.svg", (c) => {
  return c.body(FAVICON_SVG, 200, {
    "Content-Type": "image/svg+xml",
    "Cache-Control": DAY_CACHE,
  });
});

faviconRoutes.get("/favicon.ico", (c) => {
  return c.body(faviconIcoBytes(), 200, {
    "Content-Type": "image/x-icon",
    "Cache-Control": DAY_CACHE,
  });
});

faviconRoutes.get("/site.webmanifest", (c) => {
  return c.json(
    {
      name: STORE_METADATA.name,
      short_name: "SCVD",
      icons: [
        { src: "/favicon.svg", sizes: "any", type: "image/svg+xml" },
        { src: "/favicon.ico", sizes: "32x32", type: "image/x-icon" },
      ],
      theme_color: "#f4ead8",
      background_color: "#f4ead8",
      display: "browser",
      start_url: "/",
    },
    200,
    { "Cache-Control": DAY_CACHE },
  );
});
