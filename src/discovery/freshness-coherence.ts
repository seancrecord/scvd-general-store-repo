import type { FreshnessClaim, FreshnessField } from "@/discovery/freshness-claims";
import { FRESHNESS_COHERENCE_FAMILY } from "@/evidence";

/**
 * FRESHNESS JOIN — catalog dates only.
 *
 * Same shape as capability_coherence, different fact. A dimension
 * one side stated and the other left empty is not_observed, never
 * a silent agree and never a conflict. Conflict is two stated
 * instants that disagree. No scores. No live probe.
 */

export const FRESHNESS_COHERENCE_CLASS = FRESHNESS_COHERENCE_FAMILY.id;

export interface SurfaceFreshnessClaim {
  surface: string;
  claim: FreshnessClaim;
}

export interface FreshnessDisagreement {
  field: FreshnessField;
  left_surface: string;
  right_surface: string;
  left: string[];
  right: string[];
}

export interface FreshnessJoinVerdict {
  derived: "agree" | "conflict";
  disagreements: FreshnessDisagreement[];
  not_observed: Array<{
    field: FreshnessField;
    present_on: string;
    missing_on: string;
  }>;
}

function scalar(value: string | null): string[] | null {
  return value === null ? null : [value];
}

function compareDimension(
  field: FreshnessField,
  left: SurfaceFreshnessClaim,
  right: SurfaceFreshnessClaim,
  leftValues: string[] | null,
  rightValues: string[] | null,
  disagreements: FreshnessDisagreement[],
  not_observed: FreshnessJoinVerdict["not_observed"],
): void {
  if (leftValues === null && rightValues === null) return;
  if (leftValues === null || rightValues === null) {
    not_observed.push({
      field,
      present_on: leftValues === null ? right.surface : left.surface,
      missing_on: leftValues === null ? left.surface : right.surface,
    });
    return;
  }
  if (leftValues[0] === rightValues[0]) return;
  disagreements.push({
    field,
    left_surface: left.surface,
    right_surface: right.surface,
    left: leftValues,
    right: rightValues,
  });
}

export function freshnessJoinDisagreements(
  sides: readonly SurfaceFreshnessClaim[],
): {
  disagreements: FreshnessDisagreement[];
  not_observed: FreshnessJoinVerdict["not_observed"];
} {
  const disagreements: FreshnessDisagreement[] = [];
  const not_observed: FreshnessJoinVerdict["not_observed"] = [];
  for (let i = 0; i < sides.length; i += 1) {
    for (let j = i + 1; j < sides.length; j += 1) {
      const left = sides[i];
      const right = sides[j];
      if (!left || !right) continue;
      compareDimension(
        "as_of",
        left,
        right,
        scalar(left.claim.as_of),
        scalar(right.claim.as_of),
        disagreements,
        not_observed,
      );
      compareDimension(
        "valid_until",
        left,
        right,
        scalar(left.claim.valid_until),
        scalar(right.claim.valid_until),
        disagreements,
        not_observed,
      );
    }
  }
  return { disagreements, not_observed };
}

export function freshnessRowVerdict(
  sides: readonly SurfaceFreshnessClaim[],
): FreshnessJoinVerdict {
  const { disagreements, not_observed } = freshnessJoinDisagreements(sides);
  return {
    derived: disagreements.length === 0 ? "agree" : "conflict",
    disagreements,
    not_observed,
  };
}
