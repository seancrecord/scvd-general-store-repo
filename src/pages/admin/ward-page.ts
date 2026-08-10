import { escapeHtml } from "@/lib/sanitize";
import { renderAdminShell } from "@/pages/admin/layout";
import type { WardDelta, WardRound } from "@/services/ward-round";

/**
 * /admin/ward — the ward round's readout: the weekly ecosystem census
 * with the week-over-week delta on top, because the DELTA is what the
 * keeper acts on. New hosts are nobody-missed; newly-failing are
 * fresh outreach leads; newly-fixed are outreach that worked or the
 * market healing; flappers are the Night Watch's natural prospects.
 *
 * PRIVATE ON PURPOSE. Per-host verdicts about other operators stay
 * behind the keeper's login (the consent ruling: telling an operator
 * privately is help, naming them publicly is a verdict nobody asked
 * for). Anything that publishes from here does so by his hand.
 */
export function renderWardPage(
  round: WardRound | null,
  previous: WardRound | null,
  delta: WardDelta | null,
): string {
  const runButton = `<form method="post" action="/admin/ward/run" style="margin:0.5em 0">
    <button type="submit">Walk the ward now</button>
    <span style="opacity:0.7"> — one GET per listed host (~a minute); the page reloads with the fresh round.</span>
  </form>`;

  if (!round) {
    return renderAdminShell(
      "ward",
      `<section>
        <h2>The ward round</h2>
        <p>No round on the books yet. The first one runs with the Sunday
        press (11:00 UTC), or walk it now:</p>
        ${runButton}
      </section>`,
    );
  }

  const probed = round.hosts.filter((entry) => entry.verdict !== "not_probed");
  const listedOnly = round.hosts.length - probed.length;
  const ready = probed.filter((entry) => entry.verdict === "ready").length;
  const summary = `<ul>
    <li><strong>${probed.length} doors probed</strong>${listedOnly > 0 ? ` (+${listedOnly} leaderboard-listed, population only — homepages carry no 402 to judge)` : ""} ${escapeHtml(round.at.slice(0, 16))}Z (week ${escapeHtml(round.week)}); ${round.listed_resources} resources listed.</li>
    <li><strong>${ready} ready (${probed.length > 0 ? Math.round((ready / probed.length) * 100) : 0}% of probed)</strong>, ${probed.length - ready} not.</li>
    ${
      round.population
        ? `<li><strong>Coverage: ${
            round.population.coverage_pct === null
              ? "no population known"
              : `${round.population.coverage_pct}% — ${round.population.population_walked} walked of ${round.population.population_known} known`
          }</strong>. That is the denominator behind every percentage above: enumeration is nearly free, probing is not.${
            round.population.carried_forward > 0
              ? ` ${round.population.carried_forward} host(s) carried forward from a source that went dark (${escapeHtml(round.population.sources_failed.join(", "))}) — not counted as gone, because we could not ask.`
              : ""
          }${
            round.population.collapse_suspect
              ? ` <strong style="color:#8c2f1b">The known population collapsed past the floor, so disappearances are SUPPRESSED this round.</strong> The instrument explains that more plausibly than the ecosystem does; if it holds next round it will be recorded as real.`
              : ""
          }</li>
    <li>Population moves: ${round.population.appeared_count ?? round.population.appeared.length} newly listed, ${round.population.disappeared_count ?? round.population.disappeared.length} newly delisted, ${round.population.returned_count ?? round.population.returned.length} listed again after being written off. Delisted means <em>no longer listed where we look</em> — never dead, never stopped taking payment.</li>`
        : "<li>Coverage: not measured this round (round predates the population layer — read that as unknown, not as complete).</li>"
    }
    <li>Our search-index presence: <strong>${
      round.our_search_presence === null
        ? "could not check (never read as absent)"
        : round.our_search_presence
          ? "present"
          : "ABSENT — see the alert; re-run bazaar:check by hand"
    }</strong>.</li>
    ${
      round.coverage_drop
        ? `<li><strong style="color:#8c2f1b">COVERAGE DROPPED: the last round probed ${round.coverage_drop.previous_hosts} doors (${escapeHtml(round.coverage_drop.previous_at.slice(0, 16))}Z), this one only ${round.coverage_drop.this_round}.</strong> The list feed likely changed its pagination shape under us — this round is a FLOOR, not the ward shrinking, and week-over-week comparisons are unsafe until coverage recovers.</li>`
        : ""
    }
    ${round.coverage_suspect ? "<li>Coverage suspect: the list read may be one page. Treat totals as floors.</li>" : ""}
    ${round.capped ? "<li>The round hit its host cap; the tail went unprobed and this line is the record of that.</li>" : ""}
    <li>Leaderboard feed (agent402.tools): <strong>${
      round.leaderboard_sellers == null
        ? "could not check this round (says nothing about anybody)"
        : `${round.leaderboard_sellers} sellers, window ${escapeHtml(round.leaderboard_window ?? "?")}; our rank ${round.our_leaderboard_rank ?? "— not on it (expected at our volume)"}`
    }</strong>. Volume figures are claims for population, not importance — ~98% of ecosystem volume measured non-organic (Artemis, 2026-08).</li>
    ${
      round.directories_unread && round.directories_unread.length > 0
        ? `<li>Directories the round knows and cannot read: ${round.directories_unread
            .map(
              (entry) =>
                `<strong>${escapeHtml(entry.source)}</strong> <small>(${escapeHtml(entry.why)})</small>`,
            )
            .join("; ")}. The widening is only uniform if its gaps ride the same page as its findings.</li>`
        : ""
    }
  </ul>`;

  const deltaHtml = delta
    ? `<h3>Since last week${previous ? ` (${escapeHtml(previous.week)})` : ""}</h3>
      <ul>
        <li>New on the list: ${listOrNone(delta.new_hosts)}</li>
        <li>Gone from the list: ${listOrNone(delta.gone_hosts)}</li>
        <li>Newly failing (fresh leads): ${listOrNone(delta.newly_failing)}</li>
        <li>Newly fixed: ${listOrNone(delta.newly_fixed)}</li>
        <li>Flappers (Night Watch prospects): ${listOrNone(delta.flappers)}</li>
      </ul>`
    : `<p>First round on the books — the delta starts next week.</p>`;

  const rows = round.hosts
    .map(
      (entry) => `<tr>
      <td>${escapeHtml(entry.host)}${entry.source === "leaderboard" ? " <small>(leaderboard-only)</small>" : ""}</td>
      <td>${escapeHtml(entry.verdict)}</td>
      <td>${escapeHtml(entry.failed.join(", ") || "—")}</td>
      <td>${escapeHtml(entry.advisories.join(", ") || "—")}</td>
      <td>${
        entry.volume_claim
          ? `$${Math.round(entry.volume_claim.usd).toLocaleString("en-US")} · ${entry.volume_claim.calls.toLocaleString("en-US")} calls · ${entry.volume_claim.unique_buyers} buyers <small>(${escapeHtml(entry.volume_claim.window)}, their count)</small>`
          : "—"
      }</td>
    </tr>`,
    )
    .join("\n");

  return renderAdminShell(
    "ward",
    `<section>
      <h2>The ward round</h2>
      ${runButton}
      ${summary}
      ${deltaHtml}
      <h3>Every door on the ward</h3>
      <table>
        <thead><tr><th>Host</th><th>Verdict</th><th>Failed checks</th><th>Advisories</th><th>Volume claim</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p>One GET per host per week, same as any indexer. Verdicts here
      are private readings for outreach, never published as rows —
      aggregate only, by hand, per the consent ruling.</p>
    </section>`,
  );
}

function listOrNone(hosts: string[]): string {
  return hosts.length > 0
    ? hosts.map((host) => escapeHtml(host)).join(", ")
    : "none";
}
