import { claimsByKind, extractSurfaceClaims } from "@/discovery/inventory-extract";
import {
  selfJoinDisagreements,
  type SelfJoinDisagreement,
  type SurfaceClaims,
} from "@/discovery/self-coherence";
import {
  OWNED_DISCOVERY_SURFACES,
  type DiscoverySurfaceKind,
  type OwnedDiscoverySurface,
} from "@/discovery/self-surfaces";
import { storeIdentity } from "@/lib/identity";
import { checkProbeTarget } from "@/lib/probe-target";
import { probeOnce } from "@/services/preflight";
import type { Env } from "@/types";

/**
 * FREE DISCOVERY INVENTORY — host inventory pointed outward.
 *
 * Landscape §11 productize, first unpaid door: fetch the candidate
 * catalog paths we already inventory on ourselves, hash what answered,
 * extract claims, join. No signature (that is the paid report, not
 * sold yet). No scores. Paths come from OWNED_DISCOVERY_SURFACES —
 * a second typed list would drift in a day.
 *
 * Cloudflare cannot fetch this store's own hostname; that refusal
 * is the same sentence the preflight uses. CI holds our self-row.
 */

export const DISCOVERY_INVENTORY_VERSION = "v1";

export const INVENTORIES_PER_MINUTE = 8;
export const GLOBAL_INVENTORIES_PER_MINUTE = 20;

const NOT_CHECKED = [
  "same_operator",
  "live_402_behavior",
  "mcp_cluster_item_ids",
] as const;

export interface InventorySurfaceRow {
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

export interface DiscoveryInventory {
  artifact: "discovery_inventory";
  version: typeof DISCOVERY_INVENTORY_VERSION;
  about: string;
  at: string;
  clock: string;
  surfaces: InventorySurfaceRow[];
  disagreements: SelfJoinDisagreement[];
  derived: { verdict: "agree" | "conflict" | "not_observed" };
  not_checked: string[];
  does_not_prove: string[];
  signed: false;
  store_identity: ReturnType<typeof storeIdentity>;
  rate_limit: {
    per_isolate_per_minute: number;
    global_per_minute: number;
  };
}

let inventoryMinute = "";
let inventoriesUsed = 0;

function takeInventoryBudget(): boolean {
  const minute = new Date().toISOString().slice(0, 16);
  if (minute !== inventoryMinute) {
    inventoryMinute = minute;
    inventoriesUsed = 0;
  }
  if (inventoriesUsed >= INVENTORIES_PER_MINUTE) return false;
  inventoriesUsed += 1;
  return true;
}

async function takeGlobalInventoryBudget(env: Env): Promise<boolean> {
  const minute = new Date().toISOString().slice(0, 16);
  const key = `discovery_inventory_budget:${minute}`;
  const used = parseInt((await env.COUNTERS.get(key)) ?? "0", 10);
  if (used >= GLOBAL_INVENTORIES_PER_MINUTE) return false;
  await env.COUNTERS.put(key, String(used + 1), { expirationTtl: 120 });
  return true;
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

export function inventoryCandidates(): readonly OwnedDiscoverySurface[] {
  return OWNED_DISCOVERY_SURFACES;
}

function ownHostRefusal(): string {
  return "That is this store's own hostname, which a Cloudflare Worker cannot fetch (the platform kills self-requests). Our own catalogs are joined in CI on every build — probe this door from outside if you want a reading of us. This inventory is for other hosts.";
}

export async function inventoryOrigin(input: {
  rawUrl: unknown;
  env: Env;
  at?: string;
  clock?: string;
  fetchImpl?: typeof fetch;
}): Promise<{ status: number; body: DiscoveryInventory | { error: string } }> {
  const base = input.env.STORE_BASE_URL;
  if (typeof input.rawUrl !== "string" || input.rawUrl.trim().length === 0) {
    return {
      status: 400,
      body: {
        error:
          'Send {"url": "https://their-origin.example"} — the origin whose catalog doors you want inventoried. Paths are ours, from the same list we inventory on ourselves.',
      },
    };
  }
  let url: URL;
  try {
    url = new URL(input.rawUrl.trim());
  } catch {
    return { status: 400, body: { error: "That is not a parseable URL." } };
  }
  const origin = url.origin;
  const target = checkProbeTarget(new URL(`${origin}/`), "");
  if (!target.ok) {
    return { status: 400, body: { error: target.reason ?? "refused target" } };
  }
  if (url.host.toLowerCase() === new URL(base).host.toLowerCase()) {
    return { status: 400, body: { error: ownHostRefusal() } };
  }
  if (!takeInventoryBudget() || !(await takeGlobalInventoryBudget(input.env))) {
    return {
      status: 429,
      body: {
        error:
          "The inventory budget for this minute is spent — a cost bound on our side, not a fact about their catalogs. Retry next minute.",
      },
    };
  }

  const about = origin;
  const ownHost = new URL(base).host;
  const fetchImpl = input.fetchImpl ?? fetch;
  const surfaces: InventorySurfaceRow[] = [];
  const sides: SurfaceClaims[] = [];

  for (const candidate of inventoryCandidates()) {
    const fetchedFrom = `${origin}${candidate.path}`;
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

  const disagreements = selfJoinDisagreements(sides);
  const derived =
    sides.length < 2
      ? "not_observed"
      : disagreements.length === 0
        ? "agree"
        : "conflict";

  return {
    status: 200,
    body: {
      artifact: "discovery_inventory",
      version: DISCOVERY_INVENTORY_VERSION,
      about,
      at: input.at ?? new Date().toISOString(),
      clock: input.clock ?? "injected-request-clock",
      surfaces,
      disagreements,
      derived: { verdict: derived },
      not_checked: [
        ...NOT_CHECKED,
        ...surfaces
          .filter((row) => row.notes.includes(`${row.kind}_has_no_extractor`))
          .map((row) => `${row.id}_claims`),
      ],
      does_not_prove: [
        "that the compared surfaces belong to the same operator — same_operator is refused (G2)",
        "that the live buy door still behaves like these catalogs",
        "anything after this moment — one inventory, not a watch",
      ],
      signed: false,
      store_identity: storeIdentity(base),
      rate_limit: {
        per_isolate_per_minute: INVENTORIES_PER_MINUTE,
        global_per_minute: GLOBAL_INVENTORIES_PER_MINUTE,
      },
    },
  };
}
