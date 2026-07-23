/**
 * The store's favicon: a small friendly dinosaur on shop paper.
 * Nobody explains the dinosaur. The SVG is the primary; the .ico
 * fallback is the same drawing at 32px, one PNG entry in a minimal
 * ICO wrapper, for clients that only ever ask for /favicon.ico.
 * Palette is the artifact family: paper, ink, and a warm green.
 */

export const FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <circle cx="50" cy="50" r="48" fill="#f4ead8"/>
  <path d="M19 66 Q4 62 7 48 Q16 57 27 56 Z" fill="#4c8a3f"/>
  <ellipse cx="43" cy="64" rx="23" ry="15" fill="#4c8a3f"/>
  <rect x="29" y="72" width="9" height="14" rx="4.5" fill="#4c8a3f"/>
  <rect x="47" y="72" width="9" height="14" rx="4.5" fill="#4c8a3f"/>
  <path d="M53 60 Q56 34 64 24 L79 33 Q70 42 67 62 Z" fill="#4c8a3f"/>
  <ellipse cx="71" cy="26" rx="11.5" ry="9" fill="#4c8a3f"/>
  <circle cx="75" cy="24" r="2.5" fill="#3b2f23"/>
  <path d="M81 29 Q77.5 32.5 73 31.5" stroke="#3b2f23" stroke-width="1.8" fill="none" stroke-linecap="round"/>
  <ellipse cx="43" cy="68" rx="14" ry="8.5" fill="#a8c98b"/>
  <circle cx="36" cy="53" r="2.6" fill="#a8c98b"/>
  <circle cx="46" cy="51" r="2.6" fill="#a8c98b"/>
</svg>`;

/** 486 bytes: one 32x32 PNG inside an ICO header. Generated from FAVICON_SVG. */
const FAVICON_ICO_BASE64 =
  "AAABAAEAICAAAAEAIADQAQAAFgAAAIlQTkcNChoKAAAADUlIRFIAAAAgAAAAIAQDAAAAgVRnxwAAADBQTFRFTGlx7ebS9OrY9OrY9OrW9OrY9OrY9OrYTIo/9OrYpsSMbZ5cW5NMyNCvhrBxRmU0NrYARwAAAAh0Uk5TAO1TPB7GpHsTA6GvAAAACXBIWXMAAAsTAAALEwEAmpwYAAABMklEQVQokWWSP08CQRDFH/KnJlZubDAmJnTGxILOxoLOwsaO+E3sJoiQBZrHKYkdrkh9RmN9GkLtFfcF/AQ2RjPLbSAy3ftldubNzAI+Skf7J1iLA0Pay5Xeo4/toE+Xmjxf6qIJwB560MjlnTMD3yBPsIm0rbYq5wmR9L7TMwD1HNwq6AMIJSOR39QCW6HFjvR+yBoqAUxEHsgWCgHEck2yimYAIjckhytbIs8kB6inairLRr4E+6gvDEdvyeNcRA300Yg/sniRiEhHXw7QnEgeXQVDFHZFZOFmsbQVVFHhNO4452ZypaCl1idd55xL3hXUgAtGHviu1o9v4y/npr6Ejl8mo87Lq3dBXVDJcCzZp3fhV4gGx2IiHZV+ySga+0R7vzrDxqGA43+n3Dz2+nf4A/D42oEcJLn9AAAAAElFTkSuQmCC";

export function faviconIcoBytes(): Uint8Array<ArrayBuffer> {
  const raw = atob(FAVICON_ICO_BASE64);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let index = 0; index < raw.length; index += 1) {
    bytes[index] = raw.charCodeAt(index);
  }
  return bytes;
}
