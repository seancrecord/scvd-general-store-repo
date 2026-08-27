import { KV_KEYS } from "@/lib/kv-keys";
import type { Env } from "@/types";
import { kvGet, kvPut } from "@/lib/kv-retry";

/**
 * CATALOG SNAPSHOT — last unsigned look, so the next look can name
 * what moved. Latest-wins per host. No score, no alert, no watch.
 * Refresh and drift alerts sit on top of this; they are not this.
 */

export type SnapshotVerdict = "agree" | "conflict" | "not_observed";

export interface SnapshotSurface {
  id: string;
  path: string;
  observed: boolean;
  sha256?: string;
  claims: Record<string, string[]>;
}

export interface CatalogSnapshot {
  about: string;
  at: string;
  verdict: SnapshotVerdict;
  surfaces: SnapshotSurface[];
}

export interface ClaimChange {
  surface: string;
  kind: string;
  only_previous: string[];
  only_current: string[];
}

export interface SnapshotCompare {
  previous_at: string;
  previous_verdict: SnapshotVerdict;
  verdict: SnapshotVerdict;
  verdict_changed: boolean;
  surfaces_appeared: string[];
  surfaces_disappeared: string[];
  surfaces_hash_changed: string[];
  claim_changes: ClaimChange[];
}

export interface SnapshotInput {
  about: string;
  at: string;
  verdict: SnapshotVerdict;
  surfaces: SnapshotSurface[];
}

function hostOf(about: string): string {
  return new URL(about).host.toLowerCase();
}

function sorted(values: readonly string[]): string[] {
  return [...values].sort();
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function setDiff(left: readonly string[], right: readonly string[]): string[] {
  const rightSet = new Set(right);
  return sorted(left.filter((value) => !rightSet.has(value)));
}

export function snapshotFromLook(input: SnapshotInput): CatalogSnapshot {
  return {
    about: input.about,
    at: input.at,
    verdict: input.verdict,
    surfaces: input.surfaces.map((row) => ({
      id: row.id,
      path: row.path,
      observed: row.observed,
      ...(row.sha256 ? { sha256: row.sha256 } : {}),
      claims: row.claims,
    })),
  };
}

export function compareCatalogSnapshots(
  previous: CatalogSnapshot,
  current: CatalogSnapshot,
): SnapshotCompare {
  const previousById = new Map(previous.surfaces.map((row) => [row.id, row]));
  const currentById = new Map(current.surfaces.map((row) => [row.id, row]));
  const ids = unique([
    ...previous.surfaces.map((row) => row.id),
    ...current.surfaces.map((row) => row.id),
  ]);

  const surfaces_appeared: string[] = [];
  const surfaces_disappeared: string[] = [];
  const surfaces_hash_changed: string[] = [];
  const claim_changes: ClaimChange[] = [];

  for (const id of sorted(ids)) {
    const before = previousById.get(id);
    const after = currentById.get(id);
    const beforeHash = before?.sha256;
    const afterHash = after?.sha256;
    if (!beforeHash && afterHash) surfaces_appeared.push(id);
    if (beforeHash && !afterHash) surfaces_disappeared.push(id);
    if (beforeHash && afterHash && beforeHash !== afterHash) {
      surfaces_hash_changed.push(id);
    }

    const kinds = unique([
      ...Object.keys(before?.claims ?? {}),
      ...Object.keys(after?.claims ?? {}),
    ]);
    for (const kind of sorted(kinds)) {
      const only_previous = setDiff(
        before?.claims[kind] ?? [],
        after?.claims[kind] ?? [],
      );
      const only_current = setDiff(
        after?.claims[kind] ?? [],
        before?.claims[kind] ?? [],
      );
      if (only_previous.length === 0 && only_current.length === 0) continue;
      claim_changes.push({
        surface: id,
        kind,
        only_previous,
        only_current,
      });
    }
  }

  return {
    previous_at: previous.at,
    previous_verdict: previous.verdict,
    verdict: current.verdict,
    verdict_changed: previous.verdict !== current.verdict,
    surfaces_appeared,
    surfaces_disappeared,
    surfaces_hash_changed,
    claim_changes,
  };
}

export async function readCatalogSnapshot(
  env: Env,
  about: string,
): Promise<CatalogSnapshot | null> {
  const raw = await kvGet(env.COUNTERS, KV_KEYS.discoverySnapshot(hostOf(about)));
  if (!raw) return null;
  return JSON.parse(raw) as CatalogSnapshot;
}

export async function writeCatalogSnapshot(
  env: Env,
  snapshot: CatalogSnapshot,
): Promise<void> {
  await kvPut(env.COUNTERS, 
    KV_KEYS.discoverySnapshot(hostOf(snapshot.about)),
    JSON.stringify(snapshot),
  );
}

export async function rememberInventoryLook(
  env: Env,
  input: SnapshotInput,
): Promise<SnapshotCompare | null> {
  const current = snapshotFromLook(input);
  const previous = await readCatalogSnapshot(env, input.about);
  const compared = previous
    ? compareCatalogSnapshots(previous, current)
    : null;
  await writeCatalogSnapshot(env, current);
  return compared;
}
