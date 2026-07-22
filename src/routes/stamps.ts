import { Hono } from "hono";
import { currentWeekKey } from "@/lib/kv-keys";
import { sanitizeText } from "@/lib/sanitize";
import { renderVisitStamp } from "@/services/stamp-svg";
import { getStamp, issueStamp } from "@/services/stamps";
import { isRecord, type HonoEnv } from "@/types";

/**
 * POST /api/stamp — a free, dated, ed25519-signed visit stamp for the
 * current week. The design rotates weekly. Verifiable at /api/verify.
 * GET /badges/stamps/:stamp_id.svg — the stamp itself, inked.
 */
export const stampRoutes = new Hono<HonoEnv>();

stampRoutes.post("/api/stamp", async (c) => {
  const body: unknown = await c.req.json().catch(() => null);
  const name = isRecord(body) ? sanitizeText(body["name"], 80) : "";
  const issued = await issueStamp(c.env, "visitor", name || undefined);
  return c.json(
    {
      message: `Stamped. Week ${issued.record.stamp.week}'s design — come back next week for the next one in the set.`,
      stamp: issued.record.stamp,
      signature: issued.record.signature,
      public_key: issued.record.public_key,
      verification_code: issued.record.stamp.stamp_id,
      verify_url: issued.verifyUrl,
      svg_url: issued.svgUrl,
      note: "Free, no purchase necessary. The design rotates weekly; the signature is forever.",
    },
    201,
  );
});

stampRoutes.get("/api/stamp", (c) =>
  c.json({
    note: `POST here (optional body: { "name": "..." }) for this week's free visit stamp. Current week: ${currentWeekKey()}.`,
  }),
);

stampRoutes.get("/badges/stamps/:stamp{[a-z0-9_]+\\.svg}", async (c) => {
  const stampId = c.req.param("stamp").replace(/\.svg$/, "");
  const record = await getStamp(c.env, stampId);
  if (!record) {
    return c.text("No stamp by that code in the book.", 404);
  }
  return c.body(
    renderVisitStamp({
      stamp: record.stamp,
      verifyUrl: `${c.env.STORE_BASE_URL}/api/verify/${record.stamp.stamp_id}`,
    }),
    200,
    {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=3600",
    },
  );
});
