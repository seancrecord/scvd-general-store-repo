// The hosted desk and MCP describe the same records. These schemas describe
// our observations; official A2A payload validation lives in a2a-validation.js.
const text = { type: "string" };
const texts = { type: "array", items: text };
const nullableText = { type: ["string", "null"] };
const counts = { type: "object", properties: Object.fromEntries(["pass", "fail", "not_observed", "not_applicable"].map(state => [state, { type: "integer", minimum: 0 }])) };
export const A2A_READING_SCHEMA = {
  type: "object", required: ["battery", "protocol_version", "observed_at", "card_url", "endpoint", "mode", "checks", "exchanges", "counts", "gaps"],
  properties: {
    battery: text, protocol_version: nullableText, observed_at: { type: "string", format: "date-time" }, card_url: text, endpoint: nullableText,
    mode: { type: "string", enum: ["card", "runtime"] }, counts, gaps: texts,
    checks: { type: "array", items: { type: "object", properties: { id: text, state: { type: "string", enum: ["pass", "fail", "not_observed", "not_applicable"] }, detail: text, evidence: texts, spec: text }, required: ["id", "state", "detail", "evidence", "spec"] } },
    exchanges: { type: "array", items: { type: "object", properties: { id: text, url: text, method: { type: "string", enum: ["GET", "POST"] }, request: nullableText, status: { type: ["integer", "null"] }, content_type: nullableText, response: nullableText, gap: nullableText }, required: ["id", "url", "method", "request", "status", "content_type", "response", "gap"] } },
    entitlement: { type: "object", properties: { kit_id: text, started_at: text, ends_at: text, recheck_until: text } },
    association: { type: "object", properties: { kit_id: text, role: { type: "string", enum: ["watch", "recheck"] }, baseline_hash: text, slot: { type: "integer" }, scheduled_for: text } },
  },
};
export const A2A_REPAIRS_SCHEMA = { type: "array", items: { type: "object", properties: { check: text, evidence: texts, spec: text, change: text, acceptance: text, implementation: text, status: { type: "string", const: "suggested_not_applied" } } } };
export const A2A_SIGNED_SCHEMA = { type: "object", properties: { observation: A2A_READING_SCHEMA, evidence_hash: text, signature: text, public_key: text, signature_covers: text }, required: ["observation", "evidence_hash", "signature", "public_key", "signature_covers"] };
const { entitlement: _entitlement, association: _association, ...cardProperties } = A2A_READING_SCHEMA.properties;
export const A2A_CHECK_SCHEMA = { type: "object", properties: { reading: { ...A2A_READING_SCHEMA, properties: { ...cardProperties, mode: { type: "string", const: "card" } } }, repairs: A2A_REPAIRS_SCHEMA, signed: { type: "boolean", const: false }, next: text }, required: ["reading", "repairs", "signed", "next"] };
export const A2A_RECHECK_SCHEMA = { type: "object", properties: { status: { type: "string", enum: ["complete", "running", "unavailable", "unauthorized", "expired", "authorization_required"] }, report: A2A_SIGNED_SCHEMA }, required: ["status"] };
export const A2A_KIT_SCHEMA = {
  type: "object", properties: {
    id: text, cert_id: text, started_at: text, ends_at: text, recheck_until: text,
    report: A2A_SIGNED_SCHEMA, repairs: A2A_REPAIRS_SCHEMA, recheck: { anyOf: [A2A_RECHECK_SCHEMA, { type: "null" }] },
    watch: { type: "object", properties: {
      scope: text, complete: { type: "boolean" }, slots_due: { type: "integer" }, slots_recorded: { type: "integer" }, slots_observed: { type: "integer" },
      slots_missed: { type: "array", items: { type: "integer" } }, slots_without_observation: { type: "array", items: { type: "integer" } },
      passes: { type: "array", items: { type: "object", properties: { slot: { type: "integer" }, report: A2A_SIGNED_SCHEMA } } },
    } },
  }, required: ["id", "cert_id", "report", "repairs", "recheck", "watch"],
};
export const A2A_DESK_SCHEMA = {
  type: "object", properties: {
    what_this_is: text, proposition: text, for_money: text, battery: text, protocol_version: text, specification: text,
    price: { type: "object", properties: { description: text, amount_usdc: { type: "number" }, cadence: text, free: text } },
    how_to_call: { type: "object", properties: { card_check: { type: "object" }, setup: text, authorization_example: { type: "object" }, purchase: { type: "object" }, recheck: text, regression: { type: "object" }, implementation_quote: { type: "object" } } },
    errors: { type: "object", additionalProperties: text }, security: { type: "object", properties: { public_data_only: { type: "boolean" }, stored: text, authority: text, conflict: text, gaps: texts, bounds: { type: "object", additionalProperties: { type: "integer" } } } },
    repair_guidance: { type: "object", additionalProperties: { type: "object", properties: { change: text, acceptance: text, implementation: text } } },
  }, required: ["what_this_is", "price", "how_to_call", "errors", "security"],
};
