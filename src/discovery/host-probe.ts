import { claimsByKind, extractSurfaceClaims } from "@/discovery/inventory-extract";
import type { SurfaceClaims } from "@/discovery/self-coherence";
import {
  OWNED_DISCOVERY_SURFACES,
  type DiscoverySurfaceKind,
  type OwnedDiscoverySurface,
} from "@/discovery/self-surfaces";
import { probeOnce } from "@/services/preflight";
import type { Env } from "@/types";

/**
 * HOST PROBE — one outbound GET per owned catalog path, pointed at
 * someone else's origin. Inventory (unsigned) and the signed report
 * share this fetch. Paths come from OWNED_DISCOVERY_SURFACES.
 */

export interface HostSurfaceRow {
  id: string;
  path: string;
  kind: DiscoverySurfaceKind;
  status: number | "unreachable";
  observed: boolean;
  sha256?: string;
  claim_count: number;
  claims: Record<string, string[]>;
  notes: string[];
}

export interface HostCatalogCapture {
  about: string;
  surfaces: HostSurfaceRow[];
  sides: SurfaceClaims[];
  bodies: Record<string, string>;
  urls: Record<string, string>;
}

export function inventoryCandidates(): readonly OwnedDiscoverySurface[] {
  return OWNED_DISCOVERY_SURFACES;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function probeHostCatalogs(input: {
  origin: string;
  env: Env;
  fetchImpl?: typeof fetch;
}): Promise<HostCatalogCapture> {
  const about = input.origin;
  const ownHost = new URL(input.env.STORE_BASE_URL).host;
  const fetchImpl = input.fetchImpl ?? fetch;
  const surfaces: HostSurfaceRow[] = [];
  const sides: SurfaceClaims[] = [];
  const bodies: Record<string, string> = {};
  const urls: Record<string, string> = {};

  for (const candidate of inventoryCandidates()) {
    const fetchedFrom = `${about}${candidate.path}`;
    try {
      const outcome = await probeOnce(fetchedFrom, fetchImpl, ownHost, input.env);
      if (outcome.bodyOverLimit) {
        surfaces.push({
          id: candidate.id,
          path: candidate.path,
          kind: candidate.kind,
          status: outcome.response.status,
          observed: false,
          claim_count: 0,
          claims: {},
          notes: ["body_over_limit"],
        });
        continue;
      }
      if (outcome.response.status !== 200) {
        surfaces.push({
          id: candidate.id,
          path: candidate.path,
          kind: candidate.kind,
          status: outcome.response.status,
          observed: false,
          claim_count: 0,
          claims: {},
          notes: [],
        });
        continue;
      }
      const extracted = extractSurfaceClaims(
        candidate.kind,
        outcome.body,
        about,
        fetchedFrom,
      );
      bodies[candidate.id] = outcome.body;
      urls[candidate.id] = fetchedFrom;
      surfaces.push({
        id: candidate.id,
        path: candidate.path,
        kind: candidate.kind,
        status: outcome.response.status,
        observed: true,
        sha256: await sha256Hex(outcome.body),
        claim_count: extracted.claims.length,
        claims: claimsByKind(extracted.claims),
        notes: extracted.notes,
      });
      if (extracted.claims.length > 0) {
        sides.push({ surface: candidate.id, claims: extracted.claims });
      }
    } catch {
      surfaces.push({
        id: candidate.id,
        path: candidate.path,
        kind: candidate.kind,
        status: "unreachable",
        observed: false,
        claim_count: 0,
        claims: {},
        notes: ["probe_did_not_complete"],
      });
    }
  }

  return { about, surfaces, sides, bodies, urls };
}
