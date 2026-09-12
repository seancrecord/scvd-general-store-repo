import { Hono } from "hono";
import { isUrlTemplatePlaceholder } from "@/lib/url-template";
import { getCertificate } from "@/services/certificates";
import { buildReplayKit } from "@/services/replay-kit";
import type { HonoEnv } from "@/types";

/**
 * /api/replay/{cert_id} — one paid call as an integration test. JSON
 * only: the human face of the same call is the receipt page at
 * /api/verify/{cert_id}, which links here. See services/replay-kit.ts
 * for what is derived, what is recovered by hash, and what the store
 * says it does not retain.
 */
export const replayRoutes = new Hono<HonoEnv>();

replayRoutes.get("/api/replay/:cert_id", async (c) => {
  const id = c.req.param("cert_id");
  c.header("Cache-Control", "no-store");
  if (isUrlTemplatePlaceholder(id)) {
    return c.json(
      {
        error: "You fetched the URL template rather than a certificate id. Substitute a real cert_… id — every purchase response and every /api/verify answer carries one — and this endpoint assembles the kit.",
        example: `${c.env.STORE_BASE_URL}/api/replay/cert_4dww28dx5j`,
      },
      400,
    );
  }
  const record = await getCertificate(c.env, id);
  if (!record) {
    // No verdict on an absent record: not found is not "invalid".
    return c.json({ error: "No certificate by that id. Not a verdict: an id this store never issued is simply not here.", cert_id: id }, 404);
  }
  return c.json(await buildReplayKit(c.env, record));
});
