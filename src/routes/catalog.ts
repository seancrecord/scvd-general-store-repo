import { Hono } from "hono";
import { MENU_ITEMS, STORE_METADATA } from "@/store";
import type { HonoEnv, MenuItem } from "@/types";

/**
 * GET /menu.json — the machine-readable catalog.
 * Renders at / for humans; this is the same shelf for agents.
 */

interface CatalogItem extends MenuItem {
  buy_url: string;
}

export const catalogRoutes = new Hono<HonoEnv>();

catalogRoutes.get("/menu.json", (c) => {
  const base = c.env.STORE_BASE_URL;
  const items: CatalogItem[] = MENU_ITEMS.map((item) => ({
    ...item,
    buy_url: `${base}/api/buy/${item.id}`,
  }));
  return c.json({
    store: {
      ...STORE_METADATA,
      url: base,
      llms_txt: `${base}/llms.txt`,
      signing_key: `${base}/.well-known/scvd-signing-key`,
    },
    items,
    free_shelf: {
      guestbook: {
        url: `${base}/api/guestbook`,
        note: "Free to sign. Every signer gets the visitor sticker.",
      },
      visitor_sticker: {
        url: `${base}/badges/sticker.svg`,
        note: "No purchase necessary.",
      },
      bell: {
        url: `${base}/api/bell`,
        note: "POST to ring it. Once a day per visitor. It's a good bell.",
      },
    },
  });
});
