import { describe, expect, it } from "vitest";
import {
  CHIP_BUDGETS,
  CHIP_LAYOUT,
  chipTierFace,
  fitToWidth,
  renderPassportChip,
  textWidth,
} from "@/services/badge-svg";

/**
 * THE CHIP CANNOT OVERLAP ITSELF (2026-09-05).
 *
 * The chip is the one artifact this store asks operators to paste in
 * their README, and it was drawing its label through its own date and
 * its hostname through a verify URL — because SVG text does not wrap,
 * a Worker cannot measure a glyph, and every string was placed at a
 * hand-picked coordinate and hoped for. A count of characters could
 * not have caught it either: the old fit was `host.slice(0, 34)`, and
 * `WWW.EXAMPLE.COM` is nowhere near the width of `illinois.io`.
 *
 * So the geometry is stated as data, every string is fitted to a
 * budget derived from it, and this spec walks the widths for the
 * inputs that actually break a layout: the longest hostname anyone
 * can register, the widest possible caps, the longest state word and
 * the longest tier. A future edit that moves the stamp without moving
 * the budget fails here rather than on somebody's front page.
 */

const WIDEST = "WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW.COM";
const LONG_HOST = "api.some-extremely-long-subdomain.enterprise-customer.example.com";

function chip(over: Partial<Parameters<typeof renderPassportChip>[0]> = {}): string {
  return renderPassportChip({
    host: "bykaranteli.com",
    freshness: "fresh",
    decision: "READY",
    observedAt: "2026-09-01T13:27:08.998Z",
    passportUrl: "https://scvd.store/passport/bykaranteli.com",
    ...over,
  });
}

/** Every `<text>` the chip drew, with the font size and spacing it used. */
function drawnText(
  svg: string,
): { text: string; size: number; spacing: number; anchor: string; y: number }[] {
  return [...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((match) => {
    const tag = match[0];
    const size = Number(/font-size="([\d.]+)"/.exec(tag)![1]);
    const spacing = Number(/letter-spacing="([\d.]+)"/.exec(tag)?.[1] ?? 0);
    const anchor = /text-anchor="([a-z]+)"/.exec(tag)?.[1] ?? "start";
    const y = Number(/ y="([\d.]+)"/.exec(tag)![1]);
    return { text: match[1]!, size, spacing, anchor, y };
  });
}

describe("the width estimate is conservative where it matters", () => {
  it("never under-measures caps, which is the direction that overlaps", () => {
    // Caps and Ws are the glyphs that broke the old chip.
    expect(textWidth("WWWW", 10)).toBeGreaterThan(textWidth("iiii", 10));
    expect(textWidth("MMMM", 10)).toBeGreaterThan(textWidth("mmmm", 10));
    // Same character count, very different widths — the bug the old
    // `slice(0, 34)` fit could not see.
    expect(textWidth("WWWWWWWWWWW", 12)).toBeGreaterThan(2 * textWidth("illinois.io", 12));
  });

  it("fits to the budget, keeps a prefix, and refuses to draw a bare ellipsis", () => {
    const fitted = fitToWidth(WIDEST, 13, 100);
    expect(textWidth(fitted, 13)).toBeLessThanOrEqual(100);
    expect(fitted.endsWith("…")).toBe(true);
    expect(fitted.startsWith("W")).toBe(true);
    // Nothing fits: empty, not a lone ellipsis pretending to be a name.
    expect(fitToWidth(WIDEST, 13, 2)).toBe("");
    // Already short enough: returned untouched, no ellipsis.
    expect(fitToWidth("ok.io", 13, 200)).toBe("ok.io");
  });
});

describe("no drawn string leaves its box, for any input", () => {
  const cases: [string, string][] = [
    ["an ordinary host", chip()],
    ["the longest realistic host", chip({ host: LONG_HOST })],
    ["the widest possible caps", chip({ host: WIDEST })],
    ["expired, the longest state word", chip({ host: LONG_HOST, freshness: "expired" })],
    ["aging with a tier", chip({ freshness: "aging", tier: { tier: "established", line: "established — 4 of 4, W01–W04", ready: 4, rounds: 4 } })],
    ["an indeterminate tier", chip({ tier: { tier: "indeterminate", line: "indeterminate — 1 of 1", ready: 1, rounds: 1 } })],
    ["the self chip", chip({ host: "scvd.store", selfObserved: true })],
  ];

  for (const [name, svg] of cases) {
    it(`keeps every run inside the card: ${name}`, () => {
      for (const run of drawnText(svg)) {
        const width = textWidth(run.text, run.size, run.spacing);
        if (run.anchor === "middle") {
          // The seal's two lines, centred in the struck circle.
          expect(width, `seal "${run.text}"`).toBeLessThanOrEqual(CHIP_LAYOUT.seal.r * 2 - 4);
          continue;
        }
        if (run.anchor === "end") {
          // The state, set right; it may not reach back into the eyebrow.
          expect(width, `state "${run.text}"`).toBeLessThanOrEqual(CHIP_BUDGETS.state);
          continue;
        }
        const budget =
          run.y === CHIP_LAYOUT.eyebrow.y ? CHIP_BUDGETS.eyebrow : CHIP_BUDGETS.full;
        expect(width, `run "${run.text}"`).toBeLessThanOrEqual(budget);
        // And inside the drawn border, not just inside its own budget.
        expect(CHIP_LAYOUT.textX + width).toBeLessThanOrEqual(CHIP_LAYOUT.textEnd + 0.001);
      }
    });
  }

  it("the eyebrow stops before the state's reserved column", () => {
    // The old chip's actual failure: two runs sharing one baseline
    // with no budget between them.
    const eyebrowRight = CHIP_LAYOUT.textX + CHIP_BUDGETS.eyebrow;
    expect(eyebrowRight).toBeLessThan(CHIP_LAYOUT.textEnd - CHIP_BUDGETS.state);
  });

  it("the setting starts clear of the seal and its rule", () => {
    const sealRight = CHIP_LAYOUT.seal.cx + CHIP_LAYOUT.seal.r;
    expect(CHIP_LAYOUT.divider).toBeGreaterThan(sealRight);
    expect(CHIP_LAYOUT.textX).toBeGreaterThan(CHIP_LAYOUT.divider);
    // The seal sits inside the card, clear of the frame.
    expect(CHIP_LAYOUT.seal.cy + CHIP_LAYOUT.seal.r).toBeLessThanOrEqual(CHIP_LAYOUT.height - 3);
    expect(CHIP_LAYOUT.seal.cx - CHIP_LAYOUT.seal.r).toBeGreaterThanOrEqual(3);
  });

  it("the three set lines clear each other", () => {
    // Georgia's cap height is about 0.75em above the baseline.
    expect(CHIP_LAYOUT.host.y - CHIP_LAYOUT.host.size * 0.75).toBeGreaterThan(CHIP_LAYOUT.eyebrow.y);
    expect(CHIP_LAYOUT.meta.y - CHIP_LAYOUT.meta.size * 0.75).toBeGreaterThan(
      CHIP_LAYOUT.host.y + CHIP_LAYOUT.host.size * 0.16,
    );
    expect(CHIP_LAYOUT.meta.y).toBeLessThan(CHIP_LAYOUT.height - 4);
  });
});

describe("what the chip says", () => {
  it("leads the meta line with the date, so a cut takes the sentence and not the fact", () => {
    const svg = chip({ host: LONG_HOST });
    expect(svg).toContain("observed 2026-09-01");
  });

  it("never prints a full URL on the face — that was the run that overlapped the host", () => {
    const svg = chip();
    expect(svg).not.toContain("verify: https://");
    // The link still reaches a screen reader, and the markdown embed
    // wraps the whole chip in the anchor.
    expect(svg).toContain("https://scvd.store/passport/bykaranteli.com");
  });

  it("states an indeterminate tier as its fraction, not as a verdict-shaped word", () => {
    expect(chipTierFace({ tier: "indeterminate", ready: 1, rounds: 1 })).toBe("1/1 round ready");
    // `observed` is dropped for a different reason: the line it would
    // sit on already opens "observed <date>", and the chip stuttered.
    expect(chipTierFace({ tier: "observed", ready: 1, rounds: 1 })).toBe("1/1 round ready");
    expect(chipTierFace({ tier: "standing", ready: 8, rounds: 8 })).toBe(
      "standing · 8/8 rounds ready",
    );
    expect(chipTierFace({ tier: "established", ready: 4, rounds: 4 })).toBe(
      "established · 4/4 rounds ready",
    );
    const svg = chip({ tier: { tier: "indeterminate", line: "indeterminate — 1 of 1", ready: 1, rounds: 1 } });
    // The scary word does not ride on the face; it stays in the label.
    expect(svg).not.toContain(">INDETERMINATE");
    expect(svg).toContain("1/1 round ready");
  });

  it("does not ellipse its record line on an ordinary host", () => {
    /*
     * A label whose last words are always "…" reads as broken rather
     * than as brief. The record line carries the date and one thing
     * more, and both survive at the hostnames people actually have.
     */
    for (const host of ["bykaranteli.com", "402signal.com", "tensorfeed.ai"]) {
      const svg = chip({
        host,
        tier: { tier: "established", line: "established — 4 of 4", ready: 4, rounds: 4 },
      });
      const record = drawnText(svg).find((run) => run.y === CHIP_LAYOUT.meta.y)!;
      expect(record.text, host).not.toContain("…");
      expect(record.text, host).toContain("4/4 rounds ready");
    }
  });

  it("keeps the house line on the artifact, where the face has no room for it", () => {
    // Rule 43's sentence rides in the accessible label rather than
    // truncating the one visible record line.
    expect(chip()).toContain("never a ranking");
  });

  it("keeps the seal's mark inside its ring", () => {
    const seal = drawnText(chip()).filter((run) => run.anchor === "middle");
    expect(seal.length).toBe(1);
    // The inner ring is the real bound, not the outer one.
    expect(textWidth(seal[0]!.text, seal[0]!.size, seal[0]!.spacing)).toBeLessThanOrEqual(
      (CHIP_LAYOUT.seal.r - 3.2) * 2 - 2,
    );
  });

  it("says self-read on our own chip rather than claiming a census probe", () => {
    const svg = chip({ host: "scvd.store", selfObserved: true });
    expect(svg).toContain("self-read");
    expect(svg).not.toContain("census cadence");
  });
});
