import { Hono } from "hono";
import { getLucky } from "@/services/luckies";
import {
  renderLuckyCard,
  renderSampleLuckyCard,
} from "@/services/lucky-svg";
import type { HonoEnv } from "@/types";

/**
 * The lucky shelf's public face.
 * GET /luckies/sample.svg, the specimen card, what a buyer gets.
 * GET /luckies/:lucky_id.svg, a real lucky's card, the record itself.
 * GET /api/lucky/:lucky_id, the signed record as JSON.
 */
export const luckyRoutes = new Hono<HonoEnv>();

const SAMPLE_HEADERS = {
  "Content-Type": "image/svg+xml",
  "Cache-Control": "public, max-age=3600",
} as const;

/** Real cards re-ink when a status honestly changes; cache lightly. */
const CARD_HEADERS = {
  "Content-Type": "image/svg+xml",
  "Cache-Control": "public, max-age=300",
} as const;

luckyRoutes.get("/luckies/sample.svg", (c) => {
  return c.body(renderSampleLuckyCard(), 200, SAMPLE_HEADERS);
});

luckyRoutes.get("/luckies/:card{lucky_[a-z0-9]+\\.svg}", async (c) => {
  const luckyId = c.req.param("card").replace(/\.svg$/, "");
  const record = await getLucky(c.env, luckyId);
  if (!record) {
    return c.text("No lucky by that id in custody.", 404);
  }
  return c.body(
    renderLuckyCard({
      lucky: record.lucky,
      signature: record.signature,
      verifyUrl: `${c.env.STORE_BASE_URL}/api/verify/${luckyId}`,
    }),
    200,
    CARD_HEADERS,
  );
});

luckyRoutes.get("/api/lucky/:lucky_id", async (c) => {
  const luckyId = c.req.param("lucky_id");
  const record = await getLucky(c.env, luckyId);
  if (!record) {
    return c.json({ error: "No lucky by that id in custody." }, 404);
  }
  const base = c.env.STORE_BASE_URL;
  return c.json({
    lucky: record.lucky,
    signature: record.signature,
    public_key: record.public_key,
    algorithm: "ed25519",
    card_url: `${base}/luckies/${luckyId}.svg`,
    verify_url: `${base}/api/verify/${luckyId}`,
    note: "The card is the record. The object stays in custody.",
  });
});
