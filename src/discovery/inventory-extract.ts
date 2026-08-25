import type { IdentityClaim } from "@/discovery/binding";
import {
  claimsFromA2a,
  claimsFromLlmsTxt,
  claimsFromMenuJson,
  claimsFromOpenApi,
  claimsFromSkillMd,
  claimsFromX402Json,
} from "@/discovery/claims";
import type { DiscoverySurfaceKind } from "@/discovery/self-surfaces";

/**
 * EXTRACT — turn one fetched catalog body into identity claims.
 * Inventory.ts fetches and joins; this file only parses. Kinds
 * without an extractor return empty claims and a note.
 */

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function claimsByKind(claims: IdentityClaim[]): Record<string, string[]> {
  const grouped: Record<string, string[]> = {};
  for (const claim of claims) {
    const list = grouped[claim.kind] ?? [];
    list.push(claim.value);
    grouped[claim.kind] = list;
  }
  return grouped;
}

export function extractSurfaceClaims(
  kind: DiscoverySurfaceKind,
  bodyText: string,
  about: string,
  fetchedFrom: string,
): { claims: IdentityClaim[]; notes: string[] } {
  const notes: string[] = [];
  switch (kind) {
    case "menu_json": {
      const body = parseJson(bodyText);
      if (body === null) notes.push("body_not_json");
      return { claims: claimsFromMenuJson(body, about, fetchedFrom), notes };
    }
    case "x402_catalog": {
      const body = parseJson(bodyText);
      if (body === null) notes.push("body_not_json");
      return { claims: claimsFromX402Json(body, about, fetchedFrom), notes };
    }
    case "openapi": {
      const body = parseJson(bodyText);
      if (body === null) notes.push("body_not_json");
      return { claims: claimsFromOpenApi(body, about, fetchedFrom), notes };
    }
    case "a2a_agent_card": {
      const body = parseJson(bodyText);
      if (body === null) notes.push("body_not_json");
      return { claims: claimsFromA2a(body, about, fetchedFrom), notes };
    }
    case "llms_txt":
      return { claims: claimsFromLlmsTxt(bodyText, about, fetchedFrom), notes };
    case "skill_md":
      return { claims: claimsFromSkillMd(bodyText, about, fetchedFrom), notes };
    default:
      notes.push(`${kind}_has_no_extractor`);
      return { claims: [], notes };
  }
}
