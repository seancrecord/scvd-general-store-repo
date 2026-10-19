import {reconcileContributionPayment, type ContributionPaymentChecks} from "@/services/contribution-reconciliation";
import {signContributionAcceptance, type ContributionReceipt} from "@/services/contribution-receipt";
import {CONTRIBUTION_REDEMPTION, CONTRIBUTION_AUTH_SECONDS, contributionFundingWallet, reserveContributionAcceptance, contributionRewardUnits, contributionSigner, signContributionReward, privateContributionPayout, type ContributionPayout} from "@/services/contribution-payout";
import { DurableObject } from "cloudflare:workers";
import { jcsCanonicalize } from "@/lib/jcs";
import { sha256Hex } from "@/lib/idempotency";
import { CONTRIBUTION_REPORT_FIELDS, CONTRIBUTION_RESERVATION_HOURS, CONTRIBUTION_TEMPLATES, CONTRIBUTION_FIELD_CAP, CONTRIBUTION_REPORT_BYTES } from "@/store/contribution-tasks";
import { isRecord, type Env } from "@/types";
import { contributionWork } from "@/services/contribution-follow-through";
import { CONTRIBUTION_UPDATE_CAP, CONTRIBUTION_UPDATE_NOTE_CAP, CONTRIBUTION_UPDATE_BYTES, CONTRIBUTION_REVIEW_BYTES, CONTRIBUTION_ARRIVAL_CAP, CONTRIBUTION_ARRIVAL_BYTES, CONTRIBUTION_ARRIVAL_GOALS } from "@/store/contribution-tasks";

export interface ContributionTaskTerms {
  id: string; kind: string; title: string; target: string; brief: string; acceptance: string;
  payment_method?: "signed_authorization";
  reward_usd: number; slots: number; expires_at: string; review_days: number; payment_days: number;
}
export type ContributionReport = Record<keyof typeof CONTRIBUTION_REPORT_FIELDS, string>;
export interface ContributionUpdate {update_id: string; outcome: string; note: string; reference: string; at: string}
export interface ContributionArrival {goal: keyof typeof CONTRIBUTION_ARRIVAL_GOALS; found_via: string}
export interface ContributionReservation {
  id: string; key_hash: string; visitor_hash: string; reserved_at: string; submit_by: string;
  status: "reserved" | "released" | "submitted" | "accepted" | "rejected" | "payment_reported";
  arrival?: ContributionArrival; updates?: ContributionUpdate[];
  report?: ContributionReport; payout_to?: string; submission_digest?: string; submitted_at?: string;
  review?: {decision: string; reason: string; outcome: string; reference: string; at: string};
  acceptance_funding?: {id:string; wallet?:string; state:"pending" | "held"; review:NonNullable<ContributionReservation["review"]>};
  payout?: ContributionPayout;
  payment_checks?: ContributionPaymentChecks;
  payment_check_generation?: number;
  acceptance_receipt?: ContributionReceipt;
  payment?: {tx_hash: string; at: string; verification: "not_checked"};
}
export interface ContributionTaskState {terms: ContributionTaskTerms; published_at: string; closed: boolean; reservations: ContributionReservation[]}
type ResultData = Partial<Omit<ReturnType<typeof publicContribution>, "status"> & Omit<ReturnType<typeof ownReservation>, "status">> & {status?: string; code?: string; error?: string};
interface Result {status: 200 | 201 | 400 | 404 | 409 | 503; data: ResultData}
const DAY = 86400000;
// A small, keeper-posted task has bounded capacity and bounded retained attempts.
export const CONTRIBUTION_MAX_SLOTS = 10;
export const CONTRIBUTION_MAX_REVIEW_DAYS = 14;
export const CONTRIBUTION_MAX_PAYMENT_DAYS = 30;
// At most 20 bounded reports keep the atomic record below one MiB.
export const CONTRIBUTION_ATTEMPT_CAP = 20;
export { CONTRIBUTION_FIELD_CAP } from "@/store/contribution-tasks";
export const CONTRIBUTION_OUTCOMES = ["fix_planned", "fixed", "already_known", "no_change", "out_of_scope", "insufficient_evidence"] as const;
export class ContributionInputError extends Error {}
function fail(message: string): never {throw new ContributionInputError(message);}
function text(value: unknown, field: string, max = CONTRIBUTION_FIELD_CAP): string {
  if (typeof value !== "string" || !value.trim() || value.length > max || value.includes("\0")) fail(`${field} needs nonempty text of at most ${max} characters.`);
  return value;
}
function boundedBytes(value: object, maximum: number, name: string) {
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > maximum) fail(`${name} must fit within ${maximum} UTF-8 bytes.`);
}
function arrivalContext(value: unknown): ContributionArrival {
  if (!isRecord(value)) fail("arrival needs goal and found_via, or may be omitted entirely.");
  onlyFields(value, ["goal", "found_via"]);
  if (typeof value.goal !== "string" || !Object.hasOwn(CONTRIBUTION_ARRIVAL_GOALS, value.goal)) fail("Choose a published arrival goal or omit arrival entirely.");
  const arrival = {goal: value.goal as ContributionArrival["goal"], found_via: text(value.found_via, "found_via", CONTRIBUTION_ARRIVAL_CAP)};
  boundedBytes(arrival, CONTRIBUTION_ARRIVAL_BYTES, "Arrival context");
  return arrival;
}
function number(value: unknown, field: string, max: number): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1 || value > max) fail(`${field} needs a whole number from 1 to ${max}.`);
  return value;
}
export function onlyFields(body: Record<string, unknown>, fields: readonly string[]) {
  if (Object.keys(body).some(key => !fields.includes(key))) fail("Unknown fields were refused; nothing was silently discarded.");
}
function url(value: unknown, field: string): string {
  const read = text(value, field, 1000);
  let parsed: URL; try {parsed = new URL(read);} catch {return fail(`${field} needs an absolute HTTPS URL.`);}
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) fail(`${field} needs an HTTPS URL without credentials.`);
  return read;
}
export function contributionTerms(body: Record<string, unknown>, now: number): ContributionTaskTerms {
  onlyFields(body, ["id", "kind", "title", "target", "brief", "acceptance", "reward_usd", "slots", "expires_at", "review_days", "payment_days", "payment_method"]);
  if (body.payment_method !== undefined && body.payment_method !== "signed_authorization") fail("payment_method must be signed_authorization when provided.");
  const id = text(body.id, "id", 64);
  if (!/^[a-z0-9][a-z0-9-]{2,63}$/.test(id)) fail("id needs 3–64 lowercase letters, digits or hyphens.");
  const kind = text(body.kind, "kind", 20);
  if (!CONTRIBUTION_TEMPLATES.some(t => t.kind === kind)) fail("Choose a published contribution kind.");
  const expires = text(body.expires_at, "expires_at", 40);
  const time = Date.parse(expires);
  if (!Number.isFinite(time) || time <= now || time > now + 30 * DAY) fail("expires_at must be in the next 30 days.");
  const reward = body.reward_usd;
  // Fixed cents are the posting unit; this validates representation, not a new budget.
  if (typeof reward !== "number" || !Number.isFinite(reward) || reward <= 0 || !Number.isSafeInteger(Math.round(reward * 100)) || Math.abs(reward * 100 - Math.round(reward * 100)) > 1e-8) fail("reward_usd needs a positive amount in whole cents.");
  const slots = number(body.slots, "slots", CONTRIBUTION_MAX_SLOTS);
  if (!Number.isSafeInteger(Math.round(reward * 100) * slots)) fail("The maximum reward across all slots must fit within whole safe cents.");
  return {...(body.payment_method === "signed_authorization" ? {payment_method: "signed_authorization" as const} : {}), id, kind, title: text(body.title, "title", 160), target: url(body.target, "target"), brief: text(body.brief, "brief"), acceptance: text(body.acceptance, "acceptance"), reward_usd: reward, slots, expires_at: new Date(time).toISOString(), review_days: number(body.review_days, "review_days", CONTRIBUTION_MAX_REVIEW_DAYS), payment_days: number(body.payment_days, "payment_days", CONTRIBUTION_MAX_PAYMENT_DAYS)};
}
export function publicContribution(state: ContributionTaskState, now: number) {
  const active = state.reservations.filter(r => r.status === "submitted" || r.status === "accepted" || r.status === "payment_reported" || (r.status === "reserved" && Date.parse(r.submit_by) > now));
  const availabilityReason = state.closed ? "closed" : Date.parse(state.terms.expires_at) <= now ? "expired" : state.reservations.length >= CONTRIBUTION_ATTEMPT_CAP ? "attempt_limit" : active.length >= state.terms.slots ? "slots_full" : "available";
  return {...state.terms, availability_reason: availabilityReason, published_at: state.published_at, purchase_required: false, payment_method: state.terms.payment_method ?? "keeper_paid_base_usdc", redemption: state.terms.payment_method ? CONTRIBUTION_REDEMPTION : null, maximum_reward_usd: Math.round(state.terms.reward_usd * 100) * state.terms.slots / 100, status: state.closed ? "closed" : Date.parse(state.terms.expires_at) <= now ? "expired" : "open", available_slots: availabilityReason === "available" ? state.terms.slots - active.length : 0, pending_review: state.reservations.filter(r => r.status === "submitted").length};
}
function ownReservation(task: ContributionTaskState, row: ContributionReservation, now: number) {
  return {task_id: task.terms.id, task_kind: task.terms.kind, ...(row.arrival ? {arrival_goal: row.arrival.goal} : {}), submission_id: row.id, status: row.status === "reserved" && Date.parse(row.submit_by) <= now ? "expired" : row.status, reserved_at: row.reserved_at, submit_by: row.submit_by, reward_usd: task.terms.reward_usd, review_due_at: row.submitted_at ? new Date(Date.parse(row.submitted_at) + task.terms.review_days * DAY).toISOString() : null, payment_due_at: row.review?.decision === "accepted" ? new Date(Date.parse(row.review.at) + task.terms.payment_days * DAY).toISOString() : null, ...(row.acceptance_funding ? {acceptance_funding_state:row.acceptance_funding.state} : {}), ...(row.review ? {review: row.review} : {}), ...(row.payment ? {payment: row.payment} : {}), ...(row.acceptance_receipt ? {acceptance_receipt: row.acceptance_receipt, acceptance_receipt_inputs: {terms: task.terms, report: row.report, review: row.review}} : {}), ...(row.review?.decision === "accepted" ? {acceptance_receipt_state: row.acceptance_receipt ? "issued" : "unavailable"} : {}), ...(row.payment_checks ? {payment_checks: row.payment_checks} : {}), ...(row.payout ? {payout: privateContributionPayout(row.payout, now)} : {}), ...(row.updates?.length ? {updates: row.updates} : {})};
}

/** The alarm and its tests use the same clock for both expiry and the next due time. */
export function expireContributionVisitorDigests(rows: ContributionReservation[], now: number): number | null {
  const today = new Date(now); today.setUTCHours(0, 0, 0, 0);
  for (const row of rows) if (Date.parse(row.reserved_at) < today.getTime()) row.visitor_hash = "";
  return rows.some(row => row.visitor_hash) ? today.getTime() + DAY : null;
}

/** One coordination atom per brief. SQL reads and writes have no await between them. */
export class ContributionTask extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);

  }
  private read(): ContributionTaskState | null {
    if (!this.ctx.storage.sql.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='task'").toArray().length) return null;
    const row = this.ctx.storage.sql.exec<{data: string}>("SELECT data FROM task WHERE id=1").toArray()[0];
    return row ? JSON.parse(row.data) as ContributionTaskState : null;
  }
  private save(state: ContributionTaskState) {this.ctx.storage.sql.exec("INSERT INTO task(id,data) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data", JSON.stringify(state));}
  clearVisitorDigests(now = Date.now()): number | null {
    const state = this.read(); if (!state) return null;
    const next = expireContributionVisitorDigests(state.reservations, now);
    this.save(state);
    return next;
  }
  async alarm() {
    const next = this.clearVisitorDigests();
    if (next !== null) await this.ctx.storage.setAlarm(next);
  }
  publicView(now = Date.now()) {const state = this.read(); return state ? publicContribution(state, now) : null;}
  adminView() {return this.read();}
  adminSummary(now = Date.now()) {
    const state = this.read();
    return state ? {...publicContribution(state, now), work: contributionWork(state, now)} : null;
  }
  create(terms: ContributionTaskTerms, now = Date.now()): Result {
    const old = this.read();
    if (old) return JSON.stringify(old.terms) === JSON.stringify(terms) ? {status: 201, data: publicContribution(old, now)} : {status: 409, data: {code: "terms_immutable", error: "This id already has posted terms. Close it and post a new brief to change them."}};
    const state: ContributionTaskState = {terms, published_at: new Date(now).toISOString(), closed: false, reservations: []};
    this.ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS task (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL)");
    this.save(state); return {status: 201, data: publicContribution(state, now)};
  }
  /** Save only the most recently started read. Re-read after I/O so progress
   * notes and alarms cannot be overwritten by an older snapshot. */
  async checkRewardPayment(submissionId: string, transaction: string, now = Date.now()) {
    if (!/^0x[0-9a-f]{64}$/i.test(transaction)) throw new ContributionInputError("Enter a Base transaction hash: 0x followed by 64 hexadecimal characters.");
    let state = this.read();
    let row = state?.reservations.find(r => r.id === submissionId);
    if (!state || !row) return null;
    const generation = (row.payment_check_generation ?? 0) + 1;
    if (!Number.isSafeInteger(generation)) throw new Error("Payment check sequence exhausted");
    row.payment_check_generation = generation;
    this.save(state);
    const observation = await reconcileContributionPayment(this.env, state, submissionId, transaction, now);
    state = this.read(); row = state?.reservations.find(r => r.id === submissionId);
    if (!state || !row || row.payment_check_generation !== generation) return {...observation, saved:false, save_reason:"newer_check_started"};
    const previous = row.payment_checks;
    const withdrawal = previous?.confirmed?.transaction.toLowerCase() === transaction.toLowerCase() ? observation.read_at : previous?.confirmation_withdrawn_at;
    row.payment_checks = observation.status === "confirmed" ? {latest:observation, confirmed:observation}
      : {latest:observation, ...(previous?.confirmed ? {confirmed:previous.confirmed} : {}), ...(withdrawal ? {confirmation_withdrawn_at:withdrawal} : {})};
    this.save(state);
    return {...observation, saved:true, save_reason:"retained"};
  }
  /** The durable review intent is the retry identity across the two actors.
   * A lost reply leaves the work submitted and the same hold recoverable. */
  private async fundAcceptance(submissionId: string, now: number): Promise<Result> {
    try {
      let state=this.read()!, row=state.reservations.find(r=>r.id===submissionId)!;
      if(!row.acceptance_funding!.wallet) {
        const wallet=await contributionFundingWallet(this.env);
        state=this.read()!;row=state.reservations.find(r=>r.id===submissionId)!;
        if(!row.acceptance_funding!.wallet) {row.acceptance_funding!.wallet=wallet;this.save(state);}
      }
      const funding=row.acceptance_funding!;
      await reserveContributionAcceptance(this.env,funding.wallet!,funding.id,row.payout_to!,state.terms.reward_usd,now);
      state=this.read()!;row=state.reservations.find(r=>r.id===submissionId)!;
      if(!row.review) {
        row.review={...row.acceptance_funding!.review,at:new Date(now).toISOString()};
        row.status="accepted";row.acceptance_funding!.state="held";this.save(state);
      }
      return {status:200,data:ownReservation(state,row,now)};
    } catch {return {status:503,data:{code:"acceptance_funding_unavailable",error:"Acceptance is pending its funding hold. The same review intent is retained; retry this review. Do not issue a separate payment or change the decision while its funding result is uncertain."}};}
  }
  /** An immutable intent precedes external I/O. Concurrent presses sign the same
   * nonce; the fresh read after signing preserves intervening notes and alarms. */
  async issueReward(body: Record<string, unknown>, now = Date.now()): Promise<Result> {
    try {onlyFields(body, ["submission_id"]);} catch {return {status: 400, data: {code: "invalid_input", error: "Send only submission_id."}};}
    try {
      const refuse = (code: string, error: string): Result => ({status: 409, data: {code, error}});
      let state = this.read();
      let row = state?.reservations.find(r => r.id === body.submission_id);
      if (!state || !row || row.status !== "accepted" || state.terms.payment_method !== "signed_authorization" || row.payment) return refuse("not_authorizable", "An accepted submission under signed-authorization terms is required. Existing terms are unchanged.");
      if (row.payout?.signature) return {status: 200, data: ownReservation(state, row, now)};
      const signer = await contributionSigner(this.env,row.acceptance_funding?.id);
      state = this.read()!; row = state.reservations.find(r => r.id === body.submission_id)!;
      if (row.payout?.signature) return {status: 200, data: ownReservation(state, row, now)};
      if (row.acceptance_funding && (row.acceptance_funding.state !== "held" || row.acceptance_funding.wallet?.toLowerCase() !== signer.address.toLowerCase())) return refuse("payout_wallet_changed", "The wallet holding this accepted reward is required. No replacement authorization was made.");
      if (!row.payout) {
        row.payout = {created_at: new Date(now).toISOString(), authorization: {from: signer.address, to: row.payout_to!,
          value: contributionRewardUnits(state.terms.reward_usd), validAfter: "0",
          validBefore: String(Math.floor(now / 1000) + CONTRIBUTION_AUTH_SECONDS),
          nonce: `0x${[...crypto.getRandomValues(new Uint8Array(32))].map(b => b.toString(16).padStart(2, "0")).join("")}`}};
        this.save(state);
      }
      const intent = row.payout;
      if (intent.authorization.from.toLowerCase() !== signer.address.toLowerCase()) return refuse("payout_wallet_changed", "The original signing wallet is required. No replacement authorization was made.");
      if (Number(intent.authorization.validBefore) * 1000 <= now) return refuse("authorization_expired", "The saved authorization window expired. No new nonce was created; review the retained record before resolving this obligation.");
      const signature = await signContributionReward(this.env, signer, intent.authorization);
      state = this.read()!; row = state.reservations.find(r => r.id === body.submission_id)!;
      if (!row.payout?.signature) {
        row.payout = {...intent, signature, issued_at: new Date(now).toISOString()};
        this.save(state);
      }
      return {status: 200, data: ownReservation(state, row, now)};
    } catch {return {status: 503, data: {code: "payout_unavailable", error: "Reward authorization could not be issued or saved. The original intent is retained if saved. Retry this same submission; no second payment or new nonce should be created."}};}
  }
  async act(action: string, body: Record<string, unknown>, visitorHash = "", now = Date.now()): Promise<Result> {
    try {
      const admin = ["close", "review", "payment", "progress"].includes(action);
      let keyHash = "";
      if (!admin) {
        if (typeof body.reservation_key !== "string" || !/^[a-f0-9]{64}$/.test(body.reservation_key)) fail("reservation_key must be 32 cryptographically random bytes encoded as 64 lowercase hex characters. Generate it locally and keep it private; it is not a wallet key.");
        keyHash = await sha256Hex(body.reservation_key);
      }
      // Hash before the state read: crypto may yield; no await may split the capacity decision.
      const reportHash = action === "submit" ? await sha256Hex(jcsCanonicalize([body.report ?? null, body.payout_to ?? null, ...(Object.hasOwn(body, "arrival") ? [body.arrival] : [])])) : "";
      if (action === "reserve") {
        onlyFields(body, ["reservation_key"]);
        // Schedule before storing a visitor digest. Failure leaves no half-reservation.
        // Read capacity again after this await; never carry a decision across it.
        if (this.read()) {
          const midnight = new Date(now); midnight.setUTCHours(24, 0, 0, 0);
          await this.ctx.storage.setAlarm(midnight.getTime());
        }
      }
      const state = this.read();
      const refused = (status: 400 | 404 | 409, code: string, error: string): Result => ({status, data: {code, error}});
      if (!state) return refused(404, "task_missing", "No posted task with that id.");
      const date = new Date(now).toISOString();
      if (action === "close") {
        onlyFields(body, []); state.closed = true; this.save(state); return {status: 200, data: publicContribution(state, now)};
      }
      if (action === "reserve") {
        // A delayed alarm must not extend yesterday's digest on a same-key retry.
        expireContributionVisitorDigests(state.reservations, now);
        this.save(state);
        const previous = state.reservations.find(r => r.key_hash === keyHash);
        if (previous) return {status: 200, data: ownReservation(state, previous, now)};
        if (publicContribution(state, now).available_slots < 1) return refused(409, "no_slot", "No slot is available. Nothing was reserved; do not start work.");
        if (state.reservations.some(r => r.visitor_hash === visitorHash && (r.status === "submitted" || r.status === "accepted" || r.status === "payment_reported" || r.status === "reserved" && Date.parse(r.submit_by) > now))) return refused(409, "visitor_reserved", "This visitor already holds a slot for this task. Reuse the original reservation key.");
        const row: ContributionReservation = {id: crypto.randomUUID(), key_hash: keyHash, visitor_hash: visitorHash, reserved_at: date, submit_by: new Date(Math.min(Date.parse(state.terms.expires_at), now + CONTRIBUTION_RESERVATION_HOURS * 3600000)).toISOString(), status: "reserved"};
        state.reservations.push(row); this.save(state);
        return {status: 200, data: ownReservation(state, row, now)};
      }
      const row = admin ? state.reservations.find(r => r.id === body.submission_id) : state.reservations.find(r => r.key_hash === keyHash);
      if (!row) return refused(404, "reservation_missing", "No reservation opens with those details.");
      if (action === "status") {
        onlyFields(body, ["reservation_key"]);
        if (row.review?.decision === "accepted" && !row.acceptance_receipt) {
          // Acceptance already stands. A receipt failure must not undo it or hide
          // payment status. Sign privately, save before returning, reread after I/O.
          try {
            const receipt = await signContributionAcceptance(this.env, state, row, now);
            const fresh = this.read()!, current = fresh.reservations.find(r => r.id === row.id)!;
            if (!current.acceptance_receipt) {current.acceptance_receipt = receipt; this.save(fresh);}
          } catch { /* Private status exposes unavailable and retries next time. */ }
          const fresh = this.read()!, current = fresh.reservations.find(r => r.id === row.id)!;
          return {status: 200, data: ownReservation(fresh, current, now)};
        }
        return {status: 200, data: ownReservation(state, row, now)};
      }
      if (action === "submit") {
        onlyFields(body, ["reservation_key", "payout_to", "report", "arrival"]);
        if (row.submission_digest) return row.submission_digest === reportHash ? {status: 200, data: ownReservation(state, row, now)} : refused(409, "submission_immutable", "Evidence, arrival context or payout address differs from the stored submission. The original is retained.");
        if (row.status !== "reserved" || Date.parse(row.submit_by) <= now) return refused(409, "reservation_expired", "This reservation is released or expired; no submission was stored.");
        if (typeof body.payout_to !== "string" || !/^0x[a-fA-F0-9]{40}$/.test(body.payout_to) || /^0x0{40}$/i.test(body.payout_to)) fail("payout_to needs a nonzero Base EVM address you control. Never send its key.");
        if (!isRecord(body.report)) fail("report needs the published evidence fields.");
        onlyFields(body.report, Object.keys(CONTRIBUTION_REPORT_FIELDS));
        const report = {} as ContributionReport;
        for (const field of Object.keys(CONTRIBUTION_REPORT_FIELDS) as Array<keyof ContributionReport>) report[field] = text(body.report[field], field);
        if (new TextEncoder().encode(JSON.stringify(report)).byteLength > CONTRIBUTION_REPORT_BYTES) fail(`The report must fit within ${CONTRIBUTION_REPORT_BYTES} UTF-8 bytes.`);
        const arrival = Object.hasOwn(body, "arrival") ? arrivalContext(body.arrival) : undefined;
        if (arrival) row.arrival = arrival;
        row.report = report; row.payout_to = body.payout_to; row.submission_digest = reportHash; row.submitted_at = date; row.status = "submitted";
      } else if (action === "release") {
        onlyFields(body, ["reservation_key"]);
        if (row.status !== "reserved" && row.status !== "released") return refused(409, "already_submitted", "Submitted work cannot be released or replaced.");
        row.status = "released";
      } else if (action === "review") {
        onlyFields(body, ["submission_id", "decision", "reason", "outcome", "reference"]);
        if (body.decision !== "accepted" && body.decision !== "rejected") fail("decision must be accepted or rejected.");
        const outcome = text(body.outcome, "outcome", 40);
        if (!(CONTRIBUTION_OUTCOMES as readonly string[]).includes(outcome)) fail("Choose a documented review outcome.");
        const review = {decision: body.decision, reason: text(body.reason, "reason"), outcome, reference: url(body.reference, "reference"), at: date};
        boundedBytes(review, CONTRIBUTION_REVIEW_BYTES, "Review");
        if (row.review) return JSON.stringify({...row.review, at: date}) === JSON.stringify(review) ? {status: 200, data: ownReservation(state, row, now)} : refused(409, "review_immutable", "The recorded decision stands. No second decision was stored.");
        if (row.status !== "submitted") return refused(409, "not_submitted", "Review requires a submitted report.");
        if (row.acceptance_funding && JSON.stringify({...row.acceptance_funding.review,at:date}) !== JSON.stringify(review)) return refused(409,"review_pending","A funding attempt already retains a different review. Retry that original decision; it may already hold funds.");
        if (body.decision === "accepted" && state.terms.payment_method === "signed_authorization") {
          if (!row.acceptance_funding) {row.acceptance_funding={id:`${state.terms.id}:${row.id}`,state:"pending",review};this.save(state);}
          return await this.fundAcceptance(row.id,now);
        }
        row.review = review; row.status = body.decision;
      } else if (action === "progress") {
        onlyFields(body, ["submission_id", "update_id", "outcome", "note", "reference"]);
        if (!row.review) return refused(409, "not_reviewed", "Review the submission before recording follow-through.");
        const updateId = text(body.update_id, "update_id", 64);
        if (!/^[a-zA-Z0-9-]{8,64}$/.test(updateId)) fail("update_id needs 8–64 letters, digits or hyphens; retain it for retries.");
        const outcome = text(body.outcome, "outcome", 40);
        if (!(CONTRIBUTION_OUTCOMES as readonly string[]).includes(outcome)) fail("Choose a documented review outcome.");
        const update: ContributionUpdate = {update_id: updateId, outcome, note: text(body.note, "note", CONTRIBUTION_UPDATE_NOTE_CAP), reference: url(body.reference, "reference"), at: date};
        boundedBytes(update, CONTRIBUTION_UPDATE_BYTES, "Progress entry");
        const old = row.updates?.find(entry => entry.update_id === updateId);
        if (old) return JSON.stringify({...old, at: date}) === JSON.stringify(update) ? {status: 200, data: ownReservation(state, row, now)} : refused(409, "update_immutable", "That update id already records different progress. The original is retained.");
        if ((row.updates?.length ?? 0) >= CONTRIBUTION_UPDATE_CAP) return refused(409, "update_limit", "This submission's bounded progress history is full. No entry was replaced.");
        row.updates = [...(row.updates ?? []), update];
      } else if (action === "payment") {
        onlyFields(body, ["submission_id", "tx_hash"]);
        if (state.terms.payment_method === "signed_authorization" || row.payout) return refused(409, "authorization_terms", "This brief uses signed authorization. Do not send a second manual payment; verify the original authorization on chain.");
        if (typeof body.tx_hash !== "string" || !/^0x[a-fA-F0-9]{64}$/.test(body.tx_hash)) fail("tx_hash needs the Base transaction hash of the payment already made.");
        if (row.payment) return row.payment.tx_hash === body.tx_hash ? {status: 200, data: ownReservation(state, row, now)} : refused(409, "payment_immutable", "A different payment is already reported. No replacement was stored.");
        if (row.status !== "accepted") return refused(409, "not_accepted", "Only accepted work can have a payment recorded.");
        row.payment = {tx_hash: body.tx_hash, at: date, verification: "not_checked"}; row.status = "payment_reported";
      } else return refused(400, "unknown_action", "Unknown action.");
      this.save(state); return {status: 200, data: ownReservation(state, row, now)};
    } catch (error) {
      if (error instanceof ContributionInputError) return {status: 400, data: {code: "invalid_input", error: error.message}};
      throw error;
    }
  }
}
