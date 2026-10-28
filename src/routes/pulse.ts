import { Hono } from "hono";
import { escapeHtml } from "@/lib/sanitize";
import { prefersMarkdown } from "@/lib/accept";
import { jsonDocumentMarkdownResponse } from "@/lib/json-markdown";
import { renderSimplePage, wantsHtml } from "@/pages/simple-page";
import { denominatorsSectionHtml, publishedCountsBlock } from "@/store/published-counts";
import { readPublicStatistics, publicStatisticsStatus, publicStatisticsUnavailable } from "@/services/public-statistics";
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
  "THE SECOND COLUMN SUBTRACTS KNOWN MACHINERY FROM RECORDED QUOTES. The scheduled correction scans retained event rows using current crawler names and catalogue-walking patterns. It publishes only a completed scan; an em dash means no complete correction is available for that window. Event rows and quote totals are independent instruments, and earlier quote increments were lost. The corrected figure is therefore not a certified buyer count or a guaranteed upper or lower bound. Unidentified automation can remain. The clients behind it are named in the office, not here: this page publishes no user-agents.";

const HONEST_LIMIT =
  "READ THE DENOMINATOR BEFORE THE RATE. Recorded requests do not measure unique agents or establish buyer demand. Repeat requests and missing records limit what can be inferred about reach. A conversion rate shown as an em dash means no challenges were counted in that window: that is undefined, not zero. Zero means challenges were counted but no settlements were counted; neither state proves what every visitor did.";

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
  const denom = window.organic_challenges;
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
    <td>${window.organic_payments_presented}</td>
    <td>${window.organic_settled}</td>
    <td>${window.organic_rechecks}</td>
    <td>${escapeHtml(rateText(window))}</td>
  </tr>`;
}

pulseRoutes.get("/pulse.json", async (c) => {
  const summary = await readPublicStatistics(c.env).catch(() => null);
  if (!summary) return publicStatisticsUnavailable();
  return c.json({ ...summary.pulse, statistics_summary: publicStatisticsStatus(summary), published_counts: publishedCountsBlock("/pulse") });
});

pulseRoutes.get("/pulse", async (c) => {
  const summary = await readPublicStatistics(c.env).catch(() => null);
  if (!summary) return publicStatisticsUnavailable();
  const pulse = summary.pulse;
  const status = publicStatisticsStatus(summary);
  // Rule 43 for the numbers: every count, with what it is out of (store/published-counts.ts).
  const document = { ...pulse, statistics_summary: status, published_counts: publishedCountsBlock("/pulse") };
  if (prefersMarkdown(c.req.header("Accept"), "text/html", c.req.header("User-Agent"))) {
    return jsonDocumentMarkdownResponse({
      base: c.env.STORE_BASE_URL,
      path: "/pulse",
      title: "The pulse",
      description: "The whole funnel for this x402 store, organic only: how many times a price was quoted (402s answered, not distinct agents), how many purchases settled, and how many artifacts were re-verified afterwards.",
      document: document as unknown as Record<string, unknown>,
    });
  }
  if (!wantsHtml(c.req.header("Accept"), c.req.header("User-Agent"))) {
    return c.json(document);
  }
  const base = c.env.STORE_BASE_URL;
  return c.html(
    renderSimplePage({
      title: "The pulse",
      description:
        "The whole funnel for this x402 store, organic only: how many times a price was quoted (402s answered, not distinct agents), how many purchases settled, and how many artifacts were re-verified afterwards.",
      path: "/pulse",
      bodyHtml: `<section>
        <p class="menu-meta">Statistics as of ${escapeHtml(summary.computed_at)}. Refreshed hourly.${status.stale ? " The next reading is overdue; these are the last saved figures." : ""}</p>
        <p class="menu-desc"><strong>${pulse.all_time.total_organic_settled ?? pulse.all_time.organic_settled} organic sales across x402 and MPP</strong>, including ${pulse.all_time.mpp_organic_settled ?? 0} native MPP sales. The funnel below covers x402 only; its conversion rate uses x402 asks and settles.</p>
        <p class="menu-desc">${escapeHtml(STANDFIRST)}</p>
        <p class="menu-desc"><strong>${escapeHtml(sentence(pulse.all_time))}</strong> All time, since the meter went in.</p>
      </section>
      <section>
        <table border="1" cellpadding="6">
          <tr><th>window</th><th>402s offered, as recorded</th><th>less known machinery</th><th>payments presented</th><th>settled</th><th>re-verifies</th><th>rate against recorded offers</th></tr>
          ${row(pulse.all_time, "all time")}
          ${pulse.months.map((window) => row(window, window.month ?? "")).join("\n")}
        </table>
      </section>
      <section>
        <p class="menu-meta">${escapeHtml(MACHINERY_NOTE)} The correction walk last ran at ${escapeHtml(pulse.crawler_correction_computed_at ?? "never")}. ${pulse.crawler_correction_complete ? "All retained inputs were read." : "The scan is incomplete; partial months are withheld."} It runs hourly; a storage fault leaves the previous reading and its date in place.</p>
        <p class="menu-meta">${escapeHtml(HONEST_LIMIT)}</p>
        <p class="menu-meta">${escapeHtml(pulse.house_flag_policy)} Every wallet this store controls is declared, signed, at <a href="/house-ledger.json">/house-ledger.json</a> — subtract them yourself rather than taking our word for the split.</p>
        <p class="menu-meta">Machine-readable at <a href="/pulse.json"><code>${escapeHtml(base)}/pulse.json</code></a>, computed live on every request from the same counters the keeper reads. Nothing here is collected for this page: the counters predate it, so the collection cannot have been tuned to flatter the publication. Recorded settlements alone do not establish delivery. The checkout delivers before settlement; whether a buyer received the goods is checked rather than asserted from the counter. A delivery audit and an hourly walk of the chain look for that case; a find goes on /corrections. Check any artifact at <code>${escapeHtml(base)}/api/verify/{id}</code> against the key at <a href="/.well-known/scvd-signing-key"><code>/.well-known/scvd-signing-key</code></a>, without asking us.</p>
        <p class="menu-meta">Aggregate counts only. No user-agents, no referrers, no wallet addresses, no per-visitor rows — this store keeps no cookies and no IPs, and a public funnel is exactly where that discipline would be easiest to break quietly.</p>
        <p class="menu-meta">This page is computed live, which means every figure on it can change under you. The closed months are frozen, signed and linked at <a href="/store-month">the store's own month</a>, so a number you cite stays the number you cited.</p>
      </section>
      ${denominatorsSectionHtml("/pulse", escapeHtml)}`,
    }),
  );
});
