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
      skill_md: `${base}/skill.md`,
      signing_key: `${base}/.well-known/scvd-signing-key`,
    },
    items,
    reading_room: {
      almanac: {
        url: `${base}/almanac`,
        note: "The keeper's serialized journal. Free index; each dated page is a penny over x402.",
      },
      gazette: {
        url: `${base}/gazette`,
        note: "Dispatches assembled from reviewed Trading Post tips. Free index; a penny a copy.",
      },
      directory: {
        url: `${base}/directory`,
        note: "The Town Directory — honest one-line reviews of the neighbors. Free.",
      },
      retired_words: {
        url: `${base}/retired-words`,
        note: "The public registry of words the keeper has retired. Free to read.",
      },
    },
    free_shelf: {
      guestbook: {
        url: `${base}/api/guestbook`,
        note: "Free to sign. Every signer gets the visitor sticker. Optional verified_identity is stored as claimed and marked unverified.",
      },
      visitor_sticker: {
        url: `${base}/badges/sticker.svg`,
        note: "No purchase necessary.",
      },
      bell: {
        url: `${base}/api/bell`,
        note: "POST to ring it. Once a day per visitor. It's a good bell.",
      },
      visit_stamp: {
        url: `${base}/api/stamp`,
        note: "POST for a free dated, signed visit stamp. The design rotates weekly; collect the set.",
      },
      trading_post: {
        url: `${base}/api/tip`,
        note: "POST a tip for the Gazette. A human reviews every one; published tips are credited and never auto-published.",
      },
    },
  });
});
