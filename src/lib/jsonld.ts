/**
 * One place that turns a schema.org node into markup.
 *
 * THE ESCAPE IS THE WHOLE POINT. A JSON-LD block is inert data, but
 * only until a `</script>` sequence appears inside a string value and
 * ends the block early — after which the rest of the node is parsed
 * as page content. Every value we publish is derived from our own
 * copy and counts, so nothing here is attacker-controlled today; the
 * escape is what keeps that true the day a node starts carrying a
 * field somebody else wrote (a host name, an operator's own words).
 *
 * It lives in lib rather than in each route because the storefront
 * and /what each grew their own copy of this escape and the two
 * Dataset nodes grew without one — the same divergence that produces
 * one page carrying a subtly different contract from the next. One
 * helper, one behaviour, and a node added next month inherits it
 * without anybody remembering.
 */

/** The escaped JSON body, for callers that own their own <script> tag. */
export function jsonLdBody(node: unknown): string {
  return JSON.stringify(node).replace(/</g, "\\u003c");
}

/** The whole block: escaped body inside an inert application/ld+json tag. */
export function jsonLdScript(node: unknown): string {
  return `<script type="application/ld+json">${jsonLdBody(node)}</script>`;
}
