import { listKeys } from "@/lib/kv-list";
import { bulkGetJson } from "@/lib/kv-bulk";
import { KV_KEYS } from "@/lib/kv-keys";
import { kvGetJson, kvPut } from "@/lib/kv-retry";
import type { Env } from "@/types";

/**
 * OPEN FOR BUSINESS, THE SHELF. The issues a seller can buy.
 *
 * The draft is assembled by the instruments (open-for-business.ts)
 * and read on the desk; what is sold is what the keeper PUBLISHED,
 * which is the draft after his pen: cut, corrected, the fix of the
 * week written in. Publishing is a lever on the admin page and a
 * write here; nothing publishes on its own (rule 30). Issues live in
 * KV under one prefix, keyed by ISO week, newest first, the same
 * shape the almanac uses so the shelf can be restocked from a phone.
 *
 * The free line and the number of the week are the only things a
 * stranger sees before paying; both are derived from the issue
 * itself so the index can never promise a sentence the issue does
 * not carry.
 */

export interface OpenForBusinessIssue {
  /** ISO week the issue is about, e.g. 2026-W38. It is the URL and the key. */
  week: string;
  title: string;
  /** The day it went up. */
  date: string;
  /** The one free line on the index. */
  teaser: string;
  /** The number of the week, free on the index, or empty when the issue has none. */
  number_of_the_week: string;
  markdown: string;
}

const ISSUE_CAP = 200;
export const OPEN_FOR_BUSINESS_MARKDOWN_CAP = 80_000;
const TEASER_CAP = 240;
const WEEK = /^\d{4}-W\d{2}$/;

function isIssue(value: unknown): value is OpenForBusinessIssue {
  if (typeof value !== "object" || value === null) return false;
  const issue = value as Record<string, unknown>;
  return (
    typeof issue["week"] === "string" &&
    typeof issue["title"] === "string" &&
    typeof issue["date"] === "string" &&
    typeof issue["teaser"] === "string" &&
    typeof issue["number_of_the_week"] === "string" &&
    typeof issue["markdown"] === "string"
  );
}

export interface OpenForBusinessShelf {
  /** Newest week first. */
  issues: OpenForBusinessIssue[];
  /**
   * WHAT TRUNCATION MEANS HERE (rule 52). The cap is 200 issues, four
   * years of weeklies, so this is not expected to be true in the
   * shelf's lifetime; if it ever is, the list is the newest issues
   * the read reached and NOT the whole shelf, and every index says so
   * rather than presenting a short list as complete. A buyer asking
   * for a week by URL is unaffected: findOpenForBusinessIssue reads
   * one key and never lists.
   */
  truncated: boolean;
}

/** Every published issue the read could see, newest week first, with the honest flag beside it. */
export async function listOpenForBusinessShelf(env: Env): Promise<OpenForBusinessShelf> {
  const listed = await listKeys(env.ORDERS, { prefix: KV_KEYS.openForBusinessIssuePrefix, cap: ISSUE_CAP });
  const values = await bulkGetJson<OpenForBusinessIssue>(env.ORDERS, listed.names);
  const issues: OpenForBusinessIssue[] = [];
  for (const name of listed.names) {
    const value = values.get(name);
    if (isIssue(value)) issues.push(value);
  }
  return { issues: issues.sort((a, b) => b.week.localeCompare(a.week)), truncated: listed.truncated };
}

/** The issues alone, for readers that carry the shelf's `truncated` flag some other way or cannot. */
export async function listOpenForBusinessIssues(env: Env): Promise<OpenForBusinessIssue[]> {
  return (await listOpenForBusinessShelf(env)).issues;
}

export async function findOpenForBusinessIssue(env: Env, week: string): Promise<OpenForBusinessIssue | undefined> {
  if (!WEEK.test(week)) return undefined;
  const issue = await kvGetJson<OpenForBusinessIssue>(env.ORDERS, KV_KEYS.openForBusinessIssue(week), "json").catch(() => null);
  return issue && isIssue(issue) ? issue : undefined;
}

function firstHeading(markdown: string): string {
  const match = /^#\s+(.+)$/m.exec(markdown);
  return match ? (match[1] as string).trim() : "";
}

/** The bold sentence under "The number of the week", if the issue kept one. */
function numberOfTheWeek(markdown: string): string {
  const section = /^## The number of the week\s*\n+([\s\S]*?)(?=\n## |$)/m.exec(markdown);
  if (!section) return "";
  const bold = /\*\*(.+?)\*\*/.exec(section[1] ?? "");
  return bold ? (bold[1] as string).trim() : "";
}

function firstProseLine(markdown: string): string {
  for (const raw of markdown.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || line.startsWith(">") || line.startsWith("|") || line.startsWith("-")) continue;
    const bare = line.replace(/^[*_]+|[*_]+$/g, "").trim();
    if (!bare) continue;
    if (bare.length <= TEASER_CAP) return bare;
    const cut = bare.slice(0, TEASER_CAP);
    const lastSpace = cut.lastIndexOf(" ");
    return `${(lastSpace > 40 ? cut.slice(0, lastSpace) : cut).trim()}…`;
  }
  return "";
}

export interface IssueSaveResult {
  saved?: OpenForBusinessIssue;
  refused?: string;
}

/**
 * Publish one issue. Refuses rather than guesses: a week that is not
 * a week, a body with no heading, or a body with no prose stops here
 * with the words still in the form. The same week again REPLACES the
 * issue, which is how a correction is made without a deploy; a buyer
 * who already paid keeps the markdown prepared for their payment
 * (publication recovery), not the corrected one.
 */
export async function saveOpenForBusinessIssue(
  env: Env,
  input: { week: string; markdown: string; teaser?: string; title?: string; today?: string },
): Promise<IssueSaveResult> {
  const week = input.week.trim().toUpperCase();
  const markdown = input.markdown.trim();
  if (!WEEK.test(week)) return { refused: "The week must be an ISO week like 2026-W38. It is the week the issue is ABOUT." };
  if (!markdown) return { refused: "Nothing to publish. The issue body is empty." };
  if (markdown.length > OPEN_FOR_BUSINESS_MARKDOWN_CAP) {
    return { refused: `That issue runs past the margin: ${OPEN_FOR_BUSINESS_MARKDOWN_CAP} characters, tops.` };
  }
  const title = (input.title ?? "").trim() || firstHeading(markdown);
  if (!title) return { refused: "No title found. Open the issue with a `# heading` line, or fill the title box." };
  const teaser = (input.teaser ?? "").trim() || firstProseLine(markdown);
  if (!teaser) return { refused: "No free line found. Write one sentence of prose under the heading, or fill the teaser box." };
  const issue: OpenForBusinessIssue = {
    week,
    title,
    date: input.today ?? new Date().toISOString().slice(0, 10),
    teaser,
    number_of_the_week: numberOfTheWeek(markdown),
    markdown,
  };
  await kvPut(env.ORDERS, KV_KEYS.openForBusinessIssue(week), JSON.stringify(issue));
  return { saved: issue };
}

export async function removeOpenForBusinessIssue(env: Env, week: string): Promise<void> {
  if (!WEEK.test(week.trim().toUpperCase())) return;
  await env.ORDERS.delete(KV_KEYS.openForBusinessIssue(week.trim().toUpperCase()));
}
