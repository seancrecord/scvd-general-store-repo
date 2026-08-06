/**
 * Input scrubbing for anything a visitor writes on our walls.
 * Friendly but firm: strip markup, cap length, keep the register human.
 */

export const GUESTBOOK_MESSAGE_CAP = 500;
export const NAME_CAP = 80;

/**
 * THE MOJIBAKE SCRUB, and why it is its own step rather than one more
 * line inside sanitizeText.
 *
 * A visitor signed the wall with a character that reached us as broken
 * bytes, and the entry stored — and rendered, for days — as "Testing
 * every shelf [U+FFFD] verifying the store works". U+FFFD is what a
 * decoder writes when it gives up on a byte sequence: it carries no
 * meaning, it cannot be decoded back into whatever was meant, and on a
 * wall of hand-signed messages it reads as OUR store being broken
 * rather than as somebody's encoding being off.
 *
 * It is dropped, never guessed at. Substituting a dash would be
 * inventing a character nobody typed, on the one page whose whole claim
 * is that it publishes what people actually wrote. LONE surrogates go
 * with it — same accident, different shape — and only lone ones: a
 * matched pair is an ordinary emoji, and half this store's visitors
 * sign with one.
 *
 * Exported on its own because it has to run twice — on the way IN so
 * nothing new lands mangled, and on the way OUT because the entries
 * written before this existed are already on the wall, and no amount of
 * input hygiene reaches back for them.
 */
export function scrubBrokenText(input: string): string {
  return input
    .replace(/[\uFFFD\uFFFE\uFFFF]/g, "")
    .replace(
      /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g,
      "",
    )
    .replace(/\s+/g, " ")
    .trim();
}

export function sanitizeText(input: unknown, maxLength: number): string {
  if (typeof input !== "string") {
    return "";
  }
  return scrubBrokenText(input)
    .replace(/<[^>]*>/g, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

/** Escape for safe interpolation into HTML and SVG documents. */
export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function isValidHttpUrl(input: unknown): input is string {
  if (typeof input !== "string" || input.length > 2048) {
    return false;
  }
  try {
    const url = new URL(input);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

/**
 * TURN THE STORE'S OWN URLS INTO LINKS, after escaping.
 *
 * Several rooms print absolute scvd.store URLs mid-sentence — the
 * identity answers on /what most of all, where nearly every clause
 * ends in one. Set as plain prose they were indistinguishable from
 * the words around them: no underline, no colour, nothing to click,
 * on exactly the pages whose job is telling a reader where to go
 * next. Found by CV, shooting the real pages rather than reading the
 * markup.
 *
 * ESCAPE FIRST, THEN MARK UP — the same order as every other helper
 * here, and the reason this is a function rather than a regex written
 * at four call sites. The input is already-escaped text; the pattern
 * matches only this store's own origin, so nothing a buyer wrote can
 * become a link to anywhere.
 */
export function linkStoreUrls(escaped: string): string {
  return escaped.replace(
    /https:\/\/scvd\.store(\/[^\s,;)<]*[^\s,.;)<])?/g,
    (match) => `<a href="${match}"><code>${match}</code></a>`,
  );
}
