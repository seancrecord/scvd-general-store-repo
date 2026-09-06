import { describe, expect, it } from "vitest";
import {
  CHIP_BUDGETS,
  CHIP_LAYOUT,
  chipTierFace,
  fitHost,
  fitToWidth,
  renderPassportChip,
  sealAngleFor,
  splitHost,
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
): { text: string; size: number; spacing: number; anchor: string; y: number | null }[] {
  return [...svg.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/g)].map((match) => {
    const tag = match[0];
    const size = Number(/font-size="([\d.]+)"/.exec(tag)![1]);
    const spacing = Number(/letter-spacing="([\d.]+)"/.exec(tag)?.[1] ?? 0);
    const anchor = /text-anchor="([a-z]+)"/.exec(tag)?.[1] ?? "start";
    // The seal's legend is set on a path and carries no y at all; it
    // is measured against the arc's length instead of a row budget.
    const yAttr = / y="(-?[\d.]+)"/.exec(tag)?.[1];
    const y = yAttr === undefined ? null : Number(yAttr);
    // The host is set as two tspans (muted subdomain, inked apex); the
    // width that matters is the whole run, so the markup comes out.
    //
    // STRIPPED TO A FIXPOINT, not in one pass (CodeQL, 2026-09-06). A
    // single `replace(/<[^>]*>/g, "")` is incomplete: it can leave a
    // tag behind by removing the one nested inside it, so `<<tspan>x>`
    // comes out still carrying markup. Nothing here is rendered — this
    // measures an SVG string we generated ourselves — but the repo
    // already solves this in test/agent-readiness.spec.ts by looping
    // until the string stops changing, and two idioms for one job is
    // how the wrong one gets copied into a place that does render.
    let text = match[1]!;
    for (let previous = ""; previous !== text; ) {
      previous = text;
      text = text.replace(/<[^<>]*>/g, "");
    }
    return { text, size, spacing, anchor, y };
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
        if (run.y === null) {
          // The seal's legend, set around the arc.
          expect(width, `legend "${run.text}"`).toBeLessThanOrEqual(CHIP_BUDGETS.arc);
          continue;
        }
        if (run.anchor === "middle") {
          // Centred runs are the seal's mark and the stamp's two lines;
          // each has its own enclosure to stay inside.
          const enclosure = run.text === "SCVD"
            ? CHIP_BUDGETS.seal
            : CHIP_BUDGETS.stamp;
          expect(width, `centred "${run.text}"`).toBeLessThanOrEqual(enclosure);
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

  it("the eyebrow stops before the stamp begins", () => {
    // The old chip's actual failure: two runs sharing one baseline
    // with no budget between them.
    const eyebrowRight = CHIP_LAYOUT.textX + CHIP_BUDGETS.eyebrow;
    expect(eyebrowRight).toBeLessThan(CHIP_LAYOUT.stamp.cx - CHIP_LAYOUT.stamp.w / 2);
  });

  it("the seal, the rule and the setting are laid out in that order", () => {
    expect(CHIP_LAYOUT.seal.cx + CHIP_LAYOUT.seal.r).toBeLessThan(CHIP_LAYOUT.divider);
    expect(CHIP_LAYOUT.textX).toBeGreaterThan(CHIP_LAYOUT.divider);
    // The seal and the stamp both sit inside the inner rule.
    expect(CHIP_LAYOUT.seal.cy + CHIP_LAYOUT.seal.r).toBeLessThanOrEqual(CHIP_LAYOUT.height - 9);
    expect(CHIP_LAYOUT.seal.cx - CHIP_LAYOUT.seal.r).toBeGreaterThanOrEqual(9);
    expect(CHIP_LAYOUT.stamp.cx + CHIP_LAYOUT.stamp.w / 2).toBeLessThanOrEqual(CHIP_LAYOUT.width - 9);
    expect(CHIP_LAYOUT.stamp.cy - CHIP_LAYOUT.stamp.h / 2).toBeGreaterThanOrEqual(9);
  });

  it("the set lines clear the stamp and each other at the largest host size", () => {
    // Georgia's cap height is about 0.75em above the baseline.
    const biggest = CHIP_LAYOUT.host.sizes[0]!;
    expect(CHIP_LAYOUT.host.y - biggest * 0.75).toBeGreaterThan(CHIP_LAYOUT.eyebrow.y);
    // The host runs under the stamp, so it must start below it — the
    // stamp is rotated, which costs it a little more height.
    const stampBottom =
      CHIP_LAYOUT.stamp.cy +
      CHIP_LAYOUT.stamp.h / 2 +
      (CHIP_LAYOUT.stamp.w / 2) * Math.abs(Math.sin((CHIP_LAYOUT.stamp.angle * Math.PI) / 180));
    expect(CHIP_LAYOUT.host.y - biggest * 0.75).toBeGreaterThan(stampBottom);
    expect(CHIP_LAYOUT.meta.y - CHIP_LAYOUT.meta.size * 0.75).toBeGreaterThan(
      CHIP_LAYOUT.host.y + biggest * 0.16,
    );
    expect(CHIP_LAYOUT.meta.y).toBeLessThan(CHIP_LAYOUT.height - 9);
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

  it("shrinks a long host down the ramp before it cuts anything", () => {
    const short = fitHost("ok.io", CHIP_LAYOUT.host.sizes, CHIP_BUDGETS.full);
    expect(short.size).toBe(CHIP_LAYOUT.host.sizes[0]);
    expect(short.prefix).toBe("");
    expect(short.apex).toBe("ok.io");

    // A long name is set smaller, WHOLE, with its subdomain muted —
    // shrinking is what buys the name's survival.
    const longish = "api.some-long-subdomain.enterprise.example.com";
    const long = fitHost(longish, CHIP_LAYOUT.host.sizes, CHIP_BUDGETS.full);
    expect(long.size).toBeLessThan(CHIP_LAYOUT.host.sizes[0]!);
    expect(long.apex).toBe("example.com");
    expect(`${long.prefix}${long.apex}`).toBe(longish);
    expect(long.prefix).not.toContain("…");
    expect(textWidth(long.prefix + long.apex, long.size)).toBeLessThanOrEqual(CHIP_BUDGETS.full);

    // Past the ramp, the cut comes off the FRONT: the registrable name
    // is the part a reader recognises and it survives.
    const absurd = fitHost(LONG_HOST, CHIP_LAYOUT.host.sizes, CHIP_BUDGETS.full);
    expect(absurd.apex).toBe("example.com");
    expect(absurd.prefix.startsWith("…")).toBe(true);
    expect(textWidth(absurd.prefix + absurd.apex, absurd.size)).toBeLessThanOrEqual(CHIP_BUDGETS.full);
  });

  it("splits a host where a reader splits it", () => {
    expect(splitHost("example.com")).toEqual({ prefix: "", apex: "example.com" });
    expect(splitHost("api.example.com")).toEqual({ prefix: "api.", apex: "example.com" });
    expect(splitHost("localhost")).toEqual({ prefix: "", apex: "localhost" });
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
    // And on the rows with no tier, where a freshness gloss stands in —
    // the glosses are written to fit the line, not left to the fitter.
    for (const freshness of ["fresh", "aging", "expired"] as const) {
      const svg = chip({ freshness });
      const record = drawnText(svg).find((run) => run.y === CHIP_LAYOUT.meta.y)!;
      expect(record.text, freshness).not.toContain("…");
    }
    const self = chip({ host: "scvd.store", selfObserved: true });
    expect(drawnText(self).find((run) => run.y === CHIP_LAYOUT.meta.y)!.text).not.toContain("…");
  });

  it("keeps the house line on the artifact, where the face has no room for it", () => {
    // Rule 43's sentence rides in the accessible label rather than
    // truncating the one visible record line.
    expect(chip()).toContain("never a ranking");
  });

  it("carries the store's own dino inside the seal, at the size the ring allows", () => {
    /*
     * The seal held the letters SCVD until 2026-09-06; it holds the
     * mark now, which is the same drawing the favicon is cut from
     * rather than a second copy of it. A wordmark inside a ring that
     * already says SCVD GENERAL STORE around it was saying it twice.
     */
    const svg = chip();
    const dino = /<g transform="translate\(([-\d.]+) ([-\d.]+)\) scale\(([\d.]+)\)"/.exec(svg);
    expect(dino, "the dino group is drawn").not.toBeNull();
    const size = Number(dino![3]) * 100;
    // It has to sit inside the inner ring, not merely inside the card.
    expect(size).toBeLessThanOrEqual(CHIP_BUDGETS.seal + 8);
    const [x, y] = [Number(dino![1]), Number(dino![2])];
    expect(x).toBeGreaterThan(CHIP_LAYOUT.seal.cx - CHIP_LAYOUT.seal.r);
    expect(x + size).toBeLessThan(CHIP_LAYOUT.seal.cx + CHIP_LAYOUT.seal.r);
    expect(y).toBeGreaterThan(CHIP_LAYOUT.seal.cy - CHIP_LAYOUT.seal.r);
  });

  it("keeps the seal's legend on the arc", () => {
    const legend = drawnText(chip()).find((run) => run.y === null)!;
    expect(legend.text).toBe("SCVD GENERAL STORE");
    expect(textWidth(legend.text, legend.size, legend.spacing)).toBeLessThanOrEqual(CHIP_BUDGETS.arc);
  });

  it("strikes each host's seal at its own small angle, and always the same one", () => {
    // Derived, not random: a chip must render identically every time,
    // and the angle is what makes it look pressed rather than printed.
    expect(sealAngleFor("402signal.com")).toBe(sealAngleFor("402signal.com"));
    expect(sealAngleFor("402signal.com")).not.toBe(sealAngleFor("tensorfeed.ai"));
    for (const host of ["a.io", "402signal.com", "tensorfeed.ai", "bykaranteli.com", "x".repeat(60)]) {
      expect(Math.abs(sealAngleFor(host))).toBeLessThanOrEqual(4.5);
    }
    expect(chip()).toContain("rotate(");
  });

  it("says self-read on our own chip rather than claiming a census probe", () => {
    const svg = chip({ host: "scvd.store", selfObserved: true });
    expect(svg).toContain("self-read");
    // And its eyebrow is not cut mid-word to fit beside the stamp.
    const eyebrow = drawnText(svg).find((run) => run.y === CHIP_LAYOUT.eyebrow.y)!;
    expect(eyebrow.text).not.toContain("…");
    expect(svg).not.toContain("census cadence");
  });
});
