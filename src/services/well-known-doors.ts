import { checkProbeTarget } from "@/lib/probe-target";
import { KV_KEYS } from "@/lib/kv-keys";
import { kvGetJson, kvPut } from "@/lib/kv-retry";
import type { Env } from "@/types";

/**
 * A HOST'S OWN DECLARATION OF ITS DOORS (2026-09-04; the keeper:
 * "could we add a way to add apis to walk or somehow pick up doors
 * that arent on bazaar?").
 *
 * The census walks DOORS — a URL that answers a 402 — and never a
 * homepage (the 2026-08-04 lesson). The population register knows
 * 6,367 hosts by NAME, from a directory that lists hostnames; the
 * walk's roster knows ~1,088 doors, from a feed that lists URLs. The
 * 5,279 in between were "listed, not walked" every week, and on
 * 2026-09-04 one of them wrote to ask why the census had not read
 * his twenty-two ready endpoints.
 *
 * So the walk reads the one place a host can declare its own doors:
 * https://{host}/.well-known/x402 — the convention this store serves
 * for itself at the same path — and, one hop only, an A2A agent card
 * at /.well-known/agent.json that points at such a file (cloudpayx.com
 * points at api.cloudpayxagent.xyz that way, which is how its door was
 * found).
 *
 * THE CONSENT LINE, unchanged: a door enters the walk only from a feed
 * or from the host's OWN file, and a file may only declare doors on
 * the host that serves it. A door on some other host is counted as
 * `foreign` and never knocked on — one operator cannot volunteer
 * another. A redirect off-host is unreadable, not followed.
 *
 * RULE 52, every branch: no file is `none`; a file we could not read,
 * parse, or that has moved its shape is `unreadable`; only a readable
 * file listing zero doors is also `none`. None of these is ever
 * written as "this host has no doors" — the round says which.
 */

export const WELL_KNOWN_X402_PATH = "/.well-known/x402";
export const WELL_KNOWN_AGENT_CARD_PATH = "/.well-known/agent.json";
/** Doors one host may add to the roster. A file listing more is capped, and says so. */
export const WELL_KNOWN_DOOR_CAP = 20;
/** Bytes read before a file is unreadable-by-size. */
export const WELL_KNOWN_BODY_CAP = 256 * 1024;
export const WELL_KNOWN_TIMEOUT_MS = 8000;

export type WellKnownVia = "x402" | "agent-card";

export type WellKnownRead =
  | {
      kind: "doors";
      /** The host whose file declared them — the pointer's target on a hop. */
      declaring_host: string;
      doors: string[];
      /** Declared but on another host: counted, never walked. */
      foreign: number;
      /** Refused by the probe-target law (not https, odd port, private). */
      refused: number;
      capped: boolean;
      via: WellKnownVia;
    }
  | { kind: "none"; via: WellKnownVia | "neither" }
  | { kind: "unreadable"; reason: string };

export interface ParsedDoors {
  doors: string[];
  foreign: number;
  refused: number;
  capped: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The URL an item names: a bare string, or `resource`/`url` on an object. */
function itemUrl(item: unknown): string | null {
  if (typeof item === "string") return item;
  if (!isRecord(item)) return null;
  const candidate = item["resource"] ?? item["url"];
  return typeof candidate === "string" ? candidate : null;
}

/**
 * Pure. Turns a parsed well-known body into the doors it declares for
 * `declaringHost`, or says why it cannot. `null` means the body is a
 * readable file that declares nothing.
 */
export function parseWellKnownDoors(
  body: unknown,
  declaringHost: string,
  ownHost: string,
): ParsedDoors | { unreadable: string } {
  if (!isRecord(body)) return { unreadable: "the file is not a JSON object" };
  const resources = body["resources"];
  if (resources === undefined) {
    // A file that exists but carries no `resources` key is the shape
    // having moved under us — unreadable, never "no doors".
    return { unreadable: "the file carries no `resources` field" };
  }
  if (!Array.isArray(resources)) return { unreadable: "`resources` is not an array" };

  const host = declaringHost.toLowerCase();
  const seen = new Set<string>();
  let foreign = 0;
  let refused = 0;
  for (const item of resources) {
    const raw = itemUrl(item);
    if (raw === null) continue;
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      continue;
    }
    if (url.host.toLowerCase() !== host) {
      foreign += 1;
      continue;
    }
    if (!checkProbeTarget(url, ownHost).ok) {
      refused += 1;
      continue;
    }
    seen.add(url.href);
  }
  const all = [...seen];
  return {
    doors: all.slice(0, WELL_KNOWN_DOOR_CAP),
    foreign,
    refused,
    capped: all.length > WELL_KNOWN_DOOR_CAP,
  };
}

/**
 * Where an agent card points for x402 discovery, if anywhere: a
 * top-level `x402Discovery`, or one nested one level down (cloudpayx
 * nests it under a vendor key). One hop; nothing deeper.
 */
export function agentCardDiscoveryPointer(card: unknown): string | null {
  if (!isRecord(card)) return null;
  const top = card["x402Discovery"];
  if (typeof top === "string") return top;
  for (const value of Object.values(card)) {
    if (isRecord(value) && typeof value["x402Discovery"] === "string") {
      return value["x402Discovery"];
    }
  }
  return null;
}

type Fetched = { status: number; text: string; final_host: string } | { error: string };

/** One GET, bounded in time and bytes, and honest about where it landed. */
async function fetchBounded(url: string): Promise<Fetched> {
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json", "user-agent": "scvd-census/1 (+https://scvd.store/coverage)" },
      redirect: "follow",
      signal: AbortSignal.timeout(WELL_KNOWN_TIMEOUT_MS),
    });
    const finalHost = (() => {
      try {
        return new URL(response.url || url).host.toLowerCase();
      } catch {
        return "";
      }
    })();
    const reader = response.body?.getReader();
    if (!reader) return { status: response.status, text: "", final_host: finalHost };
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > WELL_KNOWN_BODY_CAP) {
        await reader.cancel();
        return { error: `body exceeds ${WELL_KNOWN_BODY_CAP} bytes` };
      }
      chunks.push(value);
    }
    const merged = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return { status: response.status, text: new TextDecoder().decode(merged), final_host: finalHost };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

type FileRead =
  | { kind: "doors"; parsed: ParsedDoors; declaring_host: string }
  | { kind: "none" }
  | { kind: "unreadable"; reason: string };

/** Read one x402 file at `url` and hold its doors to the host that served it. */
async function readX402File(url: string, ownHost: string): Promise<FileRead> {
  let expectedHost: string;
  try {
    expectedHost = new URL(url).host.toLowerCase();
  } catch {
    return { kind: "unreadable", reason: `${url} is not a URL` };
  }
  const fetched = await fetchBounded(url);
  if ("error" in fetched) return { kind: "unreadable", reason: fetched.error };
  if (fetched.status === 404) return { kind: "none" };
  if (fetched.status < 200 || fetched.status >= 300) {
    return { kind: "unreadable", reason: `HTTP ${fetched.status}` };
  }
  if (fetched.final_host !== expectedHost) {
    // A redirect off-host would let one host declare doors for another.
    return { kind: "unreadable", reason: `redirected off-host to ${fetched.final_host || "an unreadable location"}` };
  }
  let body: unknown;
  try {
    body = JSON.parse(fetched.text);
  } catch {
    return { kind: "unreadable", reason: "the file is not JSON" };
  }
  const parsed = parseWellKnownDoors(body, expectedHost, ownHost);
  if ("unreadable" in parsed) return { kind: "unreadable", reason: parsed.unreadable };
  if (parsed.doors.length === 0 && parsed.foreign === 0 && parsed.refused === 0) return { kind: "none" };
  return { kind: "doors", parsed, declaring_host: expectedHost };
}

/**
 * The read the sweep runs once per host per week. Tries the host's
 * own x402 file, then its agent card's pointer (one hop). Doors from
 * either are the host's own declaration; anything less is named for
 * what it is.
 */
export async function readWellKnownDoors(host: string, ownHost: string): Promise<WellKnownRead> {
  const target = host.trim().toLowerCase();
  if (target === "" || target === ownHost.toLowerCase()) {
    return { kind: "unreadable", reason: "refused: own host or empty" };
  }

  const direct = await readX402File(`https://${target}${WELL_KNOWN_X402_PATH}`, ownHost);
  if (direct.kind === "doors") {
    return { kind: "doors", declaring_host: direct.declaring_host, ...direct.parsed, via: "x402" };
  }

  // The agent card, one hop. Its pointer names where the host says its
  // doors are declared; that file's own host is the declaring host.
  const card = await fetchBounded(`https://${target}${WELL_KNOWN_AGENT_CARD_PATH}`);
  let hop: FileRead | null = null;
  if (!("error" in card) && card.status >= 200 && card.status < 300 && card.final_host === target) {
    let parsedCard: unknown = null;
    try {
      parsedCard = JSON.parse(card.text);
    } catch {
      parsedCard = null;
    }
    const pointer = agentCardDiscoveryPointer(parsedCard);
    if (pointer !== null) {
      let pointerUrl: URL | null = null;
      try {
        pointerUrl = new URL(pointer);
      } catch {
        pointerUrl = null;
      }
      if (pointerUrl && pointerUrl.protocol === "https:") {
        hop = await readX402File(pointerUrl.href, ownHost);
      }
    }
  }
  if (hop?.kind === "doors") {
    return { kind: "doors", declaring_host: hop.declaring_host, ...hop.parsed, via: "agent-card" };
  }

  // Nothing yielded doors. Say which read failed rather than "none"
  // when a read failed: an unreadable file is not an empty one.
  if (direct.kind === "unreadable") return direct;
  if (hop?.kind === "unreadable") return hop;
  return { kind: "none", via: hop ? "agent-card" : direct.kind === "none" ? "x402" : "neither" };
}

/**
 * THE STORE. One record per host the sweep asked, holding what that
 * host's own file declared. Weekly re-read is the consent cadence; the
 * record carries the week it was last read so a host read by hand
 * (the declare-door route) is not read twice in one week.
 */
export interface WellKnownRecord {
  /** Every door the file declared for its own host, capped. */
  doors: string[];
  /** The host whose file spoke — the pointer's target on a hop. */
  declaring_host: string;
  via: WellKnownVia;
  foreign: number;
  capped: boolean;
  read_week: string;
  read_at: string;
}

export interface WellKnownStore {
  version: 1;
  hosts: Record<string, WellKnownRecord>;
}

/** Hosts the store holds before evicting the longest-unread. */
export const WELL_KNOWN_STORE_CAP = 3000;

export async function readWellKnownStore(env: Env): Promise<WellKnownStore> {
  const stored = await kvGetJson<WellKnownStore>(env.COUNTERS, KV_KEYS.wellKnownDoors, "json");
  if (!stored || typeof stored.hosts !== "object" || stored.hosts === null) return { version: 1, hosts: {} };
  return { version: 1, hosts: stored.hosts };
}

export async function writeWellKnownStore(env: Env, store: WellKnownStore): Promise<void> {
  await kvPut(env.COUNTERS, KV_KEYS.wellKnownDoors, JSON.stringify(store));
}

/** Pure. Record one read; evict the oldest past the cap, deterministically. */
export function recordWellKnownRead(
  store: WellKnownStore,
  host: string,
  read: Extract<WellKnownRead, { kind: "doors" }>,
  week: string,
  at: string,
): { store: WellKnownStore; evicted: number } {
  const hosts = { ...store.hosts };
  hosts[host.toLowerCase()] = {
    doors: read.doors,
    declaring_host: read.declaring_host,
    via: read.via,
    foreign: read.foreign,
    capped: read.capped,
    read_week: week,
    read_at: at,
  };
  const names = Object.keys(hosts);
  let evicted = 0;
  if (names.length > WELL_KNOWN_STORE_CAP) {
    const ranked = names.sort((a, b) => {
      const byAge = hosts[a]!.read_week.localeCompare(hosts[b]!.read_week);
      return byAge !== 0 ? byAge : a.localeCompare(b);
    });
    for (const name of ranked.slice(0, names.length - WELL_KNOWN_STORE_CAP)) {
      delete hosts[name];
      evicted += 1;
    }
  }
  return { store: { version: 1, hosts }, evicted };
}

/**
 * The roster rows the store yields: ONE door per declaring host, the
 * first declared, so the census reads a host once a week the way it
 * does for every other source (the door bank keeps one URL per host
 * for the same reason). The rest stay in the record for the operator
 * to see.
 */
export function rosterDoorsFrom(store: WellKnownStore): { host: string; url: string }[] {
  const byHost = new Map<string, string>();
  for (const record of Object.values(store.hosts)) {
    const door = record.doors[0];
    if (!door) continue;
    if (!byHost.has(record.declaring_host)) byHost.set(record.declaring_host, door);
  }
  return [...byHost.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([host, url]) => ({ host, url }));
}
