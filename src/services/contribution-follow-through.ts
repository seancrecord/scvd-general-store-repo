import type { ContributionTaskState } from "@/services/contribution-task";
import { CONTRIBUTION_ARRIVAL_GOALS } from "@/store/contribution-tasks";

export interface ContributionAction {
  submission_id: string;
  action: "review" | "payment" | "follow_up";
  due_at: string | null;
  overdue: boolean;
}
/** Private, page-scoped work summary. A keeper report never becomes a settlement claim. */
export function contributionWork(state: ContributionTaskState, now: number) {
  const actions: ContributionAction[] = [];
  const goals = Object.fromEntries(Object.keys(CONTRIBUTION_ARRIVAL_GOALS).map(goal => [goal, 0]));
  let submissions = 0, provided = 0, unpaidCents = 0;
  const due = (row: ContributionTaskState["reservations"][number], action: "review" | "payment", from: string, days: number) => {
    const deadline = Date.parse(from) + days * 86400000;
    actions.push({submission_id: row.id, action, due_at: new Date(deadline).toISOString(), overdue: now >= deadline});
  };
  for (const row of state.reservations) {
    if (row.submitted_at) {
      submissions++;
      if (row.arrival) {provided++; goals[row.arrival.goal] = (goals[row.arrival.goal] ?? 0) + 1;}
    }
    if (row.status === "submitted" && row.submitted_at) due(row, "review", row.submitted_at, state.terms.review_days);
    if (row.status === "accepted" && row.review) {
      unpaidCents += Math.round(state.terms.reward_usd * 100);
      if (!row.payout?.signature) due(row, "payment", row.review.at, state.terms.payment_days);
    }
    const latestOutcome = row.updates?.at(-1)?.outcome ?? row.review?.outcome;
    if (latestOutcome === "fix_planned") actions.push({submission_id: row.id, action: "follow_up", due_at: null, overdue: false});
  }
  actions.sort((a, b) => (a.due_at ?? "~").localeCompare(b.due_at ?? "~") || a.submission_id.localeCompare(b.submission_id));
  return {
    review_pending: actions.filter(a => a.action === "review").length,
    review_overdue: actions.filter(a => a.action === "review" && a.overdue).length,
    payment_pending: actions.filter(a => a.action === "payment").length,
    payment_overdue: actions.filter(a => a.action === "payment" && a.overdue).length,
    accepted_unpaid_usd: unpaidCents / 100,
    authorizations_issued: state.reservations.filter(r => r.payout?.signature).length,
    authorization_issued_usd: state.reservations.filter(r => r.payout?.signature).length * Math.round(state.terms.reward_usd * 100) / 100,
    follow_up_pending: actions.filter(a => a.action === "follow_up").length,
    actions, learning: {submissions, provided, goals},
  };
}
