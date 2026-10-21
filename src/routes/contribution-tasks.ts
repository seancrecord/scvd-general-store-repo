import {readFieldAllocationSummary} from "@/services/field-wallet-allocations";
import {readRewardCommitments} from "@/services/reward-commitments";
import {readAgentTaskUsage} from "@/lib/metrics";
import {renderAdminShell} from "@/pages/admin/layout";
import {escapeHtml} from "@/lib/sanitize";
import {launchFirstContributionRound} from "@/services/contribution-launch";
import { contributionBoard } from "@/services/contribution-board";
import { CONTRIBUTION_INDEX_PREFIX, CONTRIBUTION_PAGE_CAP } from "@/store/contribution-tasks";
import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { listKeys } from "@/lib/kv-list";
import { kvPut } from "@/lib/kv-retry";
import { namelessVisitorKey } from "@/lib/visitor-day-key";
import { contributionNextSteps, contributionWorkPacket } from "@/services/contribution-worker";
import { contributionCompletion } from "@/services/contribution-completion";
import { ContributionInputError, onlyFields, contributionTerms, CONTRIBUTION_FIELD_CAP } from "@/services/contribution-task";
import { contributionGuide, CONTRIBUTION_ADMIN, CONTRIBUTION_API, CONTRIBUTION_REPORT_FIELDS, CONTRIBUTION_RESERVATION_HOURS, CONTRIBUTION_TEMPLATES, CONTRIBUTION_REPORT_BYTES, CONTRIBUTION_REQUEST_BYTES } from "@/store/contribution-tasks";
import { CONTRIBUTION_ARRIVAL_DESCRIPTION, CONTRIBUTION_ARRIVAL_GOALS, CONTRIBUTION_ARRIVAL_CAP, CONTRIBUTION_ARRIVAL_BYTES } from "@/store/contribution-tasks";
import { renderFieldAllocations, renderContributionDesk, renderContributionRetry, renderContributionLaunchFailure, renderContributionLaunchSuccess, type ContributionAdminAction } from "@/pages/admin/contribution-tasks";
import { isRecord, type Env, type HonoEnv } from "@/types";

export const contributionRoutes = new Hono<HonoEnv>({strict: false});
export const adminContributionRoutes = new Hono<HonoEnv>({strict: false});
const INDEX = CONTRIBUTION_INDEX_PREFIX;
function task(env: Env, id: string) {
  if (!env.CONTRIBUTION_TASKS) throw new Error("Contribution storage unavailable");
  return env.CONTRIBUTION_TASKS.getByName(id);
}
function validId(id: string) {return /^[a-z0-9][a-z0-9-]{2,63}$/.test(id);}
async function adminBoard(env: Env, cursor?: string) {
  if (!env.CONTRIBUTION_TASKS) throw new Error("Contribution storage unavailable");
  const listed = await listKeys(env.COUNTERS, {prefix: INDEX, cap: CONTRIBUTION_PAGE_CAP, ...(cursor ? {cursor} : {})});
  const now = Date.now();
  const tasks = await Promise.all(listed.names.map(key => task(env, key.slice(INDEX.length)).adminSummary(now)));
  if (tasks.some(t => t === null)) throw new Error("Indexed task record unavailable");
  return {tasks: tasks.filter(t => t !== null), truncated: listed.truncated, cursor: listed.cursor ?? null, indexing_note: "This page reads a bounded directory slice. Counts cover only the retained submissions in the briefs shown, as read now; recently posted briefs may be absent until indexing catches up. No person counts, traffic attribution or store-wide totals are inferred."};
}
function contract(base: string) {
  return {...contributionGuide(base), templates: CONTRIBUTION_TEMPLATES, templates_are: "Examples for the keeper to post with explicit terms; templates are not open work.", report_fields: CONTRIBUTION_REPORT_FIELDS, field_max_characters: CONTRIBUTION_FIELD_CAP, request_max_bytes: CONTRIBUTION_REQUEST_BYTES, report_max_bytes: CONTRIBUTION_REPORT_BYTES, reservation_hours: CONTRIBUTION_RESERVATION_HOURS,
    optional_arrival: {description: CONTRIBUTION_ARRIVAL_DESCRIPTION, goals: CONTRIBUTION_ARRIVAL_GOALS, found_via_max_characters: CONTRIBUTION_ARRIVAL_CAP, max_bytes: CONTRIBUTION_ARRIVAL_BYTES},
    acceptance_receipt: "After acceptance, private status retrieves a retained Ed25519-signed acceptance receipt binding the posted terms, report and review digests. The store is the commissioning party. This is not proof of payment or independent verification of every finding. If unavailable, retry status; acceptance and payment terms remain unchanged.",
    payment_observations: "After the keeper checks a reported redemption transaction, private status includes the latest check and latest confirmed observation. These unsigned dated readings bind the retained reward authorization; they are not live wallet balances. A failed recheck withdraws accounting credit until reconfirmed.",
    progress: "Private status includes dated keeper follow-through entries after review. They do not replace the acceptance decision, reset its payment deadline or verify a fix independently.",
    payment: "Read the brief payment_method before reserving. signed_authorization briefs issue Base USDC authorizations after acceptance and a separate keeper approval, within the payment period. Retrieve them through private status; arrange your own redemption and gas. SCVD sponsors no gas and broadcasts nothing. Legacy keeper_paid_base_usdc briefs retain their original separate-payment terms. Neither a signature nor a keeper payment report verifies settlement.",
    eligibility: "Autonomous agents may perform contribution work. Prior field-study participation does not itself disqualify a contribution; this is separate work under its own posted criteria and capacity, not another field-study reward. No purchase or positive finding required. Acceptance uses the posted brief and evidence, not praise. A daily visitor digest limits simultaneous reservations; shared networks can share that limit. Reservations expire. This is not a per-person limit or proof of identity.",
    privacy: "Reports and review references stay private. No email, bank credentials or wallet secrets are requested. Do not upload other people's private data. A daily visitor digest limits reservations and is cleared by the next daily retention alarm. No contribution is automatically published. Submitted evidence and review records are retained privately; they do not expire with the reservation.",
    requests: {
      reserve: {method: "POST", url: `${base}${CONTRIBUTION_API}/{id}/reserve`, body: {reservation_key: "32 cryptographically random bytes as 64 lowercase hex; generate locally and retain for retries and status"}},
      submit: {method: "POST", url: `${base}${CONTRIBUTION_API}/{id}/submit`, body: {reservation_key: "same private key", payout_to: "your Base EVM address", report: Object.fromEntries(Object.entries(CONTRIBUTION_REPORT_FIELDS))}, optional_body_fields: {arrival: {goal: "one optional_arrival.goals key", found_via: "Briefly describe the discovery path; no private prompts or personal data"}}},
      status: {method: "POST", url: `${base}${CONTRIBUTION_API}/{id}/status`, body: {reservation_key: "same private key"}},
      release: {method: "POST", url: `${base}${CONTRIBUTION_API}/{id}/release`, body: {reservation_key: "same private key"}},
    },
  };
}
for (const [routes, scope] of [[contributionRoutes, `${CONTRIBUTION_API}/*`], [adminContributionRoutes, "*"]] as const) {
  // Public routes mount at /; a wildcard here would wrap unrelated doors.
  routes.use(scope, bodyLimit({maxSize: CONTRIBUTION_REQUEST_BYTES, onError: c => c.json({code: "body_too_large", error: `The contribution request limit is ${CONTRIBUTION_REQUEST_BYTES} bytes. Nothing was stored.`}, 413)}));
  routes.use(scope, async (c, next) => {
    c.header("Cache-Control", "no-store");
    // no-referrer makes native form POSTs send Origin: null, which our admin
    // gate correctly refuses. same-origin keeps off-site referrals private.
    c.header("Referrer-Policy", routes === adminContributionRoutes ? "same-origin" : "no-referrer");
    await next();
  });
  routes.onError((error, c) => error instanceof ContributionInputError ? c.json({code: "invalid_input", error: error.message}, 400) : c.json({code: "contributions_unavailable", error: "Contribution records could not be read or saved. Retry with the same task id and reservation key; no success is being claimed."}, 503));
}
contributionRoutes.get(CONTRIBUTION_API, async c => c.json({...contract(c.env.STORE_BASE_URL), ...await contributionBoard(c.env, c.req.query("cursor"))}));
contributionRoutes.get(`${CONTRIBUTION_API}/:id`, async c => {
  const id = c.req.param("id");
  if (!validId(id)) return c.json({code: "task_missing", error: "No posted task with that id."}, 404);
  const value = await task(c.env, id).publicView();
  return value ? c.json({...contract(c.env.STORE_BASE_URL), task: value, work_packet: contributionWorkPacket(c.env.STORE_BASE_URL, value), next_steps: contributionNextSteps(c.env.STORE_BASE_URL, {task_id: id, status: value.availability_reason})}) : c.json({code: "task_missing", error: "No posted task with that id."}, 404);
});
for (const action of ["reserve", "submit", "status", "release"] as const) {
  contributionRoutes.post(`${CONTRIBUTION_API}/:id/${action}`, async c => {
    const id = c.req.param("id");
    if (!validId(id)) return c.json({code: "task_missing", error: "No posted task with that id."}, 404);
    const body: unknown = await c.req.json().catch(() => null);
    if (!isRecord(body)) return c.json({code: "invalid_input", error: "Send a JSON object using the published request shape."}, 400);
    const today = new Date().toISOString().slice(0, 10);
    const visitor = action === "reserve" ? await namelessVisitorKey(name => c.req.header(name), today) ?? "unidentified" : "";
    const result = await task(c.env, id).act(action, body, visitor);
    const state = result.data.status;
    const completion = result.status === 200 && (state === "accepted" || state === "payment_reported") ? contributionCompletion(c.env.STORE_BASE_URL, {
      kind: "contribution", contribution_kind: result.data.task_kind, arrival_goal: result.data.arrival_goal, task_id: id, reward_usd: Number(result.data.reward_usd),
      finalized_redemption_observed: !!result.data.acceptance_funding_release,
      reward_state: result.data.payout && result.data.payout.state !== "issuance_pending" ? "authorization_issued" : state === "accepted" ? "accepted_pending_payment" : "payment_reported",
      what_was_verified: result.data.acceptance_funding_release ? "The keeper recorded acceptance. Separate funding reconciliation retained an exact finalized reward transfer; see its transaction and read time in private status." : "The keeper recorded acceptance against the posted brief. This is a review decision, not an independently verified observation.",
      what_was_not: result.data.acceptance_funding_release ? "The report's claims, net earnings and completion of any wider task are not established by the payment observation. It is a retained RPC reading, not a live balance or independent consensus verification." : "The report's claims, payout transaction and completion of any wider task have not been independently verified by this instrument.",
    }) : {};
    return c.json({...result.data, ...(result.status === 200 ? {next_steps: contributionNextSteps(c.env.STORE_BASE_URL, result.data)} : {}), ...completion}, result.status);
  });
}

// Mounted behind the existing admin gate. Every write also rejects cross-origin requests.
adminContributionRoutes.use("*", async (c, next) => {
  if (c.req.method !== "GET") {
    const site = c.req.header("sec-fetch-site"), origin = c.req.header("origin");
    if (site && site !== "same-origin" && site !== "none" || origin && origin !== new URL(c.env.STORE_BASE_URL).origin) return c.json({code: "cross_site_refused", error: "This action is accepted only from the store admin page."}, 403);
  }
  await next();
});
adminContributionRoutes.get("/", async c => {
  const index = await adminBoard(c.env, c.req.query("cursor"));
  return c.html(renderContributionDesk(index, null, Date.now(), c.env.STORE_BASE_URL));
});
adminContributionRoutes.get("/reports/funding", async c => {
  const [data, allocations] = await Promise.all([readRewardCommitments(c.env), readFieldAllocationSummary(c.env)]);
  const rows = data.observed;
  return c.html(renderAdminShell("bounties", `${renderFieldAllocations(allocations)}<h2>Cross-program reward commitments</h2><p>${escapeHtml(data.limits)}</p><p>Read ${escapeHtml(data.read_at)} · ${data.scan_complete ? "Indexed scan completed within its bounds" : "Incomplete scan; a combined total is unavailable"}</p><pre>${escapeHtml(JSON.stringify(data.coverage, null, 2))}</pre>${data.gaps.length ? `<p>Gaps: ${escapeHtml(data.gaps.join(", "))}</p>` : ""}${rows ? `<table><tr><th>Record category</th><th>USDC face value</th></tr><tr><td>Accepted contribution work, gross</td><td>${rows.contributions.accepted_total_usd}</td></tr><tr><td>Confirmed contribution redemptions in retained observations (subset of gross)</td><td>${rows.contributions.confirmed_redemption_observed_usd}</td></tr><tr><td>Accepted contribution work without a retained confirmation</td><td>${rows.contributions.accepted_unreconciled_usd}</td></tr><tr><td>Issued contribution authorizations (subset of gross)</td><td>${rows.contributions.issued_authorization_subset_usd}</td></tr><tr><td>Manual payment reports (subset of gross)</td><td>${rows.contributions.manual_report_subset_usd}</td></tr><tr><td>Shopping authorizations within expiry</td><td>${rows.shopping_authorization_face_value_usd}</td></tr><tr><td>Study authorizations within expiry</td><td>${rows.study_authorization_face_value_usd}</td></tr><tr><td>Gross reward exposure, including observed redemptions</td><td>${data.reward_exposure_usd ?? "Unavailable"}</td></tr><tr><td>Conditional contribution reservations/submissions (separate)</td><td>${rows.contributions.conditional_reserved_or_submitted_usd}</td></tr><tr><td>Available contribution slots (separate maximum)</td><td>${rows.contributions.available_slot_maximum_usd}</td></tr></table><p>${rows.contributions.expired_authorizations} issued contribution authorizations have expired, including any already observed redeemed. Confirmation observations: ${escapeHtml(rows.contributions.confirmation_observed_from ?? "None")} through ${escapeHtml(rows.contributions.confirmation_observed_through ?? "None")}; these are saved readings, not a fresh chain scan.</p>` : "<p>Reward records could not be summarized.</p>"}<p><a href="/admin/bounties">Wallet and money-out desk</a> · <a href="/admin/bounties/contributions">Contribution work</a></p>`));
});
adminContributionRoutes.get("/reports/usage", async c => {
  const data = await readAgentTaskUsage(c.env);
  return c.html(renderAdminShell("bounties", `<h2>Agent task usage</h2><p>${escapeHtml(data.reading)}</p><p>Month: ${escapeHtml(data.month)}${data.truncated ? " · partial scan" : ""}${data.unreadable ? ` · ${data.unreadable} unreadable counters omitted` : ""}</p><table><tr><th>Task</th><th>Step</th><th>Declared arrival</th><th>HTTP outcome</th><th>Traffic bucket</th><th>Requests recorded</th></tr>${data.rows.map(row => `<tr>${[row.task,row.step,row.arrival,row.outcome,row.bucket,String(row.count)].map(value => `<td>${escapeHtml(value ?? "unknown")}</td>`).join("")}</tr>`).join("")}</table><p><a href="/admin/bounties/contributions">Back to contribution work</a></p>`));
});
adminContributionRoutes.post("/:id/reconcile", async c => {
  const id = c.req.param("id");
  if (!validId(id)) return c.json({code:"task_missing", error:"No posted task with that id."}, 404);
  const form = c.req.header("content-type")?.includes("application/x-www-form-urlencoded") ?? false;
  const body: unknown = form ? Object.fromEntries(await c.req.formData()) : await c.req.json().catch(() => null);
  if (!isRecord(body)) throw new ContributionInputError("Send a submission id and Base transaction hash.");
  onlyFields(body, ["submission_id", "tx_hash"]);
  if (typeof body.submission_id !== "string" || !body.submission_id || body.submission_id.length > 128 || typeof body.tx_hash !== "string") throw new ContributionInputError("Send a submission id and Base transaction hash.");
  if (!/^0x[0-9a-f]{64}$/i.test(body.tx_hash)) throw new ContributionInputError("Enter a Base transaction hash: 0x followed by 64 hexadecimal characters.");
  const result = await task(c.env, id).checkRewardPayment(body.submission_id, body.tx_hash);
  if (!result) return c.json({code:"submission_missing", error:"No retained submission with that id."}, 404);
  if (!form) return c.json(result);
  const labels = {confirmed:"Reward transfer confirmed", pending_finality:"Matching transfer; waiting for confirmations", not_matched:"Transaction does not match this reward", unavailable:"Payment could not be established"};
  return c.html(renderAdminShell("bounties", `<h2>${labels[result.status]}</h2><p>${result.saved ? "Payment observation saved privately." : "A newer check started; this result was not saved. Reload the submission for the current observation."}</p><p>${escapeHtml(result.limits)}</p><p>Read ${escapeHtml(result.read_at)} · ${result.confirmations ?? "Unknown"} confirmations; ${result.required_confirmations} required.</p><pre>${escapeHtml(JSON.stringify(result, null, 2))}</pre><p><a href="${CONTRIBUTION_ADMIN}/${escapeHtml(id)}#submission-${encodeURIComponent(body.submission_id)}">Back to this submission</a> · <a href="${CONTRIBUTION_ADMIN}/reports/funding">Reward inventory</a></p>`));
});
adminContributionRoutes.get("/:id", async c => {
  const id = c.req.param("id"); if (!validId(id)) return c.json({code: "task_missing", error: "No posted task with that id."}, 404);
  const state = await task(c.env, id).adminView();
  return state ? c.html(renderContributionDesk(null, state, Date.now(), c.env.STORE_BASE_URL)) : c.json({code: "task_missing", error: "No posted task with that id."}, 404);
});
async function adminFormAction(c: Context<HonoEnv>, action: ContributionAdminAction, id: string | null, perform: (body: Record<string, unknown>, form: boolean) => Promise<Response>) {
  const form = c.req.header("content-type")?.includes("application/x-www-form-urlencoded") ?? false;
  const body: unknown = form ? Object.fromEntries(await c.req.formData()) : await c.req.json().catch(() => null);
  if (!isRecord(body)) throw new ContributionInputError("Send the documented action fields.");
  try {
    // Keep the submitted strings for a failed browser response, before coercion.
    const response = await perform({...body}, form);
    if (!form || response.status < 400) return response;
    const result: unknown = await response.json();
    const error = isRecord(result) && typeof result.error === "string" ? result.error : "The action could not be completed.";
    return c.html(renderContributionRetry(action, id, body, error, response.status >= 500), response.status as 400 | 404 | 409 | 503);
  } catch (error) {
    if (!form) throw error;
    const invalid = error instanceof ContributionInputError;
    return c.html(renderContributionRetry(action, id, body, invalid ? error.message : "Contribution records could not be read or saved. No success is being claimed.", !invalid), invalid ? 400 : 503);
  }
}
adminContributionRoutes.post("/launch-first-round", async c => {
  try {
    if ((await c.req.arrayBuffer()).byteLength) throw new ContributionInputError("This button posts the fixed first-round terms; additional fields are refused.");
    await launchFirstContributionRound(c.env, Date.now());
    return c.html(renderContributionLaunchSuccess());
  } catch (error) {
    const invalid = error instanceof ContributionInputError;
    return c.html(renderContributionLaunchFailure(invalid ? error.message : "Posting could not be confirmed. Retry the same round to recover any interrupted save."), invalid ? 400 : 503);
  }
});
adminContributionRoutes.post("/", c => adminFormAction(c, "post", null, async (body, form) => {
  if (form) for (const field of ["reward_usd", "slots", "review_days", "payment_days"]) body[field] = Number(body[field]);
  // The form labels its date picker UTC; JSON callers supply their own timezone.
  if (form && typeof body.expires_at === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(body.expires_at)) body.expires_at += "Z";
  const terms = contributionTerms(body, Date.now());
  const result = await task(c.env, terms.id).create(terms);
  if (result.status !== 201) return c.json(result.data, result.status);
  // Retrying the same immutable brief repairs an interrupted index write.
  await kvPut(c.env.COUNTERS, INDEX + terms.id, "1");
  return form ? c.redirect(`/admin/bounties/contributions/${terms.id}`, 303) : c.json(result.data, 201);
}));
for (const action of ["close", "review", "payment", "progress", "authorize", "release-funding"] as const) {
  adminContributionRoutes.post(`/:id/${action}`, c => {
    const id = c.req.param("id"); if (!validId(id)) return c.json({code: "task_missing", error: "No posted task with that id."}, 404);
    return adminFormAction(c, action, id, async (body, form) => {
      const result = action === "release-funding" ? await task(c.env, id).releaseRewardFunding(body) : action === "authorize" ? await task(c.env, id).issueReward(body) : await task(c.env, id).act(action, body);
      return form && result.status === 200 ? c.redirect(`/admin/bounties/contributions/${id}`, 303) : c.json(result.data, result.status);
    });
  });
}
