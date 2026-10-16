import { escapeHtml as esc } from "@/lib/sanitize";
import type { ContributionBoard } from "@/services/contribution-board";
import { CONTRIBUTION_API, CONTRIBUTION_PROPOSITION, CONTRIBUTION_FREE, CONTRIBUTION_MONEY } from "@/store/contribution-tasks";

export const CONTRIBUTION_LIST_UNAVAILABLE = "Contribution listings could not be read. Availability is unknown; check the task list before starting work.";
export function contributionListHtml(board: ContributionBoard | null) {
  let body = `<section id="contribution-work"><h2>Contribution work — no store purchase required</h2><p class="menu-desc">${esc(CONTRIBUTION_PROPOSITION)}</p><p class="menu-desc">${esc(CONTRIBUTION_FREE)} ${esc(CONTRIBUTION_MONEY)}</p>`;
  if (!board) return `${body}<p class="menu-desc">${CONTRIBUTION_LIST_UNAVAILABLE}</p><p><a href="${CONTRIBUTION_API}">Check the contribution task list</a></p></section>`;
  body += `<p class="menu-meta">${esc(board.indexing_note)}</p>`;
  if (!board.tasks.length) body += `<p class="menu-desc">No contribution briefs are listed on this page. Templates are examples for the keeper, not work you can start or rewards you can claim.</p>`;
  const reasons: Record<string, string> = {closed: "Closed to new reservations", expired: "Expired", slots_full: "All slots held", attempt_limit: "Reservation attempt limit reached"};
  for (const task of board.tasks) {
    const available = task.availability_reason === "available";
    body += `<article><h3>${esc(task.title)}</h3><p class="menu-desc"><strong>$${task.reward_usd.toFixed(2)} Base USDC</strong> per accepted submission · ${available ? `${task.available_slots} available slot${task.available_slots === 1 ? "" : "s"}` : esc(reasons[task.availability_reason] ?? "No new reservations")}</p>
      <p class="menu-desc">${esc(task.brief)}</p><p class="menu-desc"><strong>What earns the reward:</strong> ${esc(task.acceptance)}</p>
      <p class="menu-desc">${task.redemption ? esc(task.redemption.instructions) : "This legacy brief retains separate keeper payment in Base USDC."}</p><p class="menu-meta">Target: <code>${esc(task.target)}</code><br>New reservations close ${esc(task.expires_at)} (UTC). Review within ${task.review_days} days; pay accepted work within ${task.payment_days} days.</p>
      <p><a href="${esc(task.task_url)}">${available ? "Read brief and reserve" : "Read the brief and its status"}</a></p></article>`;
  }
  if (board.truncated) body += `<p class="menu-desc">This is a partial list.${board.cursor ? ` <a href="/bounties?contribution_cursor=${encodeURIComponent(board.cursor)}#contribution-work">Next contribution briefs</a>` : ""}</p>`;
  return `${body}<p><a href="${CONTRIBUTION_API}">Task list and exact request shapes</a></p></section>`;
}
