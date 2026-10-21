import {atomicToUsdc} from "@/lib/payments";
import type {readFieldAllocationSummary, FieldAllocationProgram} from "@/services/field-wallet-allocations";
import {FIRST_CONTRIBUTION_ROUND, FIRST_CONTRIBUTION_MAXIMUM} from "@/services/contribution-launch";
import {contributionQaBrief} from "@/store/contribution-qa-brief";
import {CONTRIBUTION_REDEMPTION, privateContributionPayout} from "@/services/contribution-payout";
import {BOUNTY_WEEKLY_BUDGET_USD} from "@/services/bounty-board";
import {STUDY_WEEKLY_BUDGET_USD} from "@/services/field-study";
import { firstContributionBatch } from "@/store/contribution-first-batch";
import { contributionWork } from "@/services/contribution-follow-through";
import { CONTRIBUTION_UPDATE_CAP, CONTRIBUTION_UPDATE_NOTE_CAP, CONTRIBUTION_UPDATE_BYTES, CONTRIBUTION_REVIEW_BYTES, CONTRIBUTION_ARRIVAL_GOALS } from "@/store/contribution-tasks";
import { escapeHtml as esc } from "@/lib/sanitize";
import { renderAdminShell } from "@/pages/admin/layout";
import { CONTRIBUTION_FIELD_CAP, CONTRIBUTION_ADMIN, CONTRIBUTION_API, CONTRIBUTION_RESERVATION_HOURS, CONTRIBUTION_TEMPLATES } from "@/store/contribution-tasks";
import { CONTRIBUTION_MAX_SLOTS, CONTRIBUTION_MAX_REVIEW_DAYS, CONTRIBUTION_MAX_PAYMENT_DAYS, CONTRIBUTION_OUTCOMES, publicContribution, type ContributionTaskState } from "@/services/contribution-task";

type Index = {tasks: (ReturnType<typeof publicContribution> & {work: ReturnType<typeof contributionWork>})[]; truncated: boolean; cursor: string | null; indexing_note: string};
function field(name: string, label: string, value = "", type = "text", extra = "") {return `<label>${esc(label)} <input name="${name}" type="${type}" value="${esc(value)}" required ${extra}></label>`;}
function area(name: string, label: string, value = "", max = CONTRIBUTION_FIELD_CAP) {return `<p><label>${esc(label)}<br><textarea name="${name}" rows="4" cols="75" maxlength="${max}" required>${esc(value)}</textarea></label></p>`;}

function briefForm(t: {kind: string; title: string; brief: string; acceptance: string; target?: string; reward_usd?: number; slots?: number; expires_at?: string; review_days?: number; payment_days?: number}) {
  return `<details><summary>${esc(t.title)}</summary><form method="post" action="${CONTRIBUTION_ADMIN}"><input type="hidden" name="kind" value="${t.kind}">
      <p><input type="hidden" name="id" value="${t.kind}-${crypto.randomUUID()}">${field("title", "Title", t.title, "text", 'maxlength="160"')}</p>
      <p>${field("target", "Exact public URL", t.target ?? "", "url")}</p>${area("brief", "Task and boundaries", t.brief)}${area("acceptance", "What earns the reward", t.acceptance)}
      <p>${field("reward_usd", "Reward in Base USDC", t.reward_usd?.toString() ?? "", "number", 'min="0.01" step="0.01"')} ${field("slots", "Slots", "1", "number", `min="1" max="${CONTRIBUTION_MAX_SLOTS}"`)}</p>
      <p>${field("expires_at", "Closes at (UTC)", t.expires_at ?? "", "datetime-local")} ${field("review_days", "Review within days", t.review_days?.toString() ?? "", "number", `min="1" max="${CONTRIBUTION_MAX_REVIEW_DAYS}"`)} ${field("payment_days", "Pay accepted work within days", t.payment_days?.toString() ?? "", "number", `min="1" max="${CONTRIBUTION_MAX_PAYMENT_DAYS}"`)}</p>
      <p>Each reservation lasts up to ${CONTRIBUTION_RESERVATION_HOURS} hours or the closing time, whichever comes first. A result that finds no defect can meet these terms. The work and its payment must be reviewed by you.</p><input type="hidden" name="payment_method" value="signed_authorization"><p>${esc(CONTRIBUTION_REDEMPTION.instructions)}</p><button type="submit">Post these terms and reward commitment</button></form></details>`;
}
function workQueue(index: Index) {
  const actions = index.tasks.flatMap(task => task.work.actions.map(action => ({...action, task})))
    .sort((a, b) => (a.due_at ?? "~").localeCompare(b.due_at ?? "~") || a.task.id.localeCompare(b.task.id));
  const label = {review: "Review evidence", payment: "Pay accepted work", follow_up: "Follow through on planned fix"};
  const submissions = index.tasks.reduce((sum, task) => sum + task.work.learning.submissions, 0);
  const provided = index.tasks.reduce((sum, task) => sum + task.work.learning.provided, 0);
  const goals = Object.entries(CONTRIBUTION_ARRIVAL_GOALS).map(([key, title]) => [title, index.tasks.reduce((sum, task) => sum + (task.work.learning.goals[key] ?? 0), 0)] as const);
  const accepted = index.tasks.reduce((sum,t) => sum + Math.round(t.work.accepted_unpaid_usd * 100),0) / 100;
  const issued = index.tasks.reduce((sum,t) => sum + Math.round((t.work.authorization_issued_usd ?? 0) * 100),0) / 100;
  const maximum = index.tasks.reduce((sum,t) => sum + Math.round(t.maximum_reward_usd * 100),0) / 100;
  return `<h2>Budgets and commitments</h2><p>Shopping cap: $${BOUNTY_WEEKLY_BUDGET_USD}/week. Study cap: $${STUDY_WEEKLY_BUDGET_USD}/week. Contributions are separate posted commitments and consume neither cap. Raising those caps does not create open work or fund contributions.</p><p>On this page: $${maximum} maximum across posted briefs, including closed and historical work; $${accepted} accepted with no manual payment report; $${issued} of that amount has an issued authorization. Issued does not mean redeemed. These figures overlap; do not add them. This page is not a complete wallet-liability or available-balance calculation${index.truncated ? "; more briefs exist on another page" : ""}.</p><h2>Work awaiting your hand</h2><p>Due dates first; planned fixes follow. This queue covers only the briefs on this page. Payment entries are keeper reports, not verified settlement.</p>
    ${actions.length ? `<table><tr><th>Brief / submission</th><th>Next action</th><th>Due (UTC)</th></tr>${actions.map(a => `<tr><td><a href="${CONTRIBUTION_ADMIN}/${esc(a.task.id)}#submission-${esc(a.submission_id)}">${esc(a.task.title)} · ${esc(a.submission_id)}</a></td><td>${label[a.action]}${a.action === "payment" ? ` · $${a.task.reward_usd} Base USDC` : ""}</td><td>${a.overdue ? "<strong>Overdue</strong> · " : ""}${esc(a.due_at ?? "No repair deadline promised")}</td></tr>`).join("")}</table>` : "<p>No pending review, unreported payment or planned fix appears in this page's retained records.</p>"}
    <h2>Self-reported arrival</h2><p>${provided} of ${submissions} retained submissions on this page include an optional arrival answer; ${submissions - provided} did not. Counts include accepted, rejected and unreviewed submissions, across all retained dates. They count submissions, not people, and do not measure traffic, acquisition or verified demand.</p>
    <table><tr><th>Reported job</th><th>Submissions on this page</th></tr>${goals.map(([label, count]) => `<tr><td>${esc(label)}</td><td>${count}</td></tr>`).join("")}<tr><td>Not provided</td><td>${submissions - provided}</td></tr></table>`;
}
export function contributionLaunchPanel(error?: string) {
  return `<section id="contribution-launch"><h2>Post the first round</h2>
    ${error ? `<p role="alert">${esc(error)} Some briefs may already be posted. Retrying uses the same ids and terms; it cannot add another round or reopen closed work.</p>` : ""}
    <p>${FIRST_CONTRIBUTION_ROUND.length} briefs · maximum $${FIRST_CONTRIBUTION_MAXIMUM} Base USDC for this round, paid from the existing field wallet after acceptance. No purchase is required. This is a separate commitment; shopping and study caps stay unchanged.</p>
    ${FIRST_CONTRIBUTION_ROUND.map(t => `<details><summary>${esc(t.title)} · $${t.reward_usd} × ${t.slots} slot</summary><p><a href="${esc(t.target)}">Task entry point</a></p><p>${esc(t.brief)}</p><p><strong>Acceptance:</strong> ${esc(t.acceptance)}</p><p>Closes ${esc(t.expires_at)}. Review within ${t.review_days} days of submission; pay within ${t.payment_days} days of acceptance.</p><p><a href="${CONTRIBUTION_API}/${esc(t.id)}">Read this brief if already posted</a></p></details>`).join("")}
    <p>${esc(CONTRIBUTION_REDEMPTION.instructions)} One press posts these exact terms. Repeating it recovers this same round. It sends no payment and does not check the wallet balance; accepted rewards use a separately approved signed authorization. Workers arrange redemption and gas; SCVD does not sponsor it.</p>
    <form method="post" action="${CONTRIBUTION_ADMIN}/launch-first-round"><button>Post first round — $${FIRST_CONTRIBUTION_MAXIMUM} maximum</button></form></section>`;
}
export function renderContributionLaunchSuccess() {
  return renderAdminShell("bounties", `<h2>First round saved</h2><p>The ${FIRST_CONTRIBUTION_ROUND.length} briefs in this round are posted, with a combined maximum of $${FIRST_CONTRIBUTION_MAXIMUM}. Existing closed or expired work stays closed or expired. No payment was sent.</p><p>These direct links are available even while the board listing catches up.</p><ul>${FIRST_CONTRIBUTION_ROUND.map(t => `<li><a href="${CONTRIBUTION_ADMIN}/${esc(t.id)}">${esc(t.title)} — review desk</a> · <a href="${CONTRIBUTION_API}/${esc(t.id)}">Public terms and current availability</a></li>`).join("")}</ul><p><a href="${CONTRIBUTION_ADMIN}">All contribution work</a></p>`);
}
export function renderContributionLaunchFailure(error: string) {
  return renderAdminShell("bounties", `<h2>First-round posting needs attention</h2><p><a href="${CONTRIBUTION_ADMIN}">Contribution desk</a></p>${contributionLaunchPanel(error)}`);
}

export function renderContributionDesk(index: Index | null, state: ContributionTaskState | null, now: number, base: string) {
  let body = `<h2>Contribution work</h2><p><a href="/admin/bounties/contributions/reports/usage">Task discovery and handoff counts</a> · <a href="/admin/bounties/contributions/reports/funding">Cross-program reward commitments</a></p><p><a href="/admin/bounties">Money-out desk</a> · <a href="${CONTRIBUTION_ADMIN}">Contribution briefs</a> · <a href="${CONTRIBUTION_API}">Public task list</a></p>
  <p>Posted rewards are a separate commitment for the maximum shown on each brief. Posting does not draw from the automatic shopping or study budgets. Posting sends no money. For signed-authorization briefs, a separate approval issues the reward signature; the worker arranges redemption and gas.</p>`;
  if (index) {
    body += contributionLaunchPanel();
    body += `<h2>Free contract QA — proposed $${contributionQaBrief(base, now).reward_usd} brief</h2><p>One slot, separate from the first round. Posting both proposes $${FIRST_CONTRIBUTION_MAXIMUM + contributionQaBrief(base, now).reward_usd} total maximum commitments. Review the exact cases and terms before posting. A proposal is not assigned work.</p>${briefForm(contributionQaBrief(base, now))}`;
    body += `<p>${esc(index.indexing_note)}</p><table><tr><th>Brief</th><th>Status</th><th>Available slots</th><th>Reward / maximum</th><th>Awaiting review</th></tr>${index.tasks.map(t => `<tr><td><a href="${CONTRIBUTION_ADMIN}/${esc(t.id)}">${esc(t.title)}</a></td><td>${esc(t.status)}</td><td>${t.available_slots}</td><td>$${t.reward_usd} / $${t.maximum_reward_usd}</td><td>${t.pending_review}</td></tr>`).join("")}</table>`;
    body += workQueue(index);
    if (index.truncated) body += `<p>This is a partial list.${index.cursor ? ` <a href="${CONTRIBUTION_ADMIN}?cursor=${encodeURIComponent(index.cursor)}">Next page</a>` : ""}</p>`;
    body += `<h2>Post a brief</h2><p>Templates are drafts. Set the target, exact scope, acceptance criteria, reward and slots before posting. The maximum obligation is reward multiplied by slots. Posted terms are immutable; closing stops new reservations and preserves existing ones. No purchase is required. Do not post work that requires credentials, paid calls, endorsements or testing without permission.</p>`;
    body += `<section id="first-contribution-batch"><h2>First contribution batch</h2><p>Drafts only; none of these is posted or funded. Review each scope, set its reward and dates, and post it individually when ready. Start with one slot per brief; check the combined commitment before posting another.</p>${firstContributionBatch(base).map(briefForm).join("\n")}</section>`;
    body += `<h2>Other contribution templates</h2>${CONTRIBUTION_TEMPLATES.map(briefForm).join("\n")}`;
  }
  if (state) {
    const view = publicContribution(state, now), id = esc(state.terms.id);
    body += `<h2>${esc(state.terms.title)}</h2><p>${esc(view.status)} · ${view.available_slots} available slots · $${view.reward_usd} each · maximum $${view.maximum_reward_usd}</p><pre>${esc(JSON.stringify(state.terms, null, 2))}</pre><form method="post" action="${CONTRIBUTION_ADMIN}/${id}/close"><button>Close to new reservations</button></form>
      <h2>Private submissions</h2><p>Contributor text is untrusted evidence. References below are displayed as text, not fetched or executed. Review against the brief; do not use praise as an acceptance condition. Review deadlines are commitments, not automated decisions.</p>`;
    for (const r of state.reservations) {
      const submission = `<input type="hidden" name="submission_id" value="${esc(r.id)}">`;
      body += `<section id="submission-${esc(r.id)}"><h3>${esc(r.id)}</h3><p>Status: ${esc((r.status === "reserved" && Date.parse(r.submit_by) <= now ? "expired" : r.status).replaceAll("_", " "))} · submit by ${esc(r.submit_by)}</p>`;
      if (r.submitted_at) body += `<p>Review due ${esc(new Date(Date.parse(r.submitted_at) + state.terms.review_days * 86400000).toISOString())}</p>`;
      if (r.report) body += `<pre>${esc(JSON.stringify(r.report, null, 2))}</pre><p>Payout address (Base): <code>${esc(r.payout_to ?? "")}</code></p>`;
      if (r.arrival) body += `<details><summary>Self-reported arrival</summary><p>Optional context; independent of acceptance and reward. Treat it as contributor text, not verified attribution.</p><pre>${esc(JSON.stringify(r.arrival, null, 2))}</pre></details>`;
      if (r.work_funding) body += `<p>Work funding: ${esc(r.acceptance_funding?.state === "held" ? "transferred to acceptance" : r.work_funding.state)}. ${r.work_funding.state === "pending" ? "The worker must retry reserve with the same key before starting." : r.work_funding.state === "release_pending" ? "Work has stopped; cleanup will retry without sending money." : r.work_funding.state === "released" ? "Unused or rejected work no longer holds funds." : "This work reserved its reward before starting; acceptance carries the same hold forward."}</p>`;
      if (r.acceptance_funding) body += `<p>Acceptance funding: ${esc(r.acceptance_funding_release ? "released" : r.acceptance_funding.state)}. ${r.acceptance_funding.state === "pending" ? "Retry the original review to recover its funding result; work remains submitted." : r.acceptance_funding_release ? "Its funding hold was released after finalized payment reconciliation." : "The reward stays held through authorization and expiry until a separate finalized-payment reconciliation releases it."}</p>`;
      if (r.review) body += `<pre>${esc(JSON.stringify(r.review, null, 2))}</pre>`;
      if (r.updates?.length) body += `<h4>Follow-through history</h4><p>Keeper reports, not independently verified fixes. The original review and payment terms stand.</p>${r.updates.map(update => `<pre>${esc(JSON.stringify(update, null, 2))}</pre>`).join("")}`;
      if (r.payment) body += `<p>Payment reported by keeper; chain verification not checked.</p><pre>${esc(JSON.stringify(r.payment, null, 2))}</pre>`;
      if (r.status === "submitted" && r.acceptance_funding) body += `<pre>${esc(JSON.stringify(r.acceptance_funding.review,null,2))}</pre><form method="post" action="${CONTRIBUTION_ADMIN}/${id}/review">${submission}${Object.entries(r.acceptance_funding.review).filter(([key])=>key!=="at").map(([key,value])=>`<input type="hidden" name="${esc(key)}" value="${esc(value)}">`).join("")}<button>Retry saved acceptance</button></form>`;
      if (r.status === "submitted" && !r.acceptance_funding) body += `<form method="post" action="${CONTRIBUTION_ADMIN}/${id}/review">${submission}<label>Decision <select name="decision" required><option value="">Choose</option><option value="rejected">Reject</option><option value="accepted">Accept and owe the posted reward</option></select></label><label>Disposition <select name="outcome" required><option value="">Choose</option>${CONTRIBUTION_OUTCOMES.map(o => `<option value="${o}">${esc(o.replaceAll("_", " "))}</option>`).join("")}</select></label>${area("reason", "Reason tied to the posted criteria")}${field("reference", "Repair, decision or finding URL", "", "url")}<p>Review record limit: ${CONTRIBUTION_REVIEW_BYTES} UTF-8 bytes.</p><p><button>Record review</button></p></form>`;
      if (r.payment_checks) body += `<details><summary>Saved payment observations</summary><p>Unsigned, dated chain readings. The latest check and most recent confirmation are retained separately; a failed recheck of the confirmed transaction removes its accounting credit. A saved confirmation is not a live balance.</p><pre>${esc(JSON.stringify(r.payment_checks, null, 2))}</pre></details>`;
      if (r.payout) body += `<p>Authorization ${esc(privateContributionPayout(r.payout, now).state.replaceAll("_", " "))}; ${r.acceptance_funding_release ? "finalized redemption retained" : "redemption not observed in the authorization record"}. No gas is paid by the store. The private status response carries the original authorization.</p>`;
      if (r.acceptance_funding_release) body += `<p>Funding hold released after finalized payment. Read ${esc(r.acceptance_funding_release.read_at)}; receipt block ${r.acceptance_funding_release.receipt_block}; finalized balance block ${r.acceptance_funding_release.finalized_block}.</p><pre>${esc(r.acceptance_funding_release.transaction)}</pre>`;
      else if (r.status === "accepted" && state.terms.payment_method === "signed_authorization" && r.payout?.signature && r.acceptance_funding?.state === "held") body += `<form method="post" action="${CONTRIBUTION_ADMIN}/${id}/release-funding">${submission}<p>Release the internal funding hold only after verifying this exact reward in a finalized block and retaining the wallet balance after payment. This separate action sends no money and pays no gas. An ordinary payment check does not release the hold.</p>${field("tx_hash", "Base redemption transaction to reconcile", r.payment_checks?.confirmed?.transaction ?? "", "text", 'pattern="0x[a-fA-F0-9]{64}"')}<button>Reconcile funding hold</button></form>`;
      if (r.status === "accepted" && state.terms.payment_method === "signed_authorization" && r.payout?.signature) body += `<form method="post" action="${CONTRIBUTION_ADMIN}/${id}/reconcile">${submission}<p>Check a reported redemption against this retained authorization and exact reward. Save a payment observation for the funding view. The chain read sends no payment. Gross commitments remain visible beside observed redemptions.</p>${field("tx_hash", "Reported Base redemption transaction", "", "text", 'pattern="0x[a-fA-F0-9]{64}"')}<button>Check reward transaction</button></form>`;
      if (r.status === "accepted" && state.terms.payment_method === "signed_authorization" && !r.payout?.signature) body += `<form method="post" action="${CONTRIBUTION_ADMIN}/${id}/authorize">${submission}<p>Authorize $${state.terms.reward_usd} Base USDC from the existing field wallet. Check total commitments before pressing. Retries reuse the same nonce; this does not broadcast or pay gas.</p><button>Issue the reward authorization</button></form>`;
      if (r.status === "accepted" && !state.terms.payment_method) body += `<p>Owed $${state.terms.reward_usd} Base USDC by ${esc(new Date(Date.parse(r.review!.at) + state.terms.payment_days * 86400000).toISOString())}. Complete the payment separately, then record its transaction. This form does not pay.</p><form method="post" action="${CONTRIBUTION_ADMIN}/${id}/payment">${submission}${field("tx_hash", "Completed Base transaction hash", "", "text", 'pattern="0x[a-fA-F0-9]{64}"')}<button>Record a payment already made</button></form>`;
      if (r.review && (r.updates?.length ?? 0) < CONTRIBUTION_UPDATE_CAP) body += `<details><summary>Add follow-through</summary><p>A dated progress entry is visible through the worker's private status. It leaves the review decision and payment deadline unchanged. ${CONTRIBUTION_UPDATE_CAP - (r.updates?.length ?? 0)} entries remain; each fits within ${CONTRIBUTION_UPDATE_BYTES} UTF-8 bytes.</p><form method="post" action="${CONTRIBUTION_ADMIN}/${id}/progress">${submission}<input type="hidden" name="update_id" value="${crypto.randomUUID()}"><label>Current disposition <select name="outcome" required><option value="">Choose</option>${CONTRIBUTION_OUTCOMES.map(o => `<option value="${o}">${esc(o.replaceAll("_", " "))}</option>`).join("")}</select></label>${area("note", "What changed and what remains", "", CONTRIBUTION_UPDATE_NOTE_CAP)}${field("reference", "Repair, decision or finding URL", "", "url")}<p><button>Append progress; keep original review</button></p></form></details>`;
      if ((r.updates?.length ?? 0) >= CONTRIBUTION_UPDATE_CAP) body += "<p>This submission's progress history is full. Its existing entries remain available.</p>";
      body += "</section>";
    }
  }
  return renderAdminShell("bounties", body);
}

// Failed browser writes retain their original identity. A new id could create a
// second commitment when the first save succeeded but its response did not.
export type ContributionAdminAction = "post" | "close" | "review" | "payment" | "progress" | "authorize" | "release-funding";
const RETRY_FIELDS: Record<ContributionAdminAction, readonly string[]> = {
  post: ["id", "kind", "title", "target", "brief", "acceptance", "reward_usd", "slots", "expires_at", "review_days", "payment_days", "payment_method"],
  close: [], review: ["submission_id", "decision", "outcome", "reason", "reference"],
  "release-funding": ["submission_id", "tx_hash"], authorize: ["submission_id"], payment: ["submission_id", "tx_hash"], progress: ["submission_id", "update_id", "outcome", "note", "reference"],
};
const RETRY_LABELS: Record<string, string> = {title: "Title", target: "Exact public HTTPS URL", brief: "Task and boundaries", acceptance: "What earns the reward", reward_usd: "Reward in Base USDC", slots: "Slots", expires_at: "Closes at (UTC)", review_days: "Review within days", payment_days: "Pay accepted work within days", decision: "Decision (accepted or rejected)", outcome: "Disposition", reason: "Reason tied to the posted criteria", reference: "Repair, decision or finding HTTPS URL", tx_hash: "Completed Base transaction hash", note: "What changed and what remains"};
export function renderContributionRetry(action: ContributionAdminAction, taskId: string | null, body: Record<string, unknown>, error: string, uncertain: boolean) {
  const fields = RETRY_FIELDS[action].filter(name => name !== "payment_method" || Object.hasOwn(body, name));
  const safe = Object.keys(body).every(key => fields.includes(key)) && fields.every(key => typeof body[key] === "string");
  const recordId = taskId ?? (action === "post" && typeof body.id === "string" && /^[a-z0-9][a-z0-9-]{2,63}$/.test(body.id) ? body.id : null);
  const path = recordId ? `${CONTRIBUTION_ADMIN}/${encodeURIComponent(recordId)}` : CONTRIBUTION_ADMIN;
  let content = `<h2>Contribution action needs attention</h2><p role="alert">${esc(error)}</p><p>${uncertain ? "This action may already have been saved. Keep the same identifiers and values when retrying; do not create a second brief or send another payment." : "Review the error and correct the fields below. Existing saved terms and decisions cannot be overwritten."}</p><p><a href="${path}">Read the current record</a> · <a href="${CONTRIBUTION_ADMIN}">Contribution briefs</a></p>`;
  if (safe) {
    content += `<p>Your entries are retained below. Retrying uses the same identifiers. Authorization retries may issue the original reward signature; no action broadcasts a payment or sponsors gas.</p><form method="post" action="${action === "post" ? CONTRIBUTION_ADMIN : `${path}/${action}`}">`;
    for (const name of fields) {
      const value = body[name] as string;
      if (["id", "kind", "submission_id", "update_id", "payment_method"].includes(name)) content += `<input type="hidden" name="${name}" value="${esc(value)}">`;
      else if (["brief", "acceptance", "reason", "note"].includes(name)) content += area(name, RETRY_LABELS[name]!, value, name === "note" ? CONTRIBUTION_UPDATE_NOTE_CAP : CONTRIBUTION_FIELD_CAP);
      else if (name === "outcome") content += `<p><label>Disposition <select name="outcome" required><option value="">Choose</option>${CONTRIBUTION_OUTCOMES.map(o => `<option value="${o}"${o === value ? " selected" : ""}>${esc(o.replaceAll("_", " "))}</option>`).join("")}</select></label></p>`;
      else content += `<p>${field(name, RETRY_LABELS[name]!, value)}</p>`;
    }
    content += `<button type="submit">Retry this same action</button></form>`;
  } else content += "<p>The request did not match a complete form. No replacement form was generated from unknown fields. Read the current record before preparing another action.</p>";
  return renderAdminShell("bounties", content);
}

export function renderFieldAllocations(data: Awaited<ReturnType<typeof readFieldAllocationSummary>>) {
  const title="<h2>Shared wallet allocations</h2>";
  const limits=`<p>${esc(data.limits)}</p>`;
  if (!("programs" in data)) return `${title}<p>${data.status === "unprovisioned" ? "The paying wallet is not configured." : "Allocation records are unavailable. No zero balance is inferred."}</p>${limits}`;
  const labels:Record<FieldAllocationProgram,string>={contributions:"Contribution rewards",shopping:"Shopping rewards",studies:"Field studies",credit:"Store-credit cash-outs",launch_checks:"Paid endpoint checks",directory_walks:"Paid directory reads"};
  return `${title}<p>${data.started_at ? `Tracking authorizations and accepted-work holds since ${esc(data.started_at)}.` : "No authorizations or accepted-work holds have been allocated yet. Older obligations are outside this ledger."}</p><table><tr><th>Program</th><th>Holds retained</th><th>USDC held</th></tr>${Object.entries(labels).map(([program,label])=>{const row=data.programs[program]!;return `<tr><td>${esc(label)}</td><td>${row.count}</td><td>${atomicToUsdc(row.amount_atomic)}</td></tr>`;}).join("")}</table><p>${data.work_reservations} work reservations or submissions hold funds before acceptance. ${data.contribution_commitments} acceptance funding holds, including uncertain reviews, are included in the contribution total, counted once even after authorization. ${data.released_contributions} paid contribution holds have been released through separate finalized-payment reconciliation. Ordinary payment checks do not release holds.</p><p>Total held: ${atomicToUsdc(data.held_atomic)} USDC. Balance observed: ${data.balance_atomic === null ? "Unavailable" : `${atomicToUsdc(data.balance_atomic)} USDC`}. Observation: ${esc(data.balance_observed_at ?? "None")}. This page does not refresh the chain or release holds.</p>${limits}`;
}
