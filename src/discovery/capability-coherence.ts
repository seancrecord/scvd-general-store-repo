import type { CapabilityClaim } from "@/discovery/capability-claims";
import { CAPABILITY_COHERENCE_FAMILY } from "@/evidence";

/**
 * CAPABILITY JOIN — catalog claims only.
 *
 * Same shape as schema_coherence, different fact. A dimension one
 * side stated and the other left empty is not_observed, never a
 * silent agree and never a conflict. Conflict is two stated values
 * that disagree. Transports compare `primary_transport` (what the
 * card leads with), not the full list — A2A listing HTTP+x402
 * beside MCP is not a fight with the MCP card. No scores. No live
 * probe.
 */

export const CAPABILITY_COHERENCE_CLASS = CAPABILITY_COHERENCE_FAMILY.id;

export interface SurfaceCapabilityClaim {
  surface: string;
  claim: CapabilityClaim;
}

export interface CapabilityDisagreement {
  field: "chains" | "primary_transport" | "schemes" | "streaming";
  left_surface: string;
  right_surface: string;
  left: string[];
  right: string[];
}

export interface CapabilityJoinVerdict {
  derived: "agree" | "conflict";
  disagreements: CapabilityDisagreement[];
  not_observed: Array<{
    field: CapabilityDisagreement["field"];
    present_on: string;
    missing_on: string;
  }>;
}

function sameSet(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((entry, index) => entry === right[index]);
}

function setOrEmpty(values: readonly string[]): string[] | null {
  return values.length === 0 ? null : [...values];
}

function scalarList(value: string | boolean | null): string[] | null {
  if (value === null) return null;
  return [String(value)];
}

function compareDimension(
  field: CapabilityDisagreement["field"],
  left: SurfaceCapabilityClaim,
  right: SurfaceCapabilityClaim,
  leftValues: string[] | null,
  rightValues: string[] | null,
  disagreements: CapabilityDisagreement[],
  not_observed: CapabilityJoinVerdict["not_observed"],
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
  if (sameSet(leftValues, rightValues)) return;
  disagreements.push({
    field,
    left_surface: left.surface,
    right_surface: right.surface,
    left: leftValues,
    right: rightValues,
  });
}

export function capabilityJoinDisagreements(
  sides: readonly SurfaceCapabilityClaim[],
): {
  disagreements: CapabilityDisagreement[];
  not_observed: CapabilityJoinVerdict["not_observed"];
} {
  const disagreements: CapabilityDisagreement[] = [];
  const not_observed: CapabilityJoinVerdict["not_observed"] = [];
  for (let i = 0; i < sides.length; i += 1) {
    for (let j = i + 1; j < sides.length; j += 1) {
      const left = sides[i];
      const right = sides[j];
      if (!left || !right) continue;
      compareDimension(
        "chains",
        left,
        right,
        setOrEmpty(left.claim.chains),
        setOrEmpty(right.claim.chains),
        disagreements,
        not_observed,
      );
      compareDimension(
        "primary_transport",
        left,
        right,
        scalarList(left.claim.primary_transport),
        scalarList(right.claim.primary_transport),
        disagreements,
        not_observed,
      );
      compareDimension(
        "schemes",
        left,
        right,
        setOrEmpty(left.claim.schemes),
        setOrEmpty(right.claim.schemes),
        disagreements,
        not_observed,
      );
      compareDimension(
        "streaming",
        left,
        right,
        scalarList(left.claim.streaming),
        scalarList(right.claim.streaming),
        disagreements,
        not_observed,
      );
    }
  }
  return { disagreements, not_observed };
}

export function capabilityRowVerdict(
  sides: readonly SurfaceCapabilityClaim[],
): CapabilityJoinVerdict {
  const { disagreements, not_observed } = capabilityJoinDisagreements(sides);
  return {
    derived: disagreements.length === 0 ? "agree" : "conflict",
    disagreements,
    not_observed,
  };
}
