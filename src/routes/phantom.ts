import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import { getPhantomCheck } from "@/services/phantom";
import type { HonoEnv } from "@/types";

/**
 * GET /api/phantom/:check_id — pick up a phantom_check attestation.
 * A due-but-unswept check gets observed right here on read, so the
 * six-hour promise survives a missed cron tick.
 */
export const phantomRoutes = new Hono<HonoEnv>();

/** Paid-derived artifacts never sit in a shared cache. */
const noStore: MiddlewareHandler<HonoEnv> = async (c, next) => {
  await next();
  c.res.headers.set("Cache-Control", "no-store");
};

phantomRoutes.use("/api/phantom/*", noStore);

phantomRoutes.get("/api/phantom/:check_id", async (c) => {
  const record = await getPhantomCheck(c.env, c.req.param("check_id"));
  if (!record) {
    return c.json(
      { error: "No check by that id on the walk list. Check the pickup slip." },
      404,
    );
  }
  if (record.status === "scheduled") {
    return c.json({
      check_id: record.check_id,
      status: "scheduled",
      target: record.target,
      due_at: record.due_at,
      note: "The store hasn't walked past yet. Out-of-band means out-of-band — come back after the hour on the slip.",
    });
  }
  return c.json({
    check_id: record.check_id,
    status: "observed",
    target: record.target,
    observation: record.observation,
    signature: record.signature,
    public_key: record.public_key,
    algorithm: "ed25519",
    note: "Signed at the moment of looking. Verify against the key at /.well-known/scvd-signing-key.",
  });
});
