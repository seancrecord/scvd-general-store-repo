import type { SchemaClaim } from "@/discovery/schema-claims";
import { SCHEMA_COHERENCE_FAMILY } from "@/evidence";

/**
 * SCHEMA JOIN — schema_coherence pointed at required inputs.
 *
 * Same shape as the identity self-join, different fact: field names,
 * not catalog ids. A route present on only one schema-bearing
 * surface is not_observed on the other, never a silent agree and
 * never a conflict. Conflict is two stated required-sets that
 * disagree. No scores.
 */

export const SCHEMA_COHERENCE_CLASS = SCHEMA_COHERENCE_FAMILY.id;

export interface SurfaceSchemaClaims {
  surface: string;
  claims: SchemaClaim[];
}

export interface SchemaDisagreement {
  left_surface: string;
  right_surface: string;
  route: string;
  only_left: string[];
  only_right: string[];
}

export interface SchemaJoinVerdict {
  derived: "agree" | "conflict";
  disagreements: SchemaDisagreement[];
  /** Routes one side stated a schema for and the other did not. */
  not_observed: Array<{
    route: string;
    present_on: string;
    missing_on: string;
  }>;
}

function byRoute(claims: readonly SchemaClaim[]): Map<string, SchemaClaim> {
  const map = new Map<string, SchemaClaim>();
  for (const claim of claims) map.set(claim.route, claim);
  return map;
}

function onlyIn(left: readonly string[], right: ReadonlySet<string>): string[] {
  return left.filter((name) => !right.has(name));
}

export function schemaJoinDisagreements(
  sides: readonly SurfaceSchemaClaims[],
): SchemaDisagreement[] {
  const found: SchemaDisagreement[] = [];
  for (let i = 0; i < sides.length; i += 1) {
    for (let j = i + 1; j < sides.length; j += 1) {
      const left = sides[i];
      const right = sides[j];
      if (!left || !right) continue;
      const rightByRoute = byRoute(right.claims);
      for (const claim of left.claims) {
        const other = rightByRoute.get(claim.route);
        if (!other) continue;
        const rightNames = new Set(other.required);
        const leftNames = new Set(claim.required);
        const onlyLeft = onlyIn(claim.required, rightNames);
        const onlyRight = onlyIn(other.required, leftNames);
        if (onlyLeft.length === 0 && onlyRight.length === 0) continue;
        found.push({
          left_surface: left.surface,
          right_surface: right.surface,
          route: claim.route,
          only_left: onlyLeft,
          only_right: onlyRight,
        });
      }
    }
  }
  return found;
}

export function schemaNotObserved(
  sides: readonly SurfaceSchemaClaims[],
): SchemaJoinVerdict["not_observed"] {
  const found: SchemaJoinVerdict["not_observed"] = [];
  for (let i = 0; i < sides.length; i += 1) {
    for (let j = i + 1; j < sides.length; j += 1) {
      const left = sides[i];
      const right = sides[j];
      if (!left || !right) continue;
      const leftRoutes = new Set(left.claims.map((claim) => claim.route));
      const rightRoutes = new Set(right.claims.map((claim) => claim.route));
      for (const route of leftRoutes) {
        if (rightRoutes.has(route)) continue;
        found.push({
          route,
          present_on: left.surface,
          missing_on: right.surface,
        });
      }
      for (const route of rightRoutes) {
        if (leftRoutes.has(route)) continue;
        found.push({
          route,
          present_on: right.surface,
          missing_on: left.surface,
        });
      }
    }
  }
  return found;
}

export function schemaRowVerdict(
  sides: readonly SurfaceSchemaClaims[],
): SchemaJoinVerdict {
  const disagreements = schemaJoinDisagreements(sides);
  return {
    derived: disagreements.length === 0 ? "agree" : "conflict",
    disagreements,
    not_observed: schemaNotObserved(sides),
  };
}
