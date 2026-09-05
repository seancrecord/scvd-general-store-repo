/**
 * A PNG DRAWN BY HAND, AT REQUEST TIME, WITH NO DEPENDENCIES.
 *
 * The passport share card is what a pasted /passport/{host} link
 * unfurls into, so it is the first thing most people ever see of this
 * store — and until 2026-09-05 it was five lines of a 5x7 hand set
 * enormous on a blank field, which read as a terminal dump rather
 * than as a document anybody would want beside their door. The
 * keeper, looking at one: "why would anyone share this."
 *
 * WHAT CHANGED, and why each part of it was the problem:
 *
 *   THE HAND. 5x7 cells cannot hold a letter — at the sizes this card
 *   set them, every crude corner was forty pixels wide. The alphabet
 *   here is 6x9 engraved caps, which is enough grid for a round O and
 *   a shouldered R, and it is set SMALLER, because type that fills
 *   the frame has nowhere to be elegant.
 *
 *   THE EDGES. One bit per pixel means every edge is a staircase. The
 *   card now draws into a COVERAGE buffer — each shape contributes the
 *   exact fraction of each pixel it covers — and quantizes to a
 *   sixteen-step cream-to-brown ramp at the end. Cells land on
 *   fractional coordinates, so the type comes out inked rather than
 *   tiled. Four bits a pixel: ~380 KB, still stored-deflate, still no
 *   compressor to trust.
 *
 *   THE PAGE. A certificate is mostly margin, rule and seal. There is
 *   now a double frame, an eyebrow in letterspaced small caps, two
 *   rules with a diamond, the host as the one large thing, the dates
 *   in a quiet band, and a struck seal in the corner.
 *
 * WHAT DID NOT CHANGE: no verdict word, ever. The card is a colophon —
 * who looked, when, at what, and when the reading goes stale. A card
 * that said READY would be the badge rules 43 and 54 refuse.
 */

const W = 1200;
const H = 630;
const CREAM: readonly [number, number, number] = [245, 240, 228];
const BROWN: readonly [number, number, number] = [74, 46, 28];

/** Ramp steps between paper and ink. Sixteen is 4 bits a pixel. */
const INK_STEPS = 16;

const GLYPH_W = 6;
const GLYPH_H = 9;

/**
 * ENGRAVED CAPS, 6 WIDE BY 9 TALL. Keyed by lowercase because the card
 * sets everything in capitals — a certificate voice, and one alphabet
 * to draw rather than two. Proportions are the plain-stem kind a
 * pantograph cuts: no serifs, which at one-pixel stems read as grit
 * rather than as refinement.
 */
const FONT: Record<string, readonly string[]> = {
  a: ["..##..", ".#..#.", ".#..#.", "#....#", "#....#", "######", "#....#", "#....#", "#....#"],
  b: ["#####.", "#....#", "#....#", "#....#", "#####.", "#....#", "#....#", "#....#", "#####."],
  c: [".####.", "#....#", "#.....", "#.....", "#.....", "#.....", "#.....", "#....#", ".####."],
  d: ["#####.", "#....#", "#....#", "#....#", "#....#", "#....#", "#....#", "#....#", "#####."],
  e: ["######", "#.....", "#.....", "#.....", "#####.", "#.....", "#.....", "#.....", "######"],
  f: ["######", "#.....", "#.....", "#.....", "#####.", "#.....", "#.....", "#.....", "#....."],
  g: [".####.", "#....#", "#.....", "#.....", "#..###", "#....#", "#....#", "#....#", ".####."],
  h: ["#....#", "#....#", "#....#", "#....#", "######", "#....#", "#....#", "#....#", "#....#"],
  i: [".####.", "..##..", "..##..", "..##..", "..##..", "..##..", "..##..", "..##..", ".####."],
  j: ["..####", "....#.", "....#.", "....#.", "....#.", "....#.", "#...#.", "#...#.", ".###.."],
  k: ["#....#", "#...#.", "#..#..", "#.#...", "##....", "#.#...", "#..#..", "#...#.", "#....#"],
  l: ["#.....", "#.....", "#.....", "#.....", "#.....", "#.....", "#.....", "#.....", "######"],
  m: ["#....#", "##..##", "##..##", "#.##.#", "#.##.#", "#....#", "#....#", "#....#", "#....#"],
  n: ["#....#", "##...#", "##...#", "#.#..#", "#.#..#", "#..#.#", "#..#.#", "#...##", "#....#"],
  o: [".####.", "#....#", "#....#", "#....#", "#....#", "#....#", "#....#", "#....#", ".####."],
  p: ["#####.", "#....#", "#....#", "#....#", "#####.", "#.....", "#.....", "#.....", "#....."],
  q: [".####.", "#....#", "#....#", "#....#", "#....#", "#....#", "#.##.#", "#..#.#", ".###.#"],
  r: ["#####.", "#....#", "#....#", "#....#", "#####.", "#..#..", "#...#.", "#....#", "#....#"],
  s: [".####.", "#....#", "#.....", "#.....", ".####.", ".....#", ".....#", "#....#", ".####."],
  t: ["######", "..##..", "..##..", "..##..", "..##..", "..##..", "..##..", "..##..", "..##.."],
  u: ["#....#", "#....#", "#....#", "#....#", "#....#", "#....#", "#....#", "#....#", ".####."],
  v: ["#....#", "#....#", "#....#", "#....#", ".#..#.", ".#..#.", ".#..#.", "..##..", "..##.."],
  w: ["#....#", "#....#", "#....#", "#.##.#", "#.##.#", "#.##.#", "##..##", "##..##", "#....#"],
  x: ["#....#", "#....#", ".#..#.", "..##..", "..##..", "..##..", ".#..#.", "#....#", "#....#"],
  y: ["#....#", "#....#", ".#..#.", "..##..", "..##..", "..##..", "..##..", "..##..", "..##.."],
  z: ["######", ".....#", "....#.", "...#..", "..#...", ".#....", "#.....", "#.....", "######"],
  "0": [".####.", "#....#", "#...##", "#..#.#", "#..#.#", "#.#..#", "##...#", "#....#", ".####."],
  "1": ["..##..", ".###..", "..##..", "..##..", "..##..", "..##..", "..##..", "..##..", ".####."],
  "2": [".####.", "#....#", ".....#", "....#.", "...#..", "..#...", ".#....", "#.....", "######"],
  "3": [".####.", "#....#", ".....#", "..###.", ".....#", ".....#", ".....#", "#....#", ".####."],
  "4": ["...##.", "..#.#.", ".#..#.", "#...#.", "######", "....#.", "....#.", "....#.", "....#."],
  "5": ["######", "#.....", "#.....", "#####.", ".....#", ".....#", ".....#", "#....#", ".####."],
  "6": [".####.", "#....#", "#.....", "#####.", "#....#", "#....#", "#....#", "#....#", ".####."],
  "7": ["######", ".....#", "....#.", "....#.", "...#..", "...#..", "..#...", "..#...", "..#..."],
  "8": [".####.", "#....#", "#....#", ".####.", "#....#", "#....#", "#....#", "#....#", ".####."],
  "9": [".####.", "#....#", "#....#", "#....#", ".#####", ".....#", ".....#", "#....#", ".####."],
  ".": ["......", "......", "......", "......", "......", "......", "......", "..##..", "..##.."],
  ",": ["......", "......", "......", "......", "......", "......", "..##..", "..##..", ".##..."],
  "-": ["......", "......", "......", "......", ".####.", "......", "......", "......", "......"],
  ":": ["......", "......", "..##..", "..##..", "......", "..##..", "..##..", "......", "......"],
  "/": [".....#", ".....#", "....#.", "....#.", "...#..", "..#...", ".#....", "#.....", "#....."],
  "·": ["......", "......", "......", "..##..", "..##..", "......", "......", "......", "......"],
  " ": ["......", "......", "......", "......", "......", "......", "......", "......", "......"],
};

/** Anything the hand cannot draw is a box, never dropped: the text keeps its width. */
const UNKNOWN = ["######", "#....#", "#....#", "#....#", "#....#", "#....#", "#....#", "#....#", "######"];

/* ---------------- The coverage surface ---------------- */

/**
 * Ink laid as COVERAGE, not as pixels: every shape adds the exact
 * fraction of each pixel it covers, so an edge that falls between two
 * pixels comes out grey in the right proportion rather than snapping
 * to one side. This is the whole difference between type that looks
 * printed and type that looks tiled.
 */
class Surface {
  readonly ink: Float32Array;

  constructor(readonly width: number, readonly height: number) {
    this.ink = new Float32Array(width * height);
  }

  private add(x: number, y: number, amount: number): void {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height || amount <= 0) return;
    const index = y * this.width + x;
    const next = this.ink[index]! + amount;
    this.ink[index] = next > 1 ? 1 : next;
  }

  /** Analytic coverage for an axis-aligned rectangle in float coords. */
  rect(x: number, y: number, w: number, h: number): void {
    if (w <= 0 || h <= 0) return;
    const x1 = x + w;
    const y1 = y + h;
    const px0 = Math.max(0, Math.floor(x));
    const px1 = Math.min(this.width, Math.ceil(x1));
    const py0 = Math.max(0, Math.floor(y));
    const py1 = Math.min(this.height, Math.ceil(y1));
    for (let py = py0; py < py1; py += 1) {
      const covY = Math.min(y1, py + 1) - Math.max(y, py);
      if (covY <= 0) continue;
      for (let px = px0; px < px1; px += 1) {
        const covX = Math.min(x1, px + 1) - Math.max(x, px);
        if (covX > 0) this.add(px, py, covX * covY);
      }
    }
  }

  /** A hairline frame, four rectangles rather than a stroked path. */
  frame(x: number, y: number, w: number, h: number, t: number): void {
    this.rect(x, y, w, t);
    this.rect(x, y + h - t, w, t);
    this.rect(x, y + t, t, h - 2 * t);
    this.rect(x + w - t, y + t, t, h - 2 * t);
  }

  /**
   * A ring, sampled against the distance field. Circles are the one
   * place a card like this cannot fake it with rectangles, and a
   * staircase seal would undo the point of the whole redraw.
   */
  ring(cx: number, cy: number, radius: number, t: number): void {
    const outer = radius + t / 2 + 1;
    const px0 = Math.max(0, Math.floor(cx - outer));
    const px1 = Math.min(this.width, Math.ceil(cx + outer));
    const py0 = Math.max(0, Math.floor(cy - outer));
    const py1 = Math.min(this.height, Math.ceil(cy + outer));
    for (let py = py0; py < py1; py += 1) {
      for (let px = px0; px < px1; px += 1) {
        const dx = px + 0.5 - cx;
        const dy = py + 0.5 - cy;
        const distance = Math.sqrt(dx * dx + dy * dy);
        // One pixel of feather either side of the stroke's edge.
        const coverage = Math.min(1, Math.max(0, t / 2 - Math.abs(distance - radius) + 0.5));
        if (coverage > 0) this.add(px, py, coverage);
      }
    }
  }

  /** A struck diamond: the rule ornament, and the seal's centre mark. */
  diamond(cx: number, cy: number, r: number): void {
    const step = 0.5;
    for (let dy = -r; dy < r; dy += step) {
      const halfWidth = r - Math.abs(dy);
      if (halfWidth <= 0) continue;
      this.rect(cx - halfWidth, cy + dy, halfWidth * 2, step);
    }
  }
}

/* ---------------- Setting type ---------------- */

export interface TypeSpec {
  /** Pixel size of one font cell; a glyph is 6 cells wide and 9 tall. */
  cell: number;
  /** Extra pixels between glyphs, on top of the one-cell sidebearing. */
  tracking?: number;
}

/**
 * PROPORTIONAL METRICS, NOT A GRID (2026-09-05, second pass).
 *
 * Every glyph in a 6-wide cell advanced 6 cells, so a full stop and an
 * M occupied the same room and the card read as a terminal dump —
 * `BYKARANTELI.COM` came out with craters around its I and its stop.
 * A typesetter sets to the INKED width plus a sidebearing, so that is
 * what this measures: the first and last columns each glyph actually
 * marks, cached once because the alphabet never changes.
 */
const METRICS: Record<string, { left: number; width: number }> = (() => {
  const out: Record<string, { left: number; width: number }> = {};
  for (const [ch, glyph] of Object.entries(FONT)) {
    let left = GLYPH_W;
    let right = -1;
    for (const row of glyph) {
      for (let x = 0; x < row.length; x += 1) {
        if (row[x] === "#") {
          if (x < left) left = x;
          if (x > right) right = x;
        }
      }
    }
    // A space marks nothing; give it a word-space of three cells.
    out[ch] = right < 0 ? { left: 0, width: 3 } : { left, width: right - left + 1 };
  }
  return out;
})();

function metricsOf(ch: string): { left: number; width: number } {
  return METRICS[ch] ?? { left: 0, width: GLYPH_W };
}

/** The sidebearing between two set glyphs, in cells. */
const SIDEBEARING = 1.15;

function advanceOf(ch: string, spec: TypeSpec): number {
  return (metricsOf(ch).width + SIDEBEARING) * spec.cell + (spec.tracking ?? 0);
}

export function textWidth(text: string, spec: TypeSpec): number {
  const chars = [...text.toLowerCase()];
  if (chars.length === 0) return 0;
  let total = 0;
  for (const ch of chars) total += advanceOf(ch, spec);
  // The trailing sidebearing is not part of the drawn width.
  const last = chars[chars.length - 1]!;
  return total - SIDEBEARING * spec.cell - (spec.tracking ?? 0) + (metricsOf(last).width === 0 ? 0 : 0);
}

/**
 * Shrinks a line's cell until it fits `maxWidth`, to a floor below
 * which the type stops being type. Shrinking alone is not a
 * guarantee: a 120-character host does not fit at any legible size,
 * and the old floor silently returned a cell that still overran the
 * card. `fitLine` is what callers should use — it shrinks first and
 * only then cuts, so the common case keeps every character.
 */
export const MIN_CELL = 2;

export function fitCell(text: string, preferred: number, maxWidth: number, tracking = 0): number {
  let cell = preferred;
  while (cell > MIN_CELL && textWidth(text, { cell, tracking }) > maxWidth) cell -= 0.25;
  return cell;
}

/** The text and the cell that actually fit: shrink, then truncate. */
export function fitLine(
  text: string,
  preferred: number,
  maxWidth: number,
  tracking = 0,
): { text: string; cell: number } {
  const cell = fitCell(text, preferred, maxWidth, tracking);
  if (textWidth(text, { cell, tracking }) <= maxWidth) return { text, cell };
  const chars = [...text];
  for (let take = chars.length - 1; take > 0; take -= 1) {
    const candidate = `${chars.slice(0, take).join("")}-`;
    if (textWidth(candidate, { cell, tracking }) <= maxWidth) return { text: candidate, cell };
  }
  return { text: "", cell };
}

function drawText(
  surface: Surface,
  text: string,
  centreX: number,
  top: number,
  spec: TypeSpec,
): void {
  const lowered = text.toLowerCase();
  let x = centreX - textWidth(lowered, spec) / 2;
  for (const ch of lowered) {
    const glyph = FONT[ch] ?? UNKNOWN;
    // Set from the glyph's own left edge, so the sidebearing is even
    // rather than however much empty grid the drawing happened to have.
    const bearing = metricsOf(ch).left * spec.cell;
    for (let gy = 0; gy < glyph.length; gy += 1) {
      const row = glyph[gy]!;
      for (let gx = 0; gx < row.length; gx += 1) {
        if (row[gx] === "#") {
          surface.rect(x + gx * spec.cell - bearing, top + gy * spec.cell, spec.cell, spec.cell);
        }
      }
    }
    x += advanceOf(ch, spec);
  }
}

/* ---------------- PNG encoding, the honest way: no compression ---------------- */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) c = CRC_TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function adler32(bytes: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (let i = 0; i < bytes.length; i += 1) {
    a = (a + bytes[i]!) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

function u32(value: number): Uint8Array {
  return new Uint8Array([(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff]);
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  const body = new Uint8Array(typeBytes.length + data.length);
  body.set(typeBytes);
  body.set(data, typeBytes.length);
  const out = new Uint8Array(4 + body.length + 4);
  out.set(u32(data.length));
  out.set(body, 4);
  out.set(u32(crc32(body)), 4 + body.length);
  return out;
}

/** zlib stream of stored deflate blocks (max 65535 bytes each). */
function zlibStored(raw: Uint8Array): Uint8Array {
  const blocks = Math.ceil(raw.length / 65535) || 1;
  const out = new Uint8Array(2 + raw.length + blocks * 5 + 4);
  let o = 0;
  out[o++] = 0x78;
  out[o++] = 0x01;
  for (let i = 0; i < blocks; i += 1) {
    const start = i * 65535;
    const end = Math.min(start + 65535, raw.length);
    const len = end - start;
    out[o++] = i === blocks - 1 ? 1 : 0;
    out[o++] = len & 0xff;
    out[o++] = (len >>> 8) & 0xff;
    out[o++] = ~len & 0xff;
    out[o++] = (~len >>> 8) & 0xff;
    out.set(raw.subarray(start, end), o);
    o += len;
  }
  out.set(u32(adler32(raw)), o);
  return out;
}

/**
 * An indexed PNG at 1, 2, 4 or 8 bits a pixel. Indexed rather than
 * truecolour because the whole card is one ink on one paper: a
 * sixteen-entry ramp at 4 bits packs 1200x630 into ~380 KB
 * uncompressed, against 2.2 MB as RGB — the difference between a
 * social card every unfurler fetches and one they give up on.
 */
export function encodePngIndexed(
  width: number,
  height: number,
  indices: Uint8Array,
  palette: readonly (readonly [number, number, number])[],
  bitDepth: 1 | 2 | 4 | 8,
): Uint8Array {
  const perByte = 8 / bitDepth;
  const rowBytes = Math.ceil(width / perByte);
  // One filter byte (0 = none) per row, then the packed row.
  const raw = new Uint8Array((rowBytes + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (rowBytes + 1);
    raw[rowStart] = 0;
    for (let x = 0; x < width; x += 1) {
      const value = indices[y * width + x]! & ((1 << bitDepth) - 1);
      const shift = 8 - bitDepth * ((x % perByte) + 1);
      raw[rowStart + 1 + Math.floor(x / perByte)]! |= value << shift;
    }
  }
  const ihdr = new Uint8Array(13);
  ihdr.set(u32(width), 0);
  ihdr.set(u32(height), 4);
  ihdr[8] = bitDepth;
  ihdr[9] = 3; // colour type: indexed
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const plte = new Uint8Array(palette.length * 3);
  palette.forEach((colour, i) => plte.set(colour, i * 3));
  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("PLTE", plte),
    chunk("IDAT", zlibStored(raw)),
    chunk("IEND", new Uint8Array(0)),
  ];
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const png = new Uint8Array(total);
  let o = 0;
  for (const part of parts) {
    png.set(part, o);
    o += part.length;
  }
  return png;
}

/* ---------------- The card ---------------- */

/**
 * The card's words, already decided by the caller. Everything here is
 * a colophon line; there is deliberately no field a verdict could
 * ride in, which is a cheaper guarantee than remembering not to.
 */
export interface CardContent {
  /** Letterspaced small caps across the top. */
  eyebrow: string;
  /** What kind of document this is. */
  title: string;
  /** The subject, and the one large thing on the card. */
  host: string;
  /** The two dates, set as a quiet band. */
  observed: string;
  stale: string;
  /** The standing sentence along the foot. */
  footer: string;
}

/**
 * The page, in numbers. A certificate is mostly margin: the host is
 * the one large thing but it is NOT the biggest thing the grid can
 * hold — set enormous, a 6x9 hand shows every crude corner forty
 * pixels wide, and the eye reads "terminal" before it reads
 * "document". So the hero is set at a size the letterforms can carry
 * and the whitespace does the rest of the work.
 */
const LAYOUT = {
  frameInset: 26,
  frameThickness: 3,
  innerInset: 38,
  margin: 92,
  eyebrow: { top: 92, cell: 2.7, tracking: 8 },
  ruleTop: 150,
  title: { top: 188, cell: 3.5, tracking: 6 },
  host: { top: 252, cell: 6.4, tracking: 3 },
  hostRule: 336,
  observed: { top: 378, cell: 3, tracking: 2 },
  stale: { top: 424, cell: 3, tracking: 2 },
  ruleBottom: 498,
  footer: { top: 530, cell: 2.4, tracking: 6 },
  seal: { cx: 1060, cy: 534, radius: 44 },
} as const;

export function renderCardPng(content: CardContent): Uint8Array {
  const surface = new Surface(W, H);
  const usable = W - LAYOUT.margin * 2;

  // The double frame: a heavy rule set in, a hairline just inside it.
  surface.frame(
    LAYOUT.frameInset,
    LAYOUT.frameInset,
    W - LAYOUT.frameInset * 2,
    H - LAYOUT.frameInset * 2,
    LAYOUT.frameThickness,
  );
  surface.frame(
    LAYOUT.innerInset,
    LAYOUT.innerInset,
    W - LAYOUT.innerInset * 2,
    H - LAYOUT.innerInset * 2,
    1,
  );

  const rule = (y: number, from: number, to: number): void => {
    const centre = (from + to) / 2;
    surface.rect(from, y, centre - from - 16, 1.5);
    surface.rect(centre + 16, y, to - centre - 16, 1.5);
    surface.diamond(centre, y + 0.75, 6);
  };

  drawText(surface, content.eyebrow, W / 2, LAYOUT.eyebrow.top, LAYOUT.eyebrow);
  rule(LAYOUT.ruleTop, LAYOUT.margin, W - LAYOUT.margin);
  drawText(surface, content.title, W / 2, LAYOUT.title.top, LAYOUT.title);

  // The host is the hero and the only line whose length we do not
  // control, so it is the only one that resizes to fit — and, past the
  // size where type stops being type, gets cut rather than overrun.
  const hero = fitLine(content.host, LAYOUT.host.cell, usable, LAYOUT.host.tracking);
  const heroSpec = { cell: hero.cell, tracking: LAYOUT.host.tracking };
  drawText(surface, hero.text, W / 2, LAYOUT.host.top, heroSpec);

  // A short rule under the subject, the width of the subject itself:
  // the one piece of the page that changes shape with the host, which
  // is what makes it read as set for this document rather than filled in.
  const heroWidth = textWidth(hero.text, heroSpec);
  surface.rect(W / 2 - heroWidth / 2, LAYOUT.hostRule, heroWidth, 1);

  drawText(surface, content.observed, W / 2, LAYOUT.observed.top, LAYOUT.observed);
  drawText(surface, content.stale, W / 2, LAYOUT.stale.top, LAYOUT.stale);

  // The bottom rule stops short of the seal rather than running under it.
  rule(LAYOUT.ruleBottom, LAYOUT.margin, LAYOUT.seal.cx - LAYOUT.seal.radius - 26);
  drawText(surface, content.footer, W / 2, LAYOUT.footer.top, LAYOUT.footer);

  // The seal: two struck rings and the house initials, set to sit
  // inside the inner ring rather than crowd it.
  const { cx, cy, radius } = LAYOUT.seal;
  surface.ring(cx, cy, radius, 2.5);
  surface.ring(cx, cy, radius - 7, 1);
  const sealSpec = { cell: 2.6, tracking: 1.5 };
  drawText(surface, "scvd", cx, cy - (GLYPH_H * sealSpec.cell) / 2, sealSpec);

  // Quantize the coverage to the ink ramp.
  const indices = new Uint8Array(W * H);
  for (let i = 0; i < indices.length; i += 1) {
    indices[i] = Math.round(surface.ink[i]! * (INK_STEPS - 1));
  }
  const palette = Array.from({ length: INK_STEPS }, (_, step) => {
    const t = step / (INK_STEPS - 1);
    return [
      Math.round(CREAM[0] + (BROWN[0] - CREAM[0]) * t),
      Math.round(CREAM[1] + (BROWN[1] - CREAM[1]) * t),
      Math.round(CREAM[2] + (BROWN[2] - CREAM[2]) * t),
    ] as [number, number, number];
  });
  return encodePngIndexed(W, H, indices, palette, 4);
}

export const CARD_WIDTH = W;
export const CARD_HEIGHT = H;
