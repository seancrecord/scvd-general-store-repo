import { initWasm, Resvg } from "@resvg/resvg-wasm";
import plexBold from "../../assets/fonts/IBMPlexSerif-Bold.ttf";
import plexItalic from "../../assets/fonts/IBMPlexSerif-Italic.ttf";
import plexRegular from "../../assets/fonts/IBMPlexSerif-Regular.ttf";

/**
 * THE FACE AS PNG (2026-09-12, the keeper: "just pick one that looks
 * nice"). The Worker has no browser and no fonts, so the rasterizer
 * ships inside it: resvg compiled to WebAssembly, and one font, IBM
 * Plex Serif under the SIL Open Font License (assets/fonts/OFL.txt),
 * regular, bold and italic. Every family the SVG names — the serif for the
 * display, the monospace for the data strip — resolves to Plex Serif
 * here, so the PNG is the same card in one voice; the SVG keeps its
 * own stack where a browser has the fonts. Nothing is fetched, nothing
 * is billed per render, and the same bytes come out every time.
 *
 * LOADED ON FIRST USE, NOT ON BOOT (2026-09-13). Imported at the top
 * of the file the rasterizer costs every cold isolate 24 ms it mostly
 * does not need: 230 ms to start against 206 without, measured five
 * starts each by scripts/cold-local.mjs, on a store that minifies for
 * exactly this reason. Behind a dynamic import the bytes still ship in
 * the bundle and the compile waits for the first face anyone asks for.
 * The module initialises once per isolate; that first render pays it.
 */
let ready: Promise<void> | null = null;

function ensureReady(): Promise<void> {
  if (!ready) ready = import("@resvg/resvg-wasm/index_bg.wasm").then((module) => initWasm(module.default));
  return ready;
}

export const FACE_FONT = "IBM Plex Serif";

/**
 * The paper grain is an feTurbulence filter over the whole card: a
 * browser paints it for free and the rasterizer pays 1.1 s of CPU for
 * it (measured 2026-09-12, 1000×1400: 1,382 ms with, 233 ms without).
 * The PNG goes without; the SVG keeps it. Stated on the paper.
 */
const GRAIN_RECT = /<rect width="\d+" height="\d+" rx="\d+" filter="url\(#grain\)"[^>]*\/>/;

/** The SVG face at its native 1000×1400, or scaled to a width. */
export async function renderFacePng(svg: string, width?: number): Promise<Uint8Array> {
  await ensureReady();
  const renderer = new Resvg(svg.replace(GRAIN_RECT, ""), {
    fitTo: width ? { mode: "width", value: width } : { mode: "original" },
    font: {
      fontBuffers: [new Uint8Array(plexRegular), new Uint8Array(plexBold), new Uint8Array(plexItalic)],
      defaultFontFamily: FACE_FONT,
      serifFamily: FACE_FONT,
      monospaceFamily: FACE_FONT,
      sansSerifFamily: FACE_FONT,
      loadSystemFonts: false,
    },
  });
  try {
    const image = renderer.render();
    try {
      return image.asPng();
    } finally {
      image.free();
    }
  } finally {
    renderer.free();
  }
}
