import { Hono } from "hono";
import { KV_KEYS } from "@/lib/kv-keys";
import { getFirstDollar } from "@/lib/metrics";
import { renderStorefront } from "@/pages/storefront-page";
import { listGuestbook } from "@/services/guestbook";
import { letterCounts } from "@/services/letters";
import { computeStats, storefrontLedgerLine } from "@/services/stats";
import { DEFAULT_WEEK_NOTE } from "@/store";
import type { HonoEnv } from "@/types";

/**
 * GET /, the human storefront. Reads the weekly note, bell count, and
 * recent guestbook entries; falls back gracefully if any shelf is bare.
 */
export const storefrontRoutes = new Hono<HonoEnv>();

storefrontRoutes.get("/", async (c) => {
  const [
    weekNote,
    bellCountRaw,
    guestbook,
    letters,
    patronRaw,
    stats,
    firstDollar,
  ] = await Promise.all([
    c.env.COUNTERS.get(KV_KEYS.weekNote),
    c.env.COUNTERS.get(KV_KEYS.bellCount),
    listGuestbook(c.env, 8).catch(() => []),
    letterCounts(c.env).catch(() => ({ received: 0, answered: 0 })),
    c.env.COUNTERS.get(KV_KEYS.patronNumber),
    computeStats(c.env).catch(() => null),
    getFirstDollar(c.env).catch(() => null),
  ]);
  return c.html(
    renderStorefront({
      base: c.env.STORE_BASE_URL,
      weekNote: weekNote || DEFAULT_WEEK_NOTE,
      bellCount: bellCountRaw ? parseInt(bellCountRaw, 10) : 0,
      guestbook,
      lettersReceived: letters.received,
      lettersAnswered: letters.answered,
      patronCount: patronRaw ? parseInt(patronRaw, 10) : 0,
      stats,
      ledgerLine: stats ? storefrontLedgerLine(stats) : undefined,
      firstDollar,
    }),
  );
});
