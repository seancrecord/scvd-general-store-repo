/**
 * A QR CODE, ENCODED BY HAND, NO DEPENDENCIES (2026-09-12, the
 * Paywall's machine strip). Byte mode only, error-correction level
 * M, versions 1 through 6 — enough for a verify URL and nothing
 * more, which is all the strip on a card face has to carry. The
 * output is a square boolean matrix; the SVG and the pixel engine
 * each draw it their own way.
 *
 * ISO/IEC 18004 as remembered and then CHECKED: the scratchpad test
 * that shipped beside this file rasterised every version and decoded
 * it with an independent reader (jsQR), so the tables below are not
 * trusted from memory alone. If you change a table, run that check
 * again before you trust the strip.
 */

/** Data codewords available at level M, by version (index 0 = v1). */
const DATA_CODEWORDS_M = [16, 28, 44, 64, 86, 108] as const;
/** Error-correction codewords per block and blocks, level M. */
const EC_BLOCKS_M: readonly { ecPerBlock: number; blocks: number }[] = [
  { ecPerBlock: 10, blocks: 1 },
  { ecPerBlock: 16, blocks: 1 },
  { ecPerBlock: 26, blocks: 1 },
  { ecPerBlock: 18, blocks: 2 },
  { ecPerBlock: 24, blocks: 2 },
  { ecPerBlock: 16, blocks: 4 },
];
/** Alignment pattern centre coordinates by version (v1 has none). */
const ALIGNMENT = [[], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34]] as const;

/* ── GF(256) arithmetic for Reed–Solomon, generator 0x11d ─────────── */
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i += 1) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i += 1) EXP[i] = EXP[i - 255]!;
})();

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return EXP[LOG[a]! + LOG[b]!]!;
}

function rsGenerator(degree: number): Uint8Array {
  let poly = new Uint8Array([1]);
  for (let i = 0; i < degree; i += 1) {
    const next = new Uint8Array(poly.length + 1);
    for (let j = 0; j < poly.length; j += 1) {
      next[j] = (next[j] ?? 0) ^ poly[j]!;
      next[j + 1] = (next[j + 1] ?? 0) ^ gfMul(poly[j]!, EXP[i]!);
    }
    poly = next;
  }
  return poly;
}

function rsRemainder(data: Uint8Array, degree: number): Uint8Array {
  const gen = rsGenerator(degree);
  const out = new Uint8Array(degree);
  for (const byte of data) {
    const factor = byte ^ out[0]!;
    out.copyWithin(0, 1);
    out[degree - 1] = 0;
    for (let j = 0; j < degree; j += 1) out[j] = (out[j] ?? 0) ^ gfMul(gen[j + 1]!, factor);
  }
  return out;
}

/* ── the matrix ────────────────────────────────────────────────────── */

export interface QrMatrix {
  size: number;
  version: number;
  /** modules[y][x] true = dark */
  modules: boolean[][];
}

function chooseVersion(byteLength: number): number {
  for (let v = 1; v <= 6; v += 1) {
    // Byte mode: 4 bits mode + 8 bits count (v1..9) + data.
    const capacityBits = DATA_CODEWORDS_M[v - 1]! * 8;
    if (4 + 8 + byteLength * 8 <= capacityBits) return v;
  }
  throw new Error("QR payload too long for version 6 at level M");
}

function bchFormat(data5: number): number {
  let value = data5 << 10;
  for (let i = 14; i >= 10; i -= 1) {
    if (value & (1 << i)) value ^= 0x537 << (i - 10);
  }
  return ((data5 << 10) | value) ^ 0x5412;
}

/** Mask condition for pattern `mask` at (row, col). */
function masked(mask: number, r: number, c: number): boolean {
  switch (mask) {
    case 0: return (r + c) % 2 === 0;
    case 1: return r % 2 === 0;
    case 2: return c % 3 === 0;
    case 3: return (r + c) % 3 === 0;
    case 4: return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0;
    case 5: return ((r * c) % 2) + ((r * c) % 3) === 0;
    case 6: return (((r * c) % 2) + ((r * c) % 3)) % 2 === 0;
    default: return (((r + c) % 2) + ((r * c) % 3)) % 2 === 0;
  }
}

export function encodeQr(text: string): QrMatrix {
  const bytes = new TextEncoder().encode(text);
  const version = chooseVersion(bytes.length);
  const size = version * 4 + 17;
  const dataCodewords = DATA_CODEWORDS_M[version - 1]!;
  const { ecPerBlock, blocks } = EC_BLOCKS_M[version - 1]!;

  // Bit stream: mode 0100, count (8 bits), bytes, terminator, pad.
  const bits: number[] = [];
  const push = (value: number, length: number): void => {
    for (let i = length - 1; i >= 0; i -= 1) bits.push((value >> i) & 1);
  };
  push(0b0100, 4);
  push(bytes.length, 8);
  for (const byte of bytes) push(byte, 8);
  const capacity = dataCodewords * 8;
  push(0, Math.min(4, capacity - bits.length));
  while (bits.length % 8 !== 0) bits.push(0);
  const pads = [0xec, 0x11];
  for (let i = 0; bits.length < capacity; i += 1) push(pads[i % 2]!, 8);
  const data = new Uint8Array(dataCodewords);
  for (let i = 0; i < dataCodewords; i += 1) {
    let byte = 0;
    for (let b = 0; b < 8; b += 1) byte = (byte << 1) | bits[i * 8 + b]!;
    data[i] = byte;
  }

  // Blocks: the first (blocks - remainder) are short, the rest one longer.
  const shortLength = Math.floor(dataCodewords / blocks);
  const longBlocks = dataCodewords % blocks;
  const dataBlocks: Uint8Array[] = [];
  const ecBlocks: Uint8Array[] = [];
  let offset = 0;
  for (let b = 0; b < blocks; b += 1) {
    const length = shortLength + (b >= blocks - longBlocks ? 1 : 0);
    const block = data.slice(offset, offset + length);
    offset += length;
    dataBlocks.push(block);
    ecBlocks.push(rsRemainder(block, ecPerBlock));
  }
  const interleaved: number[] = [];
  const longest = shortLength + (longBlocks > 0 ? 1 : 0);
  for (let i = 0; i < longest; i += 1) {
    for (const block of dataBlocks) if (i < block.length) interleaved.push(block[i]!);
  }
  for (let i = 0; i < ecPerBlock; i += 1) {
    for (const block of ecBlocks) interleaved.push(block[i]!);
  }

  // The matrix and a map of reserved (function) modules.
  const modules: boolean[][] = Array.from({ length: size }, () => Array<boolean>(size).fill(false));
  const reserved: boolean[][] = Array.from({ length: size }, () => Array<boolean>(size).fill(false));
  const set = (r: number, c: number, dark: boolean): void => {
    modules[r]![c] = dark;
    reserved[r]![c] = true;
  };
  const finder = (r0: number, c0: number): void => {
    for (let r = -1; r <= 7; r += 1) {
      for (let c = -1; c <= 7; c += 1) {
        const rr = r0 + r;
        const cc = c0 + c;
        if (rr < 0 || cc < 0 || rr >= size || cc >= size) continue;
        const onRing = r === 0 || r === 6 || c === 0 || c === 6;
        const inCore = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        const inside = r >= 0 && r <= 6 && c >= 0 && c <= 6;
        set(rr, cc, inside && (onRing || inCore));
      }
    }
  };
  finder(0, 0);
  finder(0, size - 7);
  finder(size - 7, 0);
  // Timing patterns.
  for (let i = 8; i < size - 8; i += 1) {
    set(6, i, i % 2 === 0);
    set(i, 6, i % 2 === 0);
  }
  // Alignment patterns (versions 2+), skipping the finder corners.
  const centres = ALIGNMENT[version - 1]!;
  for (const cr of centres) {
    for (const cc of centres) {
      const nearFinder =
        (cr === 6 && cc === 6) || (cr === 6 && cc === size - 7) || (cr === size - 7 && cc === 6);
      if (nearFinder) continue;
      for (let r = -2; r <= 2; r += 1) {
        for (let c = -2; c <= 2; c += 1) {
          set(cr + r, cc + c, Math.max(Math.abs(r), Math.abs(c)) !== 1);
        }
      }
    }
  }
  // Reserve format areas; the dark module.
  for (let i = 0; i < 8; i += 1) {
    reserved[8]![i] = true;
    reserved[i]![8] = true;
    reserved[8]![size - 1 - i] = true;
    reserved[size - 1 - i]![8] = true;
  }
  reserved[8]![8] = true;
  set(size - 8, 8, true);

  // Place data bits in the zig-zag, right to left, two columns at a time.
  const placeData = (mask: number): boolean[][] => {
    const grid = modules.map((row) => [...row]);
    let bitIndex = 0;
    const total = interleaved.length * 8;
    let upward = true;
    for (let col = size - 1; col > 0; col -= 2) {
      if (col === 6) col -= 1;
      for (let step = 0; step < size; step += 1) {
        const r = upward ? size - 1 - step : step;
        for (const c of [col, col - 1]) {
          if (reserved[r]![c]) continue;
          let bit = false;
          if (bitIndex < total) {
            bit = ((interleaved[bitIndex >> 3]! >> (7 - (bitIndex & 7))) & 1) === 1;
            bitIndex += 1;
          }
          grid[r]![c] = bit !== masked(mask, r, c);
        }
      }
      upward = !upward;
    }
    return grid;
  };

  const writeFormat = (grid: boolean[][], mask: number): void => {
    const format = bchFormat((0b00 << 3) | mask); // level M = 00
    for (let i = 0; i < 15; i += 1) {
      const bit = ((format >> i) & 1) === 1;
      // Around the top-left finder.
      if (i < 6) grid[i]![8] = bit;
      else if (i < 8) grid[i + 1]![8] = bit;
      else grid[8]![14 - i] = bit;
      // Split between the other two.
      if (i < 8) grid[8]![size - 1 - i] = bit;
      else grid[size - 15 + i]![8] = bit;
    }
    grid[size - 8]![8] = true;
  };

  // Pick the mask with the lowest penalty (the spec's four rules).
  const penalty = (grid: boolean[][]): number => {
    let score = 0;
    for (let r = 0; r < size; r += 1) {
      let run = 1;
      for (let c = 1; c < size; c += 1) {
        if (grid[r]![c] === grid[r]![c - 1]) {
          run += 1;
          if (run === 5) score += 3;
          else if (run > 5) score += 1;
        } else run = 1;
      }
    }
    for (let c = 0; c < size; c += 1) {
      let run = 1;
      for (let r = 1; r < size; r += 1) {
        if (grid[r]![c] === grid[r - 1]![c]) {
          run += 1;
          if (run === 5) score += 3;
          else if (run > 5) score += 1;
        } else run = 1;
      }
    }
    for (let r = 0; r < size - 1; r += 1) {
      for (let c = 0; c < size - 1; c += 1) {
        const v = grid[r]![c];
        if (v === grid[r]![c + 1] && v === grid[r + 1]![c] && v === grid[r + 1]![c + 1]) score += 3;
      }
    }
    const pattern = [true, false, true, true, true, false, true];
    const finderLike = (line: boolean[]): number => {
      let hits = 0;
      for (let i = 0; i + 7 <= line.length; i += 1) {
        let match = true;
        for (let k = 0; k < 7; k += 1) if (line[i + k] !== pattern[k]) { match = false; break; }
        if (!match) continue;
        const lightBefore = i >= 4 && line.slice(i - 4, i).every((m) => !m);
        const lightAfter = i + 11 <= line.length && line.slice(i + 7, i + 11).every((m) => !m);
        if (lightBefore || lightAfter) hits += 1;
      }
      return hits;
    };
    for (let r = 0; r < size; r += 1) score += 40 * finderLike(grid[r]!);
    for (let c = 0; c < size; c += 1) score += 40 * finderLike(grid.map((row) => row[c]!));
    let dark = 0;
    for (const row of grid) for (const m of row) if (m) dark += 1;
    const ratio = (dark * 100) / (size * size);
    score += 10 * Math.min(Math.abs(Math.floor(ratio / 5) * 5 - 50) / 5, Math.abs(Math.ceil(ratio / 5) * 5 - 50) / 5);
    return score;
  };

  let best: boolean[][] | null = null;
  let bestScore = Infinity;
  for (let mask = 0; mask < 8; mask += 1) {
    const grid = placeData(mask);
    writeFormat(grid, mask);
    const score = penalty(grid);
    if (score < bestScore) {
      bestScore = score;
      best = grid;
    }
  }
  return { size, version, modules: best! };
}

/** The matrix as SVG rects, dark modules only, at `cell` px per module from (x, y). */
export function qrSvg(matrix: QrMatrix, x: number, y: number, cell: number, fill: string): string {
  const rects: string[] = [];
  for (let r = 0; r < matrix.size; r += 1) {
    for (let c = 0; c < matrix.size; c += 1) {
      if (matrix.modules[r]![c]) {
        rects.push(`<rect x="${(x + c * cell).toFixed(2)}" y="${(y + r * cell).toFixed(2)}" width="${cell}" height="${cell}"/>`);
      }
    }
  }
  return `<g fill="${fill}" shape-rendering="crispEdges">${rects.join("")}</g>`;
}
