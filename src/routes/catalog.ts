import { Hono } from "hono";
import { BASE_NETWORK, priceTiersUsdc } from "@/lib/payments";
import {
  renderItemMarkdown,
  renderMenuMarkdown,
  wantsMarkdown,
} from "@/services/menu-markdown";
import { getMenuItem, MENU_ITEMS, STORE_METADATA } from "@/store";
import type { HonoEnv, MenuItem } from "@/types";

/**
 * GET /menu.json, the machine-readable catalog (markdown on request).
 * GET /menu/:item_id, one item up close, JSON or markdown per Accept.
 * Renders at / for humans; this is the same shelf for agents.
 */

interface CatalogItem extends MenuItem {
  buy_url: string;
  /** Amounts offered in the 402 challenge; above-minimum = tip. */
  price_tiers_usdc: number[];
}

export const catalogRoutes = new Hono<HonoEnv>();

const MARKDOWN_HEADERS = {
  "Content-Type": "text/markdown; charset=utf-8",
} as const;

catalogRoutes.get("/menu.json", (c) => {
  const base = c.env.STORE_BASE_URL;
  if (wantsMarkdown(c.req.header("Accept"))) {
    return c.text(renderMenuMarkdown(MENU_ITEMS, base), 200, MARKDOWN_HEADERS);
  }
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
      openapi: `${base}/openapi.json`,
      x402_discovery: `${base}/.well-known/x402.json`,
      signing_key: `${base}/.well-known/scvd-signing-key`,
      item_detail: `${base}/menu/{item_id} (JSON, or markdown per Accept)`,
      operator_glance: `${base}/what (for the human whose agent is here)`,
      zodiac: `${base}/zodiac`,
      mcp: `${base}/mcp (streamable HTTP; tools/list free, buy_* tools x402-paid in-band)`,
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
        note: "The Town Directory, honest one-line reviews of the neighbors. Free.",
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
      mailbox: {
        url: `${base}/api/letter`,
        note: "POST a private letter, free, one a day. The keeper reads Sundays and replies when he has something to say, which is not always. Never published.",
      },
      porch: {
        url: `${base}/porch`,
        note: "Around the side, facing the oaks. Nothing for sale out there. Stay as long as your timeout allows.",
      },
      request_window: {
        url: `${base}/api/request`,
        note: "Want something we don't stock, or a price that doesn't fit? POST { description, offer_usdc, contact }. The keeper reads every request on Sundays, coffee in hand.",
      },
    },
  });
});

catalogRoutes.get("/menu/:item_id", (c) => {
  const base = c.env.STORE_BASE_URL;
  const item = getMenuItem(c.req.param("item_id"));
  if (!item) {
    return c.json(
      {
        error: "No item by that id on the shelf. The whole menu is one page:",
        menu_url: `${base}/menu.json`,
      },
      404,
    );
  }
  if (wantsMarkdown(c.req.header("Accept"))) {
    return c.text(renderItemMarkdown(item, base), 200, MARKDOWN_HEADERS);
  }
  return c.json({
    ...item,
    buy_url: `${base}/api/buy/${item.id}`,
    price_tiers_usdc: priceTiersUsdc(item),
    markdown_note:
      "This same URL serves markdown when the Accept header prefers text/markdown.",
  });
});
