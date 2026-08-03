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

  const ready = round.hosts.filter((entry) => entry.verdict === "ready").length;
  const summary = `<ul>
    <li><strong>${round.hosts.length} hosts</strong> probed ${escapeHtml(round.at.slice(0, 16))}Z (week ${escapeHtml(round.week)}); ${round.listed_resources} resources listed.</li>
    <li><strong>${ready} ready (${round.hosts.length > 0 ? Math.round((ready / round.hosts.length) * 100) : 0}%)</strong>, ${round.hosts.length - ready} not.</li>
    <li>Our search-index presence: <strong>${
      round.our_search_presence === null
        ? "could not check (never read as absent)"
        : round.our_search_presence
          ? "present"
          : "ABSENT — see the alert; re-run bazaar:check by hand"
    }</strong>.</li>
    ${round.coverage_suspect ? "<li>Coverage suspect: the list read may be one page. Treat totals as floors.</li>" : ""}
    ${round.capped ? "<li>The round hit its host cap; the tail went unprobed and this line is the record of that.</li>" : ""}
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
      <td>${escapeHtml(entry.host)}</td>
      <td>${escapeHtml(entry.verdict)}</td>
      <td>${escapeHtml(entry.failed.join(", ") || "—")}</td>
      <td>${escapeHtml(entry.advisories.join(", ") || "—")}</td>
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
        <thead><tr><th>Host</th><th>Verdict</th><th>Failed checks</th><th>Advisories</th></tr></thead>
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
