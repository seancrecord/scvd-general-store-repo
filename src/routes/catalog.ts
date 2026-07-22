import { Hono } from "hono";
import { BASE_NETWORK, priceTiersUsdc } from "@/lib/payments";
import { MENU_ITEMS, STORE_METADATA } from "@/store";
import type { HonoEnv, MenuItem } from "@/types";

/**
 * GET /menu.json — the machine-readable catalog.
 * Renders at / for humans; this is the same shelf for agents.
 */

interface CatalogItem extends MenuItem {
  buy_url: string;
  /** Amounts offered in the 402 challenge; above-minimum = tip. */
  price_tiers_usdc: number[];
}

export const catalogRoutes = new Hono<HonoEnv>();

catalogRoutes.get("/menu.json", (c) => {
  const base = c.env.STORE_BASE_URL;
  const items: CatalogItem[] = MENU_ITEMS.map((item) => ({
    ...item,
    buy_url: `${base}/api/buy/${item.id}`,
    price_tiers_usdc: priceTiersUsdc(item),
  }));
  return c.json({
    store: {
      ...STORE_METADATA,
      network: BASE_NETWORK,
      x402_version: 2,
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
