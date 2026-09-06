import { inkParamsFromSignature } from "@/lib/ink";
import { escapeHtml } from "@/lib/sanitize";
import { STORE_METADATA } from "@/store";

/**
 * SVG generation for patron badges and the free visitor sticker.
 * Design language: vintage general-store label. Paper, ink, a border
 * that looks set by hand. Not a tech badge.
 */

const PAPER = "#f4ead8";
const INK = "#3b2f23";
const ACCENT = "#8c2f1b";
const FADED = "#7a6a55";

const PATRONAGE_GOLD = "#8c6a1b";

export interface PatronBadgeOptions {
  patronNumber: number;
  date: string;
  verifyUrl: string;
  name?: string;
  /** Certificate of Patronage: gilt number, one extra line. */
  patronage?: boolean;
  /** The certificate's signature seeds the rendering, forever. */
  signature?: string;
}

/** SVG text doesn't wrap; long names get trimmed to fit the label. */
function fitName(name: string, max: number): string {
  return name.length > max ? `${name.slice(0, max - 1)}\u2026` : name;
}

/**
 * HOW WIDE THAT WILL DRAW, IN PIXELS (2026-09-05).
 *
 * SVG text does not wrap and a Worker cannot measure a glyph, so
 * every label in this file placed its text at hand-picked
 * coordinates and hoped. The passport chip stopped hoping in public:
 * a tier word on the left and a date on the right were drawn at the
 * same baseline with no budget between them, so `SCVD PASSPORT \u00b7
 * INDETERMINATE` ran straight through `FRESH \u2022 2026-09-01`, and the
 * host ran through a verify URL on the line below. It was the one
 * artifact we ask operators to paste in their README.
 *
 * A COUNT OF CHARACTERS CANNOT FIX IT, which is why the old
 * `fitName(host, 34)` did not: `WWW.EXAMPLE.COM` and `illinois.io`
 * are the same length and nowhere near the same width. So this
 * estimates by glyph class \u2014 Georgia's caps are near 0.7em, its
 * lowercase near 0.5, digits 0.55, and punctuation a third of that \u2014
 * and every string on the chip is fitted to a stated budget before
 * it is drawn. The estimate runs slightly WIDE on purpose: erring
 * long costs an ellipsis, erring short costs an overlap, and only
 * one of those ends up on somebody's front page.
 */
function glyphEm(ch: string): number {
  if (ch === " ") return 0.25;
  if (/[.,:;'`!|]/.test(ch)) return 0.28;
  if (/[\u00b7\u2022\u2013\u2014]/.test(ch)) return 0.5;
  if (/[ilj]/.test(ch)) return 0.31;
  if (/[tfr]/.test(ch)) return 0.4;
  if (/[mw]/.test(ch)) return 0.82;
  if (/[MW]/.test(ch)) return 0.95;
  if (/[IJ]/.test(ch)) return 0.42;
  if (/[A-Z]/.test(ch)) return 0.72;
  if (/[0-9]/.test(ch)) return 0.56;
  return 0.52;
}

export function textWidth(text: string, fontSize: number, letterSpacing = 0): number {
  let em = 0;
  for (const ch of text) em += glyphEm(ch);
  return em * fontSize + Math.max(0, [...text].length - 1) * letterSpacing;
}

/**
 * The longest prefix of `text` that draws inside `maxWidth`, with an
 * ellipsis when anything was dropped. Returns "" rather than a bare
 * ellipsis when even one glyph will not fit: a lone "\u2026" in a label is
 * noise pretending to be information.
 */
export function fitToWidth(
  text: string,
  fontSize: number,
  maxWidth: number,
  letterSpacing = 0,
): string {
  if (textWidth(text, fontSize, letterSpacing) <= maxWidth) return text;
  const chars = [...text];
  for (let take = chars.length - 1; take > 0; take -= 1) {
    const candidate = `${chars.slice(0, take).join("").trimEnd()}\u2026`;
    if (textWidth(candidate, fontSize, letterSpacing) <= maxWidth) return candidate;
  }
  return "";
}

export function renderPatronBadge(options: PatronBadgeOptions): string {
  const ink = inkParamsFromSignature(options.signature);
  const sealRotation = (-8 + ink.rotationDeg).toFixed(2);
  const sealOpacity = (0.92 * ink.inkOpacity).toFixed(3);
  const dateLabel = options.date.slice(0, 10);
  // The label says the town. Oak City, keeper's decision, 2026-07-23.
  const town = STORE_METADATA.location.split(",")[0] ?? "Oak City";
  const sealColor = options.patronage ? PATRONAGE_GOLD : ACCENT;
  const nameLine = options.name
    ? `<text x="200" y="174" text-anchor="middle" font-family="Georgia, serif" font-style="italic" font-size="13.5" fill="${INK}">bestowed upon ${escapeHtml(fitName(options.name, 44))}</text>`
    : "";
  const patronageLine = options.patronage
    ? `<text x="200" y="212" text-anchor="middle" font-family="Georgia, serif" font-style="italic" font-size="11.5" fill="${PATRONAGE_GOLD}">a patron of the store, by choice</text>`
    : "";
  const sevenMark =
    options.patronNumber % 7 === 0
      ? `<text x="30" y="276" text-anchor="middle" font-family="Georgia, serif" font-size="12" fill="${ACCENT}">7</text>`
      : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="400" height="300" viewBox="0 0 400 300" role="img" aria-label="Patron badge no. ${options.patronNumber}">
  <rect width="400" height="300" fill="${PAPER}" rx="10"/>
  <rect x="12" y="12" width="376" height="276" fill="none" stroke="${INK}" stroke-width="2.5" rx="6"/>
  <rect x="19" y="19" width="362" height="262" fill="none" stroke="${INK}" stroke-width="0.75" stroke-dasharray="1 4" stroke-dashoffset="${ink.hairlineOffset}" rx="4"/>
  <text x="200" y="56" text-anchor="middle" font-family="Georgia, serif" font-weight="bold" font-size="20" fill="${INK}">SEAN-CLAUDE VAN DAMME'S</text>
  <text x="200" y="80" text-anchor="middle" font-family="Georgia, serif" font-size="14" letter-spacing="7" fill="${INK}">GENERAL STORE</text>
  <line x1="84" y1="98" x2="316" y2="98" stroke="${INK}" stroke-width="1"/>
  <circle cx="200" cy="98" r="2.5" fill="${ACCENT}"/>
  <text x="200" y="126" text-anchor="middle" font-family="Georgia, serif" font-size="13" fill="${FADED}">This certifies our esteemed</text>
  <text x="200" y="158" text-anchor="middle" font-family="Georgia, serif" font-weight="bold" font-size="29" fill="${sealColor}">PATRON No. ${options.patronNumber}</text>
  ${nameLine}
  <text x="200" y="194" text-anchor="middle" font-family="Georgia, serif" font-size="10.5" letter-spacing="1.5" fill="${FADED}">${escapeHtml(town)} \u2022 ${dateLabel}</text>
  ${patronageLine}
  <g transform="rotate(${sealRotation} 326 218)" opacity="${sealOpacity}">
    <defs><path id="sealArc" d="M 326 186 a 32 32 0 1 1 -0.01 0"/></defs>
    <circle cx="326" cy="218" r="44" fill="none" stroke="${sealColor}" stroke-width="2.5" stroke-dasharray="2 3"/>
    <circle cx="326" cy="218" r="38" fill="none" stroke="${sealColor}" stroke-width="1.2"/>
    <text font-family="Georgia, serif" font-size="6.2" letter-spacing="1.2" fill="${sealColor}"><textPath href="#sealArc">OAK CITY \u2022 WHERE YOU'RE NEVER LATE</textPath></text>
    <text x="326" y="216" text-anchor="middle" font-family="Georgia, serif" font-weight="bold" font-size="14" letter-spacing="2.5" fill="${sealColor}">SCVD</text>
    <text x="326" y="229" text-anchor="middle" font-family="Georgia, serif" font-size="6.5" letter-spacing="1.6" fill="${sealColor}">SIGNED &amp; SETTLED</text>
  </g>
  <a xlink:href="${escapeHtml(options.verifyUrl)}" href="${escapeHtml(options.verifyUrl)}">
    <text x="200" y="272" text-anchor="middle" font-family="Georgia, serif" font-size="10" fill="${FADED}" text-decoration="underline">verify: ${escapeHtml(options.verifyUrl)}</text>
  </a>
  ${sevenMark}
</svg>`;
}

export interface AuditBadgeOptions {
  host: string;
  verdict: "ready" | "not_ready" | "unreachable" | "refused";
  /** ISO timestamp; the date is the loudest true thing on the label. */
  observedAt: string;
  criteria: string;
  reportUrl: string;
  /** The report's signature seeds the ink, same as the patron badge. */
  signature?: string;
}

/** Verdict ink: moss for ready, the house red otherwise. Rule 43
 * shapes the words — a fact about one moment, never a grade. */
const MOSS = "#3f5a2f";
const VERDICT_LABEL: Record<AuditBadgeOptions["verdict"], { line: string; sub: string; color: string }> = {
  ready: {
    line: "ANSWERED READY",
    sub: "every published check answered",
    color: MOSS,
  },
  not_ready: {
    line: "NOT READY",
    sub: "one or more published checks failed",
    color: ACCENT,
  },
  unreachable: {
    line: "UNREACHABLE",
    sub: "no usable answer reached us",
    color: ACCENT,
  },
  refused: {
    line: "NOT PROBED",
    sub: "the target failed our probe-target law",
    color: FADED,
  },
};

/**
 * THE AUDIT BADGE — the displayable half of the verification
 * marketplace, built 2026-08-20 under the /criteria ruling: a badge
 * is a DATED observation rendered small enough to embed, it ages
 * rather than retires, and it is never a ranking. So
 * the date shares the line with the verdict, the criteria version is
 * printed, and the whole label links to the signed report anyone can
 * verify without us. All four verdicts render — a store that badges
 * only good news is selling endorsements, which is the thing this is
 * not.
 */
export function renderAuditBadge(options: AuditBadgeOptions): string {
  const ink = inkParamsFromSignature(options.signature);
  const verdict = VERDICT_LABEL[options.verdict];
  const date = options.observedAt.slice(0, 10);
  const host = fitName(options.host, 40);
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="380" height="132" viewBox="0 0 380 132" role="img" aria-label="Conformance observation: ${escapeHtml(options.host)} ${verdict.line.toLowerCase()} on ${date}">
  <rect width="380" height="132" fill="${PAPER}" rx="8"/>
  <rect x="8" y="8" width="364" height="116" fill="none" stroke="${INK}" stroke-width="2" rx="5"/>
  <rect x="13" y="13" width="354" height="106" fill="none" stroke="${INK}" stroke-width="0.6" stroke-dasharray="1 4" stroke-dashoffset="${ink.hairlineOffset}" rx="3"/>
  <text x="190" y="32" text-anchor="middle" font-family="Georgia, serif" font-size="10" letter-spacing="3" fill="${FADED}">SCVD GENERAL STORE • CONFORMANCE DESK</text>
  <text x="190" y="52" text-anchor="middle" font-family="Georgia, serif" font-size="13" fill="${INK}">${escapeHtml(host)}</text>
  <text x="190" y="78" text-anchor="middle" font-family="Georgia, serif" font-weight="bold" font-size="20" fill="${verdict.color}">${verdict.line} • ${date}</text>
  <text x="190" y="94" text-anchor="middle" font-family="Georgia, serif" font-style="italic" font-size="10" fill="${FADED}">${escapeHtml(verdict.sub)} • criteria ${escapeHtml(options.criteria)}</text>
  <text x="190" y="107" text-anchor="middle" font-family="Georgia, serif" font-size="9" fill="${FADED}">a dated observation of one moment — it ages, it is never a ranking</text>
  <a xlink:href="${escapeHtml(options.reportUrl)}" href="${escapeHtml(options.reportUrl)}">
    <text x="190" y="119" text-anchor="middle" font-family="Georgia, serif" font-size="8.5" fill="${FADED}" text-decoration="underline">signed report: ${escapeHtml(options.reportUrl)}</text>
  </a>
</svg>`;
}

/**
 * THE CHIP'S OWN INKS (2026-09-05). Warmer paper and a darker,
 * browner black than the big badges use: the chip renders at 300px on
 * somebody else's page, usually beside their own type, and the
 * mid-brown that reads as aged paper at 400x300 reads as washed out
 * at this size. Kept separate rather than moving the shared constants,
 * because the patron badge and the audit badge are drawn for print
 * proportions and were not the thing that looked cheap.
 */
const CHIP_PAPER = "#f7f2e6";
const CHIP_INK = "#241d16";
const CHIP_MUTED = "#8a7b64";

/**
 * The chip's freshness palette. Broken and indeterminate never
 * render — the route refuses them the way the passport door does.
 *
 * PRINTER'S INKS, NOT TRAFFIC LIGHTS (2026-09-05): the old #2e7d32
 * was a dashboard's success green and made the label read as a status
 * pill. Deep forest, ochre and a grey that genuinely looks dead are
 * the three a letterpress shop would have on the shelf, and the last
 * one does the functional work of an expired chip looking expired.
 */
const CHIP_STATE: Record<
  "fresh" | "aging" | "expired",
  { color: string; sub: string }
> = {
  fresh: { color: "#1f4d33", sub: "observed inside one census cadence" },
  aging: { color: "#7a4a0e", sub: "older than one cadence — a refresh says more" },
  expired: { color: "#6b6154", sub: "too old to rely on; agents should refuse it" },
};

export interface PassportChipOptions {
  host: string;
  freshness: "fresh" | "aging" | "expired";
  /**
   * The passport's own decision word, passed in rather than re-derived
   * (2026-09-01). The chip draws three states and the passport decides
   * four, so a reader who embeds the chip and a machine that reads the
   * passport were being handed two vocabularies for the same host. The
   * chip keeps its palette — that is a design ruling, and an expired
   * chip going grey rather than red is the honest picture — but its
   * accessible label now says the word the passport says, so the two
   * cannot be quoted against each other.
   */
  decision: string;
  observedAt: string;
  passportUrl: string;
  /**
   * The store's own chip (the instrument audit, 2026-08-28). A census
   * chip's sub-caption says "observed inside one census cadence" —
   * false for our own host, which the census structurally cannot
   * probe. A self chip says what it is on its face, because it
   * renders pixel-adjacent to chips earned the census way and a
   * reader comparing them deserves to know they are two instruments.
   */
  selfObserved?: boolean;
  /**
   * The passport's tier with its fraction (2026-09-02). The face carries
   * the compact form (ESTABLISHED 4/4), the accessible label the whole
   * line, and an indeterminate tier draws dark. Absent on SELF.
   */
  tier?: { tier: string; line: string; ready: number; rounds: number };
}

/**
 * THE PASSPORT CHIP (2026-08-21, the keeper's "both" ruling): the
 * free, embeddable, FRESHNESS-DEGRADING face of an endpoint
 * passport. An operator embeds it once; it decays on its own —
 * fresh, aging, expired — by the same arithmetic printed on the
 * passport, so it can never become stale wallpaper, and an aging
 * chip on your own page is the politest possible case for the
 * refresh. Free at the observation level; the AUDITED level's badge
 * stays the paid one that rides service_audit / launch_check — the
 * free/paid line maps onto the assurance ladder, not onto a paywall
 * invented for the chip.
 */
/**
 * THE CHIP'S GEOMETRY, STATED ONCE (2026-09-05). Every number the
 * layout depends on lives here so the test can assert the budgets
 * rather than re-measure a string of SVG — and so a later edit that
 * moves the stamp has to move the budget that keeps text out of it.
 */
export const CHIP_LAYOUT = {
  /**
   * A CARD, NOT A BADGE (2026-09-06, fourth pass).
   *
   * The keeper's read of the ribbon: "second tier of five." Three
   * things were holding it there. It was small — a 300px strip beside
   * a row of shields, when this store's own copy calls it a COLOPHON
   * to paste beside your door. It carried no craft: a rectangle, a
   * circle and three lines of Georgia is what every SaaS card is. And
   * it looked like nothing in particular, when the artifact is called
   * a PASSPORT and a passport has one unmistakable visual language —
   * the entry stamp.
   *
   * So: a card at 400x110, an engraved ground, a seal with its legend
   * set around the arc, and the freshness struck across the corner as
   * a stamp rather than printed as a word. The aspect changes, which
   * old pasted embeds cannot follow; every generator here emits the
   * new size and the keeper's desk carries the note.
   */
  width: 400,
  height: 110,
  /** The struck seal, with its legend around the arc. */
  seal: { cx: 56, cy: 55, r: 28, arc: 21 },
  /** The hairline between the seal and the setting. */
  divider: 100,
  /** Where the set lines begin. */
  textX: 114,
  /** The right edge the set lines stop at. */
  textEnd: 382,
  eyebrow: { y: 34, size: 7, spacing: 2.2 },
  /** The entry stamp: the one loud thing, struck across the corner. */
  stamp: { cx: 320, cy: 36, w: 112, h: 40, angle: -3.5 },
  /**
   * The host is what a reader came for, so it gets the room: one size
   * down the ramp per step until it fits, and the subdomain muted so
   * the eye lands on the registrable name.
   */
  host: { y: 79, sizes: [22, 20, 18, 16, 14, 12, 10.5] },
  meta: { y: 94, size: 8 },
} as const;

/** Budgets derived from the geometry, never typed twice (AT_SCALE rule 1). */
export const CHIP_BUDGETS = {
  /** The eyebrow shares its band with the stamp, so it stops short of it. */
  eyebrow:
    CHIP_LAYOUT.stamp.cx - CHIP_LAYOUT.stamp.w / 2 - CHIP_LAYOUT.textX - 12,
  /** The host and record rows run under the stamp, to the full width. */
  full: CHIP_LAYOUT.textEnd - CHIP_LAYOUT.textX,
  /** Inside the stamp's inner rule. */
  stamp: CHIP_LAYOUT.stamp.w - 22,
  /** Inside the seal's inner ring, where the house mark is struck. */
  seal: (CHIP_LAYOUT.seal.arc - 4) * 2,
  /**
   * Along the seal's TOP arc. The legend rides the upper half only —
   * text set around the bottom of a circle reads upside down, which is
   * exactly how the first draft of this seal rendered it.
   */
  arc: Math.PI * CHIP_LAYOUT.seal.arc,
} as const;

/**
 * The tier as the chip's face says it. The face used to print the
 * tier word in caps beside the store's name, which put
 * `INDETERMINATE` — a statement about how MANY rounds we have, not
 * about the door — in the loudest position on a chip whose own
 * decision was READY. A reader saw a scary word next to their
 * hostname. So the face states the fraction, which is the part that
 * means something at a glance, and names the tier only when the tier
 * is a finding rather than an absence. The whole line stays in the
 * accessible label and on the passport page.
 * ⚑ Rule 7: the wording is the keeper's to keep or kill.
 */
/**
 * A HOSTNAME, SPLIT WHERE A READER SPLITS IT.
 *
 * `api.long-subdomain.enterprise.example.com` truncated from the right
 * loses the only part anybody recognises. So the chip sets the
 * registrable name in ink and everything before it muted: the eye
 * lands on `example.com`, and the path to it is still legible for
 * anyone who wants it. The split is the last two labels, which is
 * wrong for a handful of public suffixes (`co.uk` and its cousins) and
 * harmless when it is — being wrong here mutes one label too few, it
 * never hides the name.
 */
export function splitHost(host: string): { prefix: string; apex: string } {
  const parts = host.split(".");
  if (parts.length <= 2) return { prefix: "", apex: host };
  const apex = parts.slice(-2).join(".");
  return { prefix: host.slice(0, host.length - apex.length), apex };
}

export interface FittedHost {
  prefix: string;
  apex: string;
  size: number;
}

/**
 * The largest size on the ramp at which the whole name fits, and only
 * when nothing on the ramp does, a cut — taken off the FRONT, where
 * the subdomains are, so the registrable name survives. Shrinking
 * before cutting is the elegant order: a name set two points smaller
 * is still the name, and a name with its tail cut off is not.
 */
export function fitHost(
  host: string,
  sizes: readonly number[],
  budget: number,
): FittedHost {
  const { prefix, apex } = splitHost(host);
  for (const size of sizes) {
    if (textWidth(host, size) <= budget) return { prefix, apex, size };
  }
  const size = sizes[sizes.length - 1]!;
  // Keep the apex whole and eat the prefix from the left.
  const apexWidth = textWidth(apex, size);
  const room = budget - apexWidth - textWidth("…", size);
  if (room <= 0) {
    // Even the registrable name will not fit; fall back to the plain
    // fitter rather than pretend the split bought us anything.
    return { prefix: "", apex: fitToWidth(apex, size, budget), size };
  }
  const chars = [...prefix];
  for (let drop = 1; drop <= chars.length; drop += 1) {
    const tail = chars.slice(drop).join("");
    if (textWidth(tail, size) <= room) return { prefix: `…${tail}`, apex, size };
  }
  return { prefix: "", apex, size };
}

export function chipTierFace(tier: { tier: string; ready: number; rounds: number }): string {
  const fraction = `${tier.ready}/${tier.rounds} ${tier.rounds === 1 ? "round" : "rounds"} ready`;
  /*
   * Two tier words are dropped from the face rather than printed.
   * `indeterminate` is a statement about how many rounds we hold, not
   * about the door, and it was the loudest thing on a chip whose own
   * decision was READY. `observed` is the entry tier, and the line it
   * would sit on already opens "observed <date>" — the chip read
   * "observed 2026-08-19 · observed · 1/1 round ready", which is a
   * label stuttering at its reader. Both keep their full line in the
   * accessible label and on the passport page.
   */
  return tier.tier === "indeterminate" || tier.tier === "observed"
    ? fraction
    : `${tier.tier} · ${fraction}`;
}

/**
 * THE CHIP, AS A LETTERPRESS LABEL (redrawn 2026-09-05, second pass).
 *
 * The first pass fixed the overlap and the keeper looked at it: "at
 * least they are aligned now, they still don't look premium." He was
 * right, and the reasons were all craft rather than arithmetic —
 * nested rounded rectangles read as a web widget, a supermarket green
 * read as a status pill, three left-aligned rows of near-equal weight
 * gave the eye nothing to land on, and a small italic sub-line at 7px
 * is mud at any resolution.
 *
 * So: squared corners and ONE hairline frame, because engraving does
 * not round its corners. A struck seal on the left, which is the
 * house's own mark and gives the label an anchor the way a wax seal
 * anchors a document. A hairline rule between the seal and the
 * setting. Real hierarchy — tracked small caps over a large host over
 * a quiet line of record. And one accent, in inks a printer would
 * recognise (deep forest, ochre, a grey that reads dead) rather than
 * the traffic-light greens a dashboard uses.
 */
/**
 * HOW FAR OFF SQUARE THIS HOST'S SEAL SITS.
 *
 * A seal printed at exactly zero degrees is a logo; one a degree or
 * two off is a mark somebody pressed. The angle is DERIVED from the
 * hostname rather than random, so a chip is stable across every
 * re-render — the same host always gets the same press — and no two
 * neighbouring hosts sit at quite the same angle. Bounded to a few
 * degrees: enough to read as struck, never enough to read as broken.
 */
export function sealAngleFor(host: string): number {
  let hash = 0;
  for (const ch of host) hash = (hash * 31 + ch.codePointAt(0)!) >>> 0;
  // -4.5 to +4.5 degrees, in tenths, so the string stays short.
  return Math.round((((hash % 91) - 45) / 10) * 10) / 10;
}

/**
 * THE ENGRAVED GROUND. Four sine lines at a whisper of opacity, the
 * way a bond certificate lays a guilloche under its type — it is not
 * meant to be looked at, only to be there when somebody looks closely,
 * which is the difference between printed and produced. The phase is
 * derived from the host, so no two chips carry quite the same weave.
 */
function guilloche(host: string, width: number, height: number): string {
  let hash = 0;
  for (const ch of host) hash = (hash * 131 + ch.codePointAt(0)!) >>> 0;
  const lines: string[] = [];
  for (let index = 0; index < 4; index += 1) {
    const phase = ((hash >>> (index * 3)) % 36) / 6;
    const midline = height * (0.22 + index * 0.19);
    const amplitude = 5 + (index % 2) * 2.5;
    const points: string[] = [];
    for (let x = 0; x <= width; x += 5) {
      const y = midline + Math.sin(x / 17 + phase + index) * amplitude;
      points.push(`${x === 0 ? "M" : "L"}${x} ${y.toFixed(1)}`);
    }
    lines.push(points.join(" "));
  }
  return lines
    .map(
      (d) =>
        `<path d="${d}" fill="none" stroke="${CHIP_INK}" stroke-opacity="0.055" stroke-width="0.7"/>`,
    )
    .join("\n  ");
}

export function renderPassportChip(options: PassportChipOptions): string {
  const L = CHIP_LAYOUT;
  const state = CHIP_STATE[options.freshness];
  const date = options.observedAt.slice(0, 10);
  const tier = options.selfObserved ? undefined : options.tier;
  const serif = "Georgia, 'Times New Roman', serif";
  /* "SELF-OBSERVED PASSPORT" did not fit the band beside the stamp and
   * came out cut mid-word; the record line below carries the whole of
   * what self-observed means anyway. */
  const eyebrow = options.selfObserved ? "SELF-OBSERVED" : "ENDPOINT PASSPORT";
  const host = fitHost(options.host, L.host.sizes, CHIP_BUDGETS.full);
  const sealAngle = sealAngleFor(options.host);
  /*
   * The record line: the date, then ONE thing more. Three parts made a
   * line that ellipsed on ordinary hosts, and a label whose last words
   * are always "…" reads as broken rather than as brief.
   */
  const second = options.selfObserved
    ? "self-read of our own catalogs, not a census probe"
    : tier
      ? chipTierFace(tier)
      : state.sub;
  const meta = `observed ${date}  ·  ${second}`;
  const prefix = host.prefix
    ? `<tspan fill="${CHIP_MUTED}">${escapeHtml(host.prefix)}</tspan>`
    : "";
  const legend = "SCVD GENERAL STORE";
  const S = L.stamp;
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${L.width}" height="${L.height}" viewBox="0 0 ${L.width} ${L.height}" role="img" aria-label="Endpoint passport: ${escapeHtml(options.host)} — ${escapeHtml(options.decision)}, evidence ${options.freshness}${options.selfObserved ? " (self-observed)" : ""}, observed ${date}${tier ? `, tier ${escapeHtml(tier.line)}` : ""}. A dated observation, never a ranking. Verify at ${escapeHtml(options.passportUrl)}">
  <defs>
    <clipPath id="chipField"><rect x="9" y="9" width="${L.width - 18}" height="${L.height - 18}" rx="2"/></clipPath>
    <path id="chipArc" d="M ${L.seal.cx - L.seal.arc} ${L.seal.cy} A ${L.seal.arc} ${L.seal.arc} 0 0 1 ${L.seal.cx + L.seal.arc} ${L.seal.cy}"/>
  </defs>
  <rect width="${L.width}" height="${L.height}" fill="${CHIP_PAPER}" rx="4"/>
  <g clip-path="url(#chipField)">
  ${guilloche(options.host, L.width, L.height)}
  </g>
  <rect x="4.5" y="4.5" width="${L.width - 9}" height="${L.height - 9}" fill="none" stroke="${CHIP_INK}" stroke-width="1.2" rx="3"/>
  <rect x="8.5" y="8.5" width="${L.width - 17}" height="${L.height - 17}" fill="none" stroke="${CHIP_INK}" stroke-width="0.35" stroke-opacity="0.55" rx="2"/>
  <g transform="rotate(${sealAngle} ${L.seal.cx} ${L.seal.cy})">
    <g stroke="${CHIP_INK}" fill="none">
      <circle cx="${L.seal.cx}" cy="${L.seal.cy}" r="${L.seal.r}" stroke-width="1.2"/>
      <circle cx="${L.seal.cx}" cy="${L.seal.cy}" r="${L.seal.r - 3}" stroke-width="0.4" stroke-dasharray="1.6 2.4"/>
      <circle cx="${L.seal.cx}" cy="${L.seal.cy}" r="${L.seal.arc - 5}" stroke-width="0.5"/>
    </g>
    <text font-family="${serif}" font-size="4.4" letter-spacing="0.5" fill="${CHIP_INK}" fill-opacity="0.85"><textPath href="#chipArc" startOffset="50%" text-anchor="middle">${escapeHtml(legend)}</textPath></text>
    <text x="${L.seal.cx}" y="${L.seal.cy + 3.4}" text-anchor="middle" font-family="${serif}" font-weight="bold" font-size="10" letter-spacing="1.4" fill="${CHIP_INK}">SCVD</text>
    <text x="${L.seal.cx}" y="${L.seal.cy + L.seal.arc - 1}" text-anchor="middle" font-family="${serif}" font-size="5" fill="${CHIP_INK}" fill-opacity="0.75">◆</text>
  </g>
  <line x1="${L.divider}" y1="24" x2="${L.divider}" y2="86" stroke="${CHIP_INK}" stroke-width="0.4" stroke-opacity="0.4"/>
  <text x="${L.textX}" y="${L.eyebrow.y}" font-family="${serif}" font-size="${L.eyebrow.size}" letter-spacing="${L.eyebrow.spacing}" fill="${CHIP_MUTED}">${escapeHtml(fitToWidth(eyebrow, L.eyebrow.size, CHIP_BUDGETS.eyebrow, L.eyebrow.spacing))}</text>
  <g transform="rotate(${S.angle} ${S.cx} ${S.cy})" fill="none" stroke="${state.color}">
    <rect x="${S.cx - S.w / 2}" y="${S.cy - S.h / 2}" width="${S.w}" height="${S.h}" rx="2.5" stroke-width="1.6"/>
    <rect x="${S.cx - S.w / 2 + 3.5}" y="${S.cy - S.h / 2 + 3.5}" width="${S.w - 7}" height="${S.h - 7}" rx="1.5" stroke-width="0.5"/>
    <text x="${S.cx}" y="${S.cy - 2}" text-anchor="middle" font-family="${serif}" font-weight="bold" font-size="12.5" letter-spacing="2.4" fill="${state.color}" stroke="none">${escapeHtml(fitToWidth(options.freshness.toUpperCase(), 12.5, CHIP_BUDGETS.stamp, 2.4))}</text>
    <text x="${S.cx}" y="${S.cy + 12}" text-anchor="middle" font-family="${serif}" font-size="8.4" letter-spacing="1.3" fill="${state.color}" fill-opacity="0.9" stroke="none">${escapeHtml(date)}</text>
  </g>
  <text x="${L.textX}" y="${L.host.y}" font-family="${serif}" font-size="${host.size}" fill="${CHIP_INK}">${prefix}${escapeHtml(host.apex)}</text>
  <text x="${L.textX}" y="${L.meta.y}" font-family="${serif}" font-size="${L.meta.size}" fill="${CHIP_MUTED}">${escapeHtml(fitToWidth(meta, L.meta.size, CHIP_BUDGETS.full))}</text>
</svg>`;
}

export function renderVisitorSticker(storeBaseUrl: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="300" height="300" viewBox="0 0 300 300" role="img" aria-label="Visitor sticker">
  <circle cx="150" cy="150" r="145" fill="${PAPER}"/>
  <circle cx="150" cy="150" r="138" fill="none" stroke="${INK}" stroke-width="3"/>
  <circle cx="150" cy="150" r="130" fill="none" stroke="${INK}" stroke-width="1" stroke-dasharray="2 5"/>
  <text x="150" y="82" text-anchor="middle" font-family="Georgia, serif" font-size="12" letter-spacing="3" fill="${FADED}">SEAN-CLAUDE VAN DAMME'S</text>
  <text x="150" y="102" text-anchor="middle" font-family="Georgia, serif" font-size="13" letter-spacing="5" fill="${INK}">GENERAL STORE</text>
  <text x="150" y="158" text-anchor="middle" font-family="Georgia, serif" font-weight="bold" font-size="34" fill="${ACCENT}">I STOPPED BY</text>
  <text x="150" y="190" text-anchor="middle" font-family="Georgia, serif" font-style="italic" font-size="15" fill="${INK}">and signed the guestbook</text>
  <text x="150" y="228" text-anchor="middle" font-family="Georgia, serif" font-size="11" fill="${FADED}">no purchase necessary</text>
  <a xlink:href="${escapeHtml(storeBaseUrl)}" href="${escapeHtml(storeBaseUrl)}">
    <text x="150" y="250" text-anchor="middle" font-family="Georgia, serif" font-size="11" fill="${FADED}" text-decoration="underline">${escapeHtml(storeBaseUrl)}</text>
  </a>
</svg>`;
}
