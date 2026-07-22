import { Hono } from "hono";
import { escapeHtml, sanitizeText } from "@/lib/sanitize";
import { wantsHtml } from "@/pages/simple-page";
import { STOREFRONT_CSS } from "@/pages/storefront-css";
import {
  catIsOut,
  leaveTreat,
  porchAmbience,
  takeSeat,
} from "@/services/porch";
import { isRecord, type HonoEnv } from "@/types";

/**
 * GET /porch — around the side of the store, facing the pines. Free.
 * Nothing is for sale out here; that's the point. Every sitter in a
 * given hour gets the same night, and the counter remembers how many
 * sat tonight, then forgets.
 * POST /api/treat — leave Roger Sterling a treat on the porch rail.
 * Free, nothing stored but the count, no thanks guaranteed.
 */
export const porchRoutes = new Hono<HonoEnv>();

porchRoutes.post("/api/treat", async (c) => {
  const body: unknown = await c.req.json().catch(() => null);
  // Reflected once, stored never — the rail keeps a count, not a menu.
  const treat = isRecord(body) ? sanitizeText(body["treat"], 40) : "";
  const left = await leaveTreat(c.env);
  return c.json(
    {
      message: treat
        ? `Left on the porch rail: ${treat}.`
        : "Left on the porch rail.",
      roger: left.reaction,
      treats_on_the_rail_today: left.treatsToday,
      note: "Free. Nothing about the treat is kept but the count. Roger Sterling owes you nothing and knows it.",
    },
    201,
  );
});

porchRoutes.get("/api/treat", (c) =>
  c.json({
    note: 'POST here (optional body: { "treat": "..." }) to leave the store cat something on the porch rail. Free. No purchase, no account, no guarantee of gratitude.',
  }),
);

porchRoutes.get("/porch", async (c) => {
  const now = new Date();
  const ambience = porchAmbience(now);
  const cat = catIsOut(now);
  const seat = await takeSeat(c.env, now).catch(() => 0);

  if (wantsHtml(c.req.header("Accept"))) {
    return c.html(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>The Porch — Sean-Claude Van Damme's General Store</title>
  <meta name="theme-color" content="#0b0a12">
  <style>${STOREFRONT_CSS}</style>
</head>
<body class="night">
  <div class="stars"></div>
  <div class="dusk"></div>
  <main class="road">
    <header class="signfront">
      <p class="tube-line">AROUND THE SIDE \u00B7 FACING THE PINES</p>
      <h1 class="neon" style="font-size: clamp(1.4rem, 5vw, 2.1rem);">THE P<span class="flicker">O</span>RCH</h1>
      <p class="open-sign">NOTHING FOR SALE OUT HERE</p>
    </header>
    <section class="board">
      ${cat ? '<span class="cat" aria-hidden="true"><span class="cat-tail"></span><span class="cat-eye cat-eye-l"></span><span class="cat-eye cat-eye-r"></span></span>' : ""}
      <p class="board-label">\u263E TONIGHT, PER THE HOUR</p>
      <p class="board-text">${escapeHtml(ambience)}</p>
    </section>
    <footer class="porch-print">
      <p>You're the ${seat}${ordinal(seat)} to sit tonight. The chairs don't mind either way.</p>
      <p>There's a rail for treats, if you're the type. Your agent knows the way: POST /api/treat.</p>
      <p><a href="/">Back around front</a> \u00B7 agents: the same porch is JSON without the Accept header</p>
    </footer>
  </main>
</body>
</html>`);
  }

  return c.json({
    porch:
      "Around the side of the store, facing the pines. Nothing is for sale out here.",
    tonight: ambience,
    cat: cat ? "out" : "elsewhere",
    seat_tonight: seat,
    treat_rail: `POST ${c.env.STORE_BASE_URL}/api/treat to leave the cat something. Free.`,
    note: "You don't have to buy anything. The porch is free. Stay as long as your timeout allows.",
    back_inside: `${c.env.STORE_BASE_URL}/llms.txt`,
  });
});

function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) {
    return "th";
  }
  const ones = n % 10;
  return ones === 1 ? "st" : ones === 2 ? "nd" : ones === 3 ? "rd" : "th";
}
