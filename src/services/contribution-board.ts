import { listKeys } from "@/lib/kv-list";
import { CONTRIBUTION_INDEX_PREFIX, CONTRIBUTION_PAGE_CAP } from "@/store/contribution-tasks";
import { contributionTaskUrl } from "@/services/contribution-worker";
import type { Env } from "@/types";

/** The page and API read the same bounded directory and authoritative capacity. */
export async function contributionBoard(env: Env, cursor?: string) {
  const namespace = env.CONTRIBUTION_TASKS;
  if (!namespace) throw new Error("Contribution storage unavailable");
  const listed = await listKeys(env.COUNTERS, {prefix: CONTRIBUTION_INDEX_PREFIX, cap: CONTRIBUTION_PAGE_CAP, ...(cursor ? {cursor} : {})});
  const tasks = await Promise.all(listed.names.map(key => namespace.getByName(key.slice(CONTRIBUTION_INDEX_PREFIX.length)).publicView()));
  if (tasks.some(task => task === null)) throw new Error("Indexed task record unavailable");
  return {tasks: tasks.filter(task => task !== null).map(task => ({...task, task_url: contributionTaskUrl(env.STORE_BASE_URL, task.id)})), truncated: listed.truncated, cursor: listed.cursor ?? null, indexing_note: "New listings can take a short time to appear. The task URL and reservation response read authoritative capacity; no reward is reserved by reading this list."};
}
export type ContributionBoard = Awaited<ReturnType<typeof contributionBoard>>;
