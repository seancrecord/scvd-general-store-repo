import { SAMPLE_ARTIFACT_ID } from "@/store/spec";

/**
 * THE CITATION WATCH, as pure functions (2026-09-04, in the Worker).
 *
 * /scorers names seats, not occupants: a system that consumes the
 * corpus is listed only from src/store/citing-systems.json, with the
 * URL of the page that cites us and the date it was first seen. This
 * module is the check attached to that claim, and the same check
 * turned outward: the OUTREACH REGISTER (registry/scorers-outreach.json)
 * holds every system that scores or lists x402 doors, and the watch
 * reads the pages of the ones we wrote to. citationsOn() finds the
 * store's row URLs in a page's text; judgePage() turns a fetched page
 * into a verdict. No network here — the cron and the CLI fetch, and
 * this stays testable.
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

/**
 * One row of registry/scorers-outreach.json — the keeper's outreach
 * register, and since 2026-09-04 the ONLY hand-kept list of pages this
 * store watches. The Worker reads it; `npm run outreach:check` reads
 * the same file with the same matcher.
 */
export interface OutreachEntry {
  name: string;
  url: string;
  /** The date the keeper says he sent the note, or null. */
  note_sent: string | null;
  /** The date their page was first seen carrying a row, or null. */
  cites_since: string | null;
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

/**
 * The artifact ids the store itself publishes in its own listings,
 * discovery entries and MCP server card. A directory that mirrors our
 * text shows them; that is OUR words on their page, not a citation
 * (listing fact 4 on /scorers: not this store, a mirror of its text,
 * or a page it operates). Derived from the spec, never retyped.
 */
/**
 * Ids we published as examples and have since RETIRED. They belong on
 * the list above for one reason: a directory's copy of our listing
 * does not refresh when ours does.
 *
 * `cert_k2m9v4xwqp` was the placeholder in buyOutputExample until
 * 2026-09-04. It rode the bazaar discovery extension on every 402,
 * the facilitator catalogued it, and x402-list.com renders it 62
 * times on its page for this store right now — against zero
 * occurrences of the live specimen. Discounting only the CURRENT
 * specimen therefore leaves the false positive alive on exactly the
 * page that produced it, for as long as their cache lasts, which is
 * not a length we control.
 *
 * Nothing is lost by discounting a retired one: it was never minted,
 * so a page "citing" it is citing nothing. There is no artifact
 * behind it for anybody to have consumed.
 */
export const RETIRED_EXAMPLE_IDS: readonly string[] = ["cert_k2m9v4xwqp"];

export const SELF_PUBLISHED_IDS: readonly string[] = [
  SAMPLE_ARTIFACT_ID,
  ...RETIRED_EXAMPLE_IDS,
];

/**
 * Every URL shape that counts as citing a ROW of the corpus — a verify
 * URL, a numbered entry, a host history, a round — or the cite shape.
 *
 * TIGHTENED 2026-09-04, and this is the whole point of the change: the
 * bare index (/corpus, /corpus.json) and the moving views (latest,
 * diff, tiers) no longer count. A page that says "read the dated,
 * Bitcoin-anchored corpus, free, at scvd.store/corpus" is quoting this
 * store's own README back at it, which every directory that carries
 * our listing does. The first pass over the outreach register counted
 * seven such echoes as citations; six of the seven were our own
 * sentence and the seventh our own sample certificate. A citation is a
 * page pointing at ONE ROW — the thing a reader can reproduce.
 */
export function citationPatterns(base: string): RegExp[] {
  const root = base.replace(/\/$/, "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return [
    new RegExp(`${root}/api/verify/[A-Za-z0-9_-]+`, "g"),
    new RegExp(`${root}/corpus/[0-9]+\\.json`, "g"),
    new RegExp(`${root}/corpus/host/[A-Za-z0-9.-]+\\.json`, "g"),
    new RegExp(`${root}/corpus/round/[0-9]{4}-W[0-9]{2}(?:\\.json)?`, "g"),
    // The cite box's own shape, as a machine writes it (services/cite.ts).
    new RegExp(`"cites"\\s*:\\s*"${root}/corpus/[0-9]+\\.json"`, "g"),
  ];
}

/** True when a matched URL is one the store itself prints everywhere. */
function selfPublished(url: string): boolean {
  return SELF_PUBLISHED_IDS.some((id) => url.endsWith(`/api/verify/${id}`));
}

/** The distinct citing URLs found in a page, in order of first sight. */
export function citationsOn(text: string, base: string): string[] {
  const seen = new Set<string>();
  for (const pattern of citationPatterns(base)) {
    for (const match of String(text).matchAll(pattern)) {
      if (!selfPublished(match[0])) seen.add(match[0]);
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
