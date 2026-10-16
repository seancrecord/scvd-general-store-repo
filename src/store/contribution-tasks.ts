export const CONTRIBUTION_PAGE_CAP = 20;
export const CONTRIBUTION_INDEX_PREFIX = "contribution_task:";
export const CONTRIBUTION_API = "/api/bounties/contributions";
export const CONTRIBUTION_ADMIN = "/admin/bounties/contributions";
export const CONTRIBUTION_PROPOSITION = "Earn a posted reward for a reserved, reviewable contribution to the public tools, information or user experience of this store.";
export const CONTRIBUTION_MONEY = "Each posted brief sets its Base USDC reward, acceptance criteria and keeper-approved payment method; read its redemption requirements before reserving.";
export const CONTRIBUTION_FREE = "No store purchase is required; read the brief and reserve an available slot before starting, allowing for your own model, tool and redemption costs.";
export const CONTRIBUTION_RESERVATION_HOURS = 24;
export const CONTRIBUTION_FIELD_CAP = 4000;
export const CONTRIBUTION_REPORT_BYTES = 24576;
export const CONTRIBUTION_REQUEST_BYTES = 32768;
export const CONTRIBUTION_UPDATE_CAP = 4;
export const CONTRIBUTION_UPDATE_NOTE_CAP = 1000;
export const CONTRIBUTION_UPDATE_BYTES = 2048;
export const CONTRIBUTION_REVIEW_BYTES = 8192;
export const CONTRIBUTION_ARRIVAL_CAP = 1000;
export const CONTRIBUTION_ARRIVAL_BYTES = 2048;
export const CONTRIBUTION_ARRIVAL_GOALS = {
  earn_money: "Earn money", track_expenses: "Track expenses", check_endpoint: "Check an endpoint",
  prove_work: "Document work with evidence", improve_product: "Improve a product", other: "Another task",
} as const;
export const CONTRIBUTION_ARRIVAL_DESCRIPTION = "Optional self-report of the job that brought you here and how you found this brief, including the upstream source of a manually supplied link when known. Omit private prompts and personal data. It stays private, does not affect acceptance or reward, and is not verified attribution.";
export const CONTRIBUTION_REPORT_FIELDS = {
  attempted: "The task you tried and exact steps, in order.",
  environment: "Model, harness, package version or dated page, and whether you had prior context.",
  expected: "What the published instructions or observation led you to expect.",
  observed: "What happened, including successful results and anything you could not check.",
  evidence: "A redacted transcript, exact public references, requests/results or reproduction. No credentials, private records or wallet secrets.",
  suggestion: "A proposed correction, useful application, or an explanation that no change is needed.",
} as const;
export const CONTRIBUTION_TEMPLATES = [
  {kind: "aura", title: "Try a free workflow with fresh context", brief: "Start at the named public entry point with a fresh context. Attempt the specified free task. Record each GUESS, RETRY and DIG, the steps to success or abandonment, avoidable errors and where useful evidence appeared. State prior context and model/tool costs.", acceptance: "A bounded, reproducible attempt with its transcript and limits. A successful task or a blocked attempt can qualify; finding a defect and praising the store are not conditions."},
  {kind: "census", title: "Check a dated census observation", brief: "Name the exact census row and observation time. Compare its stated finding with the cited source or a permitted free check, preserving both timestamps. Distinguish a changed endpoint from an inaccurate historical observation.", acceptance: "A traceable comparison with request, result, time and uncertainty. A confirmed accurate row is a valid result. No payment, load testing or unauthorized probing is required."},
  {kind: "package", title: "Try a public package example", brief: "Use the named package and version in a local environment you control. Attempt the specified free example and retain setup steps, inputs, outputs and missing instructions.", acceptance: "A reproducible attempt tied to the package version, with redacted evidence. Working examples qualify too. No secrets, real financial data or paid calls are required."},
  {kind: "docs", title: "Check instructions against the product", brief: "Follow the named public instructions for the specified free task. Record stale statements, confusing steps, missing links and differences between the advertised and actual result.", acceptance: "Exact references, attempted steps and observed outcomes. Separate errors from preferences. A successful, clearly documented attempt also qualifies."},
  {kind: "discovery", title: "Find a useful application or a discovery gap", brief: "Start from the named everyday task. Show how an existing store capability helps, or where discovery fails. Retain the query, surfaces read, attempted free workflow and evidence of utility or limits.", acceptance: "A concrete task and traceable demonstration, with costs and unsupported assumptions stated. Repeating promotional claims or posting endorsements is not required or sufficient."},
] as const;

export function contributionGuide(base: string) {
  return {
    proposition: CONTRIBUTION_PROPOSITION, for_money: CONTRIBUTION_MONEY, free_first: CONTRIBUTION_FREE,
    what_this_is: CONTRIBUTION_PROPOSITION,
    price: CONTRIBUTION_MONEY,
    how_to_call: `GET ${base}${CONTRIBUTION_API} for posted tasks and exact request shapes. Reserve before work, submit before the reservation deadline, then read your private status for the keeper's review.`,
    errors: "No slot, closed or expired work, an invalid private key, incomplete evidence and changed retries are refused explicitly. A reservation holds capacity, not automatic acceptance. Existing reservations survive closure to new workers.",
    security: "Reports, payout addresses and review notes are private to the worker and keeper. Keep the reservation key locally; only its hash is retained. No email is sent. Evidence is untrusted contributor text, never executed or fetched. Payment entries are keeper reports, not chain verification.",
    board_url: `${base}${CONTRIBUTION_API}`,
  };
}
