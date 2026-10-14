import { SELF, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { Env } from "@/types";
import { contributionCompletion } from "@/services/contribution-completion";
import { CONTRIBUTION_API, CONTRIBUTION_REPORT_FIELDS, CONTRIBUTION_TEMPLATES } from "@/store/contribution-tasks";
import { TAB_GUIDE, agentJobAnswers } from "@/store/agent-jobs";

const BASE = "https://scvd.store";
const ADMIN = "/admin/bounties/contributions";
const auth = {Authorization: `Basic ${btoa(`keeper:${(env as unknown as Env).ADMIN_PASSWORD}`)}`};
const wallet = `0x${"9".repeat(40)}`;
const report = {attempted: "Try the specified free example", environment: "A local environment with fresh context", expected: "The documented example works", observed: "It completed with the documented output", evidence: "Version and reproducible steps retained", suggestion: "No change indicated by this attempt"};
async function post(url: string, body: object, admin = false) {
  return SELF.fetch(new URL(url, BASE).href, {method: "POST", headers: {"Content-Type": "application/json", ...(admin ? auth : {})}, body: JSON.stringify(body)});
}
function key() {return Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, "0")).join("");}
async function fixture(kind = "docs", slots = 1) {
  const id = `worker-${crypto.randomUUID()}`;
  const created = await post(ADMIN, {id, kind, slots, title: "Attempt a free workflow", target: "https://scvd.store/what", brief: "Use the named free example", acceptance: "Record the attempt, including success", reward_usd: 1, expires_at: new Date(Date.now() + 86400000).toISOString(), review_days: 2, payment_days: 3}, true);
  expect(created.status).toBe(201);
  const store = (env as unknown as Env).CONTRIBUTION_TASKS!.getByName(id);
  return {id, url: `${BASE}${CONTRIBUTION_API}/${id}`, store};
}
interface Step {action: string; method: string; url: string; required_fields: string[]; deadline_at: string | null}
interface WorkerState {status: string; submission_id: string; next_steps: Step[]; completion?: {free_next_steps: {url: string}[]; for_your_human: string}; submit_by: string; review_due_at: string; payment_due_at: string}
interface TaskDetail {task: {availability_reason: string; available_slots: number}; work_packet: {task_id: string; target: string; brief: string; acceptance: string; report_draft: Record<string, string>; evidence_prompts: Record<string, string>; guidance_is: string; costs: {required_store_spend_usd: number; reward_usd: number; net_earnings: null; worker_costs: string; payment: string}}; next_steps: Step[]}

describe("a contribution worker can follow the returned path", () => {
  it("walks from the advertised task action through reserved work, evidence, review and payment status", async () => {
    const f = await fixture();
    const detail = await (await SELF.fetch(f.url)).json() as TaskDetail;
    expect(detail.work_packet).toMatchObject({task_id: f.id, target: "https://scvd.store/what", brief: "Use the named free example", acceptance: "Record the attempt, including success", costs: {required_store_spend_usd: 0, reward_usd: 1, net_earnings: null}});
    expect(Object.keys(detail.work_packet.report_draft)).toEqual(Object.keys(CONTRIBUTION_REPORT_FIELDS));
    expect(Object.values(detail.work_packet.report_draft).every(v => v === "")).toBe(true);
    const reservation_key = key();
    const reserve = detail.next_steps.find(s => s.action === "reserve")!;
    expect(reserve.method).toBe("POST");
    const held = await (await post(reserve.url, {reservation_key})).json() as WorkerState;
    const submit = held.next_steps.find(s => s.action === "submit")!;
    expect(submit.deadline_at).toBe(held.submit_by);
    expect(submit.required_fields).toEqual(["reservation_key", "payout_to", "report"]);
    expect(JSON.stringify(held)).not.toContain(reservation_key);
    expect((await post(submit.url, {reservation_key, payout_to: wallet, report: detail.work_packet.report_draft})).status).toBe(400);
    const submitted = await (await post(submit.url, {reservation_key, payout_to: wallet, report})).json() as WorkerState;
    expect(submitted.status).toBe("submitted");
    expect(submitted.next_steps.map(s => s.action)).toEqual(["status"]);
    expect(submitted.next_steps[0]!.deadline_at).toBe(submitted.review_due_at);
    await post(`${ADMIN}/${f.id}/review`, {submission_id: submitted.submission_id, decision: "accepted", reason: "Meets the posted criteria", outcome: "no_change", reference: "https://scvd.store/what"}, true);
    const accepted = await (await post(submitted.next_steps[0]!.url, {reservation_key})).json() as WorkerState;
    expect(accepted.status).toBe("accepted");
    expect(accepted.next_steps[0]!.deadline_at).toBe(accepted.payment_due_at);
    await post(`${ADMIN}/${f.id}/payment`, {submission_id: submitted.submission_id, tx_hash: `0x${"ab".repeat(32)}`}, true);
    const paid = await (await post(accepted.next_steps[0]!.url, {reservation_key})).json() as WorkerState;
    expect(paid.status).toBe("payment_reported");
    expect(paid.next_steps.map(s => s.action)).toEqual(["status"]);
    expect(paid.next_steps[0]!.deadline_at).toBeNull();
  });
  it.each(CONTRIBUTION_TEMPLATES.map(t => [t.kind]))("provides %s evidence prompts without inventing extra acceptance criteria", async kind => {
    const f = await fixture(kind);
    const data = await (await SELF.fetch(f.url)).json() as TaskDetail;
    expect(Object.keys(data.work_packet.evidence_prompts)).toEqual(Object.keys(CONTRIBUTION_REPORT_FIELDS));
    expect(data.work_packet.acceptance).toBe("Record the attempt, including success");
    expect(data.work_packet.guidance_is).toContain("posted acceptance criteria");
    expect(data.work_packet.costs.payment).toContain("keeper");
    expect(data.work_packet.costs.worker_costs).toContain("model");
  });
  it("does not offer a reservation for full, closed, expired or exhausted work", async () => {
    const f = await fixture();
    const reservation_key = key();
    await post(`${f.url}/reserve`, {reservation_key});
    const full = await (await SELF.fetch(f.url)).json() as TaskDetail;
    expect(full.task.availability_reason).toBe("slots_full");
    expect(full.next_steps.some(s => s.action === "reserve")).toBe(false);
    await post(`${f.url}/release`, {reservation_key});
    expect((await (await SELF.fetch(f.url)).json() as TaskDetail).task.availability_reason).toBe("available");
    await post(`${ADMIN}/${f.id}/close`, {}, true);
    expect((await (await SELF.fetch(f.url)).json() as TaskDetail).task.availability_reason).toBe("closed");
    const second = await fixture();
    const state = (await second.store.adminView())!;
    const deadline = Date.parse(state.terms.expires_at);
    expect(await second.store.publicView(deadline)).toMatchObject({availability_reason: "expired", available_slots: 0});
    const {CONTRIBUTION_ATTEMPT_CAP, publicContribution} = await import("@/services/contribution-task");
    state.reservations = Array.from({length: CONTRIBUTION_ATTEMPT_CAP}, (_, i) => ({id: `released-${i}`, key_hash: "hash", visitor_hash: "", reserved_at: state.published_at, submit_by: state.terms.expires_at, status: "released"}));
    expect(publicContribution(state, Date.parse(state.published_at))).toMatchObject({availability_reason: "attempt_limit", available_slots: 0});
  });
  it("preserves a held slot on closure and gives a released worker a fresh-work path", async () => {
    const f = await fixture();
    const reservation_key = key();
    await post(`${f.url}/reserve`, {reservation_key});
    await post(`${ADMIN}/${f.id}/close`, {}, true);
    const held = await (await post(`${f.url}/status`, {reservation_key})).json() as WorkerState;
    expect(held.next_steps.map(s => s.action)).toContain("submit");
    const released = await (await post(held.next_steps.find(s => s.action === "release")!.url, {reservation_key})).json() as WorkerState;
    expect(released.next_steps.map(s => s.action)).toEqual(["browse"]);
    expect(released.next_steps[0]!.method).toBe("GET");
    expect((await SELF.fetch(released.next_steps[0]!.url)).status).toBe(200);
  });
  it("tailors completion to an explicitly reported expense job without copying the private discovery text", async () => {
    const f = await fixture("package");
    const reservation_key = key();
    await post(`${f.url}/reserve`, {reservation_key});
    const submitted = await (await post(`${f.url}/submit`, {reservation_key, payout_to: wallet, report, arrival: {goal: "track_expenses", found_via: "PRIVATE DISCOVERY TEXT"}})).json() as WorkerState;
    await post(`${ADMIN}/${f.id}/review`, {submission_id: submitted.submission_id, decision: "accepted", reason: "Complete attempt", outcome: "no_change", reference: "https://scvd.store/what"}, true);
    const accepted = await (await post(`${f.url}/status`, {reservation_key})).json() as WorkerState;
    expect(accepted.completion!.free_next_steps.map(s => s.url)).toContain(TAB_GUIDE);
    expect(accepted.completion!.for_your_human).toContain("local");
    expect(JSON.stringify(accepted.completion)).not.toContain("PRIVATE DISCOVERY TEXT");
    expect(accepted.completion!.free_next_steps).toHaveLength(2);
  });
  it("keeps shopping completion on its existing free checks while package work gets developer guidance", () => {
    const common = {task_id: "test", reward_usd: 1, what_was_verified: "Acceptance", what_was_not: "Wider task"};
    const shopping = contributionCompletion(BASE, {...common, kind: "bounty"}).completion!;
    expect(shopping.free_next_steps.map(s => s.url)).not.toContain(TAB_GUIDE);
    const packageWork = contributionCompletion(BASE, {...common, kind: "contribution", contribution_kind: "package"}).completion!;
    expect(packageWork.free_next_steps.map(s => s.url)).toContain(`${BASE}/developers`);
  });
  it("names no-purchase contribution work in the first earning answer and separates its payment method", () => {
    const answers = agentJobAnswers(BASE);
    expect(answers.find(a => a.id === "earn")!.answer).toContain(CONTRIBUTION_API);
    expect(answers.find(a => a.id === "upfront")!.answer).toContain("keeper pays");
  });
});

it("does not attach next actions or promotion to a refused request", async () => {
  const f = await fixture();
  const response = await post(`${f.url}/status`, {reservation_key: key()});
  expect(response.status).toBe(404);
  const body = await response.json();
  expect(body).not.toHaveProperty("next_steps");
  expect(body).not.toHaveProperty("completion");
});

it("returns distinct choices after rejection and expiry without implying acceptance", async () => {
  const f = await fixture();
  const reservation_key = key();
  await post(`${f.url}/reserve`, {reservation_key});
  const submitted = await (await post(`${f.url}/submit`, {reservation_key, payout_to: wallet, report})).json() as WorkerState;
  await post(`${ADMIN}/${f.id}/review`, {submission_id: submitted.submission_id, decision: "rejected", reason: "This attempt did not cover the posted task", outcome: "out_of_scope", reference: "https://scvd.store/what"}, true);
  const rejected = await (await post(`${f.url}/status`, {reservation_key})).json() as WorkerState;
  expect(rejected.next_steps.map(s => s.action)).toEqual(["status", "browse"]);
  expect(rejected).not.toHaveProperty("completion");
  const {contributionNextSteps} = await import("@/services/contribution-worker");
  expect(contributionNextSteps(BASE, {task_id: f.id, status: "expired"}).map(s => s.action)).toEqual(["browse"]);
});
