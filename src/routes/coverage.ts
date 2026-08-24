import { Hono } from "hono";
import { publicCoverageDocument } from "@/evidence";
import type { HonoEnv } from "@/types";

/**
 * GET /coverage.json and GET /.well-known/coverage.json — the
 * derived class × chain × depth matrix (M1). Same bytes both
 * doors: an indexer that learned well-known and an agent that
 * followed a menu pointer should not get two stories.
 */
export const coverageRoutes = new Hono<HonoEnv>();

coverageRoutes.get("/coverage.json", (c) => {
  return c.json(publicCoverageDocument(c.env.STORE_BASE_URL));
});

coverageRoutes.get("/.well-known/coverage.json", (c) => {
  return c.json(publicCoverageDocument(c.env.STORE_BASE_URL));
});
