import { describe, expect, it } from "vitest";
import {
  CHIP_LAYOUT,
  CHIP_PALETTE,
  CHIP_STATE,
  renderPassportChip,
} from "@/services/badge-svg";

/**
 * THE CHIP IS AN IMAGE OF TEXT, SO THE RATIO BINDS (2026-09-06).
 *
 * A design pass darkened the paper and lightened the secondary tone
 * until the record line sat at 3.69:1 against it — under the 4.5:1
 * WCAG asks for, on the two runs a reader is actually meant to read,
 * on an artifact this store asks OPERATORS to embed. Their own
 * accessibility audit would have failed them for carrying it, which
 * makes it our defect and not their problem.
 *
 * Contrast is arithmetic, so it is a test rather than a review note.
 * Every colour the chip inks text with is walked against the paper
 * here, at the size the chip actually draws it.
 */

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const h = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => Number.parseInt(h.slice(i, i + 2), 16));
  return 0.2126 * channel(r!) + 0.7152 * channel(g!) + 0.0722 * channel(b!);
}

export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)];
  const [hi, lo] = x > y ? [x, y] : [y, x];
  return (hi + 0.05) / (lo + 0.05);
}

const WCAG_AA = 4.5;

describe("every ink the chip sets text in is legible on its paper", () => {
  it("the primary and secondary tones clear 4.5:1", () => {
    expect(contrast(CHIP_PALETTE.ink, CHIP_PALETTE.paper)).toBeGreaterThanOrEqual(WCAG_AA);
    // The one that was failing, and the reason this file exists.
    expect(contrast(CHIP_PALETTE.muted, CHIP_PALETTE.paper)).toBeGreaterThanOrEqual(WCAG_AA);
  });

  for (const [name, state] of Object.entries(CHIP_STATE)) {
    it(`the ${name} stamp clears 4.5:1`, () => {
      expect(contrast(state.color, CHIP_PALETTE.paper)).toBeGreaterThanOrEqual(WCAG_AA);
    });
  }

  it("no run is inked at a partial opacity that would undo the ratio", () => {
    /*
     * `fill-opacity` blends toward the paper and quietly costs contrast:
     * the expired stamp's date sat at 4.36:1 purely because it was set
     * at 0.9. Anything translucent has to be a rule or an ornament, not
     * a run of text — so the guard is that no <text> carries one.
     */
    const svg = renderPassportChip({
      host: "402signal.com",
      freshness: "expired",
      decision: "EXPIRED",
      observedAt: "2026-09-01T00:00:00.000Z",
      passportUrl: "https://scvd.store/passport/402signal.com",
    });
    for (const tag of svg.match(/<text[^>]*>/g) ?? []) {
      expect(/fill-opacity/.exec(tag)?.[0], tag).toBeUndefined();
    }
    // The seal's diamond is a drawn path, not a geometric character set
    // in a font — some platforms give ◆ an emoji face, and a glyph the
    // renderer has to find is a dependency an SVG should not carry.
    expect(svg).not.toContain("◆");
  });

  it("nothing a reader is meant to read is set under 8px", () => {
    // Priority 6's anti-pattern, scaled to this artifact: the eyebrow
    // and the record line were 7 and 8, on a card with room for more.
    expect(CHIP_LAYOUT.eyebrow.size).toBeGreaterThanOrEqual(8);
    expect(CHIP_LAYOUT.meta.size).toBeGreaterThanOrEqual(9);
    expect(CHIP_LAYOUT.host.sizes[CHIP_LAYOUT.host.sizes.length - 1]!).toBeGreaterThanOrEqual(10);
  });
});
