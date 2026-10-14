import { eventPrefixes, EVENT_TTL_SECONDS } from "@/lib/event-range";
import { sha256Hex } from "@/lib/idempotency";
import { bulkGetJson } from "@/lib/kv-bulk";
import { kvList } from "@/lib/kv-retry";
import { r2ReadText } from "@/lib/r2-read";
import type { MetricEvent } from "@/lib/metrics";
import type { Env } from "@/types";

export const CORRECTION_READ_BUDGET = 20_000;
const LIST_LIMIT = 1000;
const LIST_BUDGET = 2000;
const CACHE_PREFIX = "internal/correction-pages/v1/";
// More slots than the 90-day retention window contains 2.8-hour slices.
// Slots rotate, so this derived cache does not become another permanent archive.
const CACHE_SLOTS = 1024;
const CLEANUP_KEY = "internal/correction-page-cleanup.json";

/** One bounded cleanup page per pass; its cursor survives failures/restarts. */
async function pruneCache(bucket: R2Bucket, now: Date): Promise<{ cursor?: string; knownPages?: Set<string> }> {
  const state = await r2ReadText(bucket, CLEANUP_KEY);
  const cursor = state === null ? undefined : (JSON.parse(state) as { cursor?: string }).cursor;
  const page = await bucket.list({ prefix: CACHE_PREFIX, limit: 1000,
    include: ["customMetadata"], ...(cursor ? { cursor } : {}) });
  const expired = page.objects.filter(object => {
    const expires = Number(object.customMetadata?.expires);
    return Number.isFinite(expires) && expires <= now.getTime();
  }).map(object => object.key);
  if (expired.length) await bucket.delete(expired);
  // Only a complete listing from the beginning can establish absence. A
  // cleanup continuation is still partial even when it reaches the last page.
  const removed = new Set(expired);
  return { cursor: page.truncated ? page.cursor : undefined,
    ...(!cursor && !page.truncated ? { knownPages: new Set(page.objects
      .filter(object => !removed.has(object.key)).map(object => object.key)) } : {}) };
}

/** Only classification inputs; never payer, signature, note or other purchase data. */
export type CorrectionEvent = Pick<MetricEvent,
  "kind" | "house" | "channel" | "at" | "item" | "user_agent" | "referrer" | "declared_source">;
interface CachedPage { digest: string; events: CorrectionEvent[] }
export interface CorrectionScan {
  kv_keys_read: number;
  keys_listed: number;
  list_pages: number;
  cached_pages: number;
  complete: boolean;
}
export function correctionScan(): CorrectionScan {
  return { kv_keys_read: 0, keys_listed: 0, list_pages: 0, cached_pages: 0, complete: true };
}

/** KV can return short or empty continuations without changing the key set. */
async function* stableKeyPages(env: Env, now: Date, scan: CorrectionScan) {
  // One extra day covers the key-write/TTL boundary; actual list expiration
  // decides membership. No assumption that event.at equals the key timestamp.
  const prefixes = eventPrefixes(now.getTime() - (EVENT_TTL_SECONDS + 86400) * 1000,
    now.getTime() + 86400 * 1000);
  for (const prefix of prefixes) {
    let cursor: string | undefined;
    let page = 0;
    const pending: KVNamespaceListKey<unknown>[] = [];
    do {
      if (scan.list_pages >= LIST_BUDGET) { scan.complete = false; return; }
      const listed = await kvList(env.COUNTERS, { prefix, limit: LIST_LIMIT, ...(cursor ? { cursor } : {}) });
      scan.list_pages += 1;
      const keys = listed.keys.filter(k => !k.expiration || k.expiration * 1000 > now.getTime());
      scan.keys_listed += keys.length;
      pending.push(...keys);
      cursor = listed.list_complete ? undefined : listed.cursor;
      // Cache boundaries follow the sorted live keys, never an opaque cursor
      // or the provider's page size. At most two pages of keys are buffered.
      while (pending.length >= LIST_LIMIT) {
        yield { prefix, page: page++, keys: pending.splice(0, LIST_LIMIT) };
      }
    } while (cursor);
    // A partial page is stable only after the slice's listing is complete.
    // Hitting the list budget above must not freeze an unfinished tail.
    if (pending.length) yield { prefix, page, keys: pending };
  }
}

/**
 * Event keys are append-only, and their TTL is set by writeEvent. Re-list every
 * retained slice: new, deleted and expired keys change its page fingerprint.
 * Cache INPUTS, not verdicts, so each pass still applies today's classifier.
 * Slice boundaries prevent new traffic from shifting every historical page.
 * Saved pages are also the warm-up checkpoint: a failed invocation can reuse
 * pages already saved, and a later pass spends its read budget further back.
 */
export async function* cachedCorrectionPages(
  env: Env,
  now: Date,
  scan: CorrectionScan,
  readBudget = CORRECTION_READ_BUDGET,
): AsyncGenerator<CorrectionEvent[]> {
  if (!env.CORPUS_R2) throw new Error("Correction cache requires object storage");
  if (!Number.isFinite(readBudget) || readBudget < 0) throw new Error("Invalid correction read budget");
  readBudget = Math.min(CORRECTION_READ_BUDGET, Math.floor(readBudget));
  const cleanup = await pruneCache(env.CORPUS_R2, now);
  // Persist only after pruning succeeds. Keep the R2 binding explicit: this is
  // object storage, outside the KV per-key write-rate/retry contract.
  await env.CORPUS_R2.put(CLEANUP_KEY, JSON.stringify({ cursor: cleanup.cursor }));
  for await (const { prefix, page, keys } of stableKeyPages(env, now, scan)) {
    const cacheKey = `${CACHE_PREFIX}${Number(prefix.slice(4)) % CACHE_SLOTS}/${page}`;
    // Names and expiration, never the opaque list cursor. The full prefix is
    // in every name, so a rotated slot cannot reuse another slice's data.
    const digest = await sha256Hex(JSON.stringify(keys.map(k => [k.name, k.expiration ?? null])));
    // Warm-up can have hundreds of missing pages. Reuse the cleanup's
    // complete inventory instead of paying a storage round-trip per miss.
    const raw = cleanup.knownPages && !cleanup.knownPages.has(cacheKey)
      ? null : await r2ReadText(env.CORPUS_R2, cacheKey);
    const cached = raw === null ? null : JSON.parse(raw) as CachedPage;
    if (cached?.digest === digest && Array.isArray(cached.events)) {
      scan.cached_pages += 1;
      yield cached.events;
      continue;
    }
    if (scan.kv_keys_read + keys.length > readBudget) {
      scan.complete = false;
      // Keep visiting cached pages; an uncached busy slice must not hide
      // history we can already read without spending the KV value budget.
      continue;
    }
    scan.kv_keys_read += keys.length;
    const values = await bulkGetJson<MetricEvent>(env.COUNTERS, keys.map(k => k.name));
    const events: CorrectionEvent[] = [];
    let readable = true;
    for (const key of keys) {
      const event = values.get(key.name);
      if (!event) { readable = false; continue; }
      if (event.kind !== "challenge" || event.house) continue;
      const { kind, house, channel, at, item, user_agent, referrer, declared_source } = event;
      events.push({ kind, house, channel, at, item, user_agent, referrer, declared_source });
    }
    // A listed but unreadable row may be propagation delay or corruption.
    // Never freeze that omission in a cache or call that pass complete.
    if (readable) await env.CORPUS_R2.put(cacheKey, JSON.stringify({ digest, events } satisfies CachedPage), {
      customMetadata: { expires: String(Math.max(...keys.map(k => k.expiration
        ? k.expiration * 1000 : now.getTime() + EVENT_TTL_SECONDS * 1000))) },
    });
    else scan.complete = false;
    yield events;
  }
}
