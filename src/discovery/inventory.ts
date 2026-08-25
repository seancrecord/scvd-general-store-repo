import {
  inventoryCandidates,
  probeHostCatalogs,
  type HostSurfaceRow,
} from "@/discovery/host-probe";
import { selfJoinDisagreements } from "@/discovery/self-coherence";
import { storeIdentity } from "@/lib/identity";
import { checkProbeTarget } from "@/lib/probe-target";
import type { Env } from "@/types";

/**
 * FREE DISCOVERY INVENTORY — unsigned view over probeHostCatalogs.
 * The signed sibling is sign-report.ts. No scores.
 */

export const DISCOVERY_INVENTORY_VERSION = "v1";

export const INVENTORIES_PER_MINUTE = 8;
export const GLOBAL_INVENTORIES_PER_MINUTE = 20;

export type InventorySurfaceRow = HostSurfaceRow;

const NOT_CHECKED = [
  "same_operator",
  "live_402_behavior",
  "mcp_cluster_item_ids",
] as const;

export interface DiscoveryInventory {
  artifact: "discovery_inventory";
  version: typeof DISCOVERY_INVENTORY_VERSION;
  about: string;
  at: string;
  clock: string;
  surfaces: InventorySurfaceRow[];
  disagreements: ReturnType<typeof selfJoinDisagreements>;
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

function ownHostRefusal(): string {
  return "That is this store's own hostname, which a Cloudflare Worker cannot fetch (the platform kills self-requests). Our own catalogs are joined in CI on every build — probe this door from outside if you want a reading of us. This inventory is for other hosts.";
}

export { inventoryCandidates };

export function parseInventoryTarget(
  rawUrl: unknown,
  ownBase: string,
): { ok: true; origin: string } | { ok: false; status: number; error: string } {
  if (typeof rawUrl !== "string" || rawUrl.trim().length === 0) {
    return {
      ok: false,
      status: 400,
      error:
        'Send {"url": "https://their-origin.example"} — the origin whose catalog doors you want inventoried. Paths are ours, from the same list we inventory on ourselves.',
    };
  }
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    return { ok: false, status: 400, error: "That is not a parseable URL." };
  }
  const target = checkProbeTarget(new URL(`${url.origin}/`), "");
  if (!target.ok) {
    return { ok: false, status: 400, error: target.reason ?? "refused target" };
  }
  if (url.host.toLowerCase() === new URL(ownBase).host.toLowerCase()) {
    return { ok: false, status: 400, error: ownHostRefusal() };
  }
  return { ok: true, origin: url.origin };
}

export function inventoryFromCapture(
  capture: Awaited<ReturnType<typeof probeHostCatalogs>>,
  base: string,
  at: string,
  clock: string,
): DiscoveryInventory {
  const disagreements = selfJoinDisagreements(capture.sides);
  const derived =
    capture.sides.length < 2
      ? "not_observed"
      : disagreements.length === 0
        ? "agree"
        : "conflict";
  return {
    artifact: "discovery_inventory",
    version: DISCOVERY_INVENTORY_VERSION,
    about: capture.about,
    at,
    clock,
    surfaces: capture.surfaces,
    disagreements,
    derived: { verdict: derived },
    not_checked: [
      ...NOT_CHECKED,
      ...capture.surfaces
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
  };
}

export async function inventoryOrigin(input: {
  rawUrl: unknown;
  env: Env;
  at?: string;
  clock?: string;
  fetchImpl?: typeof fetch;
}): Promise<{ status: number; body: DiscoveryInventory | { error: string } }> {
  const base = input.env.STORE_BASE_URL;
  const parsed = parseInventoryTarget(input.rawUrl, base);
  if (!parsed.ok) {
    return { status: parsed.status, body: { error: parsed.error } };
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
  const capture = await probeHostCatalogs({
    origin: parsed.origin,
    env: input.env,
    fetchImpl: input.fetchImpl,
  });
  return {
    status: 200,
    body: inventoryFromCapture(
      capture,
      base,
      input.at ?? new Date().toISOString(),
      input.clock ?? "injected-request-clock",
    ),
  };
}
