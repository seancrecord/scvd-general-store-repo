/**
 * /becoming's own look, on top of the shared room stylesheet.
 *
 * TRIMMED 2026-07-30, the same day it was written. This page went dark
 * first, as a one-off; hours later the keeper condemned the brown
 * template every other room wore and PAPER_CSS took the same hours —
 * warm ink, one lamp accent, left-aligned heads. So most of what was
 * here became a duplicate of the base sheet and was deleted rather
 * than left to drift out of step with it. What remains is only what is
 * genuinely particular to a page of theses.
 *
 * TYPOGRAPHY DOES THE WORK, not chrome. Four claims set large enough
 * to be read across a room, each with its falsifier underneath in a
 * quieter hand, because the whole argument of the page is that a
 * claim and its refutation belong on the same surface. Ghost numerals
 * behind them so the theses count without a list marker doing it.
 *
 * Every size is clamped and every table scrolls inside its own box, so
 * a phone gets the same page rather than a broken one.
 */
export const BECOMING_CSS = `
/* The standfirst, and the line that keeps the quarantine honest. */
body.becoming .lede {
  font-size: clamp(1.05rem, 2.6vw, 1.3rem);
  line-height: 1.5;
  color: var(--chalk);
  margin-top: 1.5rem;
}
body.becoming .not-for-sale {
  display: block;
  margin-top: 1.5rem;
  padding: 0.9rem 1.1rem;
  border-left: 3px solid var(--lamp);
  background: var(--board-lift);
  color: var(--chalk-dim);
  font-size: 0.92rem;
}

/* THE THESES — the reason the page exists. Set large enough to be read
   across a room, with the falsifier directly underneath in a quieter
   hand, because a claim and its refutation belong on one surface. */
body.becoming .thesis {
  padding-bottom: 2.25rem;
  margin-bottom: 2.25rem;
  border-bottom: 1px solid var(--rule);
}
body.becoming .thesis:last-of-type { border-bottom: 0; }
body.becoming .thesis-n {
  display: block;
  font-size: 0.7rem;
  letter-spacing: 0.3em;
  color: var(--lamp);
  margin-bottom: 0.6rem;
}
body.becoming .thesis-claim {
  font-size: clamp(1.35rem, 4.2vw, 2rem);
  line-height: 1.25;
  color: var(--chalk);
  margin: 0 0 1rem;
  text-wrap: balance;
}
body.becoming .thesis-false {
  color: var(--chalk-dim);
  font-size: 0.95rem;
  line-height: 1.6;
  padding-left: 1rem;
  border-left: 2px solid var(--rule);
}
body.becoming .thesis-false strong {
  color: var(--lamp);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-size: 0.72rem;
  display: block;
  margin-bottom: 0.35rem;
}

/* SETTLED — a ruling, and the reasoning that produced it. */
body.becoming .settled {
  background: var(--board-lift);
  border: 1px solid var(--rule);
  border-radius: 3px;
  padding: 1.15rem 1.25rem;
  margin-bottom: 1rem;
}
body.becoming .settled-q {
  color: var(--chalk-dim);
  font-size: 0.86rem;
  margin-bottom: 0.5rem;
}
body.becoming .settled-a {
  color: var(--chalk);
  font-size: clamp(1.05rem, 3vw, 1.35rem);
  line-height: 1.3;
  margin-bottom: 0.75rem;
  text-wrap: balance;
}
body.becoming .settled-why {
  color: var(--chalk-dim);
  font-size: 0.9rem;
  line-height: 1.6;
}

/* WATCHED — a ledger. Wide screens get a table; narrow ones get cards,
   because three columns of long prose is the wrong structure for a
   phone whatever the widths work out to.

   NOT WRITTEN TO FIX A BUG, and the record matters more than the CSS.
   A screenshot at 390px appeared to show the whole document
   overflowing, so this was written as a fix. It was not one: headless
   Chrome clamps its window to a 500px minimum, so the shot was a 500px
   layout cropped to 390 and the overflow was an artifact of the
   instrument. A page predating this file showed exactly the same
   thing, which is what gave it away. The stacking stays because it is
   better on a small screen; it repaired nothing, and nothing below
   500px here has actually been verified. */
body.becoming section > .menu-desc { margin-bottom: 1.5rem; }
body.becoming .ledger-wrap { overflow-x: auto; margin-top: 1.5rem; }
@media (min-width: 720px) {
  body.becoming table { min-width: 620px; }
}
@media (max-width: 719px) {
  body.becoming tr:first-child th { display: none; }
  body.becoming table, body.becoming tbody, body.becoming tr, body.becoming td {
    display: block;
    width: 100%;
  }
  body.becoming tr {
    border-bottom: 1px solid var(--rule);
    padding-bottom: 1rem;
    margin-bottom: 1rem;
  }
  body.becoming td { border: 0; padding: 0 0 0.75rem; }
  body.becoming td:first-child { font-size: 1.05rem; padding-bottom: 0.5rem; }
  body.becoming td[data-label]::before {
    content: attr(data-label);
    display: block;
    color: var(--lamp);
    font-size: 0.62rem;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    margin-bottom: 0.3rem;
  }
}
`;
