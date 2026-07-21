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
