import { Hono } from "hono";
import { listingSpec, SPEC_SCHEMA_PATH } from "@/lib/listing-spec";
import { freshness } from "@/lib/freshness";
import { BASE_NETWORK, priceTiersUsdc } from "@/lib/payments";
import {
  renderItemMarkdown,
  renderMenuMarkdown,
  wantsMarkdown,
} from "@/services/menu-markdown";
import { stockedShelfCount } from "@/services/fulfillment";
import { USE_WHEN } from "@/store/spec";
import { shutterState } from "@/services/shutter";
import type { ShutterState } from "@/services/shutter";
import { computeStats, trackRecordLine } from "@/services/stats";
import {
  getMenuItem,
  MENU_ITEMS,
  STORE_METADATA,
  STORE_SERVICE_NAME,
} from "@/store";
import { GUARANTEED, NOT_GUARANTEED } from "@/store/spec";
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
  /** S1: the uniform listing spec, one shape storewide. */
  spec: ReturnType<typeof listingSpec>;
  /** C3: the guaranteed / not-guaranteed split, storewide. */
  guaranteed: readonly string[];
  not_guaranteed: readonly string[];
  /** Fulfillment restructure: agents deserve to know before they 402. */
  fulfillment_state: FulfillmentState;
}

interface FulfillmentState {
  class: "stocked" | "instant" | "commission";
  stock?: number;
  shutter: "open" | "closed";
  sla_hours?: number;
}

async function fulfillmentState(
  env: Parameters<typeof stockedShelfCount>[0],
  item: MenuItem,
  shutter: ShutterState,
): Promise<FulfillmentState> {
  if (item.stocked) {
    return {
      class: "stocked",
      stock: await stockedShelfCount(env, item),
      shutter: "open",
    };
  }
  if (item.fulfillment === "instant") {
    return { class: "instant", shutter: "open" };
  }
  return {
    class: "commission",
    shutter: shutter.closed ? "closed" : "open",
    sla_hours: item.sla_hours ?? 168,
  };
}

export const catalogRoutes = new Hono<HonoEnv>();

const MARKDOWN_HEADERS = {
  "Content-Type": "text/markdown; charset=utf-8",
} as const;

catalogRoutes.get("/menu.json", async (c) => {
  const base = c.env.STORE_BASE_URL;
  if (wantsMarkdown(c.req.header("Accept"))) {
    return c.text(renderMenuMarkdown(MENU_ITEMS, base), 200, MARKDOWN_HEADERS);
  }
  // The books are part of the catalog's root metadata (C2); a ledger
  // hiccup never blocks the menu.
  const stats = await computeStats(c.env).catch(() => null);
  const shutter: ShutterState = await shutterState(c.env).catch(() => ({
    closed: false,
  }));
  const items: CatalogItem[] = await Promise.all(
    MENU_ITEMS.map(async (item) => ({
      ...item,
      buy_url: `${base}/api/buy/${item.id}`,
      price_tiers_usdc: priceTiersUsdc(item),
      spec: listingSpec(item, base),
      guaranteed: GUARANTEED,
      not_guaranteed: NOT_GUARANTEED,
      fulfillment_state: await fulfillmentState(c.env, item, shutter),
      ...(item.sample_url ? { sample_url: `${base}${item.sample_url}` } : {}),
    })),
  );
  return c.json({
    ...freshness(),
    store: {
      ...STORE_METADATA,
      // THE NAMING LAW, tier 2: the spread carries the tier-3 full
      // name, which is retired from metadata. Overridden here so this
      // field matches serviceName and x402.json character for character.
      name: STORE_SERVICE_NAME,
      network: BASE_NETWORK,
      x402_version: 2,
      url: base,
      human_shelf: shutter.closed
        ? "shuttered (the keeper is away from the counter; human-labor purchases are refused before money moves; machine shelves and stocked shelves keep selling)"
        : "open",
      ...(stats ? { track_record: trackRecordLine(stats, base) } : {}),
      stats: `${base}/stats`,
      listing_spec_schema: `${base}${SPEC_SCHEMA_PATH}`,
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
    // The reverse index: situation -> item ids. why_use tells an agent
    // what an item is; this tells it whether it is in the situation the
    // item answers, which is the question that comes first.
    use_when: USE_WHEN.map((entry) => ({
      when: entry.when,
      items: [...entry.items],
      example: entry.example,
    })),
    items,
    reading_room: {
      almanac: {
        url: `${base}/almanac`,
        note: "The keeper's serialized journal. Free index; each dated page is a penny over x402.",
      },
      gazette: {
        url: `${base}/gazette`,
        note: "Dispatches assembled from reviewed Trading Post tips. Free index; a penny a copy. The founding edition is free at /gazette/founding, take one.",
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
        note: "Out front. Nothing for sale out there. Stay as long as your timeout allows.",
      },
      request_window: {
        url: `${base}/api/request`,
        note: "Want something we don't stock, or a price that doesn't fit? POST { description, offer_usdc, contact }. The keeper reads every one on Sundays. Coffee's for closers.",
      },
    },
  });
});

catalogRoutes.get("/menu/:item_id", async (c) => {
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
  const shutter: ShutterState = await shutterState(c.env).catch(() => ({
    closed: false,
  }));
  return c.json({
    ...item,
    buy_url: `${base}/api/buy/${item.id}`,
    price_tiers_usdc: priceTiersUsdc(item),
    spec: listingSpec(item, base),
    guaranteed: GUARANTEED,
    not_guaranteed: NOT_GUARANTEED,
    fulfillment_state: await fulfillmentState(c.env, item, shutter),
    ...(item.sample_url ? { sample_url: `${base}${item.sample_url}` } : {}),
    markdown_note:
      "This same URL serves markdown when the Accept header prefers text/markdown.",
  });
});
