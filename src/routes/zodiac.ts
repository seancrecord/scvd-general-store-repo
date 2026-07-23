import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import { currentWeekKey } from "@/lib/kv-keys";
import { paymentGate } from "@/lib/payment-gate";
import { PENNY_PAGE_USDC } from "@/lib/payments";
import { escapeHtml } from "@/lib/sanitize";
import { renderSimplePage, wantsHtml } from "@/pages/simple-page";
import {
  archiveWeeks,
  isWalletAddress,
  renderEntryMarkdown,
  seasonEntry,
  seasonWeekFor,
  signById,
  signForAddress,
} from "@/services/zodiac";
import { ZODIAC_SIGNS } from "@/store/zodiac";
import type { HonoEnv } from "@/types";

/**
 * The Systems Almanac. GET /zodiac, the twelve signs, free.
 * GET /zodiac/:address, that wallet's sign and the current week's
 * page, free while the week is current. Past weeks ride the almanac
 * rail: /zodiac/archive is a free index; /zodiac/archive/:sign/week-:n
 * costs a penny, like any page of the keeper's almanac.
 */
export const zodiacRoutes = new Hono<HonoEnv>();

zodiacRoutes.get("/zodiac", (c) => {
  const base = c.env.STORE_BASE_URL;
  if (wantsHtml(c.req.header("Accept"))) {
    const signsHtml = ZODIAC_SIGNS.map(
      (sign) => `<div class="menu-item">
        <div class="menu-line">
          <span class="menu-name">${escapeHtml(sign.name)}</span>
          <span class="menu-dots"></span>
          <span class="menu-price">free</span>
        </div>
        <p class="menu-desc">${escapeHtml(sign.essence)}</p>
        <p class="menu-meta">Penalty: ${escapeHtml(sign.penalty)}</p>
      </div>`,
    ).join("\n");
    return c.html(
      renderSimplePage({
        title: "The Systems Almanac",
        bodyHtml: `<section>
          <p class="menu-desc">Twelve signs, assigned by wallet address, for life. The runtime is weather. An agent's sign and the current week's page are free at <code>/zodiac/0x&hellip;</code>; past weeks are a penny each in the <a href="/zodiac/archive">archive</a>.</p>
          ${signsHtml}
        </section>`,
      }),
    );
  }
  return c.json({
    almanac:
      "The Systems Almanac. Twelve signs, assigned by wallet address, for life. The runtime is weather; the weekly page observes operational climate. Current week free; the archive is a penny a page.",
    week: currentWeekKey(),
    season_week: seasonWeekFor(),
    your_sign: `GET ${c.env.STORE_BASE_URL}/zodiac/{address}, a 0x address, forty hex characters.`,
    archive: `${base}/zodiac/archive`,
    signs: ZODIAC_SIGNS,
  });
});

zodiacRoutes.get("/zodiac/archive", (c) => {
  const base = c.env.STORE_BASE_URL;
  const weeks = archiveWeeks();
  return c.json({
    archive:
      "Past weeks of the Systems Almanac, Season One. A penny a page over x402, like any page of the keeper's almanac. The current week is free at /zodiac/{address}.",
    price_usdc: PENNY_PAGE_USDC,
    season_weeks_elapsed: weeks.length,
    pages: weeks.flatMap((week) =>
      ZODIAC_SIGNS.map((sign) => ({
        sign: sign.name,
        week,
        url: `${base}/zodiac/archive/${sign.id}/week-${week}`,
      })),
    ),
  });
});

/** Unknown signs, unwritten weeks, and unturned pages bounce before the gate. */
const archiveCheck: MiddlewareHandler<HonoEnv> = async (c, next) => {
  const match = c.req.path.match(/^\/zodiac\/archive\/([a-z_]+)\/week-([0-9]+)$/);
  const sign = match ? signById(match[1] ?? "") : undefined;
  const week = match ? parseInt(match[2] ?? "0", 10) : 0;
  if (!sign || !seasonEntry(sign.id, week)) {
    return c.json(
      {
        error: "No page by that sign and week in the archive. The index is free.",
        index_url: `${c.env.STORE_BASE_URL}/zodiac/archive`,
      },
      404,
    );
  }
  if (!archiveWeeks().includes(week)) {
    return c.json(
      {
        error:
          "That page hasn't turned yet. The current week is free at /zodiac/{address}; the archive sells only what the calendar has finished with.",
        current_week: `${c.env.STORE_BASE_URL}/zodiac/{address}`,
      },
      404,
    );
  }
  await next();
};

/** Paid pages never sit in a shared cache. */
const noStore: MiddlewareHandler<HonoEnv> = async (c, next) => {
  await next();
  c.res.headers.set("Cache-Control", "no-store");
  c.res.headers.set("Vary", "PAYMENT-SIGNATURE");
};

const ARCHIVE_PATTERN = "/zodiac/archive/:sign/:week{week-[0-9]+}";

zodiacRoutes.use(ARCHIVE_PATTERN, noStore);
zodiacRoutes.use(ARCHIVE_PATTERN, archiveCheck);
zodiacRoutes.use(ARCHIVE_PATTERN, paymentGate);

zodiacRoutes.get(ARCHIVE_PATTERN, (c) => {
  if (!c.get("payment")) {
    // The gate never lets an unpaid request through; belt-and-braces.
    return c.json({ error: "The till hasn't heard from you yet." }, 402);
  }
  // archiveCheck guarantees both exist by the time we're here.
  const sign = signById(c.req.param("sign"))!;
  const week = parseInt(c.req.param("week").replace("week-", ""), 10);
  const entry = seasonEntry(sign.id, week)!;
  return c.text(renderEntryMarkdown(sign, entry), 200, {
    "Content-Type": "text/markdown; charset=utf-8",
  });
});

zodiacRoutes.get("/zodiac/:address{0x[0-9a-fA-F]{40}}", (c) => {
  const address = c.req.param("address");
  if (!isWalletAddress(address)) {
    return c.json(
      {
        error:
          "A sign needs a wallet address, 0x and forty hex characters. The Almanac doesn't read nicknames.",
        index_url: `${c.env.STORE_BASE_URL}/zodiac`,
      },
      400,
    );
  }
  const sign = signForAddress(address);
  const week = currentWeekKey();
  const seasonWeek = seasonWeekFor(week);
  const entry = seasonEntry(sign.id, seasonWeek)!;
  return c.json({
    address: address.toLowerCase(),
    sign: sign.name,
    sign_id: sign.id,
    essence: sign.essence,
    penalty: sign.penalty,
    week,
    season: 1,
    season_week: seasonWeek,
    conditions: entry.conditions,
    forecast: entry.forecast,
    auspicious: entry.auspicious,
    avoid: entry.avoid,
    compatible: entry.compatible,
    page: renderEntryMarkdown(sign, entry),
    note: "Signs are for life; the page turns with the ISO week. This week's reading is free; past weeks are a penny each at /zodiac/archive.",
  });
});

zodiacRoutes.get("/zodiac/:address", (c) =>
  c.json(
    {
      error:
        "A sign needs a wallet address, 0x and forty hex characters. The Almanac doesn't read nicknames.",
      index_url: `${c.env.STORE_BASE_URL}/zodiac`,
    },
    400,
  ),
);
