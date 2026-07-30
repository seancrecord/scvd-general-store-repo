import { Hono } from "hono";
import { escapeHtml } from "@/lib/sanitize";
import { renderSimplePage, wantsHtml } from "@/pages/simple-page";
import { computePulse } from "@/services/pulse";
import type { PulseWindow } from "@/services/pulse";
import type { HonoEnv } from "@/types";

/**
 * /pulse.json and /pulse — the public funnel, organic only.
 *
 * THE HUMAN PAGE EXISTS BECAUSE THE JSON ALONE WOULD BE A HALF-CLAIM.
 * Every other artifact this store publishes has a readable twin, and a
 * funnel only machines could read would be the one number-bearing
 * surface a person has to take our word about — precisely backwards for
 * the page whose entire argument is "here is the denominator, check it
 * yourself."
 *
 * A CAUTION LEARNED THIS WEEK AND APPLIED HERE. A competitor's near-
 * empty leaderboard read as proof AGAINST their pitch rather than as
 * evidence of being early: near-populated, every score near zero. The
 * visitors' register answered that by publishing no total at all.
 *
 * THIS PAGE ANSWERS IT DIFFERENTLY, AND THE DISTINCTION IS THE WHOLE
 * DESIGN: a leaderboard with empty ranks implies a scale nobody
 * claimed, while a FUNNEL with a zero at the end is a complete sentence
 * — "this many were offered a price, this many paid" — where the zero
 * is the finding rather than the gap. So the shape is deliberately a
 * sentence and not a scoreboard, and the page says out loud that a
 * small denominator is a fact about our reach and not about the market.
 *
 * NOT WIRED TO THE STOREFRONT. The keeper's instruction stands: whether
 * these numbers become content anywhere else is a separate decision and
 * not this file's to make.
 */
export const pulseRoutes = new Hono<HonoEnv>();

const STANDFIRST =
  "The whole funnel, not the flattering end of it: how many agents were offered a price here, how many paid, and how many came back to re-check an artifact afterwards. Organic only — the proprietors' own wallets and tests are flagged at the till and excluded, the same way they are excluded from /stats.";

const HONEST_LIMIT =
  "READ THE DENOMINATOR BEFORE THE RATE. A small number of 402s means this store has not been found by many agents yet, which is a fact about our reach and not a fact about the market. A conversion rate shown as an em dash means nobody has been offered a price in that window at all: that is undefined, not zero, and we will not print 0% for it, because 0% would say agents were offered something and declined.";

function rateText(window: PulseWindow): string {
  return window.conversion_rate === null
    ? "—"
    : `${(window.conversion_rate * 100).toFixed(1)}%`;
}

/** The funnel as a sentence, which is the point of showing it whole. */
function sentence(window: PulseWindow): string {
  if (window.organic_challenges === 0) {
    return "Nobody has been offered a price here yet.";
  }
  const paid =
    window.organic_settled === 0
      ? "none of them paid"
      : `${window.organic_settled} paid`;
  return `${window.organic_challenges} agent${
    window.organic_challenges === 1 ? " was" : "s were"
  } offered a price, and ${paid}.`;
}

function row(window: PulseWindow, label: string): string {
  return `<tr>
    <td>${escapeHtml(label)}</td>
    <td>${window.organic_challenges}</td>
    <td>${window.organic_settled}</td>
    <td>${window.organic_verifies}</td>
    <td>${escapeHtml(rateText(window))}</td>
  </tr>`;
}

pulseRoutes.get("/pulse.json", async (c) => {
  return c.json(await computePulse(c.env));
});

pulseRoutes.get("/pulse", async (c) => {
  const pulse = await computePulse(c.env);
  if (!wantsHtml(c.req.header("Accept"))) {
    return c.json(pulse);
  }
  const base = c.env.STORE_BASE_URL;
  return c.html(
    renderSimplePage({
      title: "The pulse",
      description:
        "The whole funnel for this x402 store, organic only: how many agents were offered a price, how many paid, and how many re-verified an artifact afterwards. House traffic excluded, denominator included.",
      path: "/pulse",
      bodyHtml: `<section>
        <p class="menu-desc">${escapeHtml(STANDFIRST)}</p>
        <p class="menu-desc"><strong>${escapeHtml(sentence(pulse.all_time))}</strong> All time, since the meter went in.</p>
      </section>
      <section>
        <table border="1" cellpadding="6">
          <tr><th>window</th><th>402s offered</th><th>settled</th><th>re-verifies</th><th>rate</th></tr>
          ${row(pulse.all_time, "all time")}
          ${pulse.months.map((window) => row(window, window.month ?? "")).join("\n")}
        </table>
      </section>
      <section>
        <p class="menu-meta">${escapeHtml(HONEST_LIMIT)}</p>
        <p class="menu-meta">${escapeHtml(pulse.house_flag_policy)} Every wallet this store controls is declared, signed, at <a href="/house-ledger.json">/house-ledger.json</a> — subtract them yourself rather than taking our word for the split.</p>
        <p class="menu-meta">Machine-readable at <a href="/pulse.json"><code>${escapeHtml(base)}/pulse.json</code></a>, computed live on every request from the same counters the keeper reads. Nothing here is collected for this page: the counters predate it, so the collection cannot have been tuned to flatter the publication. Every settlement counted here minted a signed artifact — check any of them at <code>${escapeHtml(base)}/api/verify/{id}</code> against the key at <a href="/.well-known/scvd-signing-key"><code>/.well-known/scvd-signing-key</code></a>, without asking us.</p>
        <p class="menu-meta">Aggregate counts only. No user-agents, no referrers, no wallet addresses, no per-visitor rows — this store keeps no cookies and no IPs, and a public funnel is exactly where that discipline would be easiest to break quietly.</p>
      </section>`,
    }),
  );
});
