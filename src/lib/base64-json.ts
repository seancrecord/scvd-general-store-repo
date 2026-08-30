/**
 * BASE64 JSON THAT SURVIVES A NON-ASCII CHARACTER.
 *
 * `atob` returns a BINARY STRING — one character per byte — so
 * `JSON.parse(atob(x))` hands back every non-ASCII character as its
 * raw UTF-8 bytes widened into separate code points. An em-dash
 * becomes "â€"", an ellipsis "â€¦". `btoa` has the mirror flaw: it
 * throws outright on any character above U+00FF.
 *
 * WHAT THAT COST, FOUND 2026-08-29 ON THE LIVE STORE. The x402
 * challenge is base64 JSON, and the MCP door decoded it with atob
 * before relaying it to the buyer. So every agent that asked this
 * store what a purchase would cost got the terms with the prose
 * mangled — at the one door where a month of handshakes had produced
 * no purchases at all. The HTTP door was clean only by ACCIDENT: it
 * decoded with atob and re-encoded with btoa, and that round trip is
 * lossless on a binary string, so the corruption cancelled out
 * instead of being fixed. Which is why the two must move together —
 * correcting one half alone makes btoa throw on the first em-dash,
 * and the caller's fail-open catch would drop the store's signed
 * offer without a sound.
 *
 * So: one codec, bytes on both sides, used everywhere base64 JSON
 * crosses this store's boundary.
 */

/** Base64 → UTF-8 → JSON. Throws like JSON.parse; callers decide. */
export function decodeBase64Json(value: string): unknown {
  const binary = atob(value);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

/** JSON → UTF-8 → base64. Never throws on an em-dash. */
export function encodeBase64Json(value: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}
