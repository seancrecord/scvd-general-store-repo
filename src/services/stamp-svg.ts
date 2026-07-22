import { escapeHtml } from "@/lib/sanitize";
import type { StampRecord } from "@/types";

/**
 * SVG for the weekly visit stamp. Same vintage-label language as the
 * badges: paper, ink, a rubber-stamp circle. The motto and accent rotate
 * with the ISO week, so no two weeks stamp quite alike.
 */

const PAPER = "#f4ead8";
const INK = "#3b2f23";
const FADED = "#7a6a55";

interface WeeklyLook {
  motto: string;
  accent: string;
}

/** Four looks in rotation; the week number picks one. */
const WEEKLY_LOOKS: readonly WeeklyLook[] = [
  { motto: "CAME BY THIS WEEK", accent: "#8c2f1b" },
  { motto: "SEEN AT THE COUNTER", accent: "#1b5c8c" },
  { motto: "PASSED THROUGH THE CROSSING", accent: "#3f6b2f" },
  { motto: "RANG THE BELL, PROBABLY", accent: "#6b3f8c" },
] as const;

const CONTRIBUTOR_LOOK: WeeklyLook = {
  motto: "GAZETTE CONTRIBUTOR",
  accent: "#8c6a1b",
};

function lookForStamp(stamp: StampRecord): WeeklyLook {
  if (stamp.variant === "contributor") {
    return CONTRIBUTOR_LOOK;
  }
  const weekNumber = parseInt(stamp.week.split("-W")[1] ?? "0", 10);
  return WEEKLY_LOOKS[weekNumber % WEEKLY_LOOKS.length] ?? WEEKLY_LOOKS[0]!;
}

export interface StampSvgOptions {
  stamp: StampRecord;
  verifyUrl: string;
}

export function renderVisitStamp(options: StampSvgOptions): string {
  const { stamp, verifyUrl } = options;
  const look = lookForStamp(stamp);
  const nameLine = stamp.name
    ? `<text x="150" y="196" text-anchor="middle" font-family="Georgia, serif" font-style="italic" font-size="13" fill="${INK}">${escapeHtml(stamp.name)}</text>`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="300" height="300" viewBox="0 0 300 300" role="img" aria-label="Visit stamp ${escapeHtml(stamp.week)}">
  <rect width="300" height="300" fill="${PAPER}" rx="8"/>
  <g transform="rotate(-7 150 150)">
    <circle cx="150" cy="150" r="122" fill="none" stroke="${look.accent}" stroke-width="5"/>
    <circle cx="150" cy="150" r="112" fill="none" stroke="${look.accent}" stroke-width="1.5" stroke-dasharray="3 6"/>
    <text x="150" y="86" text-anchor="middle" font-family="Georgia, serif" font-size="11" letter-spacing="3" fill="${FADED}">SEAN-CLAUDE VAN DAMME'S GENERAL STORE</text>
    <text x="150" y="140" text-anchor="middle" font-family="Georgia, serif" font-weight="bold" font-size="20" fill="${look.accent}">${escapeHtml(look.motto)}</text>
    <text x="150" y="170" text-anchor="middle" font-family="Georgia, serif" font-size="16" fill="${INK}">week ${escapeHtml(stamp.week)}</text>
    ${nameLine}
    <text x="150" y="222" text-anchor="middle" font-family="Georgia, serif" font-size="10" fill="${FADED}">code: ${escapeHtml(stamp.stamp_id)}</text>
  </g>
  <a xlink:href="${escapeHtml(verifyUrl)}" href="${escapeHtml(verifyUrl)}">
    <text x="150" y="284" text-anchor="middle" font-family="Georgia, serif" font-size="10" fill="${FADED}" text-decoration="underline">verify: ${escapeHtml(verifyUrl)}</text>
  </a>
</svg>`;
}
