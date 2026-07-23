import { inkParamsFromSignature } from "@/lib/ink";
import { escapeHtml } from "@/lib/sanitize";
import {
  LUCKY_CARD_LINES,
  LUCKY_STATUS_LINES,
  SPECIMEN_LUCKY,
} from "@/store/luckies";
import { STORE_METADATA } from "@/store/metadata";
import type { LuckyRecord, LuckyStrength } from "@/types";

/**
 * The lucky card: the record of a lucky in custody, same vintage-label
 * language as the badges. No photograph and no drawing of the object,
 * a drawing would be an invention; the card records name, provenance,
 * power, and an honest grade. The typeset part sits straight; the
 * grade block lands like a hand stamp, seeded by the record's own
 * signature. Same signature, same card, forever; a re-signed status
 * change re-inks it, honestly.
 */

const PAPER = "#f4ead8";
const INK = "#3b2f23";
const ACCENT = "#8c2f1b";
const FADED = "#7a6a55";
const GOLD = "#8c6a1b";

const WIDTH = 320;
const HEIGHT = 480;

const STRENGTH_ORDER: readonly LuckyStrength[] = [
  "faint",
  "fair",
  "strong",
  "uncanny",
];

/** Greedy word wrap; SVG text doesn't do it for us. */
function wrapText(text: string, maxChars: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter((word) => word.length > 0);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxChars || current === "") {
      current = candidate;
      continue;
    }
    lines.push(current);
    current = word;
  }
  if (current) {
    lines.push(current);
  }
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    const last = kept[maxLines - 1] ?? "";
    kept[maxLines - 1] =
      last.length > maxChars - 1 ? `${last.slice(0, maxChars - 1)}\u2026` : `${last}\u2026`;
    return kept;
  }
  return lines;
}

function textLines(
  lines: string[],
  startY: number,
  step: number,
  attrs: string,
): { svg: string; nextY: number } {
  const svg = lines
    .map(
      (line, index) =>
        `<text x="${WIDTH / 2}" y="${startY + index * step}" text-anchor="middle" ${attrs}>${escapeHtml(line)}</text>`,
    )
    .join("\n  ");
  return { svg, nextY: startY + lines.length * step };
}

/** Four slots, filled to the grade. The countermark's honest language. */
function strengthSlots(strength: LuckyStrength, y: number): string {
  const gradeIndex = STRENGTH_ORDER.indexOf(strength);
  const slotWidth = 20;
  const gap = 7;
  const total = 4 * slotWidth + 3 * gap;
  const startX = (WIDTH - total) / 2;
  const slots: string[] = [];
  for (let index = 0; index < 4; index += 1) {
    const x = startX + index * (slotWidth + gap);
    slots.push(
      index <= gradeIndex
        ? `<rect x="${x}" y="${y}" width="${slotWidth}" height="11" rx="1.5" fill="${ACCENT}"/>`
        : `<rect x="${x}" y="${y}" width="${slotWidth}" height="11" rx="1.5" fill="none" stroke="${FADED}" stroke-width="0.7" stroke-dasharray="2 2"/>`,
    );
  }
  return slots.join("");
}

export interface LuckyCardOptions {
  lucky: LuckyRecord;
  verifyUrl: string;
  /** Seeds the grade-block ink; same signature, same card, forever. */
  signature: string;
}

interface CardBody {
  lucky: Pick<
    LuckyRecord,
    "name" | "provenance" | "power" | "strength"
  > &
    Partial<Pick<LuckyRecord, "status" | "status_note" | "date" | "lucky_id">>;
  signature?: string;
  specimen?: boolean;
  verifyUrl?: string;
}

export function renderLuckyCard(options: LuckyCardOptions): string {
  return renderCard({
    lucky: options.lucky,
    signature: options.signature,
    verifyUrl: options.verifyUrl,
  });
}

export function renderSampleLuckyCard(): string {
  return renderCard({ lucky: SPECIMEN_LUCKY, specimen: true });
}

function renderCard(body: CardBody): string {
  const { lucky } = body;
  const ink = inkParamsFromSignature(body.signature);
  const town = STORE_METADATA.location.split(",")[0] ?? "Oak City";

  const nameLines = wrapText(lucky.name, 22, 2);
  const provenanceLines = wrapText(lucky.provenance, 44, 3);
  // The card shows what fits; the signed record always holds the whole text.
  const powerLines = wrapText(lucky.power, 44, 3);

  let cursor = 118;
  const name = textLines(
    nameLines,
    cursor,
    26,
    `font-family="Georgia, serif" font-weight="bold" font-size="21" fill="${INK}"`,
  );
  cursor = name.nextY + 12;

  const provenanceLabelY = cursor;
  cursor += 16;
  const provenance = textLines(
    provenanceLines,
    cursor,
    15,
    `font-family="Georgia, serif" font-style="italic" font-size="11.5" fill="${INK}"`,
  );
  cursor = provenance.nextY + 10;

  const powerLabelY = cursor;
  cursor += 16;
  const power = textLines(
    powerLines,
    cursor,
    15,
    `font-family="Georgia, serif" font-size="11.5" fill="${INK}"`,
  );
  cursor = power.nextY + 14;

  // The grade block: stamped by hand, so it lands slightly off-true.
  const strengthLabelY = cursor;
  const slotsY = cursor + 8;
  const gradeWordY = slotsY + 30;
  const statusY = gradeWordY + 22;
  const statusLine = body.specimen
    ? LUCKY_CARD_LINES.specimenMark
    : LUCKY_STATUS_LINES[lucky.status ?? "in_service"];
  const statusColor =
    lucky.status === "promoted" ? GOLD : lucky.status === "benched" ? FADED : INK;
  const statusNote =
    !body.specimen && lucky.status_note
      ? textLines(
          wrapText(lucky.status_note, 48, 1),
          statusY + 14,
          12,
          `font-family="Georgia, serif" font-style="italic" font-size="9.5" fill="${FADED}"`,
        ).svg
      : "";
  const gradeRotation = ink.rotationDeg.toFixed(2);
  const gradeCenterY = (strengthLabelY + statusY) / 2;

  const custodyParts = [LUCKY_CARD_LINES.custodyLine, town];
  if (lucky.date) {
    custodyParts.push(lucky.date.slice(0, 10));
  }
  const footer = body.specimen
    ? `<text x="${WIDTH / 2}" y="438" text-anchor="middle" font-family="Georgia, serif" font-style="italic" font-size="10" fill="${FADED}">${escapeHtml(LUCKY_CARD_LINES.specimenFootnote)}</text>
  <text x="${WIDTH / 2}" y="452" text-anchor="middle" font-family="Georgia, serif" font-style="italic" font-size="10" fill="${FADED}">${escapeHtml(LUCKY_CARD_LINES.specimenFootnote2)}</text>`
    : `<text x="${WIDTH / 2}" y="438" text-anchor="middle" font-family="Georgia, serif" font-size="9.5" fill="${FADED}">code: ${escapeHtml(lucky.lucky_id ?? "")}</text>
  <a xlink:href="${escapeHtml(body.verifyUrl ?? "")}" href="${escapeHtml(body.verifyUrl ?? "")}">
    <text x="${WIDTH / 2}" y="454" text-anchor="middle" font-family="Georgia, serif" font-size="9.5" fill="${FADED}" text-decoration="underline">verify: ${escapeHtml(body.verifyUrl ?? "")}</text>
  </a>`;
  const specimenWatermark = body.specimen
    ? `<text x="${WIDTH / 2}" y="${HEIGHT / 2}" text-anchor="middle" transform="rotate(-24 ${WIDTH / 2} ${HEIGHT / 2})" font-family="Georgia, serif" font-weight="bold" font-size="52" letter-spacing="6" fill="${FADED}" opacity="0.16">${escapeHtml(LUCKY_CARD_LINES.specimenMark)}</text>`
    : "";
  const label = body.specimen ? "Sample lucky card" : `Lucky card: ${lucky.name}`;

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="${escapeHtml(label)}">
  <rect width="${WIDTH}" height="${HEIGHT}" fill="${PAPER}" rx="12"/>
  <rect x="12" y="12" width="${WIDTH - 24}" height="${HEIGHT - 24}" fill="none" stroke="${INK}" stroke-width="2.5" rx="8"/>
  <rect x="19" y="19" width="${WIDTH - 38}" height="${HEIGHT - 38}" fill="none" stroke="${INK}" stroke-width="0.75" stroke-dasharray="1 4" stroke-dashoffset="${ink.hairlineOffset}" rx="6"/>
  ${specimenWatermark}
  <text x="${WIDTH / 2}" y="46" text-anchor="middle" font-family="Georgia, serif" font-weight="bold" font-size="13" fill="${INK}">SEAN-CLAUDE VAN DAMME'S</text>
  <text x="${WIDTH / 2}" y="64" text-anchor="middle" font-family="Georgia, serif" font-size="10.5" letter-spacing="6" fill="${INK}">GENERAL STORE</text>
  <line x1="70" y1="78" x2="${WIDTH - 70}" y2="78" stroke="${INK}" stroke-width="1"/>
  <circle cx="${WIDTH / 2}" cy="78" r="2.5" fill="${ACCENT}"/>
  <text x="${WIDTH / 2}" y="98" text-anchor="middle" font-family="Georgia, serif" font-style="italic" font-size="13" fill="${FADED}">${escapeHtml(LUCKY_CARD_LINES.shelfLine)}</text>
  ${name.svg}
  <text x="${WIDTH / 2}" y="${provenanceLabelY}" text-anchor="middle" font-family="Georgia, serif" font-size="8.5" letter-spacing="2" fill="${FADED}">${LUCKY_CARD_LINES.provenanceLabel}</text>
  ${provenance.svg}
  <text x="${WIDTH / 2}" y="${powerLabelY}" text-anchor="middle" font-family="Georgia, serif" font-size="8.5" letter-spacing="2" fill="${FADED}">${LUCKY_CARD_LINES.powerLabel}</text>
  ${power.svg}
  <g transform="rotate(${gradeRotation} ${WIDTH / 2} ${gradeCenterY})" opacity="${ink.inkOpacity}">
    <text x="${WIDTH / 2}" y="${strengthLabelY}" text-anchor="middle" font-family="Georgia, serif" font-size="8.5" letter-spacing="2" fill="${FADED}">${LUCKY_CARD_LINES.strengthLabel}</text>
    ${strengthSlots(lucky.strength, slotsY)}
    <text x="${WIDTH / 2}" y="${gradeWordY}" text-anchor="middle" font-family="Georgia, serif" font-weight="bold" font-size="15" letter-spacing="2" fill="${ACCENT}">${escapeHtml(lucky.strength.toUpperCase())}</text>
    <text x="${WIDTH / 2}" y="${statusY}" text-anchor="middle" font-family="Georgia, serif" font-weight="bold" font-size="12" letter-spacing="3" fill="${statusColor}">${escapeHtml(statusLine)}</text>
    ${statusNote}
  </g>
  <text x="${WIDTH / 2}" y="420" text-anchor="middle" font-family="Georgia, serif" font-size="9.5" letter-spacing="1.5" fill="${FADED}">${escapeHtml(custodyParts.join(" \u2022 "))}</text>
  ${footer}
</svg>`;
}
