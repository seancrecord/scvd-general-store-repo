#!/usr/bin/env node
/**
 * THE SOCIAL CARD, DRAWN BY CODE (2026-08-04). The keeper supplied
 * the art direction — his brown T-rex over "scvd.store" — and this
 * renders it as pixel art at 1200x630, dependency-free: rectangles
 * into an RGBA buffer, PNG chunks by hand, deflate from node's own
 * zlib. No fonts, no image libraries, no network; the same bytes
 * forever from the same script.
 *
 *   node scripts/generate-og-image.mjs        # writes src/store/og-image.ts
 *   PREVIEW=1 node scripts/generate-og-image.mjs   # prints the grids as ASCII
 */
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

const W = 1200;
const H = 630;
const CREAM = [246, 241, 231, 255];
const BROWN = [77, 47, 32, 255];
const WHITE = [246, 241, 231, 255];

/** The dino, keeper's art direction: head high right, tail low left. */
const DINO = [
  "..................#########.",
  ".................###########",
  ".................##o########",
  ".................###########",
  ".................######wwww.",
  ".................#########..",
  ".................######www..",
  ".................#######....",
  ".................######.....",
  "............##########......",
  "..........############......",
  ".#.......#############......",
  ".##.....##############......",
  ".###...#############.##.....",
  ".####.##############..#.....",
  ".###################........",
  "..#################.........",
  "...###############..........",
  "....#############...........",
  ".....####..#####............",
  ".....###....####............",
  ".....###.....###............",
  ".....####....####...........",
];

/** 5x7 pixel glyphs; only the characters the card needs. */
const FONT = {
  s: ["#####", "#....", "#....", "#####", "....#", "....#", "#####"],
  c: ["#####", "#....", "#....", "#....", "#....", "#....", "#####"],
  v: ["#...#", "#...#", "#...#", "#...#", "#...#", ".#.#.", "..#.."],
  d: ["####.", "#...#", "#...#", "#...#", "#...#", "#...#", "####."],
  t: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."],
  o: ["#####", "#...#", "#...#", "#...#", "#...#", "#...#", "#####"],
  r: ["####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"],
  e: ["#####", "#....", "#....", "####.", "#....", "#....", "#####"],
  a: [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  g: ["#####", "#....", "#....", "#.###", "#...#", "#...#", "#####"],
  n: ["#...#", "##..#", "##..#", "#.#.#", "#..##", "#..##", "#...#"],
  l: ["#....", "#....", "#....", "#....", "#....", "#....", "#####"],
  f: ["#####", "#....", "#....", "####.", "#....", "#....", "#...."],
  i: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "#####"],
  x: ["#...#", "#...#", ".#.#.", "..#..", ".#.#.", "#...#", "#...#"],
  "4": ["#..#.", "#..#.", "#..#.", "#####", "...#.", "...#.", "...#."],
  "0": ["#####", "#...#", "#...#", "#...#", "#...#", "#...#", "#####"],
  "2": ["#####", "....#", "....#", "#####", "#....", "#....", "#####"],
  ".": [".....", ".....", ".....", ".....", ".....", ".##..", ".##.."],
  " ": [".....", ".....", ".....", ".....", ".....", ".....", "....."],
};

function textWidth(text, cell) {
  return text.length * 6 * cell - cell;
}

const pixels = new Uint8Array(W * H * 4);
function put(x, y, [r, g, b, a]) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 4;
  pixels[i] = r; pixels[i + 1] = g; pixels[i + 2] = b; pixels[i + 3] = a;
}
function rect(x, y, w, h, color) {
  for (let dy = 0; dy < h; dy += 1)
    for (let dx = 0; dx < w; dx += 1) put(x + dx, y + dy, color);
}

rect(0, 0, W, H, CREAM);

// The dino: 28 columns; cell size chosen to sit comfortably upper-center.
const CELL = 15;
const dinoW = DINO[0].length * CELL;
const dinoX = Math.round((W - dinoW) / 2);
const dinoY = 60;
DINO.forEach((row, gy) => {
  [...row].forEach((ch, gx) => {
    if (ch === "#") rect(dinoX + gx * CELL, dinoY + gy * CELL, CELL, CELL, BROWN);
    if (ch === "o") rect(dinoX + gx * CELL, dinoY + gy * CELL, CELL, CELL, WHITE);
    if (ch === "w") rect(dinoX + gx * CELL, dinoY + gy * CELL, CELL, CELL, WHITE);
  });
});

function drawText(text, centerY, cell) {
  let x = Math.round((W - textWidth(text, cell)) / 2);
  for (const ch of text) {
    const glyph = FONT[ch];
    if (!glyph) throw new Error(`no glyph for ${JSON.stringify(ch)}`);
    glyph.forEach((row, gy) => {
      [...row].forEach((bit, gx) => {
        if (bit === "#") rect(x + gx * cell, centerY + gy * cell, cell, cell, BROWN);
      });
    });
    x += 6 * cell;
  }
}

drawText("scvd.store", 448, 10);
drawText("a general store for ai agents", 545, 4);
drawText("x402", 583, 3);

if (process.env.PREVIEW) {
  console.log(DINO.join("\n"));
  process.exit(0);
}

// ── PNG encoding, by hand ────────────────────────────────────────────
const CRC_TABLE = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function crc32(bytes) {
  let c = -1;
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const out = Buffer.alloc(8 + data.length + 4);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8;  // bit depth
ihdr[9] = 6;  // RGBA
const raw = Buffer.alloc(H * (1 + W * 4));
for (let y = 0; y < H; y += 1) {
  raw[y * (1 + W * 4)] = 0; // filter: none
  Buffer.from(pixels.buffer, y * W * 4, W * 4).copy(raw, y * (1 + W * 4) + 1);
}
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);

const module_ = `/**
 * The social card (og:image), 1200x630 PNG, GENERATED — never edit by
 * hand. Rebuild with \`node scripts/generate-og-image.mjs\` (the
 * keeper's dino, pixel-drawn; the script is the source of truth).
 */
export const OG_IMAGE_PNG_BASE64 =
  "${png.toString("base64")}";
`;
writeFileSync("src/store/og-image.ts", module_);
console.log(`og image: ${png.length} bytes PNG, module written to src/store/og-image.ts`);
