/** Bounded task labels shared by discovery and request accounting. */
export const AGENT_TASK_IDS = ['earn', 'expenses', 'trial-reminders', 'before-signup', 'find-apis', 'preflight', 'overlapping-tools', 'payment-debugging', 'compare-endpoints', 'client-report'] as const;
export type AgentTaskId = typeof AGENT_TASK_IDS[number];
export function isAgentTaskId(value: string | null): value is AgentTaskId {
  return value !== null && (AGENT_TASK_IDS as readonly string[]).includes(value);
}
