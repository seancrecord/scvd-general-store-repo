import { joinClaimSets, type ClaimSetJoin, type IdentityClaim } from "@/discovery/binding";
import {
  claimsFromA2a,
  claimsFromLlmsTxt,
  claimsFromMcpItemIds,
  claimsFromMenuJson,
  claimsFromOpenApi,
  claimsFromSkillMd,
  claimsFromX402Json,
} from "@/discovery/claims";

/**
 * SELF-JOIN — discovery_coherence pointed at us.
 *
 * Step 4 of the implementation order, on our own inventory first:
 * take claim lists extracted from each catalog surface and set-join
 * them. A non-empty only_left / only_right is a disagreement. No
 * scores. MCP tool names are not in these lists — extractors use
 * cluster itemIds as route_identity.
 */

export interface SurfaceClaims {
  surface: string;
  claims: IdentityClaim[];
}

export interface SelfJoinDisagreement {
  left_surface: string;
  right_surface: string;
  kind: ClaimSetJoin["kind"];
  only_left: string[];
  only_right: string[];
}

export interface FetchedSelfRow {
  about: string;
  fetchedFrom: string;
  menu: unknown;
  x402: unknown;
  openapi: unknown;
  a2a: unknown;
  llms: string;
  skillMd: string;
  mcpItemIds: readonly string[];
}

/** Extract each owned catalog into the claim lists the join consumes. */
export function assembleSelfRow(row: FetchedSelfRow): SurfaceClaims[] {
  const { about, fetchedFrom } = row;
  return [
    { surface: "menu_json", claims: claimsFromMenuJson(row.menu, about, fetchedFrom) },
    { surface: "x402_catalog", claims: claimsFromX402Json(row.x402, about, fetchedFrom) },
    { surface: "openapi", claims: claimsFromOpenApi(row.openapi, about, fetchedFrom) },
    { surface: "a2a_agent_card", claims: claimsFromA2a(row.a2a, about, fetchedFrom) },
    { surface: "llms_txt", claims: claimsFromLlmsTxt(row.llms, about, fetchedFrom) },
    { surface: "skill_md", claims: claimsFromSkillMd(row.skillMd, about, fetchedFrom) },
    {
      surface: "mcp_clusters",
      claims: claimsFromMcpItemIds(row.mcpItemIds, about, fetchedFrom),
    },
  ];
}

export function selfJoinDisagreements(
  sides: readonly SurfaceClaims[],
): SelfJoinDisagreement[] {
  const found: SelfJoinDisagreement[] = [];
  for (let i = 0; i < sides.length; i += 1) {
    for (let j = i + 1; j < sides.length; j += 1) {
      const left = sides[i];
      const right = sides[j];
      if (!left || !right) continue;
      for (const join of joinClaimSets(left.claims, right.claims)) {
        if (join.only_left.length === 0 && join.only_right.length === 0) {
          continue;
        }
        found.push({
          left_surface: left.surface,
          right_surface: right.surface,
          kind: join.kind,
          only_left: join.only_left,
          only_right: join.only_right,
        });
      }
    }
  }
  return found;
}
