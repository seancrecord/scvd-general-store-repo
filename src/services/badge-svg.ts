import { inkParamsFromSignature } from "@/lib/ink";
import { escapeHtml } from "@/lib/sanitize";
import { STORE_METADATA } from "@/store";

/**
 * SVG generation for patron badges and the free visitor sticker.
 * Design language: vintage general-store label. Paper, ink, a border
 * that looks set by hand. Not a tech badge.
 */

const PAPER = "#f4ead8";
const INK = "#3b2f23";
const ACCENT = "#8c2f1b";
const FADED = "#7a6a55";

const PATRONAGE_GOLD = "#8c6a1b";

export interface PatronBadgeOptions {
  patronNumber: number;
  date: string;
  verifyUrl: string;
  name?: string;
  /** Certificate of Patronage: gilt number, one extra line. */
  patronage?: boolean;
  /** The certificate's signature seeds the rendering, forever. */
  signature?: string;
}

/** SVG text doesn't wrap; long names get trimmed to fit the label. */
function fitName(name: string, max: number): string {
  return name.length > max ? `${name.slice(0, max - 1)}\u2026` : name;
}

export function renderPatronBadge(options: PatronBadgeOptions): string {
  const ink = inkParamsFromSignature(options.signature);
  const sealRotation = (-8 + ink.rotationDeg).toFixed(2);
  const sealOpacity = (0.92 * ink.inkOpacity).toFixed(3);
  const dateLabel = options.date.slice(0, 10);
  // The label says the town. Oak City, keeper's decision, 2026-07-23.
  const town = STORE_METADATA.location.split(",")[0] ?? "Oak City";
  const sealColor = options.patronage ? PATRONAGE_GOLD : ACCENT;
  const nameLine = options.name
    ? `<text x="200" y="174" text-anchor="middle" font-family="Georgia, serif" font-style="italic" font-size="13.5" fill="${INK}">bestowed upon ${escapeHtml(fitName(options.name, 44))}</text>`
    : "";
  const patronageLine = options.patronage
    ? `<text x="200" y="212" text-anchor="middle" font-family="Georgia, serif" font-style="italic" font-size="11.5" fill="${PATRONAGE_GOLD}">a patron of the store, by choice</text>`
    : "";
  const sevenMark =
    options.patronNumber % 7 === 0
      ? `<text x="30" y="276" text-anchor="middle" font-family="Georgia, serif" font-size="12" fill="${ACCENT}">7</text>`
      : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="400" height="300" viewBox="0 0 400 300" role="img" aria-label="Patron badge no. ${options.patronNumber}">
  <rect width="400" height="300" fill="${PAPER}" rx="10"/>
  <rect x="12" y="12" width="376" height="276" fill="none" stroke="${INK}" stroke-width="2.5" rx="6"/>
  <rect x="19" y="19" width="362" height="262" fill="none" stroke="${INK}" stroke-width="0.75" stroke-dasharray="1 4" stroke-dashoffset="${ink.hairlineOffset}" rx="4"/>
  <text x="200" y="56" text-anchor="middle" font-family="Georgia, serif" font-weight="bold" font-size="20" fill="${INK}">SEAN-CLAUDE VAN DAMME'S</text>
  <text x="200" y="80" text-anchor="middle" font-family="Georgia, serif" font-size="14" letter-spacing="7" fill="${INK}">GENERAL STORE</text>
  <line x1="84" y1="98" x2="316" y2="98" stroke="${INK}" stroke-width="1"/>
  <circle cx="200" cy="98" r="2.5" fill="${ACCENT}"/>
  <text x="200" y="126" text-anchor="middle" font-family="Georgia, serif" font-size="13" fill="${FADED}">This certifies our esteemed</text>
  <text x="200" y="158" text-anchor="middle" font-family="Georgia, serif" font-weight="bold" font-size="29" fill="${sealColor}">PATRON No. ${options.patronNumber}</text>
  ${nameLine}
  <text x="200" y="194" text-anchor="middle" font-family="Georgia, serif" font-size="10.5" letter-spacing="1.5" fill="${FADED}">${escapeHtml(town)} \u2022 ${dateLabel}</text>
  ${patronageLine}
  <g transform="rotate(${sealRotation} 326 218)" opacity="${sealOpacity}">
    <defs><path id="sealArc" d="M 326 186 a 32 32 0 1 1 -0.01 0"/></defs>
    <circle cx="326" cy="218" r="44" fill="none" stroke="${sealColor}" stroke-width="2.5" stroke-dasharray="2 3"/>
    <circle cx="326" cy="218" r="38" fill="none" stroke="${sealColor}" stroke-width="1.2"/>
    <text font-family="Georgia, serif" font-size="6.2" letter-spacing="1.2" fill="${sealColor}"><textPath href="#sealArc">OAK CITY \u2022 NORTH CAROLINA</textPath></text>
    <text x="326" y="216" text-anchor="middle" font-family="Georgia, serif" font-weight="bold" font-size="14" letter-spacing="2.5" fill="${sealColor}">SCVD</text>
    <text x="326" y="229" text-anchor="middle" font-family="Georgia, serif" font-size="6.5" letter-spacing="1.6" fill="${sealColor}">SIGNED &amp; SETTLED</text>
  </g>
  <a xlink:href="${escapeHtml(options.verifyUrl)}" href="${escapeHtml(options.verifyUrl)}">
    <text x="200" y="272" text-anchor="middle" font-family="Georgia, serif" font-size="10" fill="${FADED}" text-decoration="underline">verify: ${escapeHtml(options.verifyUrl)}</text>
  </a>
  ${sevenMark}
</svg>`;
}

export function renderVisitorSticker(storeBaseUrl: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="300" height="300" viewBox="0 0 300 300" role="img" aria-label="Visitor sticker">
  <circle cx="150" cy="150" r="145" fill="${PAPER}"/>
  <circle cx="150" cy="150" r="138" fill="none" stroke="${INK}" stroke-width="3"/>
  <circle cx="150" cy="150" r="130" fill="none" stroke="${INK}" stroke-width="1" stroke-dasharray="2 5"/>
  <text x="150" y="82" text-anchor="middle" font-family="Georgia, serif" font-size="12" letter-spacing="3" fill="${FADED}">SEAN-CLAUDE VAN DAMME'S</text>
  <text x="150" y="102" text-anchor="middle" font-family="Georgia, serif" font-size="13" letter-spacing="5" fill="${INK}">GENERAL STORE</text>
  <text x="150" y="158" text-anchor="middle" font-family="Georgia, serif" font-weight="bold" font-size="34" fill="${ACCENT}">I STOPPED BY</text>
  <text x="150" y="190" text-anchor="middle" font-family="Georgia, serif" font-style="italic" font-size="15" fill="${INK}">and signed the guestbook</text>
  <text x="150" y="228" text-anchor="middle" font-family="Georgia, serif" font-size="11" fill="${FADED}">no purchase necessary</text>
  <a xlink:href="${escapeHtml(storeBaseUrl)}" href="${escapeHtml(storeBaseUrl)}">
    <text x="150" y="250" text-anchor="middle" font-family="Georgia, serif" font-size="11" fill="${FADED}" text-decoration="underline">${escapeHtml(storeBaseUrl)}</text>
  </a>
</svg>`;
}
