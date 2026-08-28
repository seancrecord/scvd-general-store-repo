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
 * rather than retires, and it is never a score on an operator. So
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
  <text x="190" y="107" text-anchor="middle" font-family="Georgia, serif" font-size="9" fill="${FADED}">a dated observation of one moment — it ages, it is never a score</text>
  <a xlink:href="${escapeHtml(options.reportUrl)}" href="${escapeHtml(options.reportUrl)}">
    <text x="190" y="119" text-anchor="middle" font-family="Georgia, serif" font-size="8.5" fill="${FADED}" text-decoration="underline">signed report: ${escapeHtml(options.reportUrl)}</text>
  </a>
</svg>`;
}

/** The chip's freshness palette. Broken and indeterminate never
 * render — the route refuses them the way the passport door does. */
const CHIP_STATE: Record<
  "fresh" | "aging" | "expired",
  { color: string; sub: string }
> = {
  fresh: { color: "#2e7d32", sub: "observed inside one census cadence" },
  aging: { color: "#b26a00", sub: "older than one cadence — a refresh would say more" },
  expired: { color: FADED, sub: "too old to rely on; agents should refuse it" },
};

export interface PassportChipOptions {
  host: string;
  freshness: "fresh" | "aging" | "expired";
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
export function renderPassportChip(options: PassportChipOptions): string {
  const state = CHIP_STATE[options.freshness];
  const date = options.observedAt.slice(0, 10);
  const host = fitName(options.host, 34);
  const sub = options.selfObserved
    ? "self-read of our own catalogs at render, not a census probe"
    : state.sub;
  const label = options.selfObserved ? "SCVD PASSPORT · SELF" : "SCVD PASSPORT";
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="300" height="56" viewBox="0 0 300 56" role="img" aria-label="Endpoint passport: ${escapeHtml(options.host)} ${options.freshness}${options.selfObserved ? " (self-observed)" : ""}, observed ${date}">
  <rect width="300" height="56" fill="${PAPER}" rx="6"/>
  <rect x="4" y="4" width="292" height="48" fill="none" stroke="${INK}" stroke-width="1.5" rx="4"/>
  <text x="14" y="21" font-family="Georgia, serif" font-size="9" letter-spacing="2" fill="${FADED}">${label}</text>
  <text x="14" y="38" font-family="Georgia, serif" font-size="12" fill="${INK}">${escapeHtml(host)}</text>
  <text x="286" y="21" text-anchor="end" font-family="Georgia, serif" font-weight="bold" font-size="12" fill="${state.color}">${options.freshness.toUpperCase()} • ${date}</text>
  <a xlink:href="${escapeHtml(options.passportUrl)}" href="${escapeHtml(options.passportUrl)}">
    <text x="286" y="38" text-anchor="end" font-family="Georgia, serif" font-size="8.5" fill="${FADED}" text-decoration="underline">verify: ${escapeHtml(options.passportUrl)}</text>
  </a>
  <text x="14" y="49" font-family="Georgia, serif" font-style="italic" font-size="7.5" fill="${FADED}">${escapeHtml(sub)} — a dated observation, never a score</text>
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
