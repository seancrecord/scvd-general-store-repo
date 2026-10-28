import { CONTRIBUTION_API, CONTRIBUTION_REPORT_FIELDS, CONTRIBUTION_FIELD_CAP, CONTRIBUTION_UPDATE_CAP, CONTRIBUTION_ARRIVAL_CAP, CONTRIBUTION_ARRIVAL_GOALS, CONTRIBUTION_ARRIVAL_DESCRIPTION } from "@/store/contribution-tasks";

import {CONTRIBUTION_REDEMPTION} from "@/services/contribution-payout";

const text = {type: "string"};
const ref = (name: string) => ({$ref: `#/components/schemas/${name}`});
const response = (schema: object) => ({description: "Current terms or private task state; no funds sent.", content: {"application/json": {schema}}});
const steps = {type: "array", items: ref("ContributionStep")};
const reportStrings = {type: "object", properties: Object.fromEntries(Object.keys(CONTRIBUTION_REPORT_FIELDS).map(k => [k, text]))};
const key = {type: "string", pattern: "^[a-f0-9]{64}$", description: "Local random reservation key, reused for retries. Never a wallet key."};
export const CONTRIBUTION_SCHEMAS = {
  ContributionRedemption: {type: ["object", "null"], properties: {store_sponsors_gas: {type: "boolean", const: false}, store_broadcasts: {type: "boolean", const: false}, authorization_is_payment_received: {type: "boolean", const: false}, network: {type: "string", const: CONTRIBUTION_REDEMPTION.network}, asset: {type: "string", const: CONTRIBUTION_REDEMPTION.asset}, validity_seconds: {type: "integer", const: CONTRIBUTION_REDEMPTION.validity_seconds}, instructions: text}},
  ContributionPayout: {type: "object", properties: {state: {type: "string", enum: ["issuance_pending", "authorization_issued", "expired"]}, created_at: text, issued_at: text, signature: text, redemption_state: {type: "string", enum: ["not_observed", "finalized_observed"]}, redemption: ref("ContributionRedemption"), authorization: {type: "object", properties: Object.fromEntries(["from", "to", "value", "validAfter", "validBefore", "nonce"].map(k => [k, text]))}}},
  ContributionAcceptanceReceipt: {type: "object", required: ["algorithm", "signed_payload", "signature", "public_key", "verification"], properties: {algorithm: {type: "string", const: "ed25519"}, signed_payload: text, signature: text, public_key: text, verification: text}},
  ContributionKeyInput: {type: "object", additionalProperties: false, required: ["reservation_key"], properties: {reservation_key: key}},
  ContributionReportStrings: reportStrings,
  ContributionStep: {type: "object", required: ["action", "method", "url", "required_fields", "deadline_at", "note"], properties: {action: text, method: {type: "string", enum: ["GET", "POST"]}, url: text, required_fields: {type: "array", items: text}, deadline_at: {type: ["string", "null"]}, note: text}},
  ContributionWorkPacket: {type: "object", properties: {
    ...Object.fromEntries(["task_id", "task_url", "target", "brief", "acceptance", "guidance_is"].map(k => [k, text])),
    evidence_prompts: ref("ContributionReportStrings"), report_draft: ref("ContributionReportStrings"),
    costs: {type: "object", properties: {required_store_spend_usd: {type: "number", const: 0}, reward_usd: {type: "number"}, net_earnings: {type: "null"}, worker_costs: text, payment: text, payment_method: text, redemption: ref("ContributionRedemption"), funding: text}},
    deadlines: {type: "object", properties: {new_reservations_close_at: text, submission: text, review_days: {type: "integer"}, payment_days: {type: "integer"}}},
  }},
  ContributionArrival: {type: "object", additionalProperties: false, required: ["goal", "found_via"], description: CONTRIBUTION_ARRIVAL_DESCRIPTION, properties: {goal: {type: "string", enum: Object.keys(CONTRIBUTION_ARRIVAL_GOALS)}, found_via: {type: "string", minLength: 1, maxLength: CONTRIBUTION_ARRIVAL_CAP}}},
  ContributionTask: {type: "object", required: ["id", "reward_usd", "available_slots", "purchase_required"], properties: {
    ...Object.fromEntries(["id", "kind", "title", "target", "brief", "acceptance", "expires_at", "published_at", "status", "payment_method", "availability_reason", "task_url"].map(k => [k, text])),
    ...Object.fromEntries(["slots", "review_days", "payment_days", "available_slots", "pending_review"].map(k => [k, {type: "integer"}])),
    reservation_funding: {type:"string",enum:["required_for_new_reservations","not_managed"]},
    reward_usd: {type: "number"}, maximum_reward_usd: {type: "number"}, redemption: ref("ContributionRedemption"), purchase_required: {type: "boolean", const: false},
  }},
  ContributionState: {type: "object", required: ["task_id", "submission_id", "status", "reward_usd", "submit_by"], properties: {
    ...Object.fromEntries(["task_id", "submission_id", "status", "reserved_at", "submit_by", "task_kind", "arrival_goal"].map(k => [k, text])),
    reward_usd: {type: "number"}, review_due_at: {type: ["string", "null"]}, payment_due_at: {type: ["string", "null"]},
    review: {type: "object", properties: Object.fromEntries(["decision", "reason", "outcome", "reference", "at"].map(k => [k, text]))},
    work_funding_state: {type:"string",enum:["pending","held","transferred","release_pending","released"],description:"Present for new signed-authorization reservations. Pending means do not start or submit; retry reserve with the same key. Submitted work stays held until review; transferred means the same hold now backs acceptance. This is an internal allocation, not escrow or payment."},
    acceptance_funding_release: {type:"object",description:"Retained finalized-payment reconciliation that released the internal hold. No new transfer or gas was sent.",properties:{transaction:text,receipt_block:{type:"integer"},read_at:text}},
    acceptance_funding_state: {type:"string",enum:["pending","held","released"],description:"Present for newly funded signed-authorization acceptances. Pending work remains submitted; held is an internal funding reservation, not payment or full wallet coverage. Released means the hold was reconciled against finalized payment."},
    payout: ref("ContributionPayout"), acceptance_receipt: ref("ContributionAcceptanceReceipt"), acceptance_receipt_inputs: {type: "object", description: "Private original objects for independent digest comparison; never published on the board.", properties: {terms: {type: "object"}, report: ref("ContributionReportStrings"), review: {type: "object"}}}, acceptance_receipt_state: {type: "string", enum: ["issued", "unavailable"]},
    payment: {type: "object", properties: {tx_hash: text, at: text, verification: {type: "string", const: "not_checked"}}},
    updates: {type: "array", maxItems: CONTRIBUTION_UPDATE_CAP, description: "Append-only keeper follow-through; original review and payment deadline remain unchanged.", items: {type: "object", properties: Object.fromEntries(["update_id", "outcome", "note", "reference", "at"].map(k => [k, text]))}},
    next_steps: steps,
    completion: ref("ContributionCompletion"),
  }},
};
export const CONTRIBUTION_RESPONSES = {
  ContributionError: {description: "Named refusal: invalid input, missing record, no slot/conflicting retry, oversized body or unavailable storage.", content: {"application/problem+json": {schema: ref("Problem")}, "application/json": {schema: ref("Problem")}}},
};
const error = {$ref: "#/components/responses/ContributionError"};
const errors = Object.fromEntries([400, 404, 409, 413, 503].map(code => [String(code), error]));
const id = {name: "id", in: "path", required: true, schema: {type: "string", pattern: "^[a-z0-9][a-z0-9-]{2,63}$"}};

export const CONTRIBUTION_PATHS = [CONTRIBUTION_API, `${CONTRIBUTION_API}/{id}`, ...["reserve", "submit", "status", "release"].map(action => `${CONTRIBUTION_API}/{id}/${action}`)];
export const CONTRIBUTION_OPENAPI = {
  [CONTRIBUTION_API]: {get: {summary: "Posted contribution work without a purchase", description: "Briefs, capacity, rewards, review terms and request shapes. Templates are not open tasks. Free.", parameters: [{name: "cursor", in: "query", schema: text}], responses: {"200": response({type: "object", properties: {tasks: {type: "array", items: ref("ContributionTask")}, truncated: {type: "boolean"}, cursor: {type: ["string", "null"]}, requests: {type: "object"}, templates: {type: "array", items: {type: "object", properties: {kind: text, title: text, brief: text, acceptance: text}}}}}), "503": error}}},
  [`${CONTRIBUTION_API}/{id}`]: {get: {summary: "Read a contribution brief", parameters: [id], responses: {"200": response({type: "object", properties: {task: ref("ContributionTask"), work_packet: ref("ContributionWorkPacket"), next_steps: steps}}), "404": error, "503": error}}},
  ...Object.fromEntries(["reserve", "submit", "status", "release"].map(action => [`${CONTRIBUTION_API}/{id}/${action}`, {post: {
    summary: `${action} contribution work`, description: "Free. Acceptance is a keeper decision; reported payment is not chain verification.", parameters: [id],
    requestBody: {required: true, content: {"application/json": {schema: action !== "submit" ? ref("ContributionKeyInput") : {type: "object", additionalProperties: false, required: action === "submit" ? ["reservation_key", "payout_to", "report"] : ["reservation_key"], properties: {
      reservation_key: key,
      ...(action === "submit" ? {arrival: ref("ContributionArrival"), payout_to: {type: "string", pattern: "^0x[a-fA-F0-9]{40}$"}, report: {type: "object", additionalProperties: false, required: Object.keys(CONTRIBUTION_REPORT_FIELDS), properties: Object.fromEntries(Object.entries(CONTRIBUTION_REPORT_FIELDS).map(([name, description]) => [name, {type: "string", minLength: 1, maxLength: CONTRIBUTION_FIELD_CAP, description}]))}} : {}),
    }}}}}, responses: {"200": response(ref("ContributionState")), ...errors},
  }}])),
};
