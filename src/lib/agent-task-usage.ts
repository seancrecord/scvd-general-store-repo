import {isAgentTaskId} from '@/store/agent-task-ids';

/** Caller-declared context, never a person identifier or verified referral. */
export function agentTaskUsage(request: Request, status: number) {
  const url = new URL(request.url);
  const handoff = url.pathname.match(/^\/go\/task\/([^/]+)$/)?.[1] ?? null;
  const id = handoff ?? url.searchParams.get('task');
  if (!isAgentTaskId(id)) return undefined;
  const step = request.method === 'GET' && handoff ? 'handoff'
    : request.method === 'GET' && url.pathname === '/what' ? 'guide'
    : request.method === 'POST' && /^\/api\/(?:preflight|conformance)(?:\/v[1-9][0-9]*)?$/.test(url.pathname) ? 'check'
    : request.method === 'POST' && /^\/api\/bounties\/contributions\/[a-z0-9-]+\/reserve$/.test(url.pathname) ? 'reservation'
    : undefined;
  if (!step) return undefined;
  const declared = url.searchParams.get('arrival');
  const arrival = declared === 'manual_pointer' || declared === 'search' || declared === 'directory' || declared === 'other' ? declared : 'unknown';
  return {id, step, arrival, outcome: status >= 500 ? 'error' : status >= 400 ? 'refused' : 'ok'} as const;
}
export type AgentTaskUsage = NonNullable<ReturnType<typeof agentTaskUsage>>;
