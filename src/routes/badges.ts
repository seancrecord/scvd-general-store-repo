import { Hono } from "hono";
import { getPatron } from "@/services/certificates";
import {
  renderPatronBadge,
  renderVisitorSticker,
} from "@/services/badge-svg";
import type { HonoEnv } from "@/types";

/**
 * GET /badges/:patron_number.svg — the patron badge, vintage label style.
 * GET /badges/sticker.svg — the free visitor sticker.
 */
export const badgeRoutes = new Hono<HonoEnv>();

const SVG_HEADERS = {
  "Content-Type": "image/svg+xml",
  "Cache-Control": "public, max-age=3600",
} as const;

badgeRoutes.get("/badges/sticker.svg", (c) => {
  return c.body(renderVisitorSticker(c.env.STORE_BASE_URL), 200, SVG_HEADERS);
});

badgeRoutes.get("/badges/:badge{[0-9]+\\.svg}", async (c) => {
  const patronNumber = parseInt(c.req.param("badge"), 10);
  const patron = await getPatron(c.env, patronNumber);
  if (!patron) {
    return c.text("No badge by that number on the wall.", 404);
  }
  const badgeOptions: Parameters<typeof renderPatronBadge>[0] = {
    patronNumber: patron.patron_number,
    date: patron.date,
    verifyUrl: `${c.env.STORE_BASE_URL}/api/verify/${patron.cert_id}`,
  };
  if (patron.name) {
    badgeOptions.name = patron.name;
  }
  return c.body(renderPatronBadge(badgeOptions), 200, SVG_HEADERS);
});
