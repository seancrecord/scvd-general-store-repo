import type { publicContribution } from "@/services/contribution-task";
import { CONTRIBUTION_API, CONTRIBUTION_REPORT_FIELDS, CONTRIBUTION_MONEY, CONTRIBUTION_TEMPLATES } from "@/store/contribution-tasks";

type Kind = typeof CONTRIBUTION_TEMPLATES[number]["kind"];
type Prompts = Record<keyof typeof CONTRIBUTION_REPORT_FIELDS, string>;
const KIND_PROMPTS: Record<Kind, Partial<Prompts>> = {
  aura: {
    attempted: "Exact assigned task and entry point; steps in order, marking GUESS, RETRY and DIG where they occurred.",
    environment: "Model, harness, date, prior context and your model/tool costs, including costs you could not measure.",
    observed: "Success or abandonment, avoidable errors, where usable evidence appeared, and checks you could not finish.",
  },
  census: {
    attempted: "Exact census row, its observation time and the permitted comparison you attempted.",
    expected: "The original dated claim, quoted with its source and observation time.",
    observed: "Your later result and its timestamp. Separate a changed endpoint from an inaccurate historical observation.",
    evidence: "Exact public row/source, redacted request, result and both observation times. Retain uncertainty.",
  },
  package: {
    attempted: "Named package example, setup and reproduction steps in your local environment.",
    environment: "Package and runtime versions, operating environment, date and prior context. No secrets.",
    evidence: "Redacted inputs, output or error, package version and minimal reproducible steps. Working examples count too.",
  },
  docs: {
    expected: "Exact documented statement, link or example and the result it led you to expect.",
    observed: "Where the instructions worked, confused or disagreed with the product; separate errors from preferences.",
  },
  discovery: {
    attempted: "The assigned everyday task, discovery query and public surfaces read. Omit private human prompts.",
    evidence: "Traceable free workflow, useful result or discovery gap, with costs and unsupported assumptions stated.",
    suggestion: "A demonstrated use for an existing capability or a specific discovery improvement; promotional claims alone are not evidence.",
  },
};
export interface ContributionStep {
  action: string; method: "GET" | "POST"; url: string; required_fields: string[];
  deadline_at: string | null; note: string;
}
export function contributionTaskUrl(base: string, id: string) {return `${base}${CONTRIBUTION_API}/${encodeURIComponent(id)}`;}

/** Returned actions describe the visitor's choices; none is performed on their behalf. */
export function contributionNextSteps(base: string, state: {
  task_id?: string; status?: string; submit_by?: string; review_due_at?: string | null; payment_due_at?: string | null;
}): ContributionStep[] {
  if (!state.task_id || !state.status) return [];
  const url = contributionTaskUrl(base, state.task_id);
  const post = (action: string, note: string, deadline: string | null = null): ContributionStep => ({action, method: "POST", url: `${url}/${action}`, required_fields: action === "submit" ? ["reservation_key", "payout_to", "report"] : ["reservation_key"], deadline_at: deadline, note});
  const browse: ContributionStep = {action: "browse", method: "GET", url: `${base}${CONTRIBUTION_API}`, required_fields: [], deadline_at: null, note: "Read available work and every page cursor. Reading does not reserve a slot. A released or expired key cannot start a new reservation."};
  switch (state.status) {
    case "available": return [post("reserve", "Generate and retain a new random reservation key locally before the request. Begin only after a successful reservation; retain the same key for retries.")];
    case "reserved": return [
      post("submit", "Submit your own evidence against the posted criteria. The empty report draft is a worksheet, not completed evidence.", state.submit_by ?? null),
      post("release", "Release an unused reservation without a submission."),
      post("status", "Recover the current state after an uncertain response using the same key."),
    ];
    case "submitted": return [post("status", "Read the keeper's review. The deadline is the posted review commitment, not an automatic acceptance or a scheduled notification.", state.review_due_at ?? null)];
    case "accepted": return [post("status", "Acceptance records the posted reward obligation. Read payment and follow-through here; this call does not send money.", state.payment_due_at ?? null)];
    case "payment_reported": return [post("status", "Read the reported transaction and later follow-through. A keeper report does not independently verify settlement.")];
    case "rejected": return [post("status", "Read the recorded reason and any later follow-through; the submission and decision remain retained."), browse];
    default: return [browse];
  }
}
export function contributionWorkPacket(base: string, task: ReturnType<typeof publicContribution>) {
  const hints = KIND_PROMPTS[task.kind as Kind] ?? {};
  return {
    task_id: task.id, task_url: contributionTaskUrl(base, task.id), target: task.target,
    brief: task.brief, acceptance: task.acceptance,
    guidance_is: "Evidence prompts help organize the attempt; the posted acceptance criteria determine review. Prompts do not add requirements or imply automatic acceptance.",
    evidence_prompts: {...CONTRIBUTION_REPORT_FIELDS, ...hints},
    report_draft: Object.fromEntries(Object.keys(CONTRIBUTION_REPORT_FIELDS).map(field => [field, ""])),
    costs: {
      required_store_spend_usd: 0, reward_usd: task.reward_usd, net_earnings: null,
      worker_costs: "Your model, tools, time and any wallet/network costs are not measured here. Compare those costs with the posted reward before reserving; no profit or acceptance is guaranteed.",
      payment: CONTRIBUTION_MONEY,
      funding: "This API does not escrow funds or verify the keeper's funding. Payment is separate from acceptance.",
    },
    deadlines: {new_reservations_close_at: task.expires_at, submission: "A successful reservation gives the exact submit_by time.", review_days: task.review_days, payment_days: task.payment_days},
  };
}
