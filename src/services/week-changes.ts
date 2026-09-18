import { KV_KEYS, currentWeekKey, weekKeyMonday } from "@/lib/kv-keys";
import { kvGetJson, kvPut } from "@/lib/kv-retry";
import type { Env } from "@/types";

/**
 * WHAT CHANGED AT OUR OWN DOOR THIS WEEK (2026-09-18, the keeper's
 * call). The fix of the week used to be his pen and nothing else, and
 * there was nowhere on the desk to hold it. His ruling: derive it
 * from the week's merged pull requests instead. Every change to this
 * store's doors lands as a pull request with a title in the house
 * voice, and a seller reading the issue gets the list of what we
 * changed on our own till that week, dated, each one a thing they
 * can copy on Monday.
 *
 * READ FROM GITHUB, PUBLIC, UNAUTHENTICATED. The repository is
 * public, so the pulls endpoint answers without a token; a token in
 * GITHUB_READ_TOKEN lifts the rate limit when one is set. A read
 * that fails is reported as NOT READ (rule 52), never as a week with
 * no changes, and a read that succeeds is kept in KV so the desk and
 * the Monday press do not ask GitHub twice for a closed week.
 *
 * WHAT IS LEFT OUT. Pull requests by bots (dependency bumps, the
 * skill-record automation) and anything merged outside the ISO week.
 * Nothing about the reviewer, the branch or the diff: the title and
 * the day are the whole row.
 */

export const STORE_REPOSITORY = "seancrecord/scvd-general-store-repo";
const PULLS_URL = `https://api.github.com/repos/${STORE_REPOSITORY}/pulls?state=closed&base=main&sort=updated&direction=desc&per_page=100`;
const FETCH_TIMEOUT_MS = 10_000;
export const WEEK_CHANGES_CAP = 20;
/** An open week's read is re-taken after this long; a closed week's is kept. */
const OPEN_WEEK_TTL_MS = 6 * 60 * 60 * 1000;

export interface WeekChange {
  number: number;
  title: string;
  /** YYYY-MM-DD, UTC, the day it merged. */
  merged_on: string;
  url: string;
}

export interface WeekChanges {
  week: string;
  /** False when GitHub did not answer: the rows are then absent, not empty. */
  read: boolean;
  read_at: string;
  rows: WeekChange[];
  /** True when more than WEEK_CHANGES_CAP merged that week; the newest are kept. */
  truncated: boolean;
}

export type PullsFetcher = (url: string, headers: Record<string, string>) => Promise<unknown | null>;

async function fetchPulls(url: string, headers: Record<string, string>): Promise<unknown | null> {
  try {
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

/** [Monday 00:00Z, next Monday 00:00Z) of an ISO week. */
export function weekBounds(week: string): { start: Date; end: Date } {
  const start = weekKeyMonday(week);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 7);
  return { start, end };
}

function isBot(login: string | undefined, type: string | undefined): boolean {
  return type === "Bot" || (login ?? "").endsWith("[bot]");
}

/** The merged pull requests of one ISO week, read live. Null when GitHub did not answer. */
export async function readWeekChanges(
  env: Env,
  week: string,
  fetchImpl: PullsFetcher = fetchPulls,
): Promise<WeekChanges | null> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": `scvd.store open-for-business (+${env.STORE_BASE_URL})`,
  };
  if (env.GITHUB_READ_TOKEN) headers["Authorization"] = `Bearer ${env.GITHUB_READ_TOKEN}`;
  const body = await fetchImpl(PULLS_URL, headers);
  if (!Array.isArray(body)) return null;
  const { start, end } = weekBounds(week);
  const rows: WeekChange[] = [];
  for (const item of body) {
    if (typeof item !== "object" || item === null) continue;
    const pull = item as Record<string, unknown>;
    const mergedAt = typeof pull["merged_at"] === "string" ? pull["merged_at"] : null;
    if (!mergedAt) continue;
    const merged = new Date(mergedAt);
    if (Number.isNaN(merged.getTime()) || merged < start || merged >= end) continue;
    const user = typeof pull["user"] === "object" && pull["user"] !== null ? (pull["user"] as Record<string, unknown>) : {};
    if (isBot(typeof user["login"] === "string" ? user["login"] : undefined, typeof user["type"] === "string" ? user["type"] : undefined)) continue;
    if (typeof pull["number"] !== "number" || typeof pull["title"] !== "string" || typeof pull["html_url"] !== "string") continue;
    rows.push({ number: pull["number"], title: pull["title"].trim(), merged_on: mergedAt.slice(0, 10), url: pull["html_url"] });
  }
  rows.sort((a, b) => b.merged_on.localeCompare(a.merged_on) || b.number - a.number);
  return {
    week,
    read: true,
    read_at: new Date().toISOString(),
    rows: rows.slice(0, WEEK_CHANGES_CAP),
    truncated: rows.length > WEEK_CHANGES_CAP,
  };
}

/**
 * The week's changes, from KV when a fresh enough read is held, else
 * read now and kept. A failed read is returned as `read: false` with
 * no rows and is NOT kept, so the next asker tries again.
 */
export async function weekChanges(
  env: Env,
  week: string,
  now: Date = new Date(),
  fetchImpl: PullsFetcher = fetchPulls,
): Promise<WeekChanges> {
  const held = await kvGetJson<WeekChanges>(env.COUNTERS, KV_KEYS.weekChanges(week), "json").catch(() => null);
  if (held && held.read) {
    const closed = week !== currentWeekKey(now) && weekBounds(week).end <= now;
    const fresh = now.getTime() - new Date(held.read_at).getTime() < OPEN_WEEK_TTL_MS;
    if (closed || fresh) return held;
  }
  const read = await readWeekChanges(env, week, fetchImpl);
  if (!read) return { week, read: false, read_at: now.toISOString(), rows: [], truncated: false };
  await kvPut(env.COUNTERS, KV_KEYS.weekChanges(week), JSON.stringify(read)).catch(() => undefined);
  return read;
}

/**
 * The section as markdown, in the voice the issue uses everywhere
 * else: a lead that says what the list is, one dated line per change,
 * and the honest line when the read failed or the week was quiet.
 */
export function renderWeekChangesMarkdown(changes: WeekChanges): string {
  if (!changes.read) {
    return "_The week's changes were not read: GitHub did not answer when this draft was laid. The list is at the store's repository, merged pull requests, this week._";
  }
  if (changes.rows.length === 0) {
    return "Nothing changed at our own door this week. A quiet week on our side is a fact about us, and it is printed rather than padded.";
  }
  const lines = [
    "What we changed at our own till this week, dated, each one a thing a seller can copy on Monday. The list is the store's merged pull requests for the week, titles as written; the diffs are public.",
    "",
    ...changes.rows.map((row) => `- ${row.merged_on} — ${row.title} ([#${row.number}](${row.url}))`),
  ];
  if (changes.truncated) lines.push("", `_More than ${WEEK_CHANGES_CAP} merged this week; the newest ${WEEK_CHANGES_CAP} are listed._`);
  return lines.join("\n");
}
