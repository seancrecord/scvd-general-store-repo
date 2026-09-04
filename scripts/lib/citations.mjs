/**
 * THE CITATION WATCH, as pure functions (2026-09-03).
 *
 * /scorers names seats, not occupants: a system that consumes the
 * corpus is listed only from src/store/citing-systems.json, with the
 * URL of the page that cites us and the date it was first seen. This
 * module is the check attached to that claim. citationsOn() finds the
 * store's verify and corpus URLs in a page's text; judge() turns a
 * fetched page into a verdict per listed system. No network here —
 * the CLI fetches and this stays testable.
 */

/**
 * The artifact ids the store itself publishes in its own listings and
 * descriptions (the sample certificate every discovery entry and the
 * MCP server card carry). A directory that mirrors our text shows it;
 * that is our words on their page, not a citation (listing fact 4).
 * test/citation-watch.spec.ts holds this to src/store/spec.ts.
 */
export const RETIRED_EXAMPLE_IDS = ["cert_k2m9v4xwqp"];
export const SELF_PUBLISHED_IDS = ["cert_4dww28dx5j", ...RETIRED_EXAMPLE_IDS];

/**
 * Every URL shape that counts as citing a ROW of the corpus — a verify
 * URL, a numbered entry, a host history, a round — or the cite shape.
 * Tightened 2026-09-04: the bare index (/corpus, /corpus.json) and the
 * moving views (latest, diff, tiers) no longer count, because a page
 * that says "read the corpus at scvd.store/corpus" is quoting our own
 * README, and the first pass over the outreach register found seven
 * such echoes and called them citations.
 */
export function citationPatterns(base) {
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
function selfPublished(url) {
  return SELF_PUBLISHED_IDS.some((id) => url.endsWith(`/api/verify/${id}`));
}

/** The distinct citing URLs found in a page, in order of first sight. */
export function citationsOn(text, base) {
  const seen = new Set();
  for (const pattern of citationPatterns(base)) {
    for (const match of String(text).matchAll(pattern)) {
      if (!selfPublished(match[0])) seen.add(match[0]);
    }
  }
  return [...seen];
}

/**
 * One verdict per listed system. `fetched` is what the CLI saw:
 * { status, text } or { error }. A system whose page carries no
 * citation is `gone`; a page that could not be read is `unreadable`,
 * which is not a finding about the citation and says so.
 */
export function judge(system, fetched) {
  if (!fetched || fetched.error) {
    return { name: system.name, cites_at: system.cites_at, since: system.since, verdict: "unreadable", reason: String(fetched?.error ?? "no response"), citations: [] };
  }
  if (fetched.status !== 200) {
    return { name: system.name, cites_at: system.cites_at, since: system.since, verdict: "unreadable", reason: `HTTP ${fetched.status}`, citations: [] };
  }
  const citations = citationsOn(fetched.text, system.base ?? "https://scvd.store");
  return {
    name: system.name,
    cites_at: system.cites_at,
    since: system.since,
    verdict: citations.length > 0 ? "cited" : "gone",
    citations,
  };
}

/** The exit code the CLI should use: any `gone` is a failure. */
export function exitCodeFor(verdicts) {
  return verdicts.some((entry) => entry.verdict === "gone") ? 1 : 0;
}
