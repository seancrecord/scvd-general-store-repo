/**
 * The store's favicon: the house tyrannosaur, drawn to match the
 * chocolate T-rex the keeper stamped on the connector logo — chunky
 * silhouette, open toothy jaw, white eye, on the same shop paper the
 * artifact family uses. Nobody explains the dinosaur. The SVG is the
 * primary; the .ico fallback is the same drawing at 32px, one PNG
 * entry in a minimal ICO wrapper, for clients that only ever ask for
 * /favicon.ico.
 */

export const FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <circle cx="50" cy="50" r="48" fill="#f4ead8"/>
  <g fill="#4e2c18">
    <!-- tail, thick and low -->
    <path d="M6 52 Q16 44 28 47 L36 66 Q18 66 8 59 Q3 56 6 52 Z"/>
    <!-- body, big and round -->
    <ellipse cx="44" cy="58" rx="22" ry="16"/>
    <!-- neck, wide -->
    <path d="M46 50 L54 20 L78 24 L68 56 Z"/>
    <!-- skull with snout -->
    <path d="M54 22 Q53 11 64 10 L86 13 Q94 15 93 22 L92 29 L56 33 Z"/>
    <!-- lower jaw, open -->
    <path d="M61 40 L89 36 Q94 38 92 42 Q86 46 73 45 L60 44 Z"/>
    <!-- legs with forward feet -->
    <path d="M33 66 L43 66 L45 85 L53 85 L53 90 L37 90 Z"/>
    <path d="M51 63 L60 63 L64 84 L72 84 L72 89 L55 89 Z"/>
    <!-- tiny arms -->
    <path d="M56 44 q8 -3 11 2 l-2 5 q-5 -4 -9 -3 z"/>
    <path d="M53 51 q7 -2 10 3 l-3 4 q-4 -4 -7 -3 z"/>
  </g>
  <!-- teeth: brown triangles hanging from the skull into the open gap -->
  <g fill="#4e2c18">
    <path d="M66 32.4 L71 32 L68.5 36.4 Z"/>
    <path d="M74 31.7 L79 31.3 L76.5 35.7 Z"/>
    <path d="M82 31 L87 30.6 L84.5 35 Z"/>
    <path d="M89 30.4 L92.5 30.1 L90.7 34 Z"/>
  </g>
  <!-- eye and nostril -->
  <circle cx="66" cy="18" r="3" fill="#f4ead8"/>
  <circle cx="87" cy="17.5" r="1.8" fill="#f4ead8"/>
</svg>`;

/** 1528 bytes: one 32x32 PNG inside an ICO header. Generated from FAVICON_SVG. */
const FAVICON_ICO_BASE64 =
  "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";

export function faviconIcoBytes(): Uint8Array<ArrayBuffer> {
  const raw = atob(FAVICON_ICO_BASE64);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let index = 0; index < raw.length; index += 1) {
    bytes[index] = raw.charCodeAt(index);
  }
  return bytes;
}
