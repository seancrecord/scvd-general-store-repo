import { Hono } from "hono";
import { computePulse } from "@/services/pulse";
import type { HonoEnv } from "@/types";

/**
 * GET /pulse.json — the public funnel, organic only.
 *
 * Thin on purpose, same shape as /stats: the service computes, the
 * route serves. Endpoint only for now — whether any of this becomes
 * content on the storefront is a separate decision and not this file's
 * to make.
 */
export const pulseRoutes = new Hono<HonoEnv>();

pulseRoutes.get("/pulse.json", async (c) => {
  return c.json(await computePulse(c.env));
});
