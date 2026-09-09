import { KV_KEYS } from "@/lib/kv-keys";
import { listKeys } from "@/lib/kv-list";
import { boundedKvJson } from "@/lib/kv-bounded-json";
import type { Env } from "@/types";

export const CORPUS_INDEX_PAGE_SIZE = 25;
export const CORPUS_INDEX_RECORD_BYTES = 16 * 1024 * 1024;
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/** Discovery metadata only. Copies in a KV pointer are not a chain verification. */
export async function corpusIndexPage(env: Env, limit = CORPUS_INDEX_PAGE_SIZE, cursor?: string) {
  if (!Number.isInteger(limit) || limit < 1 || limit > CORPUS_INDEX_PAGE_SIZE) throw new Error("invalid_limit");
  const listed = await listKeys(env.COUNTERS, { prefix: KV_KEYS.corpusPrefix, cap: limit, cursor });
  const entries = [];
  let unreadable = 0;
  for (const key of listed.names) {
    const suffix = key.slice(KV_KEYS.corpusPrefix.length);
    const sequence = /^\d{9}$/.test(suffix) ? Number(suffix) : null;
    const read = await boundedKvJson(env.COUNTERS, key, CORPUS_INDEX_RECORD_BYTES);
    const stored = read.status === "readable" && object(read.value) ? read.value : null;
    const meta = stored?.pointer === true ? stored : object(stored?.snapshot) ? stored.snapshot : null;
    const valid = sequence !== null && sequence > 0 && meta?.sequence === sequence &&
      typeof meta.week === "string" && /^\d{4}-W\d{2}$/.test(meta.week) &&
      typeof stored?.digest === "string" && /^[a-f0-9]{64}$/i.test(stored.digest);
    if (!valid) unreadable++;
    entries.push({
      sequence,
      status: valid ? "metadata_available" : read.status === "readable" ? "unreadable" : read.status,
      ...(valid ? { week: meta!.week, digest: stored!.digest } : {}),
      url: sequence && sequence > 0 ? `${env.STORE_BASE_URL}/corpus/${sequence}.json` : null,
    });
  }
  const next = listed.truncated && listed.cursor
    ? `${env.STORE_BASE_URL}/corpus/index.json?limit=${limit}&cursor=${encodeURIComponent(listed.cursor)}` : null;
  return {
    format: "scvd-corpus-index/v1",
    entries, listed: listed.names.length, unreadable,
    has_more: listed.truncated, next,
    page_limit: limit, record_byte_limit: CORPUS_INDEX_RECORD_BYTES,
    r2_bodies_read: false,
    verification: "Not performed. This index reads KV metadata (legacy embedded records are projected); it does not read R2 bodies, verify signatures, chain links or Bitcoin proofs. Fetch and verify each linked snapshot separately.",
    completeness: "Listed keys in this page, including unreadable rows. Follow next until null; has_more with no next is incomplete. KV pagination is not a point-in-time inventory and cannot prove no records were withheld.",
    legacy_index: `${env.STORE_BASE_URL}/corpus.json`,
  };
}
