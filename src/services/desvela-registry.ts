import { bulkGetJson } from "@/lib/kv-bulk";
import { KV_KEYS } from "@/lib/kv-keys";
import { listKeys } from "@/lib/kv-list";
import { kvGet, kvPut } from "@/lib/kv-retry";
import { isRecord, type Env } from "@/types";

export const DESVELA_REGISTRY_USER_AGENT = "Desvela-Registry/0.1 (+https://desvela.dev/bot)";
export const DESVELA_REGISTRY_BODY_LIMIT = 128 * 1024;
const SURFACE_EVENTS = ["surface_appeared", "surface_changed", "surface_gone"];
const ENTRY_EVENTS = ["entry_added", "entry_changed", "entry_gone"];
const KINDS = ["ai_catalog", "llms_txt", "agents_md", "robots_ai"];

export interface DesvelaRegistryPayload extends Record<string, unknown> {
  watch_id: number;
  domain: string;
  events: Record<string, unknown>[];
  observed_at: string;
}
export interface DesvelaRegistryReceipt {
  body_sha256: string;
  received_at: string;
  user_agent_matches: boolean;
  payload: DesvelaRegistryPayload;
  raw_body: string;
}

function utcTimestamp(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value) && Number.isFinite(Date.parse(value));
}

export function isDesvelaRegistryPayload(value: unknown, domain: string): value is DesvelaRegistryPayload {
  if (!isRecord(value) || !Number.isSafeInteger(value.watch_id) || Number(value.watch_id) < 1 ||
      value.domain !== domain || !utcTimestamp(value.observed_at) ||
      !Array.isArray(value.events) || value.events.length === 0) return false;
  return value.events.every((event: unknown) => {
    if (!isRecord(event) || typeof event.type !== "string" || !utcTimestamp(event.at)) return false;
    if (SURFACE_EVENTS.includes(event.type)) {
      return typeof event.kind === "string" && KINDS.includes(event.kind) &&
        (event.status === undefined || typeof event.status === "string") &&
        (event.content_hash === undefined || event.content_hash === null || typeof event.content_hash === "string") &&
        (event.platform_template === undefined || typeof event.platform_template === "boolean");
    }
    return ENTRY_EVENTS.includes(event.type) && typeof event.urn === "string" && event.urn.length > 0;
  });
}

/** Same private KV receipt pattern as the trade counter; no delivery or money path. */
export async function recordDesvelaRegistry(
  env: Env, payload: DesvelaRegistryPayload, raw: Uint8Array<ArrayBuffer>, rawBody: string,
  userAgentMatches: boolean, now = new Date(),
): Promise<string> {
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", raw)), (byte) => byte.toString(16).padStart(2, "0")).join("");
  // A retry of these exact bytes names the same receipt. KV is not a
  // transactional replay guard: concurrent retries may replace receipt
  // metadata, but cannot add another row or trigger an outward action.
  const key = KV_KEYS.desvelaRegistry(digest);
  if (await kvGet(env.ORDERS, key) === null) {
    const receipt: DesvelaRegistryReceipt = {
      body_sha256: digest, received_at: now.toISOString(), user_agent_matches: userAgentMatches,
      payload, raw_body: rawBody,
    };
    await kvPut(env.ORDERS, key, JSON.stringify(receipt));
  }
  return digest;
}

export async function listDesvelaRegistry(env: Env, cursor?: string) {
  const listed = await listKeys(env.ORDERS, { prefix: KV_KEYS.desvelaRegistryPrefix, cap: 100, cursor });
  const receipts = await bulkGetJson<DesvelaRegistryReceipt>(env.ORDERS, listed.names);
  const rows = listed.names.flatMap((name) => receipts.get(name) ? [receipts.get(name)!] : []);
  return {
    what_this_is: "Reports received with a valid Desvela Registry Watch HMAC, kept for the keeper to review. The shared secret authenticates delivery; the observations remain Desvela's claims. Nothing here changes or publishes the store's catalog.",
    ordering: "SHA-256 receipt key order; follow next_cursor for the next page. KV listings may lag recent deliveries.",
    rows, truncated: listed.truncated, next_cursor: listed.cursor ?? null,
    unreadable_rows: listed.names.length - rows.length,
  };
}
