import { Hono } from "hono";
import { buildAnchorLogDocument } from "@/services/anchor-log";
import type { HonoEnv } from "@/types";

/**
 * GET /.well-known/anchor-log.json — the externally timestamped hash
 * chain over this store's key state, published so it can be checked.
 *
 * A COMMITMENT NOBODY HAS TO TAKE OUR WORD FOR. Each entry hashes the
 * key state plus the previous entry's digest, and the digests are
 * submitted to OpenTimestamps, which aggregates them into Bitcoin.
 * Once a proof upgrades to Bitcoin-confirmed, "this key state existed
 * before block N" is a fact about the Bitcoin chain rather than a
 * claim on this page — which is exactly the property a self-hosted,
 * mutable key registry cannot have on its own.
 *
 * THE DOCUMENT ITSELF is built in services/anchor-log.ts since
 * 2026-08-03, because the conformance desk needs the same bytes and
 * cannot fetch this route — Cloudflare refuses a Worker's subrequest
 * to its own hostname. One producer, two consumers, no copy to drift.
 * The full prose — what the log proves, what it cannot, and the
 * six-step check that needs nothing from us — ships inside the
 * document, where the reader who needs it is.
 */
export const anchorLogRoutes = new Hono<HonoEnv>();

anchorLogRoutes.get("/.well-known/anchor-log.json", async (c) => {
  return c.json(await buildAnchorLogDocument(c.env));
});
