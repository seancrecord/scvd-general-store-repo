/**
 * THE CITATION WATCH, as pure functions (2026-09-04, in the Worker).
 *
 * /scorers names seats, not occupants: a system that consumes the
 * corpus is listed only from src/store/citing-systems.json, with the
 * URL of the page that cites us and the date it was first seen. This
 * module is the check attached to that claim, and the same check
 * turned outward: a PROSPECT is a page we sent the scorers note to,
 * watched for the day it starts carrying a row. citationsOn() finds
 * the store's verify and corpus URLs in a page's text; judge() turns
 * a fetched page into a verdict. No network here — the cron and the
 * CLI fetch, and this stays testable.
 *
 * scripts/lib/citations.mjs is the same text for node, so the npm
 * script and the CI gate need no TypeScript loader. test/
 * citation-watch.spec.ts holds the two to one answer on one fixture.
 */

export interface CitingSystem {
  name: string;
  /** The page of theirs that carries the citation. */
  cites_at: string;
  /** The date the citation was first seen, YYYY-MM-DD. */
  since: string;
  base?: string;
}

export interface CitationProspect {
  name: string;
  /** The page we expect a citation to appear on, if one ever does. */
  url: string;
  /** The date it was put on the watch, YYYY-MM-DD. */
  noted: string;
}

export type Fetched = { status: number; text: string; error?: undefined } | { error: string; status?: undefined; text?: undefined };

export type CitationVerdict = "cited" | "gone" | "silent" | "unreadable";

export interface CitationJudgement {
  name: string;
  url: string;
  verdict: CitationVerdict;
  reason?: string;
  citations: string[];
}

/** Every URL shape that counts as citing a row of the corpus. */
export function citationPatterns(base: string): RegExp[] {
  const root = base.replace(/\/$/, "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return [
    new RegExp(`${root}/api/verify/[A-Za-z0-9_-]+`, "g"),
    new RegExp(`${root}/corpus(?:/[A-Za-z0-9._:~-]+)*(?:\\.json)?`, "g"),
    // The cite box's own shape, as a machine writes it (services/cite.ts).
    new RegExp(`"cites"\\s*:\\s*"${root}/corpus/[0-9]+\\.json"`, "g"),
  ];
}

/** The distinct citing URLs found in a page, in order of first sight. */
export function citationsOn(text: string, base: string): string[] {
  const seen = new Set<string>();
  for (const pattern of citationPatterns(base)) {
    for (const match of String(text).matchAll(pattern)) {
      seen.add(match[0]);
    }
  }
  return [...seen];
}

/**
 * One verdict per page. A listed system whose page carries no
 * citation is `gone`; a prospect whose page carries none is `silent`,
 * which is the expected state and not a finding. A page that could
 * not be read is `unreadable` either way, and says so.
 */
export function judgePage(
  name: string,
  url: string,
  fetched: Fetched | undefined,
  base: string,
  absent: "gone" | "silent",
): CitationJudgement {
  if (!fetched || fetched.error !== undefined) {
    return { name, url, verdict: "unreadable", reason: String(fetched?.error ?? "no response"), citations: [] };
  }
  if (fetched.status !== 200) {
    return { name, url, verdict: "unreadable", reason: `HTTP ${fetched.status}`, citations: [] };
  }
  const citations = citationsOn(fetched.text, base);
  return { name, url, verdict: citations.length > 0 ? "cited" : absent, citations };
}
