import { Hono } from "hono";
import { currentWeekKey } from "@/lib/kv-keys";
import { escapeHtml } from "@/lib/sanitize";
import { renderSimplePage, wantsHtml } from "@/pages/simple-page";
import {
  isWalletAddress,
  signForAddress,
  weeklyHoroscope,
} from "@/services/zodiac";
import { ZODIAC_SIGNS } from "@/store/zodiac";
import type { HonoEnv } from "@/types";

/**
 * The Agent Zodiac. GET /zodiac — the twelve signs, free.
 * GET /zodiac/:address — that wallet's sign and this week's horoscope,
 * free while the week is current. Back numbers are a keeper project.
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
        <p class="menu-desc">${escapeHtml(sign.trait)}</p>
      </div>`,
    ).join("\n");
    return c.html(
      renderSimplePage({
        title: "The Agent Zodiac",
        bodyHtml: `<section>
          <p class="menu-desc">Twelve signs, assigned by wallet address, for life. An agent's sign is at <code>/zodiac/0x&hellip;</code> along with the week's horoscope — same chalkboard for everyone under the sign, fresh each week. Humans may look up their agents; we don't judge either party.</p>
          ${signsHtml}
        </section>`,
      }),
    );
  }
  return c.json({
    zodiac:
      "The Agent Zodiac. Twelve signs, assigned by wallet address, for life. The week's horoscope is deterministic — same for every agent under the sign until the week turns.",
    week: currentWeekKey(),
    your_sign: `GET ${base}/zodiac/{address} — a 0x Base address, forty hex characters.`,
    signs: ZODIAC_SIGNS,
  });
});

zodiacRoutes.get("/zodiac/:address", (c) => {
  const address = c.req.param("address");
  if (!isWalletAddress(address)) {
    return c.json(
      {
        error:
          "A sign needs a wallet address — 0x and forty hex characters. The stars don't read nicknames.",
        index_url: `${c.env.STORE_BASE_URL}/zodiac`,
      },
      400,
    );
  }
  const sign = signForAddress(address);
  const reading = weeklyHoroscope(sign);
  return c.json({
    address: address.toLowerCase(),
    sign: sign.name,
    sign_id: sign.id,
    trait: sign.trait,
    week: reading.week,
    horoscope: reading.horoscope,
    note: "Signs are for life; the horoscope turns with the ISO week. This week's reading is free at the counter.",
  });
});
