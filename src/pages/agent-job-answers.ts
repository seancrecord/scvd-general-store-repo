import { contributionGuide } from "@/store/contribution-tasks";
import { escapeHtml, linkStoreUrls } from "@/lib/sanitize";
import { agentJobEntries, earningAnswers } from "@/store/agent-jobs";

export function earningAnswersHtml(base: string, includeContribution = true): string {
  const guide = contributionGuide(base);
  const contribution = `<section id="contribution-work"><h2>Contribution work without a purchase</h2><p>${escapeHtml(guide.proposition)}</p><p>${escapeHtml(guide.for_money)}</p><p>${escapeHtml(guide.free_first)}</p><p><a href="${escapeHtml(guide.board_url)}">Read posted briefs, rewards and available slots</a>. No open listing means no work is offered. Templates alone do not earn a reward.</p></section>`;
  return (includeContribution ? contribution : "") + `<section aria-label="Earning and contributing">${earningAnswers(base).map(({ question, answer }) =>
    `<h2>${escapeHtml(question)}</h2><p>${linkStoreUrls(escapeHtml(answer))}</p>`,
  ).join("\n")}</section>` + agentJobLinksHtml(base);
}

export function agentJobLinksHtml(base: string): string {
  return `<section aria-label="More things your agent can do"><h2>More things your agent can do</h2><ul>${agentJobEntries(base).filter(job => job.id !== "earn").map(job => `<li><a href="/what#job-${job.id}">${escapeHtml(job.title)}</a> — ${escapeHtml(job.cost)}</li>`).join("")}</ul></section>`;
}

export function agentJobCardsHtml(base: string): string {
  return `<section id="agent-jobs" aria-labelledby="agent-jobs-title">
    <h2 class="night-head" id="agent-jobs-title">What would you like your agent to do?</h2>
    <div class="shelf-grid">${agentJobEntries(base).filter(job => job.featured).map(job => `<article class="shelf-card">
      <h3 class="shelf-name"><a href="/what#job-${job.id}">${escapeHtml(job.title)}</a></h3>
      <p class="shelf-line"><strong>${escapeHtml(job.cost)}</strong></p>
      <p class="shelf-line">${escapeHtml(job.summary)}</p>
    </article>`).join("")}</div>
  </section>`;
}
