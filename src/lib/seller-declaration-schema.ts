const strings = { type: "array", items: { type: "string" } };
export const SELLER_DECLARATION_INPUT_SCHEMA = { type: "object", required: ["artifact", "version", "host", "declares"], properties: {
  artifact: { type: "string", enum: ["seller_declaration"] }, version: { type: "integer", enum: [1] }, host: { type: "string" },
  declares: { type: "object", required: ["pay_to", "networks", "valid_from"], properties: { pay_to: { ...strings, minItems: 1, maxItems: 20 }, networks: { ...strings, minItems: 1, maxItems: 20 }, valid_from: { type: "string", format: "date-time" } } },
} };
export const SELLER_DECLARATION_SCHEMA = { type: "object", required: ["id", "host", "pay_to_digests", "networks", "valid_from", "attached_at", "evidence", "proof_scope"], properties: {
  artifact: { type: "string" }, version: { type: "integer" }, id: { type: "string" }, host: { type: "string" }, pay_to_digests: strings, networks: strings,
  valid_from: { type: "string", format: "date-time" }, attached_at: { type: "string", format: "date-time" }, evidence: { type: "string", enum: ["well_known", "wallet_signature"] }, proof_scope: { type: "string" },
} };
export const DECLARATION_COMPARISON_SCHEMA = { type: "object", required: ["state", "declaration", "observed", "limitations"], properties: {
  state: { type: "string", enum: ["match", "mismatch", "not_captured", "not_probed", "no_declaration"] }, declaration: { ...SELLER_DECLARATION_SCHEMA, nullable: true },
  observed: { type: "object", nullable: true, properties: { sequence: { type: "integer" }, week: { type: "string" }, observed_at: { type: "string", format: "date-time" }, digest: { type: "string" }, pay_to_digests: strings } }, limitations: { type: "string" },
} };
export const DECLARATION_READ_SCHEMA = { type: "object", properties: { host: { type: "string" }, declared_vs_observed: DECLARATION_COMPARISON_SCHEMA,
  what_this_is: { type: "string" }, proposition: { type: "string" }, price: { type: "string" }, for_money: { type: "string" }, free_first: { type: "string" },
  how_to_call: { type: "object", additionalProperties: true }, errors: { type: "object", additionalProperties: { type: "string" } }, security: { type: "object", additionalProperties: { type: "string" } },
  states: { type: "object", additionalProperties: { type: "string" } }, next_steps: { type: "object", additionalProperties: true }, watch: { type: "object", nullable: true, additionalProperties: true },
} };
export const DECLARATION_WRITE_SCHEMA = { type: "object", properties: { attached: { type: "boolean" }, declaration: { oneOf: [SELLER_DECLARATION_SCHEMA, SELLER_DECLARATION_INPUT_SCHEMA] },
  statement: { type: "string" }, sha256: { type: "string" }, well_known_path: { type: "string" }, expires_note: { type: "string" }, comparison_url: { type: "string" }, next_steps: { type: "object", additionalProperties: true },
} };
