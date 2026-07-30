import { listKeys } from "@/lib/kv-list";
import { bulkGetJson } from "@/lib/kv-bulk";
import { KV_KEYS } from "@/lib/kv-keys";
import { ALMANAC_ENTRIES } from "@/store/almanac";
import type { AlmanacEntry, Env } from "@/types";

/**
 * THE ALMANAC, WRITABLE FROM THE OFFICE.
 *
 * Pages used to be TypeScript modules compiled into the Worker, which
 * meant the single highest-leverage thing this store can do — write
 * another journal entry — was gated behind a git commit. On 2026-07-30
 * the store's first sale to a stranger was an almanac page, and the
 * keeper asked the obvious question: why can I not do this from admin.
 *
 * No good answer. It is his own standing rule from the same day —
 * everything should be visible AND MANAGEABLE from the office — and the
 * almanac was the one shelf he could not restock without a laptop.
 *
 * SO ENTRIES NOW COME FROM TWO PLACES and this module is the only thing
 * that knows it: the seed pages compiled in, and keeper pages written
 * from the office and kept in KV. A KV page with the same slug as a
 * compiled one WINS, so an entry can be corrected from the office
 * without a deploy — which is the whole point.
 *
 * THE VOICE RULE IS UNCHANGED AND UNCHANGEABLE HERE. The almanac's own
 * content rule says the keeper's voice is non-delegable: the machine
 * structures, never invents. This module moves where the words are
 * STORED. It has no opinion about the words, and nothing in this store
 * writes them but him.
 */

const KEEPER_ENTRY_CAP = 200;

function isEntry(value: unknown): value is AlmanacEntry {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const entry = value as Record<string, unknown>;
  return (
    typeof entry["slug"] === "string" &&
    typeof entry["title"] === "string" &&
    typeof entry["date"] === "string" &&
    typeof entry["teaser"] === "string" &&
    typeof entry["markdown"] === "string"
  );
}

/** Pages written from the office. Newest first. */
export async function listKeeperEntries(env: Env): Promise<AlmanacEntry[]> {
  const listed = await listKeys(env.ORDERS, {
    prefix: KV_KEYS.almanacEntryPrefix,
    cap: KEEPER_ENTRY_CAP,
  });
  const values = await bulkGetJson<AlmanacEntry>(env.ORDERS, listed.names);
  const entries: AlmanacEntry[] = [];
  for (const name of listed.names) {
    const value = values.get(name);
    if (isEntry(value)) {
      entries.push(value);
    }
  }
  return entries.sort((a, b) => b.date.localeCompare(a.date));
}

/**
 * Every page, both sources, newest first. A keeper page overrides a
 * compiled page of the same slug — corrections without a deploy.
 */
export async function listAlmanacEntries(env: Env): Promise<AlmanacEntry[]> {
  const keeper = await listKeeperEntries(env).catch(() => []);
  const bySlug = new Map<string, AlmanacEntry>();
  for (const entry of ALMANAC_ENTRIES) {
    bySlug.set(entry.slug, entry);
  }
  for (const entry of keeper) {
    bySlug.set(entry.slug, entry);
  }
  return [...bySlug.values()].sort((a, b) => b.date.localeCompare(a.date));
}

export async function findAlmanacEntry(
  env: Env,
  slug: string,
): Promise<AlmanacEntry | undefined> {
  const keeper = await env.ORDERS.get<AlmanacEntry>(
    KV_KEYS.almanacEntry(slug),
    "json",
  ).catch(() => null);
  if (keeper && isEntry(keeper)) {
    return keeper;
  }
  return ALMANAC_ENTRIES.find((entry) => entry.slug === slug);
}

/** Lowercase, hyphens, nothing else. The slug is a URL and a KV key. */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export interface SaveResult {
  saved?: AlmanacEntry;
  refused?: string;
}

export const ALMANAC_MARKDOWN_CAP = 40_000;

/**
 * Write a page. Refuses rather than mangles: a page that silently lost
 * its body would be worse than one that never saved, and the keeper is
 * the only author this shelf has.
 */
export async function saveAlmanacEntry(
  env: Env,
  input: { title: string; date: string; teaser: string; markdown: string },
): Promise<SaveResult> {
  const title = input.title.trim();
  const markdown = input.markdown.trim();
  const teaser = input.teaser.trim();
  const date = input.date.trim();
  if (!title) {
    return { refused: "A page needs a title." };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return {
      refused:
        "The date must be YYYY-MM-DD. It is the day the entry is ABOUT, not the day it goes up.",
    };
  }
  if (!teaser) {
    return { refused: "A page needs a teaser: the one free line on the index." };
  }
  if (!markdown) {
    return { refused: "Nothing to save. The page body is empty." };
  }
  if (markdown.length > ALMANAC_MARKDOWN_CAP) {
    return {
      refused: `That page runs past the ledger margin: ${ALMANAC_MARKDOWN_CAP} characters, tops.`,
    };
  }
  const slug = slugify(title);
  if (!slug) {
    return { refused: "That title makes no usable slug. Try words." };
  }
  const entry: AlmanacEntry = { slug, title, date, teaser, markdown };
  await env.ORDERS.put(KV_KEYS.almanacEntry(slug), JSON.stringify(entry));
  return { saved: entry };
}

/** Pull a keeper page. A compiled page cannot be deleted from here. */
export async function removeAlmanacEntry(
  env: Env,
  slug: string,
): Promise<void> {
  await env.ORDERS.delete(KV_KEYS.almanacEntry(slug));
}
