import type { EvidenceArtifact } from "@/services/a2a-evidence";
import type { DefectClass } from "@/store/defect-vocabulary";

type Schema = Record<string, unknown>;
const text = { type: "string" };
const nullableText = { type: ["string", "null"] };
const count = { type: "integer", minimum: 0 };
const texts = { type: "array", items: text };
const object = (properties: Record<string, Schema>): Schema => ({
  type: "object", properties, required: Object.keys(properties),
});

// Refused input carries an empty evidence object; a lookup carries the
// held corpus reading. Nested records remain extensible as the corpus grows.
const heldEvidence = object({
  host: text,
  never_met: { type: "boolean" },
  rounds_in_chain: count,
  rounds_since_first_sighting: count,
  rounds_probed: count,
  rounds_gapped: count,
  first_observed: nullableText,
  last_observed: nullableText,
  gaps_by_reason: { type: "object", additionalProperties: count },
  tier: object({
    tier: text, line: text, rule: text, criteria_url: text,
    fraction: object({ ready: count, rounds: count, first_week: nullableText, last_week: nullableText, weeks: text }),
    latest: object({ verdict: nullableText, observed_at: nullableText, source: nullableText }),
    coverage_suspect: { type: "boolean" },
    window: object({ rounds: count, established_needs: count, standing_needs: count }),
    rows: { type: "array", items: { type: "object" } },
  }),
  passport: object({
    decision: text, freshness: text, observed_at: nullableText,
    verdict: nullableText, source: nullableText, url: text,
  }),
  last_probed_round: {
    type: ["object", "null"],
    properties: { week: text, taken_at: text, observed_at: text, url: text,
      verdict: text, failed: texts, advisories: texts, entry_url: text,
      digest: text, sequence: count, battery: text },
    required: ["week", "taken_at", "failed", "advisories", "entry_url"],
  },
  verdict_changes: count,
  what_this_cannot_see: texts,
  rows_url: text,
  derived_at: text,
  held_for_seconds: count,
});

const readinessProperties = {
  task: { type: "string", const: "get_endpoint_readiness" },
  observed_at: { ...text, description: "When this lookup was made; historical observation dates are in evidence." },
  result: { ...text, description: "Never met, last signed verdict, no verdict on file, or a refused host input." },
  scope: text,
  does_not_establish: texts,
  verification_url: text,
  artifact_url: nullableText,
  key_url: nullableText,
  evidence: { anyOf: [{ type: "object", maxProperties: 0 }, heldEvidence] },
  never_a_ranking: text,
} satisfies Record<keyof EvidenceArtifact, Schema>;

export const READINESS_OUTPUT_SCHEMA: Schema = object(readinessProperties);

const defectProperties = {
  id: text, title: text, asserts: text, costs: text,
  detectable: { type: "string", enum: ["unpaid", "paid"] },
  our_signal: nullableText,
  falsified_by: text, repair_hint: text, buyer_hint: text,
} satisfies Record<keyof Omit<DefectClass, "also_known_as" | "sourced_by" | "registered">, Schema>;
const commonDefectProperties = { vocabulary_version: text, definition_url: text };

// No id returns the vocabulary index; an id returns the full definition.
// Unknown ids are JSON-RPC errors, not successful structured tool results.
export const DEFECT_OUTPUT_SCHEMA: Schema = {
  type: "object",
  oneOf: [
    { ...object({ ...commonDefectProperties,
      classes: { type: "array", items: object({
        id: defectProperties.id, title: defectProperties.title, detectable: defectProperties.detectable,
      }) },
    }), additionalProperties: false },
    { ...object({ ...commonDefectProperties, ...defectProperties }),
      properties: { ...commonDefectProperties, ...defectProperties,
        also_known_as: { type: "array", items: object({ instrument: text, as: text, verify: text, falsified_by: text }) },
        sourced_by: text, registered: text,
      },
      additionalProperties: false,
    },
  ],
};
