/**
 * Input scrubbing for anything a visitor writes on our walls.
 * Friendly but firm: strip markup, cap length, keep the register human.
 */

export const GUESTBOOK_MESSAGE_CAP = 500;
export const NAME_CAP = 80;

export function sanitizeText(input: unknown, maxLength: number): string {
  if (typeof input !== "string") {
    return "";
  }
  return input
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
