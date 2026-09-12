import { inkParamsFromSignature } from "@/lib/ink";
import { escapeHtml } from "@/lib/sanitize";
import { fnv1a } from "@/services/luckies";
import { dinoMark } from "@/services/favicon";
import {
  CARD_LINES,
  CURRENT_SEASON,
  RARITY_LINES,
  RARITY_ORDER,
  SPECIMEN_CARD,
  seasonById,
  type CardEntry,
} from "@/store/cards";
import { STORE_METADATA } from "@/store/metadata";
import type { CardRarity, CardRecord } from "@/types";

/**
 * THE CARD, DRAWN. 5:7 like a real card, forest-black ground like the
 * passport chip (the keeper on the cream face: "I want premium"), a
 * foil frame whose metal is the rarity, and in the picture window a
 * SIGIL rather than a drawing: a rosette derived from the card's own
 * name, so every printing of "The Bell" carries the same mark and no
 * two entries in the set share one. No photograph and no illustration
 * of an object, because a drawing would be an invention and the card
 * is a record. The rarity stamp lands by hand, seeded by the record's
 * signature (lib/ink.ts): same signature, same card, forever.
 */

const WIDTH = 360;
const HEIGHT = 504;

const FIELD = "#0F1A13";
const FIELD_DEEP = "#08110B";
const CREAM = "#F0E6CF";
const FADED = "#9DA58F";

/** The foil per tier: a flat metal for the low tiers, a gradient for the high. */
const FOIL: Record<CardRarity, { a: string; b: string; ink: string }> = {
  common: { a: "#D9D2BE", b: "#B9B19C", ink: "#E5E0D0" },
  uncommon: { a: "#D08A46", b: "#9C5A22", ink: "#E4A76B" },
  rare: { a: "#C9D6E4", b: "#7F93A8", ink: "#D6E2EE" },
  legendary: { a: "#F6DC8C", b: "#B8860B", ink: "#F3D27A" },
};

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
  if (current) lines.push(current);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    const last = kept[maxLines - 1] ?? "";
    kept[maxLines - 1] =
      last.length > maxChars - 1 ? `${last.slice(0, maxChars - 1)}…` : `${last}…`;
    return kept;
  }
  return lines;
}

function textLines(lines: string[], startY: number, step: number, attrs: string): string {
  return lines
    .map(
      (line, index) =>
        `<text x="${WIDTH / 2}" y="${startY + index * step}" text-anchor="middle" ${attrs}>${escapeHtml(line)}</text>`,
    )
    .join("\n  ");
}

/**
 * THE SIGIL. A rosette of nested polygons whose point count, turn and
 * ring count come off the card's name, so it is the same on every
 * printing and different on every entry. Higher tiers get more rings;
 * the legendary tier gets the dinosaur behind it, faint.
 */
export function sigil(name: string, rarity: CardRarity, cx: number, cy: number, radius: number, ink: string): string {
  const seed = fnv1a(`sigil:${name}`);
  const points = 5 + (seed % 5); // 5..9
  const turn = ((seed >>> 8) % 360) * (Math.PI / 180);
  const rings = 2 + RARITY_ORDER.indexOf(rarity); // 2..5
  const parts: string[] = [];
  for (let ring = 0; ring < rings; ring += 1) {
    const r = radius * (1 - ring * (0.72 / rings));
    const offset = turn + ring * (Math.PI / points);
    const coords: string[] = [];
    for (let index = 0; index < points; index += 1) {
      const angle = offset + (index * 2 * Math.PI) / points;
      coords.push(`${(cx + r * Math.cos(angle)).toFixed(2)},${(cy + r * Math.sin(angle)).toFixed(2)}`);
    }
    // Alternate rings are drawn as stars (every other vertex) so the
    // rosette reads as one ornament rather than stacked plates.
    const star = ring % 2 === 1 && points >= 5;
    const order = star ? coords.filter((_, index) => index % 2 === 0).concat(coords.filter((_, index) => index % 2 === 1)) : coords;
    parts.push(
      `<polygon points="${order.join(" ")}" fill="none" stroke="${ink}" stroke-width="${(1.4 - ring * 0.2).toFixed(2)}" opacity="${(0.9 - ring * 0.12).toFixed(2)}"/>`,
    );
  }
  parts.push(`<circle cx="${cx}" cy="${cy}" r="${(radius * 0.08).toFixed(2)}" fill="${ink}"/>`);
  return parts.join("\n    ");
}

function pips(rarity: CardRarity, y: number, ink: string): string {
  const count = RARITY_ORDER.indexOf(rarity) + 1;
  const gap = 14;
  const startX = WIDTH / 2 - ((count - 1) * gap) / 2;
  const marks: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const x = startX + index * gap;
    marks.push(`<polygon points="${x},${y - 5} ${x + 5},${y} ${x},${y + 5} ${x - 5},${y}" fill="${ink}"/>`);
  }
  return marks.join("");
}

export interface CardArtOptions {
  card: CardRecord;
  signature: string;
  verifyUrl: string;
}

interface CardBody {
  entry: CardEntry;
  seasonName: string;
  setSize: number;
  specimen?: boolean;
  cardId?: string;
  date?: string;
  signature?: string;
  verifyUrl?: string;
}

export function renderCardSvg(options: CardArtOptions): string {
  const season = seasonById(options.card.season);
  return renderCard({
    entry: {
      no: options.card.card_no,
      name: options.card.name,
      rarity: options.card.rarity,
      kind: options.card.kind,
      line: options.card.line,
      cite: options.card.cite,
    },
    seasonName: season?.name ?? options.card.season,
    setSize: season?.cards.length ?? 0,
    cardId: options.card.card_id,
    date: options.card.date,
    signature: options.signature,
    verifyUrl: options.verifyUrl,
  });
}

export function renderSampleCardSvg(): string {
  return renderCard({ entry: SPECIMEN_CARD, seasonName: CURRENT_SEASON.name, setSize: CURRENT_SEASON.cards.length, specimen: true });
}

function renderCard(body: CardBody): string {
  const { entry } = body;
  const foil = FOIL[entry.rarity];
  const ink = inkParamsFromSignature(body.signature);
  const town = STORE_METADATA.location.split(",")[0] ?? "Oak City";
  const gradientId = `foil-${entry.rarity}`;
  const numberLine = body.specimen ? "No. —" : `No. ${String(entry.no).padStart(2, "0")} / ${body.setSize}`;

  const nameLines = wrapText(entry.name, 20, 2);
  const lineLines = wrapText(entry.line, 40, 4);

  // The picture window and everything under it lay out from the top.
  const windowTop = 84;
  const windowHeight = 190;
  const windowBottom = windowTop + windowHeight;
  const nameY = windowBottom + 34;
  const nameSvg = textLines(nameLines, nameY, 24, `font-family="Georgia, serif" font-weight="bold" font-size="20" fill="${CREAM}"`);
  const kindY = nameY + (nameLines.length - 1) * 24 + 18;
  const lineY = kindY + 20;
  const lineSvg = textLines(lineLines, lineY, 14, `font-family="Georgia, serif" font-style="italic" font-size="10.5" fill="${CREAM}" opacity="0.92"`);
  const stampY = 442;

  const legendaryMark =
    entry.rarity === "legendary"
      ? dinoMark(WIDTH / 2 - 66, windowTop + windowHeight / 2 - 66, 132, foil.ink, 0.13)
      : "";
  const sheen =
    entry.rarity === "legendary" || entry.rarity === "rare"
      ? `<rect x="0" y="0" width="${WIDTH}" height="${HEIGHT}" fill="url(#sheen)" rx="14" opacity="0.35"/>`
      : "";

  const footer = body.specimen
    ? `<text x="${WIDTH / 2}" y="470" text-anchor="middle" font-family="Georgia, serif" font-style="italic" font-size="9.5" fill="${FADED}">${escapeHtml(CARD_LINES.specimenFootnote)}</text>
  <text x="${WIDTH / 2}" y="483" text-anchor="middle" font-family="Georgia, serif" font-style="italic" font-size="9.5" fill="${FADED}">${escapeHtml(CARD_LINES.specimenFootnote2)}</text>`
    : `<text x="${WIDTH / 2}" y="470" text-anchor="middle" font-family="Georgia, serif" font-size="9" fill="${FADED}">code: ${escapeHtml(body.cardId ?? "")}</text>
  <a xlink:href="${escapeHtml(body.verifyUrl ?? "")}" href="${escapeHtml(body.verifyUrl ?? "")}">
    <text x="${WIDTH / 2}" y="483" text-anchor="middle" font-family="Georgia, serif" font-size="9" fill="${FADED}" text-decoration="underline">verify: ${escapeHtml(body.verifyUrl ?? "")}</text>
  </a>`;
  const specimenWatermark = body.specimen
    ? `<text x="${WIDTH / 2}" y="${HEIGHT / 2}" text-anchor="middle" transform="rotate(-24 ${WIDTH / 2} ${HEIGHT / 2})" font-family="Georgia, serif" font-weight="bold" font-size="56" letter-spacing="6" fill="${CREAM}" opacity="0.14">${escapeHtml(CARD_LINES.specimenMark)}</text>`
    : "";
  const custodyParts = [CARD_LINES.custodyLine, town];
  if (body.date) custodyParts.push(body.date.slice(0, 10));
  const label = body.specimen ? "Sample trading card" : `Trading card: ${entry.name}, ${RARITY_LINES[entry.rarity].toLowerCase()}`;

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="${escapeHtml(label)}">
  <defs>
    <linearGradient id="${gradientId}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${foil.a}"/>
      <stop offset="0.5" stop-color="${foil.b}"/>
      <stop offset="1" stop-color="${foil.a}"/>
    </linearGradient>
    <linearGradient id="sheen" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0.35" stop-color="${CREAM}" stop-opacity="0"/>
      <stop offset="0.5" stop-color="${CREAM}" stop-opacity="0.18"/>
      <stop offset="0.65" stop-color="${CREAM}" stop-opacity="0"/>
    </linearGradient>
    <radialGradient id="window" cx="0.5" cy="0.45" r="0.7">
      <stop offset="0" stop-color="#1B2E22"/>
      <stop offset="1" stop-color="${FIELD_DEEP}"/>
    </radialGradient>
  </defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#${gradientId})" rx="14"/>
  <rect x="7" y="7" width="${WIDTH - 14}" height="${HEIGHT - 14}" fill="${FIELD}" rx="10"/>
  <rect x="13" y="13" width="${WIDTH - 26}" height="${HEIGHT - 26}" fill="none" stroke="${foil.ink}" stroke-width="0.75" stroke-dasharray="1 3" stroke-dashoffset="${ink.hairlineOffset}" rx="8" opacity="0.7"/>
  ${sheen}
  <text x="${WIDTH / 2}" y="40" text-anchor="middle" font-family="Georgia, serif" font-size="9" letter-spacing="3" fill="${foil.ink}">SEAN-CLAUDE VAN DAMME'S GENERAL STORE</text>
  <text x="${WIDTH / 2}" y="58" text-anchor="middle" font-family="Georgia, serif" font-size="8.5" letter-spacing="2.5" fill="${FADED}">${escapeHtml(CARD_LINES.seasonLabel)} • ${escapeHtml(body.seasonName.toUpperCase())}</text>
  <line x1="40" y1="70" x2="${WIDTH - 40}" y2="70" stroke="${foil.ink}" stroke-width="0.8" opacity="0.8"/>
  <rect x="28" y="${windowTop}" width="${WIDTH - 56}" height="${windowHeight}" fill="url(#window)" stroke="${foil.ink}" stroke-width="1.2" rx="6"/>
  <g>
    ${legendaryMark}
    ${sigil(entry.name, entry.rarity, WIDTH / 2, windowTop + windowHeight / 2, 74, foil.ink)}
  </g>
  ${specimenWatermark}
  <text x="${WIDTH - 36}" y="${windowBottom - 10}" text-anchor="end" font-family="Georgia, serif" font-size="9" letter-spacing="1.5" fill="${foil.ink}" opacity="0.9">${escapeHtml(numberLine)}</text>
  ${nameSvg}
  <text x="${WIDTH / 2}" y="${kindY}" text-anchor="middle" font-family="Georgia, serif" font-size="8.5" letter-spacing="3" fill="${FADED}">${escapeHtml(entry.kind.toUpperCase())}</text>
  ${lineSvg}
  <g transform="rotate(${ink.rotationDeg.toFixed(2)} ${WIDTH / 2} ${stampY})" opacity="${ink.inkOpacity}">
    ${pips(entry.rarity, stampY - 16, foil.ink)}
    <text x="${WIDTH / 2}" y="${stampY + 2}" text-anchor="middle" font-family="Georgia, serif" font-weight="bold" font-size="12" letter-spacing="4" fill="${foil.ink}">${escapeHtml(body.specimen ? CARD_LINES.specimenMark : RARITY_LINES[entry.rarity])}</text>
  </g>
  <text x="${WIDTH / 2}" y="${stampY + 16}" text-anchor="middle" font-family="Georgia, serif" font-size="8.5" letter-spacing="1.5" fill="${FADED}">${escapeHtml(custodyParts.join(" • "))}</text>
  ${footer}
</svg>`;
}
