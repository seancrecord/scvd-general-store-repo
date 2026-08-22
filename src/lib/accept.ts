/**
 * ACCEPT HEADER CONTENT NEGOTIATION, PARSED RATHER THAN GUESSED AT.
 *
 * The store has served markdown from /menu.json and /menu/{id} since
 * the catalog shipped, and it decided whether to by asking whether the
 * Accept header CONTAINED the string "text/markdown". That is the one
 * thing the acceptmarkdown.com convention names as the common mistake,
 * and it is wrong in both directions:
 *
 *   Accept: text/html, text/markdown;q=0.1   → substring says markdown,
 *   the client says it would much rather have HTML.
 *
 *   Accept: a bare `text` wildcard            → substring says no, but a
 *   wildcard the store can satisfy is a yes.
 *
 * So: parse into (type, q), sort by q descending, break ties by
 * specificity (a concrete type beats a type wildcard beats the full
 * wildcard), and pick
 * the best representation actually on offer. RFC 9110 §12.5.1 rules,
 * RFC 7763's text/markdown media type.
 *
 * THE VARY HEADER IS NOT OPTIONAL, and the reason is a cache, not a
 * checklist: this store sits behind a CDN, and two clients asking the
 * same URL for different media types will be served whichever variant
 * landed in the cache first unless the response says what it varied
 * on. An agent asking for markdown and getting a cached page of HTML
 * is the exact failure the convention exists to prevent.
 */

export const MARKDOWN_MEDIA_TYPE = "text/markdown; charset=utf-8";

/** What a negotiated response must send so a CDN keeps variants apart. */
export const VARY_ACCEPT = "Accept, Accept-Encoding";

interface AcceptEntry {
  type: string;
  subtype: string;
  q: number;
  /** 2 = a concrete type, 1 = a type wildcard, 0 = the full wildcard. */
  specificity: number;
  /** Original order, so an otherwise exact tie is stable. */
  index: number;
}

function parseAccept(header: string | undefined | null): AcceptEntry[] {
  if (!header) return [];
  const entries: AcceptEntry[] = [];
  header.split(",").forEach((raw, index) => {
    const parts = raw.trim().split(";");
    const media = (parts.shift() ?? "").trim().toLowerCase();
    if (!media) return;
    const [type = "", subtype = ""] = media.split("/");
    if (!type || !subtype) return;
    let q = 1;
    for (const parameter of parts) {
      const [name, value] = parameter.split("=");
      if ((name ?? "").trim().toLowerCase() === "q") {
        const parsed = Number.parseFloat((value ?? "").trim());
        // A malformed q is not a zero — it is a client that did not
        // manage to express a preference, so the default stands.
        if (Number.isFinite(parsed)) q = Math.min(Math.max(parsed, 0), 1);
      }
    }
    const specificity = type === "*" ? 0 : subtype === "*" ? 1 : 2;
    entries.push({ type, subtype, q, specificity, index });
  });
  return entries.sort(
    (a, b) =>
      b.q - a.q || b.specificity - a.specificity || a.index - b.index,
  );
}

function matches(entry: AcceptEntry, media: string): boolean {
  const [type = "", subtype = ""] = media.toLowerCase().split("/");
  if (entry.type === "*") return true;
  if (entry.type !== type) return false;
  return entry.subtype === "*" || entry.subtype === subtype;
}

/**
 * The best of `offered` for this Accept header, or null when the
 * client ranked everything we have at q=0.
 *
 * `offered` is in the store's OWN preference order, which settles the
 * case a client leaves open (`*​/*`, or no header at all): the first
 * entry wins, so callers list their default representation first.
 */
export function negotiate(
  header: string | undefined | null,
  offered: readonly string[],
): string | null {
  if (offered.length === 0) return null;
  const entries = parseAccept(header);
  // No header, or nothing parseable in it, means no preference stated.
  if (entries.length === 0) return offered[0] ?? null;
  for (const entry of entries) {
    if (entry.q === 0) continue;
    const hit = offered.find((media) => matches(entry, media));
    if (hit) return hit;
  }
  /*
   * Everything on offer was either unmentioned or explicitly refused.
   * Returning null lets the caller decide between 406 and its default;
   * the convention warns against reaching for 406 too eagerly, so the
   * store's own routes keep serving their default.
   */
  return null;
}

/**
 * TRUE WHEN THE CLIENT GENUINELY PREFERS MARKDOWN over the HTML or
 * JSON the same URL would otherwise serve. `alternative` is what this
 * route serves by default — pass the media type it really sends, or
 * the ranking is decided against the wrong opponent.
 */
export function prefersMarkdown(
  header: string | undefined | null,
  alternative = "application/json",
): boolean {
  return negotiate(header, [alternative, "text/markdown"]) === "text/markdown";
}
