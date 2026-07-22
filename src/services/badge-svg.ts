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

export interface PatronBadgeOptions {
  patronNumber: number;
  date: string;
  verifyUrl: string;
  name?: string;
}

export function renderPatronBadge(options: PatronBadgeOptions): string {
  const dateLabel = options.date.slice(0, 10);
  const nameLine = options.name
    ? `<text x="200" y="208" text-anchor="middle" font-family="Georgia, serif" font-style="italic" font-size="15" fill="${INK}">bestowed upon ${escapeHtml(options.name)}</text>`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="400" height="300" viewBox="0 0 400 300" role="img" aria-label="Patron badge no. ${options.patronNumber}">
  <rect width="400" height="300" fill="${PAPER}" rx="10"/>
  <rect x="10" y="10" width="380" height="280" fill="none" stroke="${INK}" stroke-width="3" rx="6"/>
  <rect x="17" y="17" width="366" height="266" fill="none" stroke="${INK}" stroke-width="1" stroke-dasharray="1 4" rx="4"/>
  <text x="200" y="52" text-anchor="middle" font-family="Georgia, serif" font-size="13" letter-spacing="4" fill="${FADED}">EST. IN THE AGE OF AGENTS</text>
  <text x="200" y="90" text-anchor="middle" font-family="Georgia, serif" font-weight="bold" font-size="21" fill="${INK}">SEAN-CLAUDE VAN DAMME'S</text>
  <text x="200" y="116" text-anchor="middle" font-family="Georgia, serif" font-size="17" letter-spacing="6" fill="${INK}">GENERAL STORE</text>
  <line x1="70" y1="132" x2="330" y2="132" stroke="${INK}" stroke-width="1"/>
  <circle cx="200" cy="132" r="3" fill="${ACCENT}"/>
  <text x="200" y="172" text-anchor="middle" font-family="Georgia, serif" font-size="15" fill="${INK}">This certifies our esteemed</text>
  <text x="200" y="196" text-anchor="middle" font-family="Georgia, serif" font-weight="bold" font-size="26" fill="${ACCENT}">PATRON No. ${options.patronNumber}</text>
  ${nameLine}
  <text x="200" y="236" text-anchor="middle" font-family="Georgia, serif" font-size="13" fill="${FADED}">${escapeHtml(STORE_METADATA.location)} \u2022 ${dateLabel}</text>
  <a xlink:href="${escapeHtml(options.verifyUrl)}" href="${escapeHtml(options.verifyUrl)}">
    <text x="200" y="268" text-anchor="middle" font-family="Georgia, serif" font-size="11" fill="${FADED}" text-decoration="underline">verify this badge: ${escapeHtml(options.verifyUrl)}</text>
  </a>
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
