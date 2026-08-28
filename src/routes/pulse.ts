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
  "The whole funnel, not the flattering end of it: how many times this store quoted a price (each 402 answered, as recorded — a count of price quotes, not of distinct agents, which this meter deliberately cannot count), how many purchases settled, and how many artifacts were re-checked afterwards. Organic only — the proprietors' own wallets and tests are flagged at the till and excluded, the same way they are excluded from /stats.";

/**
 * THE CORRECTION EXPLAINED WHERE IT IS SHOWN, not in a commit message.
 * Both columns are published because a number that silently changed is
 * a number nobody can check, which is the opposite of this page's job.
 */
const MACHINERY_NOTE =
  "THE SECOND COLUMN IS A CORRECTION, NOT A RESTATEMENT. Channel is decided when a 402 goes out and never revisited, so a crawler this store had not yet learned to recognise was counted as an agent — a monitoring bot that announces itself in its user-agent was doing exactly that here until 2026-07-26. The raw rows keep what each request arrived with, so they can be re-read with today's crawler table, and a walk on the clock does that over every row of the month rather than a sample of it. The recorded figure is left exactly as the counters have it and the correction sits beside it, because a number that quietly changed is a number you cannot check. An em dash means no complete walk has run for that window yet; a partial one is not published, since a window mistaken for a month is the error this mechanism exists to prevent. It finds machinery we can NAME — an unidentified crawler is invisible here exactly as it is everywhere else, so read the corrected column as an upper bound on organic rather than a certified count. The clients behind it are named in the office, not here: this page promises no user-agents and that promise outranks the feature.";

const HONEST_LIMIT =
  "READ THE DENOMINATOR BEFORE THE RATE. A small number of 402s means this store has not been found by many agents yet, which is a fact about our reach and not a fact about the market. A conversion rate shown as an em dash means nobody has been offered a price in that window at all: that is undefined, not zero, and we will not print 0% for it, because 0% would say agents were offered something and declined.";

/**
 * A PERCENTAGE THIS SMALL IS UNREADABLE, so the ratio rides beside it.
 * "0.02%" is technically right and tells a person nothing; "1 in
 * 5,083" is the same fact in a form somebody can hold. Fixed decimals
 * were also printing 0.0% for a window that had a sale in it, which
 * this page's own copy swears it will never do.
 */
function rateText(window: PulseWindow): string {
  if (window.conversion_rate === null) {
    return "—";
  }
  if (window.organic_settled === 0) {
    return "0%";
  }
  const denom = window.corrected_challenges ?? window.organic_challenges;
  const oneIn = Math.round(denom / window.organic_settled);
  const pct = window.conversion_rate * 100;
  const shown = pct >= 1 ? pct.toFixed(1) : pct.toPrecision(2);
  return `${shown}% (1 in ${oneIn.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")})`;
}

/**
 * The funnel as a sentence, which is the point of showing it whole.
 *
 * COUNTS QUOTES, NOT HEADS (the instrument audit, 2026-08-28). This
 * used to read "N agents were offered a price" — but the meter
 * counts 402 responses, and the porch's own accounting refuses to
 * count unique heads on purpose. One agent retrying is many quotes;
 * the sentence now says what the number is.
 */
function sentence(window: PulseWindow): string {
  if (window.organic_challenges === 0) {
    return "No price has been quoted here yet.";
  }
  const paid =
    window.organic_settled === 0
      ? "no purchase settled"
      : `${window.organic_settled} purchase${window.organic_settled === 1 ? "" : "s"} settled`;
  return `A price was quoted ${window.organic_challenges} time${
    window.organic_challenges === 1 ? "" : "s"
  } (402s answered, not distinct agents), and ${paid}.`;
}

function row(window: PulseWindow, label: string): string {
  return `<tr>
    <td>${escapeHtml(label)}</td>
    <td>${window.organic_challenges}</td>
    <td>${
      window.known_machinery === undefined
        ? "&mdash;"
        : `${window.corrected_challenges} <small>(&minus;${window.known_machinery})</small>`
    }</td>
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
        "The whole funnel for this x402 store, organic only: how many times a price was quoted (402s answered, not distinct agents), how many purchases settled, and how many artifacts were re-verified afterwards.",
      path: "/pulse",
      bodyHtml: `<section>
        <p class="menu-desc">${escapeHtml(STANDFIRST)}</p>
        <p class="menu-desc"><strong>${escapeHtml(sentence(pulse.all_time))}</strong> All time, since the meter went in.</p>
      </section>
      <section>
        <table border="1" cellpadding="6">
          <tr><th>window</th><th>402s offered, as recorded</th><th>less known machinery</th><th>settled</th><th>re-verifies</th><th>rate</th></tr>
          ${row(pulse.all_time, "all time")}
          ${pulse.months.map((window) => row(window, window.month ?? "")).join("\n")}
        </table>
      </section>
      <section>
        <p class="menu-meta">${escapeHtml(MACHINERY_NOTE)}</p>
        <p class="menu-meta">${escapeHtml(HONEST_LIMIT)}</p>
        <p class="menu-meta">${escapeHtml(pulse.house_flag_policy)} Every wallet this store controls is declared, signed, at <a href="/house-ledger.json">/house-ledger.json</a> — subtract them yourself rather than taking our word for the split.</p>
        <p class="menu-meta">Machine-readable at <a href="/pulse.json"><code>${escapeHtml(base)}/pulse.json</code></a>, computed live on every request from the same counters the keeper reads. Nothing here is collected for this page: the counters predate it, so the collection cannot have been tuned to flatter the publication. Every settlement counted here is expected to have minted a signed artifact, and that expectation is checked rather than asserted: the counter is bumped before the handler that mints, so a sale that settled and never delivered would appear here with nothing behind it. A delivery audit and an hourly walk of the chain look for that case; a find goes on /corrections. Check any artifact at <code>${escapeHtml(base)}/api/verify/{id}</code> against the key at <a href="/.well-known/scvd-signing-key"><code>/.well-known/scvd-signing-key</code></a>, without asking us.</p>
        <p class="menu-meta">Aggregate counts only. No user-agents, no referrers, no wallet addresses, no per-visitor rows — this store keeps no cookies and no IPs, and a public funnel is exactly where that discipline would be easiest to break quietly.</p>
      </section>`,
    }),
  );
});
