import { agentJobEntries } from "@/store/agent-jobs";
import { listKeys } from "@/lib/kv-list";
import { CONTRIBUTION_API, CONTRIBUTION_INDEX_PREFIX, CONTRIBUTION_PAGE_CAP } from "@/store/contribution-tasks";
import { contributionTaskUrl, type ContributionStep } from "@/services/contribution-worker";
import type { Env } from "@/types";

/** The page and API read the same bounded directory and authoritative capacity. */
export async function contributionBoard(env: Env, cursor?: string) {
  const namespace = env.CONTRIBUTION_TASKS;
  if (!namespace) throw new Error("Contribution storage unavailable");
  const listed = await listKeys(env.COUNTERS, {prefix: CONTRIBUTION_INDEX_PREFIX, cap: CONTRIBUTION_PAGE_CAP, ...(cursor ? {cursor} : {})});
  const now = Date.now();
  const tasks = await Promise.all(listed.names.map(key => namespace.getByName(key.slice(CONTRIBUTION_INDEX_PREFIX.length)).publicView(now)));
  if (tasks.some(task => task === null)) throw new Error("Indexed task record unavailable");
  const base = env.STORE_BASE_URL;
  const rows = tasks.filter(task => task !== null).map(task => ({...task, task_url: contributionTaskUrl(base, task.id)}));
  const available = rows.filter(task => task.availability_reason === "available" && task.available_slots > 0);
  const nextPage = listed.truncated && listed.cursor ? `${base}${CONTRIBUTION_API}?cursor=${encodeURIComponent(listed.cursor)}` : null;
  const nextSteps: ContributionDiscoveryStep[] = [];
  if (nextPage) nextSteps.push({action: "next_page", label: "Read more contribution briefs", method: "GET", url: nextPage, required_fields: [], deadline_at: null, note: "This page is only part of the directory. Later pages may contain available slots."});
  for (const task of available) nextSteps.push({action: "read_brief", label: `Read brief: ${task.title}`, method: "GET", url: task.task_url, required_fields: [], deadline_at: task.expires_at, note: "Read acceptance criteria, costs, payment method and deadlines before reserving. Only a successful reserved response permits work; funding_pending does not."});
  if (!available.length) nextSteps.push(...contributionFreeNextSteps(base));
  return {tasks: rows, truncated: listed.truncated, cursor: listed.cursor ?? null,
    availability: {state: available.length ? "slots_listed" as const : "no_slots_listed" as const, scope: "this_page" as const, evaluated_at: new Date(now).toISOString(), available_tasks: available.length, available_slots: available.reduce((sum, task) => sum + task.available_slots, 0), permission_to_start: false as const, note: "Counts cover only the briefs on this page and can change. A listed slot is not a reservation or a funding guarantee. Begin only after reserve returns reserved under the posted terms."},
    next_steps: nextSteps,
    indexing_note: "New listings can take a short time to appear. The task URL and reservation response read authoritative capacity; no reward is reserved by reading this list."};
}
export type ContributionBoard = Awaited<ReturnType<typeof contributionBoard>>;

export interface ContributionDiscoveryStep extends ContributionStep {label: string}
/** Existing free tasks are optional alternatives, never substitute paid briefs. */
export function contributionFreeNextSteps(base: string): ContributionDiscoveryStep[] {
  return agentJobEntries(base).filter(job => ["expenses", "find-apis", "preflight"].includes(job.id)).map(job => ({
    action: "free_task", label: job.title, method: "GET", url: job.url, required_fields: [], deadline_at: null,
    note: `${job.cost}. ${job.summary} This is an optional tool for your own task, not paid contribution work or a promised reward.`,
  }));
}
