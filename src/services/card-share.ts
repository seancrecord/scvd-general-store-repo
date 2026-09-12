import { drawText, fitLine, flattenPath, renderTwoInkPng, Surface, textWidth } from "@/lib/pixel-card";
import { CONDITION_YELLOW, CREAM, CURRENT_SEASON, CV_CLAY, KEEPER_GOLD, RAIL_COLOURS, RARITY_LINES, RARITY_ORDER, seasonById, type CardEntry } from "@/store/cards";
import { plateFor } from "@/store/plates";
import type { CardRarity, CardRecord } from "@/types";

/**
 * THE SHARE SHEET, 1200×675 (handoff v2 §2): the card face at about
 * 55% height on the left, and on the right, in one giant line, the
 * post copy, the rarity, No. x / N, and the verify id in the
 * engraved hand. Dark field, one rail-colour accent. This is the
 * thing that stops the scroll — not the card, the sentence.
 *
 * Drawn by the same dependency-free pixel engine as the passport
 * card, extended with a second ink for the accent. Every unfurl on
 * the store comes off one desk.
 */

const W = 1200;
const H = 675;
const FIELD: readonly [number, number, number] = [17, 17, 17];
const INK: readonly [number, number, number] = [232, 220, 192];

function rgb(hexColour: string): [number, number, number] {
  const n = parseInt(hexColour.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Greedy wrap by measured width, so the sentence fits the column. */
function wrapToWidth(text: string, cell: number, tracking: number, maxWidth: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (textWidth(candidate, { cell, tracking }) <= maxWidth || !current) current = candidate;
    else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, maxLines);
}

export function renderShareSheet(card: CardRecord, base: string, post: string): Uint8Array {
  const ink = new Surface(W, H);
  const accent = new Surface(W, H);
  const season = seasonById(card.season);
  const setSize = season?.cards.length ?? 0;
  const accentHex = card.rarity === "keeper" ? (card.key === "cv" ? CV_CLAY : KEEPER_GOLD) : card.rail ? RAIL_COLOURS[card.rail] : card.type === "condition" ? CONDITION_YELLOW : CREAM;
  const accentSurface = accentHex === CREAM ? ink : accent;

  // The card, small, on the left: 5:7 at 55% of the sheet's height.
  const cardH = Math.round(H * 0.55);
  const cardW = Math.round((cardH * 5) / 7);
  const cardX = 56;
  const cardY = Math.round((H - cardH) / 2);
  ink.frame(cardX, cardY, cardW, cardH, 3);
  ink.frame(cardX + 8, cardY + 8, cardW - 16, cardH - 16, 1);
  // The plate window and the plate.
  const winX = cardX + 22;
  const winY = cardY + 34;
  const winW = cardW - 44;
  const winH = Math.round(cardH * 0.5);
  ink.frame(winX, winY, winW, winH, 1);
  const plate = plateFor(card.key);
  const plateSize = Math.min(winW, winH) - 24;
  const px = winX + (winW - plateSize) / 2;
  const py = winY + (winH - plateSize) / 2;
  if (plate) {
    const scale = plateSize / 100;
    // The dinosaur is authored on its own field; its transform is a
    // translate-scale-flip pair, which the flattener does not parse —
    // so undo it here: the favicon's path is 100 units after
    // scale(0.01118568) and a vertical flip from y = 100.
    const map = plate.transform
      ? (x: number, y: number): [number, number] => [px + (4 + x * 0.01118568 * 0.92) * scale, py + (-2 + (100 - y * 0.01118568) * 0.92) * scale]
      : (x: number, y: number): [number, number] => [px + x * scale, py + y * scale];
    ink.polygons(flattenPath(plate.d, map));
  } else {
    ink.frame(px + plateSize * 0.2, py + plateSize * 0.2, plateSize * 0.6, plateSize * 0.6, 2);
  }
  if (card.type === "condition") {
    // Something visibly wrong: the yellow cross.
    const x0 = px + plateSize * 0.15;
    const x1 = px + plateSize * 0.85;
    const y0 = py + plateSize * 0.15;
    const y1 = py + plateSize * 0.85;
    const t = 5;
    const stroke = (ax: number, ay: number, bx: number, by: number): void => {
      const dx = bx - ax;
      const dy = by - ay;
      const len = Math.hypot(dx, dy) || 1;
      const nx = (-dy / len) * t;
      const ny = (dx / len) * t;
      accent.polygons([[[ax + nx, ay + ny], [bx + nx, by + ny], [bx - nx, by - ny], [ax - nx, ay - ny]]]);
    };
    stroke(x0, y0, x1, y1);
    stroke(x1, y0, x0, y1);
  }
  // Name under the window, then the diamonds.
  const nameSpec = { cell: 2.2, tracking: 2 };
  const nameLines = wrapToWidth(card.name, nameSpec.cell, nameSpec.tracking, cardW - 40, 2);
  nameLines.forEach((line, i) => {
    const fit = fitLine(line, nameSpec.cell, cardW - 40, nameSpec.tracking);
    drawText(ink, fit.text, cardX + cardW / 2, winY + winH + 22 + i * 26, { cell: fit.cell, tracking: nameSpec.tracking });
  });
  const count = Math.max(1, RARITY_ORDER.indexOf(card.rarity) + 1);
  const gap = 18;
  const dStart = cardX + cardW / 2 - ((count - 1) * gap) / 2;
  for (let i = 0; i < count; i += 1) accentSurface.diamond(dStart + i * gap, winY + winH + 44 + nameLines.length * 26, 6);
  drawText(ink, `NO. ${String(card.card_no).padStart(2, "0")} / ${setSize}`, cardX + cardW / 2, cardY + cardH - 40, { cell: 1.6, tracking: 2 });

  // The sentence, on the right, as big as it fits in four lines.
  const colX = cardX + cardW + 56;
  const colW = W - colX - 56;
  let cell = 4.2;
  let lines = wrapToWidth(post, cell, 3, colW, 4);
  while (lines.length >= 4 && cell > 2.6) {
    cell -= 0.2;
    lines = wrapToWidth(post, cell, 3, colW, 4);
  }
  const lineStep = cell * 9 + 16;
  const blockH = lines.length * lineStep;
  const topY = Math.round(H / 2 - blockH / 2 - 60);
  lines.forEach((line, i) => {
    const width = textWidth(line, { cell, tracking: 3 });
    drawText(ink, line, colX + width / 2, topY + i * lineStep, { cell, tracking: 3 });
  });
  // Rarity, number, verify id: the phosphor line under the sentence.
  const metaY = topY + blockH + 30;
  const meta = `${RARITY_LINES[card.rarity]} · NO. ${String(card.card_no).padStart(2, "0")} / ${setSize} · PRINT ${card.print_no}${card.print_cap ? ` OF ${card.print_cap}` : ""}`;
  const metaSpec = { cell: 2.2, tracking: 3 };
  const metaFit = fitLine(meta, metaSpec.cell, colW, metaSpec.tracking);
  drawText(accentSurface, metaFit.text, colX + textWidth(metaFit.text, { cell: metaFit.cell, tracking: metaSpec.tracking }) / 2, metaY, { cell: metaFit.cell, tracking: metaSpec.tracking });
  const verifyLine = `${base.replace(/^https?:\/\//, "")}/p/${card.card_id.replace(/^card_/, "")}`;
  const vSpec = { cell: 2, tracking: 2 };
  drawText(accentSurface, verifyLine, colX + textWidth(verifyLine, vSpec) / 2, metaY + 40, vSpec);
  // A rule in the accent along the foot, the one flourish.
  accentSurface.rect(colX, H - 64, colW, 2);
  drawText(ink, "SIGNED AT ISSUE · DRAWN BY A SEED YOU CAN CHECK · PRINTED ONCE", colX + colW / 2, H - 50, { cell: 1.5, tracking: 3 });

  return renderTwoInkPng(ink, accent, { field: FIELD, ink: INK, accent: rgb(accentHex) });
}

/** A plate into a box on a surface; the labelled square where there is no drawing. */
function drawPlate(surface: Surface, key: string, x: number, y: number, size: number): void {
  const plate = plateFor(key);
  if (!plate) {
    surface.frame(x + size * 0.2, y + size * 0.2, size * 0.6, size * 0.6, 1);
    return;
  }
  const scale = size / 100;
  const map = plate.transform
    ? (px: number, py: number): [number, number] => [x + (4 + px * 0.01118568 * 0.92) * scale, y + (-2 + (100 - py * 0.01118568) * 0.92) * scale]
    : (px: number, py: number): [number, number] => [x + px * scale, y + py * scale];
  surface.polygons(flattenPath(plate.d, map));
}

/**
 * THE BINDER SHEET, 1200×675 (2026-09-12): the whole set as a grid on
 * the left, every card this wallet holds drawn in ink and every card
 * it does not as a dot, and on the right the count, giant. The
 * collection is the thing a collector posts; this is the picture
 * that goes with it, off the same desk as the card's own sheet.
 */
export function renderBinderSheet(held: ReadonlySet<string>, wallet: string, base: string, conditions = 0): Uint8Array {
  const ink = new Surface(W, H);
  const accent = new Surface(W, H);
  const cards: readonly CardEntry[] = CURRENT_SEASON.cards;
  const cols = 10;
  const rows = Math.ceil(cards.length / cols);
  const cell = 62;
  const gridW = cols * cell;
  const gridX = 56;
  const gridY = Math.round((H - rows * cell) / 2);
  ink.frame(gridX - 12, gridY - 12, gridW + 24, rows * cell + 24, 2);
  const byRarity: Record<CardRarity, number> = { common: 0, uncommon: 0, rare: 0, holo: 0, keeper: 0 };
  let count = 0;
  cards.forEach((card, index) => {
    const x = gridX + (index % cols) * cell;
    const y = gridY + Math.floor(index / cols) * cell;
    if (held.has(card.key)) {
      count += 1;
      byRarity[card.rarity] += 1;
      // The one-of-ones and the holos in the accent ink; the rest in the cream.
      drawPlate(card.rarity === "keeper" || card.rarity === "holo" ? accent : ink, card.key, x + 7, y + 7, cell - 14);
    } else {
      ink.rect(x + cell / 2 - 2, y + cell / 2 - 2, 4, 4);
    }
  });

  const colX = gridX + gridW + 56;
  const colW = W - colX - 56;
  const big = `${count} / ${cards.length}`;
  const bigFit = fitLine(big, 9, colW, 4);
  drawText(ink, bigFit.text, colX + colW / 2, 200, { cell: bigFit.cell, tracking: 4 });
  drawText(ink, "IN THE BINDER", colX + colW / 2, 290, { cell: 2.2, tracking: 4 });
  // The tally wraps by entry, never inside one: "1 RARE" stays together.
  const entries = (["keeper", "holo", "rare", "uncommon", "common"] as const)
    .filter((rarity) => byRarity[rarity] > 0)
    .map((rarity) => `${byRarity[rarity]} ${RARITY_LINES[rarity]}`);
  const tallyLines: string[] = [];
  for (const entry of entries) {
    const last = tallyLines[tallyLines.length - 1];
    const joined = last ? `${last} · ${entry}` : entry;
    if (last && textWidth(joined, { cell: 2, tracking: 3 }) <= colW) tallyLines[tallyLines.length - 1] = joined;
    else tallyLines.push(entry);
  }
  // The right column flows: the tally, the weather if any, the wallet, the door.
  let cursor = 340;
  for (const line of tallyLines) {
    drawText(accent, line, colX + colW / 2, cursor, { cell: 2, tracking: 3 });
    cursor += 32;
  }
  if (conditions >= 3) {
    cursor += 12;
    drawText(accent, "UNDER THE WEATHER", colX + colW / 2, cursor, { cell: 2, tracking: 4 });
    cursor += 32;
  }
  cursor += 28;
  // The pixel font has no ellipsis; three stops say the same thing.
  const who = `${wallet.slice(0, 6)}...${wallet.slice(-4)}`;
  drawText(ink, who.toUpperCase(), colX + colW / 2, cursor, { cell: 2.4, tracking: 3 });
  const where = `${base.replace(/^https?:\/\//, "")}/binder`;
  drawText(accent, where, colX + colW / 2, cursor + 40, { cell: 2, tracking: 2 });
  accent.rect(colX, H - 64, colW, 2);
  drawText(ink, "SEASON ONE · SUMMER OF 402 · OAK CITY", colX + colW / 2, H - 50, { cell: 1.5, tracking: 3 });
  return renderTwoInkPng(ink, accent, { field: FIELD, ink: INK, accent: rgb(KEEPER_GOLD) });
}
