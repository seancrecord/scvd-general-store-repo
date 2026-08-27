import { listKeys } from "@/lib/kv-list";
import { bulkGetJson } from "@/lib/kv-bulk";
import { KV_KEYS } from "@/lib/kv-keys";
import { ALMANAC_ENTRIES } from "@/store/almanac";
import type { AlmanacEntry, Env } from "@/types";
import { kvGetJson, kvPut } from "@/lib/kv-retry";

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
  const keeper = await kvGetJson<AlmanacEntry>(env.ORDERS, 
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
/**
 * THREE OF THE FOUR FIELDS ARE ALREADY IN THE WRITING.
 *
 * Added 2026-07-31 on the keeper's complaint, which was correct and
 * had been true since the form was built: "I have to enter too much
 * shit." Four required boxes to publish a journal entry — title,
 * date, teaser, body — of which only ONE is the writing. The other
 * three are transcription, and a form that charges three transcription
 * taxes on every entry is a form that gets used less than the writing
 * deserves. The almanac is also the only shelf a stranger has ever
 * bought from, so friction here is not a cosmetic complaint.
 *
 * So the body is the only required field now and the rest are
 * derived: the title from the first `# heading`, the teaser from the
 * first line of actual prose, the date from today. Every one can still
 * be typed to override, because the date in particular is often NOT
 * today — it is the day the entry is about, which is exactly the kind
 * of thing a default must not silently decide.
 *
 * IT GUESSES OR IT REFUSES, NEVER BOTH. If the markdown has no
 * heading, that is a refusal naming the missing heading rather than a
 * slug invented from the first few words — a wrong title becomes a
 * permanent URL, and the store has spent a week on the principle that
 * a derived value which quietly guesses is worse than one that stops.
 */
function firstHeading(markdown: string): string {
  const match = /^#\s+(.+)$/m.exec(markdown);
  return match ? (match[1] as string).trim() : "";
}

/**
 * The first line that is prose: not a heading, not the italic
 * standfirst the almanac's own house style opens with, not a bold
 * dateline, not blank. Truncated on a word boundary to the teaser cap.
 */
/**
 * Emphasis markers off both ends, by index rather than by regex.
 * `/^[*_]+|[*_]+$/` retries the trailing branch from every position in
 * a run of stars, which is quadratic on a line an author supplies —
 * and the two slugify functions nearby only escape the same shape
 * because their preceding replace collapses runs to a single
 * character first. This one has no such collapse in front of it.
 */
function trimEmphasis(line: string): string {
  const marker = (ch: string | undefined) => ch === "*" || ch === "_";
  let start = 0;
  let end = line.length;
  while (start < end && marker(line[start])) start += 1;
  while (end > start && marker(line[end - 1])) end -= 1;
  return line.slice(start, end);
}

function firstProseLine(markdown: string): string {
  for (const raw of markdown.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || line.startsWith(">")) {
      continue;
    }
    const bare = trimEmphasis(line).trim();
    // The house dateline — "**2026-07-31, Oak City.**" — is furniture,
    // not the first thing a reader should be sold on.
    if (!bare || /^\d{4}-\d{2}-\d{2}[,.]?\s|^From the Keeper/i.test(bare)) {
      continue;
    }
    if (bare.length <= ALMANAC_TEASER_CAP) {
      return bare;
    }
    const cut = bare.slice(0, ALMANAC_TEASER_CAP);
    const lastSpace = cut.lastIndexOf(" ");
    return `${(lastSpace > 40 ? cut.slice(0, lastSpace) : cut).trim()}…`;
  }
  return "";
}

export const ALMANAC_TEASER_CAP = 200;

export async function saveAlmanacEntry(
  env: Env,
  input: {
    title?: string;
    date?: string;
    teaser?: string;
    markdown: string;
    /**
     * Override for "today", used by tests. No route passes it — the
     * default is the real clock — and it is named as a seam rather
     * than described as the caller owning the clock, which was an
     * overclaim in the first draft of this comment.
     */
    today?: string;
  },
): Promise<SaveResult> {
  const markdown = input.markdown.trim();
  const title = (input.title ?? "").trim() || firstHeading(markdown);
  const teaser = (input.teaser ?? "").trim() || firstProseLine(markdown);
  const date =
    (input.date ?? "").trim() ||
    (input.today ?? new Date().toISOString().slice(0, 10));
  if (!markdown) {
    return { refused: "Nothing to save. The page body is empty." };
  }
  if (!title) {
    return {
      refused:
        "No title given and none found in the page. Either fill the title box, or open the markdown with a `# heading` line and it will be taken from there.",
    };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return {
      refused:
        "The date must be YYYY-MM-DD. It is the day the entry is ABOUT, not the day it goes up.",
    };
  }
  if (!teaser) {
    return {
      refused:
        "No teaser given and no prose line found to take one from. The index shows one free line before the paywall; write a sentence under the heading, or fill the teaser box.",
    };
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
  await kvPut(env.ORDERS, KV_KEYS.almanacEntry(slug), JSON.stringify(entry));
  return { saved: entry };
}

/** Pull a keeper page. A compiled page cannot be deleted from here. */
export async function removeAlmanacEntry(
  env: Env,
  slug: string,
): Promise<void> {
  await env.ORDERS.delete(KV_KEYS.almanacEntry(slug));
}
