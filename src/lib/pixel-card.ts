/**
 * A PNG DRAWN BY HAND, AT REQUEST TIME, WITH NO DEPENDENCIES.
 *
 * The social card (og.png) is the keeper's dino, pixel-drawn by a
 * script. The passport share card (2026-09-02, roadmap S2's "share
 * card that carries date, gaps, stale-after") has to be drawn per
 * host, per request, so the drawing moves into the Worker: the same
 * 5x7 hand, cream and brown, and a PNG encoder small enough to read
 * — stored (uncompressed) deflate blocks inside a zlib wrapper, so
 * there is no compressor to trust and the bytes are exactly the
 * pixels. A card is ~900 KB raw for 1200x630; well under any limit
 * and cached for a day.
 */

const W = 1200;
const H = 630;
const CREAM: readonly [number, number, number] = [245, 240, 228];
const BROWN: readonly [number, number, number] = [74, 46, 28];

/** 5 columns, 7 rows. Lowercase, digits, and the marks a hostname or a date needs. */
const FONT: Record<string, readonly string[]> = {
  a: [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  b: ["####.", "#...#", "#...#", "####.", "#...#", "#...#", "####."],
  c: ["#####", "#....", "#....", "#....", "#....", "#....", "#####"],
  d: ["####.", "#...#", "#...#", "#...#", "#...#", "#...#", "####."],
  e: ["#####", "#....", "#....", "####.", "#....", "#....", "#####"],
  f: ["#####", "#....", "#....", "####.", "#....", "#....", "#...."],
  g: ["#####", "#....", "#....", "#.###", "#...#", "#...#", "#####"],
  h: ["#...#", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  i: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "#####"],
  j: ["#####", "...#.", "...#.", "...#.", "...#.", "#..#.", ".##.."],
  k: ["#...#", "#..#.", "#.#..", "##...", "#.#..", "#..#.", "#...#"],
  l: ["#....", "#....", "#....", "#....", "#....", "#....", "#####"],
  m: ["#...#", "##.##", "#.#.#", "#.#.#", "#...#", "#...#", "#...#"],
  n: ["#...#", "##..#", "##..#", "#.#.#", "#..##", "#..##", "#...#"],
  o: ["#####", "#...#", "#...#", "#...#", "#...#", "#...#", "#####"],
  p: ["####.", "#...#", "#...#", "####.", "#....", "#....", "#...."],
  q: ["#####", "#...#", "#...#", "#...#", "#.#.#", "#..#.", "####."],
  r: ["####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"],
  s: ["#####", "#....", "#....", "#####", "....#", "....#", "#####"],
  t: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."],
  u: ["#...#", "#...#", "#...#", "#...#", "#...#", "#...#", "#####"],
  v: ["#...#", "#...#", "#...#", "#...#", "#...#", ".#.#.", "..#.."],
  w: ["#...#", "#...#", "#...#", "#.#.#", "#.#.#", "##.##", "#...#"],
  x: ["#...#", "#...#", ".#.#.", "..#..", ".#.#.", "#...#", "#...#"],
  y: ["#...#", "#...#", "#...#", "#####", "..#..", "..#..", "..#.."],
  z: ["#####", "....#", "...#.", "..#..", ".#...", "#....", "#####"],
  "0": ["#####", "#...#", "#...#", "#...#", "#...#", "#...#", "#####"],
  "1": ["..#..", ".##..", "..#..", "..#..", "..#..", "..#..", "#####"],
  "2": ["#####", "....#", "....#", "#####", "#....", "#....", "#####"],
  "3": ["#####", "....#", "....#", "#####", "....#", "....#", "#####"],
  "4": ["#..#.", "#..#.", "#..#.", "#####", "...#.", "...#.", "...#."],
  "5": ["#####", "#....", "#....", "#####", "....#", "....#", "#####"],
  "6": ["#####", "#....", "#....", "#####", "#...#", "#...#", "#####"],
  "7": ["#####", "....#", "...#.", "..#..", ".#...", ".#...", ".#..."],
  "8": ["#####", "#...#", "#...#", "#####", "#...#", "#...#", "#####"],
  "9": ["#####", "#...#", "#...#", "#####", "....#", "....#", "#####"],
  ".": [".....", ".....", ".....", ".....", ".....", ".##..", ".##.."],
  "-": [".....", ".....", ".....", "#####", ".....", ".....", "....."],
  ":": [".....", ".##..", ".##..", ".....", ".##..", ".##..", "....."],
  "/": ["....#", "....#", "...#.", "..#..", ".#...", "#....", "#...."],
  " ": [".....", ".....", ".....", ".....", ".....", ".....", "....."],
};
/** Anything the hand cannot draw is drawn as a box, never dropped: the text stays the same width. */
const UNKNOWN = ["#####", "#...#", "#...#", "#...#", "#...#", "#...#", "#####"];

export interface CardLine {
  text: string;
  /** Pixel size of one font cell; the glyph is 5 cells wide, 7 tall, 6 advance. */
  cell: number;
}

function textWidth(text: string, cell: number): number {
  return text.length * 6 * cell - cell;
}

/** Shrinks a line's cell until it fits the card with a margin, floor 3. */
export function fitCell(text: string, preferred: number, margin = 60): number {
  let cell = preferred;
  while (cell > 3 && textWidth(text, cell) > W - margin * 2) cell -= 1;
  return cell;
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
 * A two-colour image is one bit per pixel. Colour type 3 (indexed) at
 * bit depth 1 with a two-entry palette: 1200x630 packs into ~95 KB
 * uncompressed, against 2.2 MB as truecolour — the difference between
 * a social card every unfurler fetches and one they give up on.
 */
export function encodePng1Bit(
  width: number,
  height: number,
  bits: Uint8Array,
  palette: readonly (readonly [number, number, number])[],
): Uint8Array {
  const rowBytes = Math.ceil(width / 8);
  // One filter byte (0 = none) per row, then the packed row.
  const raw = new Uint8Array((rowBytes + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (rowBytes + 1)] = 0;
    raw.set(bits.subarray(y * rowBytes, (y + 1) * rowBytes), y * (rowBytes + 1) + 1);
  }
  const ihdr = new Uint8Array(13);
  ihdr.set(u32(width), 0);
  ihdr.set(u32(height), 4);
  ihdr[8] = 1; // bit depth
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

export function renderCardPng(lines: readonly CardLine[]): Uint8Array {
  // Palette index 0 is cream (every bit starts 0); index 1 is brown.
  const rowBytes = Math.ceil(W / 8);
  const bits = new Uint8Array(rowBytes * H);
  const rect = (x: number, y: number, w: number, h: number): void => {
    for (let dy = 0; dy < h; dy += 1) {
      const yy = y + dy;
      if (yy < 0 || yy >= H) continue;
      for (let dx = 0; dx < w; dx += 1) {
        const xx = x + dx;
        if (xx < 0 || xx >= W) continue;
        bits[yy * rowBytes + (xx >> 3)]! |= 0x80 >> (xx & 7);
      }
    }
  };
  // Vertically centred block of lines, one cell-height of air between.
  const heights = lines.map((line) => line.cell * 7);
  const gaps = lines.map((line) => line.cell * 2);
  const block = heights.reduce((s, h) => s + h, 0) + gaps.slice(0, -1).reduce((s, g) => s + g, 0);
  let y = Math.round((H - block) / 2);
  lines.forEach((line, index) => {
    const text = line.text.toLowerCase();
    const cell = line.cell;
    let x = Math.round((W - textWidth(text, cell)) / 2);
    for (const ch of text) {
      const glyph = FONT[ch] ?? UNKNOWN;
      glyph.forEach((row, gy) => {
        [...row].forEach((bit, gx) => {
          if (bit === "#") rect(x + gx * cell, y + gy * cell, cell, cell);
        });
      });
      x += 6 * cell;
    }
    y += heights[index]! + (gaps[index] ?? 0);
  });
  // A thin brown rule top and bottom, the paper's edge.
  rect(0, 0, W, 6);
  rect(0, H - 6, W, 6);
  return encodePng1Bit(W, H, bits, [CREAM, BROWN]);
}

export const CARD_WIDTH = W;
export const CARD_HEIGHT = H;
