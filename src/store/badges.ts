/**
 * EVERY MARK THIS STORE PUTS ON ANYTHING, DECLARED IN ONE PLACE.
 *
 * LEDGER A1, found 2026-08-24. `/criteria` — the page that exists to
 * govern when this store may badge anything at all — read: "None.
 * Nothing this store serves carries a badge." Five badge surfaces
 * were live at the time. Same class as the auto-refund incident: not
 * a lie anyone told, but a true-sounding line nobody re-checked,
 * sitting on the one page whose entire job is to be the standard.
 *
 * WHY A CONSTANT AND NOT A HAND-WRITTEN PARAGRAPH. The paragraph is
 * what went stale. This list is keyed by the EXACT path the router
 * registers, and a test walks `app.routes` to assert every `/badges`
 * route appears here. Ship a sixth badge without declaring it and
 * that test fails by name.
 *
 * It caught its own author on the first run: a careful read of
 * `routes/badges.ts` found four, and the router walk found five — the
 * stamp badge is registered in `routes/stamps.ts`, one file over.
 * That is the entire argument against inventories people maintain.
 *
 * WHAT EVERY ENTRY MUST SAY. Rule 43 permits a mark only if it is a
 * DATED OBSERVATION rather than an accumulating judgment, so each one
 * states what it asserts and what it refuses to assert. A badge that
 * cannot say what it would be wrong about is a score wearing a
 * sticker.
 */
export interface BadgeSurface {
  /** Exactly as the router registers it — the guard test compares strings. */
  route: string;
  name: string;
  /** Free to anyone, or bought. */
  cost: "free" | "paid";
  /** The dated observation it carries. */
  asserts: string;
  /** The reading it refuses. */
  does_not_assert: string;
  /** Whether it degrades with time rather than sitting green forever. */
  ages: boolean;
}

export const BADGE_SURFACES: readonly BadgeSurface[] = [
  {
    route: "/badges/sticker.svg",
    name: "Visitor sticker",
    cost: "free",
    asserts:
      "Somebody visited this store. It is a souvenir and says nothing about the visitor or about us.",
    does_not_assert:
      "Not an endorsement, not a verification, and not evidence of a transaction.",
    ages: false,
  },
  {
    route: "/badges/:badge{[0-9]+\\.svg}",
    name: "Patron badge",
    cost: "paid",
    asserts:
      "This patron number was issued to somebody who paid for patronage on a stated date.",
    does_not_assert:
      "Nothing about the patron's conduct, solvency, or anything they sell.",
    ages: false,
  },
  {
    route: "/badges/audit/:badge{saudit_[a-z0-9]+\\.svg}",
    name: "Service audit badge",
    cost: "paid",
    asserts:
      "The displayable half of a purchased point-in-time audit: what the battery saw at one dated moment, citing the criteria it was measured against.",
    does_not_assert:
      "Not a rating, not a score, and not a claim about any moment other than the one it names.",
    ages: true,
  },
  {
    route: "/badges/passport/:chip{[a-z0-9.-]+\\.svg}",
    name: "Passport chip",
    cost: "free",
    asserts:
      "A ready-side host was observed passing the published battery, with freshness degrading as the observation gets older.",
    does_not_assert:
      "Not a claim the host is up now. A broken host's chip refuses to render rather than staying green — a chip that survived the door breaking would be the stale wallpaper freshness states exist to kill.",
    ages: true,
  },
  {
    route: "/badges/stamps/:stamp{[a-z0-9_]+\\.svg}",
    name: "Stamp badge",
    cost: "free",
    asserts:
      "A stamp minted against a specific event this store recorded, findable from the artifact that minted it.",
    does_not_assert:
      "Not a standing status. The stamp names one event and expires from relevance the way any dated observation does.",
    ages: true,
  },
];

/**
 * The sentence `/criteria` publishes, derived rather than typed.
 * Counting in prose is how "None" survived five shipping surfaces.
 */
export function badgesTodayLine(): string {
  const free = BADGE_SURFACES.filter((entry) => entry.cost === "free").length;
  const paid = BADGE_SURFACES.length - free;
  return `${BADGE_SURFACES.length} — ${free} free, ${paid} bought. Each carries a dated observation and states what it refuses to assert; none is a ranking, and none carries a verdict without its derivation and denominator beside it, which is the gate rule 43 puts in front of every mark this store serves.`;
}
