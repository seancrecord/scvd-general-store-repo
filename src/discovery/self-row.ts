import {
  assembleSelfRow,
  selfJoinDisagreements,
  type FetchedSelfRow,
  type SelfJoinDisagreement,
  type SurfaceClaims,
} from "@/discovery/self-coherence";

/**
 * SELF-ROW VERDICT — the fold CI blocks the release on.
 *
 * Landscape §11: never grade anyone before our own catalogs agree.
 * The join lives in self-coherence; this file is the named gate
 * that fold becomes. agree = zero disagreements. No scores.
 */

export interface SelfRowVerdict {
  derived: "agree" | "conflict";
  disagreements: SelfJoinDisagreement[];
}

export function selfRowVerdict(
  sides: readonly SurfaceClaims[],
): SelfRowVerdict {
  const disagreements = selfJoinDisagreements(sides);
  return {
    derived: disagreements.length === 0 ? "agree" : "conflict",
    disagreements,
  };
}

export function selfRowFromCatalogs(row: FetchedSelfRow): SelfRowVerdict {
  return selfRowVerdict(assembleSelfRow(row));
}
