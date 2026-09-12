import { inkParamsFromSignature } from "@/lib/ink";
import { encodeQr, qrSvg } from "@/lib/qr";
import { escapeHtml } from "@/lib/sanitize";
import {
  CARD_LINES,
  CONDITION_YELLOW,
  CREAM,
  CURRENT_SEASON,
  CV_CLAY,
  KEEPER_GOLD,
  PAPER_BLACK,
  RAIL_COLOURS,
  RARITY_LINES,
  RARITY_ORDER,
  SPECIMEN_CARD,
  TYPE_LINES,
  seasonById,
  type CardEntry,
} from "@/store/cards";
import { plateFor } from "@/store/plates";
import type { CardRarity, CardRecord, CardType } from "@/types";

/**
 * THE CARD FACE, 1000×1400 (handoff v2 §2–3): letterpress plate,
 * phosphor data layer. Four layers, bottom to top —
 *
 *   1. PAPER. Near-black with a faint stock grain. The rarity changes
 *      the stock: common is flat, uncommon carries an inner hairline,
 *      rare a visible deckle edge, holo a cream-to-white shimmer band,
 *      keeper is cream paper with black ink — the one inverted card.
 *   2. PLATE. The field-guide drawing, single ink, from store/plates.
 *      A condition is its plate with something visibly wrong in
 *      yellow. An undrawn entry is its silhouette, labelled.
 *   3. DATA. Monospace, small, one rail colour (store items cream):
 *      the card id, the print number, the verify URL, the date, the
 *      seed commit, and a real QR of the verify URL along the foot.
 *      Holo gets a scanline over the data layer. Nowhere else.
 *   4. LABEL. Name in the serif display, type under it, one italic
 *      line, rarity diamonds. No eyebrows beyond the header lockup.
 *
 * The stamp of the rarity lands by hand, seeded by the signature
 * (lib/ink.ts), so a pressing's face is stable forever.
 */

const W = 1000;
const H = 1400;

const SERIF = "Georgia, 'Times New Roman', serif";
const MONO = "'IBM Plex Mono', ui-monospace, 'SF Mono', Menlo, Consolas, monospace";

const TYPE_SILHOUETTE: Record<CardType, string> = {
  herd: "M20 70c0-20 12-34 30-34s30 14 30 34l-6 4H26z",
  room: "M18 46l32-26 32 26v34H18z",
  instrument: "M50 14a30 30 0 1 0 0.1 0z M46 44h8v42h-8z",
  place: "M48 10h4v80h-4z M20 22h50v14H20z M80 46H30v14h50z",
  mark: "M50 12l38 38-38 38-38-38z",
  rail: "M10 60h80v8H10z M22 20h8v40h-8z M70 20h8v40h-8z",
  door: "M22 90V34a28 28 0 0 1 56 0v56z",
  condition: "M20 20h60v60H20z",
  event: "M50 12l11 24 26 3-19 18 5 26-23-13-23 13 5-26-19-18 26-3z",
  ally: "M50 14a16 16 0 1 0 0.1 0z M26 84c0-18 10-30 24-30s24 12 24 30z",
  model: "M26 26h48v48H26z M46 8h8v18h-8z M46 74h8v18h-8z M8 46h18v8H8z M74 46h18v8H74z",
};

export interface FaceOptions {
  card: CardRecord;
  signature: string;
  verifyUrl: string;
}

interface FaceBody {
  entry: CardEntry;
  seasonName: string;
  subtitle: string;
  setSize: number;
  specimen?: boolean;
  cardId?: string;
  printNo?: number;
  printCap?: number;
  date?: string;
  commit?: string;
  signature?: string;
  verifyUrl?: string;
  /** A Door: the host's hash and the observation count the cap was read from. Never the URL. */
  doorHash?: string;
  observations?: number;
  /** What the QR carries. The specimen's points at the room. */
  qrText: string;
}

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
    kept[maxLines - 1] = last.length > maxChars - 1 ? `${last.slice(0, maxChars - 1)}…` : `${last}…`;
    return kept;
  }
  return lines;
}

export function accentFor(entry: Pick<CardEntry, "type" | "rail" | "key" | "rarity">): string {
  if (entry.rarity === "keeper") return entry.key === "cv" ? CV_CLAY : KEEPER_GOLD;
  if (entry.rail) return RAIL_COLOURS[entry.rail];
  return CREAM;
}

/**
 * THE ONE-OF-ONES (the keeper's second reading, 2026-09-12): the
 * Keeper and CV are the two cards a season prints once, and the
 * inverted cream stock alone read as a photocopy. So: a sunburst of
 * hairlines behind the plate in the card's own metal, a second frame
 * with corner diamonds, the plate itself in that metal, a seal that
 * says 1 / 1 and the season, and a signed line under the flavour.
 * Everything is stroke and fill; nothing is loaded, nothing moves.
 */
function oneOfOne(entry: CardEntry, box: { x: number; y: number; w: number; h: number }, metal: string, ink: string, seasonName: string): string {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const rays: string[] = [];
  for (let deg = 0; deg < 360; deg += 7.5) {
    const rad = (deg * Math.PI) / 180;
    rays.push(`<line x1="${cx}" y1="${cy}" x2="${(cx + Math.cos(rad) * 520).toFixed(1)}" y2="${(cy + Math.sin(rad) * 520).toFixed(1)}"/>`);
  }
  const corner = (x: number, y: number): string => `<polygon points="${x},${y - 14} ${x + 14},${y} ${x},${y + 14} ${x - 14},${y}" fill="${metal}"/>`;
  const sealX = box.x + box.w - 96;
  const sealY = box.y + 96;
  return `<clipPath id="window"><rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" rx="10"/></clipPath>
  <g clip-path="url(#window)" stroke="${metal}" stroke-width="1.2" opacity="0.28">${rays.join("")}</g>
  <circle cx="${cx}" cy="${cy}" r="300" fill="url(#metal)"/>
  <rect x="42" y="42" width="${W - 84}" height="${H - 84}" rx="16" fill="none" stroke="${metal}" stroke-width="2"/>
  ${corner(42, 42)}${corner(W - 42, 42)}${corner(42, H - 42)}${corner(W - 42, H - 42)}
  <g transform="rotate(-12 ${sealX} ${sealY})">
    <circle cx="${sealX}" cy="${sealY}" r="64" fill="${ink}" opacity="0.06"/>
    <circle cx="${sealX}" cy="${sealY}" r="64" fill="none" stroke="${metal}" stroke-width="3"/>
    <circle cx="${sealX}" cy="${sealY}" r="54" fill="none" stroke="${metal}" stroke-width="1"/>
    <text x="${sealX}" y="${sealY - 4}" text-anchor="middle" font-family="${SERIF}" font-weight="bold" font-size="34" fill="${metal}">1 / 1</text>
    <text x="${sealX}" y="${sealY + 26}" text-anchor="middle" font-family="${MONO}" font-size="13" letter-spacing="3" fill="${metal}">${escapeHtml(seasonName.toUpperCase())}</text>
  </g>
`;
}

/** The plate, or the labelled silhouette, into a box. */
function plateSvg(entry: CardEntry, box: { x: number; y: number; size: number }, ink: string, labelInk: string): string {
  const plate = plateFor(entry.key);
  const scale = box.size / 100;
  if (plate) {
    const transform = plate.transform ? ` transform="${plate.transform}"` : "";
    return `<g transform="translate(${box.x} ${box.y}) scale(${scale.toFixed(4)})"><path d="${plate.d}" fill="${ink}" fill-rule="evenodd"${transform}/></g>`;
  }
  return `<g transform="translate(${box.x} ${box.y}) scale(${scale.toFixed(4)})"><path d="${TYPE_SILHOUETTE[entry.type]}" fill="#262626" fill-rule="evenodd"/></g>
  <text x="${W / 2}" y="${box.y + box.size + 44}" text-anchor="middle" font-family="${MONO}" font-size="22" letter-spacing="4" fill="${labelInk}">${escapeHtml(CARD_LINES.notYetPressed.toUpperCase())}</text>`;
}

/** Something visibly wrong, in yellow: the condition's mark over its plate. */
function conditionMark(box: { x: number; y: number; size: number }): string {
  const x0 = box.x + box.size * 0.12;
  const x1 = box.x + box.size * 0.88;
  const y0 = box.y + box.size * 0.12;
  const y1 = box.y + box.size * 0.88;
  return `<g stroke="${CONDITION_YELLOW}" stroke-width="14" stroke-linecap="round" fill="none" opacity="0.92">
    <line x1="${x0}" y1="${y0}" x2="${x1}" y2="${y1}"/>
    <line x1="${x1}" y1="${y0}" x2="${x0}" y2="${y1}"/>
  </g>`;
}

function diamonds(rarity: CardRarity, cx: number, y: number, ink: string): string {
  const count = Math.max(1, RARITY_ORDER.indexOf(rarity) + 1);
  const gap = 34;
  const startX = cx - ((count - 1) * gap) / 2;
  const marks: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const x = startX + i * gap;
    marks.push(`<polygon points="${x},${y - 11} ${x + 11},${y} ${x},${y + 11} ${x - 11},${y}" fill="${ink}"/>`);
  }
  return marks.join("");
}

/** The deckle: a rough cream edge just inside the frame, for rare stock. */
function deckle(seed: number): string {
  const points: string[] = [];
  const inset = 22;
  const step = 18;
  let n = seed;
  const jitter = (): number => {
    n = (Math.imul(n, 1664525) + 1013904223) >>> 0;
    return ((n >>> 8) % 9) - 4;
  };
  for (let x = inset; x <= W - inset; x += step) points.push(`${x},${inset + jitter()}`);
  for (let y = inset; y <= H - inset; y += step) points.push(`${W - inset + jitter()},${y}`);
  for (let x = W - inset; x >= inset; x -= step) points.push(`${x},${H - inset + jitter()}`);
  for (let y = H - inset; y >= inset; y -= step) points.push(`${inset + jitter()},${y}`);
  return `<polygon points="${points.join(" ")}" fill="none" stroke="${CREAM}" stroke-width="2.5" opacity="0.75"/>`;
}

export function renderCardFace(options: FaceOptions): string {
  const { card } = options;
  const season = seasonById(card.season) ?? CURRENT_SEASON;
  return renderFace({
    entry: {
      no: card.card_no,
      key: card.key,
      name: card.name,
      type: card.type,
      rarity: card.rarity,
      ...(card.rail ? { rail: card.rail } : {}),
      obtained: "pack",
      line: card.line,
      post: card.line,
      cite: card.cite,
      ...(card.print_cap !== undefined ? { print_cap: card.print_cap } : {}),
    },
    seasonName: season.name,
    subtitle: season.subtitle,
    setSize: season.cards.length,
    cardId: card.card_id,
    printNo: card.print_no,
    ...(card.print_cap !== undefined ? { printCap: card.print_cap } : {}),
    date: card.date,
    ...(card.commit ? { commit: card.commit } : {}),
    ...(card.door_hash ? { doorHash: card.door_hash, observations: card.observations ?? 0 } : {}),
    signature: options.signature,
    verifyUrl: options.verifyUrl,
    qrText: options.verifyUrl,
  });
}

export function renderSpecimenFace(base: string): string {
  return renderFace({
    entry: SPECIMEN_CARD,
    seasonName: CURRENT_SEASON.name,
    subtitle: CURRENT_SEASON.subtitle,
    setSize: CURRENT_SEASON.cards.length,
    specimen: true,
    qrText: `${base}/design`,
  });
}

function renderFace(body: FaceBody): string {
  const { entry } = body;
  const inverted = entry.rarity === "keeper";
  const paper = inverted ? CREAM : PAPER_BLACK;
  const ink = inverted ? PAPER_BLACK : CREAM;
  const accent = accentFor(entry);
  const faded = inverted ? "#4a4437" : "#8f8878";
  const stamp = inkParamsFromSignature(body.signature);
  const window = { x: 90, y: 150, w: 820, h: 700 };
  const plateBox = { x: window.x + (window.w - 560) / 2, y: window.y + (window.h - 560) / 2, size: 560 };

  const nameLines = wrapText(entry.name, 22, 2);
  const flavour = wrapText(entry.line, 46, 3);
  // A three-line flavour lifts the whole label block so the stamp
  // still clears the machine strip (the clamp below is the strip's top).
  const nameY = flavour.length > 2 ? 910 : 940;
  const nameSize = nameLines.length > 1 ? 52 : 60;
  const typeY = nameY + (nameLines.length - 1) * 58 + 40;
  const flavourY = typeY + 46;
  // The stamp never wanders into the data layer: it floats under the
  // flavour but stops above the strip, whatever the name wrapped to.
  const signedY = flavourY + flavour.length * 34 + 8;
  const diamondsY = Math.min(flavourY + flavour.length * 34 + (inverted ? 52 : 12), H - 300);

  const numberLine = body.specimen ? "No. — / —" : `No. ${String(entry.no).padStart(2, "0")} / ${body.setSize}`;
  const printLine = body.specimen
    ? "no print number"
    : body.printCap !== undefined
      ? `print ${body.printNo} of ${body.printCap}`
      : `print ${body.printNo}`;

  // The machine strip: a real QR of the verify URL, bottom-left, and the data beside it.
  const qr = encodeQr(body.qrText);
  const qrCell = Math.floor(150 / qr.size);
  const qrSize = qrCell * qr.size;
  const qrX = 90;
  const qrY = H - 90 - qrSize;
  const dataX = qrX + qrSize + 28;
  const dataLines = body.specimen
    ? [CARD_LINES.specimenMark, "no signature · no print", body.qrText]
    : [
        `${body.cardId} · ${printLine}`,
        body.doorHash
          ? `door ${body.doorHash.slice(0, 16)} · seen ${body.observations ?? 0} · ${(body.date ?? "").slice(0, 10)}`
          : `${(body.date ?? "").slice(0, 10)} · commit ${(body.commit ?? "").slice(0, 16)}…`,
        body.verifyUrl ?? "",
      ];
  const dataSvg = dataLines
    .map((line, i) => `<text x="${dataX}" y="${qrY + 26 + i * 30}" font-family="${MONO}" font-size="19" fill="${accent}" opacity="0.95">${escapeHtml(line)}</text>`)
    .join("\n  ");

  const stock =
    entry.rarity === "uncommon"
      ? `<rect x="34" y="34" width="${W - 68}" height="${H - 68}" rx="18" fill="none" stroke="${ink}" stroke-width="1" opacity="0.5"/>`
      : entry.rarity === "rare"
        ? deckle(parseInt((body.signature ?? "7").slice(0, 6), 16) || 7)
        : entry.rarity === "holo"
          ? `<rect x="0" y="0" width="${W}" height="${H}" rx="28" fill="url(#holo)"/>`
          : "";
  const scanlines = entry.rarity === "holo" ? `<rect x="${qrX - 10}" y="${qrY - 16}" width="${W - 160}" height="${qrSize + 32}" fill="url(#scan)" opacity="0.45"/>` : "";
  const specimenWatermark = body.specimen
    ? `<text x="${W / 2}" y="${window.y + window.h / 2 + 40}" text-anchor="middle" transform="rotate(-24 ${W / 2} ${window.y + window.h / 2})" font-family="${SERIF}" font-weight="bold" font-size="150" letter-spacing="14" fill="${ink}" opacity="0.16">${escapeHtml(CARD_LINES.specimenMark)}</text>`
    : "";
  const label = body.specimen ? "Sample card" : `${entry.name}, ${RARITY_LINES[entry.rarity].toLowerCase()} ${TYPE_LINES[entry.type].toLowerCase()} card`;

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${escapeHtml(label)}">
  <defs>
    <filter id="grain" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" result="noise"/>
      <feColorMatrix type="saturate" values="0"/>
      <feComponentTransfer><feFuncA type="linear" slope="0.07"/></feComponentTransfer>
    </filter>
    <linearGradient id="holo" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0.30" stop-color="${CREAM}" stop-opacity="0"/>
      <stop offset="0.46" stop-color="${CREAM}" stop-opacity="0.16"/>
      <stop offset="0.50" stop-color="#FFFFFF" stop-opacity="0.26"/>
      <stop offset="0.54" stop-color="${CREAM}" stop-opacity="0.16"/>
      <stop offset="0.70" stop-color="${CREAM}" stop-opacity="0"/>
    </linearGradient>
    <radialGradient id="metal" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="${accent}" stop-opacity="0.22"/>
      <stop offset="0.7" stop-color="${accent}" stop-opacity="0.06"/>
      <stop offset="1" stop-color="${accent}" stop-opacity="0"/>
    </radialGradient>
    <pattern id="scan" width="4" height="4" patternUnits="userSpaceOnUse">
      <rect width="4" height="2" fill="${ink}" opacity="0.18"/>
    </pattern>
  </defs>
  <rect width="${W}" height="${H}" rx="28" fill="${paper}"/>
  <rect width="${W}" height="${H}" rx="28" filter="url(#grain)" fill="${ink}"/>
  ${stock}
  <rect x="24" y="24" width="${W - 48}" height="${H - 48}" rx="20" fill="none" stroke="${ink}" stroke-width="3"/>
  <text x="${W / 2}" y="76" text-anchor="middle" font-family="${SERIF}" font-size="22" letter-spacing="7" fill="${ink}">${escapeHtml(CARD_LINES.headerLockup)}</text>
  <text x="${W / 2}" y="112" text-anchor="middle" font-family="${SERIF}" font-style="italic" font-size="21" letter-spacing="3" fill="${faded}">${escapeHtml(body.subtitle)}</text>
  <rect x="${window.x}" y="${window.y}" width="${window.w}" height="${window.h}" rx="10" fill="none" stroke="${ink}" stroke-width="1.5" opacity="0.7"/>
  ${inverted ? oneOfOne(entry, window, accent, ink, body.seasonName) : ""}
  ${plateSvg(entry, plateBox, inverted ? accent : ink, faded)}
  ${entry.type === "condition" ? conditionMark(plateBox) : ""}
  ${specimenWatermark}
  <text x="${window.x + window.w - 22}" y="${window.y + window.h - 22}" text-anchor="end" font-family="${MONO}" font-size="20" letter-spacing="3" fill="${accent}">${escapeHtml(numberLine)}</text>
  ${nameLines.map((line, i) => `<text x="${W / 2}" y="${nameY + i * 58}" text-anchor="middle" font-family="${SERIF}" font-weight="bold" font-size="${nameSize}" fill="${inverted ? accent : ink}">${escapeHtml(line)}</text>`).join("\n  ")}
  <text x="${W / 2}" y="${typeY}" text-anchor="middle" font-family="${SERIF}" font-size="22" letter-spacing="6" fill="${faded}">${escapeHtml(TYPE_LINES[entry.type].toUpperCase())}${entry.rail ? ` · ${escapeHtml(entry.rail.toUpperCase())}` : ""}</text>
  ${flavour.map((line, i) => `<text x="${W / 2}" y="${flavourY + i * 34}" text-anchor="middle" font-family="${SERIF}" font-style="italic" font-size="26" fill="${ink}" opacity="0.92">${escapeHtml(line)}</text>`).join("\n  ")}
  ${inverted && !body.specimen ? `<text x="${W - 110}" y="${signedY}" text-anchor="end" font-family="${SERIF}" font-style="italic" font-size="24" fill="${accent}">${escapeHtml(entry.key === "cv" ? "signed, CV" : "signed, the keeper")}</text>` : ""}
  <g transform="rotate(${stamp.rotationDeg.toFixed(2)} ${W / 2} ${diamondsY})" opacity="${stamp.inkOpacity}">
    ${diamonds(entry.rarity, W / 2, diamondsY, accent)}
    <text x="${W / 2}" y="${diamondsY + 44}" text-anchor="middle" font-family="${SERIF}" font-weight="bold" font-size="24" letter-spacing="8" fill="${accent}">${escapeHtml(body.specimen ? CARD_LINES.specimenMark : RARITY_LINES[entry.rarity])}</text>
  </g>
  ${scanlines}
  ${qrSvg(qr, qrX, qrY, qrCell, accent)}
  ${dataSvg}
  <text x="${W - 90}" y="${H - 96}" text-anchor="end" font-family="${MONO}" font-size="17" letter-spacing="2" fill="${faded}">${escapeHtml(body.specimen ? CARD_LINES.specimenFootnote : CARD_LINES.custodyLine)}</text>
</svg>`;
}
