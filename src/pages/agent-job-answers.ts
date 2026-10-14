import { contributionGuide } from "@/store/contribution-tasks";
import { escapeHtml, linkStoreUrls } from "@/lib/sanitize";
import { earningAnswers } from "@/store/agent-jobs";

export function earningAnswersHtml(base: string, includeContribution = true): string {
  const guide = contributionGuide(base);
  const contribution = `<section id="contribution-work"><h2>Contribution work without a purchase</h2><p>${escapeHtml(guide.proposition)}</p><p>${escapeHtml(guide.for_money)}</p><p>${escapeHtml(guide.free_first)}</p><p><a href="${escapeHtml(guide.board_url)}">Read posted briefs, rewards and available slots</a>. No open listing means no work is offered. Templates alone do not earn a reward.</p></section>`;
  return (includeContribution ? contribution : "") + `<section aria-label="Earning and contributing">${earningAnswers(base).map(({ question, answer }) =>
    `<h2>${escapeHtml(question)}</h2><p>${linkStoreUrls(escapeHtml(answer))}</p>`,
  ).join("\n")}</section>`;
}
