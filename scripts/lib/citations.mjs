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

/** Every URL shape that counts as citing a row of the corpus. */
export function citationPatterns(base) {
  const root = base.replace(/\/$/, "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return [
    new RegExp(`${root}/api/verify/[A-Za-z0-9_-]+`, "g"),
    new RegExp(`${root}/corpus(?:/[A-Za-z0-9._:~-]+)*(?:\\.json)?`, "g"),
    // The cite box's own shape, as a machine writes it (services/cite.ts).
    new RegExp(`"cites"\\s*:\\s*"${root}/corpus/[0-9]+\\.json"`, "g"),
  ];
}

/** The distinct citing URLs found in a page, in order of first sight. */
export function citationsOn(text, base) {
  const seen = new Set();
  for (const pattern of citationPatterns(base)) {
    for (const match of String(text).matchAll(pattern)) {
      seen.add(match[0]);
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
