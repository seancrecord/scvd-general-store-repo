/**
 * THE COLD CANARY — a Worker that does nothing, so the cost of doing
 * nothing can be read (2026-09-05, the x402-list night read).
 *
 * The store's cold penalty (scripts/cold-read.mjs) is Cloudflare's
 * floor plus our script's share. This Worker is the floor: no
 * bindings, no imports, one route, the same Server-Timing line the
 * store writes so the same reader parses both. Read it beside the
 * store from one vantage right after both are deployed, and the
 * difference is what the 3.5 MB script costs before a line of ours
 * runs — the number that decides whether the bundle diet (ROADMAP)
 * is worth its risk.
 *
 * Deployed by the keeper's hand (KEEPER_LIST):
 *   npx wrangler deploy -c canary/wrangler.jsonc
 * then read with
 *   npm run cold:read -- --url=https://scvd.store/api/buy/hello --url=https://scvd-cold-canary.<account>.workers.dev/
 */
let bornAt = null;
let served = 0;

export default {
  fetch() {
    const cold = served === 0;
    served += 1;
    const now = Date.now();
    if (bornAt === null) bornAt = now;
    const age = Math.round((now - bornAt) / 1000);
    return new Response(JSON.stringify({ canary: "scvd-cold-canary", cold, age_s: age }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "Server-Timing": `isolate;desc=${cold ? "cold" : "warm"}, age;dur=${age}, req;dur=0`,
      },
    });
  },
};
