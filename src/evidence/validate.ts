import { subjectDefects, type EvidenceSubject } from "@/evidence/subject";
import {
  EVIDENCE_SCHEMA_V1,
  REFUSED_DERIVED_FIELDS,
  type CheckState,
  type EvidenceEnvelopePayload,
} from "@/evidence/types";

/**
 * THE ENVELOPE VALIDATOR — structural rules from spec §2, each with a
 * stable, namespaced defect code (battery-style ids, spec §4: never
 * renamed, only deprecated). The validator answers with EVERY defect
 * it found, not the first: a producer fixing an envelope should fix
 * it once.
 *
 * What is deliberately NOT here: signature verification (layers 1–3
 * are x402-verify's job, spec §1) and truth (layer 4 — no validator
 * can check whether the observation happened). This is the schema
 * gate producers run BEFORE signing and consumers run before trusting
 * a parse.
 */

export type EnvelopeValidation =
  | { ok: true; payload: EvidenceEnvelopePayload }
  | { ok: false; defects: string[] };

const CHECK_STATES: readonly CheckState[] = ["pass", "fail", "not_checked"];

/** ISO-8601 UTC instant, seconds or milliseconds, Z-terminated — the
 * one spelling every artifact class already writes. */
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

/** Refused fields (§11) are rejected at ANY depth of `derived` — a
 * confidence scalar nested one level down is still a confidence
 * scalar. */
function findRefusedFields(value: unknown, defects: string[]): void {
  if (Array.isArray(value)) {
    for (const entry of value) findRefusedFields(entry, defects);
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, entry] of Object.entries(value)) {
    if ((REFUSED_DERIVED_FIELDS as readonly string[]).includes(key)) {
      const code = `envelope.derived.refused-field:${key}`;
      if (!defects.includes(code)) defects.push(code);
    }
    findRefusedFields(entry, defects);
  }
}

export function validateEnvelopePayload(value: unknown): EnvelopeValidation {
  const defects: string[] = [];
  if (!isRecord(value)) {
    return { ok: false, defects: ["envelope.not-an-object"] };
  }

  if (
    !isRecord(value["methodology"]) ||
    value["methodology"]["schema"] !== EVIDENCE_SCHEMA_V1
  ) {
    // The schema id lives INSIDE the signed bytes (D6) — an envelope
    // that does not say what it is cannot be read safely under any
    // assumption about what it is.
    defects.push("envelope.methodology.schema-missing");
  }

  if (!isRecord(value["subject"])) {
    defects.push("envelope.subject.missing");
  } else {
    defects.push(...subjectDefects(value["subject"] as unknown as EvidenceSubject));
  }

  if (!isRecord(value["observation"])) {
    defects.push("envelope.observation.missing");
  }
  if (!isRecord(value["evidence"])) {
    // May be sparse (a class that captures nothing states so through
    // limitations) but must EXIST — absence stated, never omitted.
    defects.push("envelope.evidence.missing");
  }

  const observer = value["observer"];
  if (
    !isRecord(observer) ||
    typeof observer["key_id"] !== "string" ||
    observer["key_id"].length === 0 ||
    typeof observer["software_version"] !== "string" ||
    typeof observer["vantage"] !== "string"
  ) {
    defects.push("envelope.observer.incomplete");
  }

  if (typeof value["at"] !== "string" || !ISO_INSTANT.test(value["at"])) {
    defects.push("envelope.at.not-utc-instant");
  }
  if (typeof value["clock"] !== "string" || value["clock"].length === 0) {
    // A verdict that can move with an unnamed wall clock is not a
    // test (§7); the clock that produced `at` is part of the record.
    defects.push("envelope.clock.unnamed");
  }

  const derived = value["derived"];
  if (!isRecord(derived) || typeof derived["verdict"] !== "string") {
    defects.push("envelope.derived.verdict-missing");
  } else {
    const checks = derived["checks"];
    if (!isRecord(checks)) {
      defects.push("envelope.derived.checks-missing");
    } else {
      for (const [id, state] of Object.entries(checks)) {
        if (!CHECK_STATES.includes(state as CheckState)) {
          // Tri-state only: silence must be distinguishable from a
          // pass, and no fourth spelling gets to blur the three.
          defects.push(`envelope.derived.check-state-invalid:${id}`);
        }
      }
    }
    findRefusedFields(derived, defects);
  }

  const limitations = value["limitations"];
  if (
    !isRecord(limitations) ||
    !isStringArray(limitations["does_not_prove"]) ||
    !isStringArray(limitations["not_checked"])
  ) {
    // In-band and mandatory: an envelope with nothing in these
    // arrays says so with empty arrays, never by leaving them out.
    defects.push("envelope.limitations.missing");
  }

  const key = value["key"];
  if (
    !isRecord(key) ||
    typeof key["key_id"] !== "string" ||
    typeof key["in_service_from"] !== "string"
  ) {
    // The service window rides in-band so layer 3 is checkable
    // offline against the published registry (D4/D5).
    defects.push("envelope.key.window-missing");
  }

  const authorization = value["authorization"];
  if (
    !isRecord(authorization) ||
    typeof authorization["key_registry_url"] !== "string" ||
    typeof authorization["anchor_log_url"] !== "string"
  ) {
    defects.push("envelope.authorization.missing");
  }

  if (defects.length > 0) {
    return { ok: false, defects };
  }
  return { ok: true, payload: value as unknown as EvidenceEnvelopePayload };
}
