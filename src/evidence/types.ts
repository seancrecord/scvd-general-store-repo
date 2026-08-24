import type { EvidenceSubject } from "@/evidence/subject";

/**
 * THE EVIDENCE ENVELOPE, v1 — one container for every observation
 * class (watch rows, audit reports, ward rows, launch checks,
 * attestations). Ledger D-envelope; spec §2. This module tree is the
 * future `@scvd/evidence` package (spec §10): zero runtime
 * dependencies outside this tree except the house JCS canonicalizer,
 * which moves WITH it at extraction (one implementation, never a
 * twin — the same supply-chain reasoning that keeps it hand-rolled).
 *
 * STORAGE LAYOUT DECISION (roadmap 1.1 expand note, recorded here so
 * 1.2 does not re-litigate it): envelopes persist PER-ARTIFACT in KV,
 * keyed by evidence hash under a class prefix
 * (`evidence:{class}:{sha256}`), never bundled — a bundle rewrites
 * neighbours on every append, which is exactly the write-amplification
 * M4's limits punish, and an append-only surface a spec can clear by
 * prefix is the testing rule AGENTS.md already binds. Bundles, feeds
 * and histories are DERIVED views over per-artifact rows.
 *
 * Nothing here invents a format the store doesn't already half-own:
 * signed_payload discipline + attests binding + key registry + OTS
 * anchoring, with the `evidence` block (B9's raw capture) as the one
 * genuinely new field group.
 */

/** The schema identifier carried INSIDE the signed bytes (D6). */
export const EVIDENCE_SCHEMA_V1 = "scvd-evidence/v1" as const;

/** Tri-state: silence must be distinguishable from a pass (§2). */
export type CheckState = "pass" | "fail" | "not_checked";

/** Field names the envelope REFUSES at any depth of `derived` — the
 * spec's §11 refusals, enforced where they'd otherwise creep in. */
export const REFUSED_DERIVED_FIELDS = [
  "score",
  "confidence",
  "rating",
  "rank",
] as const;

export interface EvidenceCapture {
  /** Verbatim challenge/response bytes, when the class captures them.
   * Stored, not just hashed: an observation that cannot be
   * re-examined is a conclusion, not evidence (§2). */
  challenge_bytes?: string;
  /** Curated headers — the ones the battery read, exactly as read. */
  headers?: Record<string, string>;
  /** sha256 of the full body when the body itself is not retained. */
  body_sha256?: string;
  /** Where the raw artifact lives, when it lives anywhere. */
  artifact_urls?: string[];
}

export interface EvidenceObserver {
  /** The artifact signing key's id — layer 2's subject. */
  key_id: string;
  /** Software version that ran the observation. */
  software_version: string;
  /** Battery version, when a battery ran (also cited in methodology —
   * here it names the instrument, there it names the method). */
  battery_version?: string;
  /** Where we looked from. Single vantage today; saying so is the
   * honest limit (§6), and the field is where a second vantage lands. */
  vantage: string;
}

export interface EvidenceMethodology {
  /** EVIDENCE_SCHEMA_V1 — inside the signed bytes, so an artifact
   * can never be silently read under the wrong schema (D6). */
  schema: typeof EVIDENCE_SCHEMA_V1;
  battery_version?: string;
  criteria_version?: string;
}

export interface EvidenceDerived {
  /** The verdict drawn — visibly a layer ABOVE observation (§1.5). */
  verdict: string;
  /** Tri-state per named check; a check above the reached level is
   * not_checked, never pass (§4). */
  checks: Record<string, CheckState>;
}

export interface EvidenceLimitations {
  /** What this artifact's signature does NOT establish, in-band. */
  does_not_prove: string[];
  /** What was not looked at, stated rather than omitted (§2). */
  not_checked: string[];
}

/**
 * How deep this class goes, per chain (M1). Ordered: a walk implies
 * we can also read a challenge on that rail; the matrix still says
 * the deepest thing THIS class does, not the implication stack.
 */
export type CoverageDepth = "none" | "challenge" | "read" | "till" | "walk";

export interface EvidenceCoverage {
  class_id: string;
  /** Depth on the subject chain for THIS observation. */
  depth: CoverageDepth;
  /** This class's full row at signing time — every known chain stated. */
  class_row: Record<string, CoverageDepth>;
}

export interface EvidenceKeyWindow {
  key_id: string;
  /** Service window cited in-band so layer 3 is checkable offline
   * against the published registry (D4/D5). */
  in_service_from: string;
  retired_on?: string;
}

export interface EvidenceAuthorization {
  /** The published key directory this key must appear in. */
  key_registry_url: string;
  /** The anchor log whose chain bounds backdating. */
  anchor_log_url: string;
  /** Handover announcement id, when a retired key signed. */
  handover_announcement_id?: string;
}

/**
 * The signed subset is EVERYTHING except `signature` — the exact
 * bytes are the JCS canonicalization of this object (canonical.ts).
 */
export interface EvidenceEnvelopePayload {
  methodology: EvidenceMethodology;
  subject: EvidenceSubject;
  /** What was seen, stated as facts, never verdicts (§2). */
  observation: Record<string, unknown>;
  evidence: EvidenceCapture;
  observer: EvidenceObserver;
  /** ISO-8601 UTC instant of the observation. */
  at: string;
  /** Which clock produced `at` — injected, never ambient (§7). */
  clock: string;
  derived: EvidenceDerived;
  limitations: EvidenceLimitations;
  /** Class × chain × depth, in-band so "we cover Solana" is per class. */
  coverage: EvidenceCoverage;
  key: EvidenceKeyWindow;
  authorization: EvidenceAuthorization;
}

export interface EvidenceEnvelope extends EvidenceEnvelopePayload {
  /** ed25519 over the JCS bytes of the payload (everything above). */
  signature: string;
}
