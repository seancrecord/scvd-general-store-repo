/**
 * IS THIS A VALUE, OR IS IT THE HOLE A VALUE GOES IN?
 *
 * Every machine-readable surface this store publishes carries URL
 * TEMPLATES: `/api/verify/{id}`, `/menu/{item_id}`, `/corpus/host/
 * {host}.json`. They are correct as documentation and they are also,
 * to a large and growing class of reader, links — a crawler
 * extracting hrefs, a link checker, an agent handed a page and told
 * to follow what it finds. Those readers fetch the literal string,
 * braces and all.
 *
 * WHAT THEY GET BACK MATTERS MORE HERE THAN ELSEWHERE. A 404 from a
 * VERIFICATION endpoint does not read as "you sent a placeholder". It
 * reads as "that artifact does not exist", which is the single worst
 * thing this store can say by accident: the whole product is that a
 * stranger can check an artifact without asking us, and the endpoint
 * answering "no such thing" to a documentation URL is a false
 * negative about our own goods. The same 404 also costs us on the
 * outside, where a readiness scan counts it as a broken link on the
 * page we most want read.
 *
 * This is the same lesson as the wrong-method 405 and the truncated
 * lookup: silence and refusal are ANSWERS, and an answer that cannot
 * be told apart from a different, worse answer is a defect even when
 * the status code is technically defensible.
 *
 * DELIBERATELY NARROW. It matches a segment that is ENTIRELY a
 * placeholder in one of the three notations this store's own
 * documents use, and nothing else. A real identifier here — a cert
 * id, an item id, a hostname — contains none of these characters at
 * its edges, so no genuine lookup can be swallowed by this check.
 * Widening it to "looks a bit like a placeholder" would be trading a
 * documentation nicety for the ability to mistake a real artifact for
 * a template, which is not a trade worth making.
 */

/** `{id}`, `{cert_id}` — the notation OpenAPI and this store use. */
const BRACED = /^\{[A-Za-z0-9_.-]+\}$/;
/** `<id>` — the notation RFC examples and some READMEs use. */
const ANGLED = /^<[A-Za-z0-9_.-]+>$/;
/** `:id` — the notation a router's own path uses, pasted verbatim. */
const COLONED = /^:[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * True when this path segment is a documentation placeholder rather
 * than something to look up.
 *
 * Percent-encoding is handled because a link checker often sends
 * `%7Bid%7D` — and because a decoder that throws on a malformed
 * escape must not take the request down with it, the decode is
 * guarded and falls back to the raw value.
 */
export function isUrlTemplatePlaceholder(value: string | undefined): boolean {
  if (!value) {
    return false;
  }
  let candidate = value.trim();
  if (candidate.includes("%")) {
    try {
      candidate = decodeURIComponent(candidate).trim();
    } catch {
      // A malformed escape is not a placeholder; it is a bad request,
      // and the route's own handling is the right answer to it.
    }
  }
  /*
   * A trailing extension is part of the template, not part of the
   * name: `/corpus/host/{host}.json` is one placeholder and one
   * suffix, and a reader that fetches it literally sends both.
   */
  const withoutExtension = candidate.replace(/\.[A-Za-z0-9]+$/, "");
  return [candidate, withoutExtension].some(
    (form) => BRACED.test(form) || ANGLED.test(form) || COLONED.test(form),
  );
}
