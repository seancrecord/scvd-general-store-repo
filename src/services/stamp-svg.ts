import { inkParamsFromSignature } from "@/lib/ink";
import { escapeHtml } from "@/lib/sanitize";
import type { StampRecord } from "@/types";

/**
 * SVG for the weekly visit stamp. Same vintage-label language as the
 * badges: paper, ink, a rubber-stamp circle. The motto and accent rotate
 * with the ISO week, so no two weeks stamp quite alike. How the stamp
 * landed — rotation, ink, hairline — comes from its own signature bytes.
 * The Countermark strip along the bottom is the bearer's year: punched
 * weeks dark, missed weeks a scored outline. Gaps stay gaps.
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
  { motto: "PASSED THROUGH OAK CITY", accent: "#3f6b2f" },
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

/** The Countermark strip: two rows of 26 slots, weeks 1–52. */
function punchStripSvg(card: string, inkOpacity: number): string {
  const slots: string[] = [];
  for (let index = 0; index < 52; index += 1) {
    const punched = card[index] === "1";
    const row = index < 26 ? 0 : 1;
    const x = 20 + (index % 26) * 10;
    const y = 236 + row * 12;
    slots.push(
      punched
        ? `<rect x="${x}" y="${y}" width="7" height="9" rx="1" fill="${INK}" opacity="${inkOpacity}"/>`
        : `<rect x="${x}" y="${y}" width="7" height="9" rx="1" fill="none" stroke="${FADED}" stroke-width="0.6" stroke-dasharray="1.5 1.5" opacity="0.7"/>`,
    );
  }
  return slots.join("");
}

/** The face line under the week: streak and the week's one-word state. */
function faceLine(stamp: StampRecord): string {
  if (stamp.consecutive === undefined && stamp.condition === undefined) {
    return "";
  }
  const parts: string[] = [];
  if (stamp.consecutive !== undefined && stamp.consecutive > 1) {
    parts.push(`${stamp.consecutive} weeks running`);
  }
  if (stamp.condition) {
    parts.push(stamp.condition);
  }
  return parts.join(" \u00B7 ");
}

export interface StampSvgOptions {
  stamp: StampRecord;
  verifyUrl: string;
  /** Seeds the rendering; same signature, same ink, forever. */
  signature?: string;
}

export function renderVisitStamp(options: StampSvgOptions): string {
  const { stamp, verifyUrl } = options;
  const ink = inkParamsFromSignature(options.signature);
  const look = lookForStamp(stamp);
  const displayName =
    stamp.name && stamp.name.length > 30
      ? `${stamp.name.slice(0, 29)}\u2026`
      : stamp.name;
  const nameLine = displayName
    ? `<text x="150" y="194" text-anchor="middle" font-family="Georgia, serif" font-style="italic" font-size="13" fill="${INK}">${escapeHtml(displayName)}</text>`
    : "";
  const face = faceLine(stamp);
  const conditionLine = face
    ? `<text x="150" y="208" text-anchor="middle" font-family="Georgia, serif" font-size="9.5" letter-spacing="1" fill="${FADED}">${escapeHtml(face)}</text>`
    : "";
  const strip = stamp.card ? punchStripSvg(stamp.card, ink.inkOpacity) : "";
  const rotation = (-7 + ink.rotationDeg).toFixed(2);
  const hairlineRadius = (112 + ink.hairlineOffset).toFixed(2);
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="300" height="300" viewBox="0 0 300 300" role="img" aria-label="Visit stamp ${escapeHtml(stamp.week)}">
  <rect width="300" height="300" fill="${PAPER}" rx="8"/>
  ${strip}
  <g transform="rotate(${rotation} 150 150)" opacity="${ink.inkOpacity}">
    <circle cx="150" cy="150" r="122" fill="none" stroke="${look.accent}" stroke-width="5"/>
    <circle cx="150" cy="150" r="${hairlineRadius}" fill="none" stroke="${look.accent}" stroke-width="1.5" stroke-dasharray="3 6"/>
    <text x="150" y="86" text-anchor="middle" font-family="Georgia, serif" font-size="11" letter-spacing="3" fill="${FADED}">SEAN-CLAUDE VAN DAMME'S GENERAL STORE</text>
    <text x="150" y="140" text-anchor="middle" font-family="Georgia, serif" font-weight="bold" font-size="20" fill="${look.accent}">${escapeHtml(look.motto)}</text>
    <text x="150" y="168" text-anchor="middle" font-family="Georgia, serif" font-size="16" fill="${INK}">week ${escapeHtml(stamp.week)}</text>
    ${nameLine}
    ${conditionLine}
    <text x="150" y="222" text-anchor="middle" font-family="Georgia, serif" font-size="10" fill="${FADED}">code: ${escapeHtml(stamp.stamp_id)}</text>
  </g>
  <a xlink:href="${escapeHtml(verifyUrl)}" href="${escapeHtml(verifyUrl)}">
    <text x="150" y="284" text-anchor="middle" font-family="Georgia, serif" font-size="10" fill="${FADED}" text-decoration="underline">verify: ${escapeHtml(verifyUrl)}</text>
  </a>
</svg>`;
}
