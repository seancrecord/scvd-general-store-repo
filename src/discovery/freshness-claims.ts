import { isRecord } from "@/types";

/**
 * FRESHNESS CLAIMS — dated facts a catalog actually stated.
 *
 * Landscape §11 freshness_coherence, catalog-only: as_of and
 * valid_until. Cache headers, last_seen, badge renewal, and the
 * live probe are later. Empty means the surface did not date
 * itself. Invalid strings are not dates.
 */

export type FreshnessField = "as_of" | "valid_until";

export interface FreshnessClaim {
  surface: string;
  as_of: string | null;
  valid_until: string | null;
  about: string;
  fetched_from: string;
}

const AS_OF_KEYS = [
  "asOf",
  "lastUpdated",
  "last_updated",
  "updated_at",
  "issued_at",
  "generated_at",
] as const;

const UNTIL_KEYS = [
  "validUntil",
  "valid_until",
  "expires",
  "expires_at",
] as const;

/** Canonical ISO, or null if the value is not a date. */
export function normalizeStamp(raw: unknown): string | null {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    const ms = raw < 1e12 ? raw * 1000 : raw;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  if (typeof raw !== "string" || raw.trim().length === 0) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function firstStamp(
  body: Record<string, unknown>,
  keys: readonly string[],
): string | null {
  for (const key of keys) {
    const stamp = normalizeStamp(body[key]);
    if (stamp) return stamp;
  }
  return null;
}

function claim(
  surface: string,
  body: Record<string, unknown>,
  about: string,
  fetchedFrom: string,
): FreshnessClaim {
  return {
    surface,
    as_of: firstStamp(body, AS_OF_KEYS),
    valid_until: firstStamp(body, UNTIL_KEYS),
    about,
    fetched_from: fetchedFrom,
  };
}

/** Top-level dates only. A SKU `expires` is not the catalog's clock. */
export function freshnessFromJson(
  body: unknown,
  about: string,
  fetchedFrom: string,
  surface: string,
): FreshnessClaim | null {
  if (!isRecord(body)) return null;
  return claim(surface, body, about, fetchedFrom);
}

export function freshnessFromX402(
  body: unknown,
  about: string,
  fetchedFrom: string,
  surface = "x402_catalog",
): FreshnessClaim | null {
  return freshnessFromJson(body, about, fetchedFrom, surface);
}

export function freshnessFromA2a(
  body: unknown,
  about: string,
  fetchedFrom: string,
): FreshnessClaim | null {
  if (!isRecord(body)) return null;
  const provider = isRecord(body["provider"]) ? body["provider"] : {};
  const merged = { ...provider, ...body };
  return claim("a2a_agent_card", merged, about, fetchedFrom);
}
