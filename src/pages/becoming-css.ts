/**
 * /becoming's own look: a hand-set broadside, nailed up at night.
 *
 * The small rooms are wood and paper because inside the store it was
 * always daytime; the storefront is neon because outside it is always
 * night. This page is neither — it is the thing tacked to the door
 * after closing, ink on a dark board, and it should read as a
 * statement rather than as another page of inventory.
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
:root {
  --board: #14110d;
  --board-lift: #1c1813;
  --chalk: #f2ece0;
  --chalk-dim: #b3a892;
  --lamp: #e8a33d;
  --rule: #3a3229;
}
body.becoming {
  /* Fills the canvas even when the content is short, so no white band
     shows under the board on a tall viewport. */
  min-height: 100vh;
  background:
    radial-gradient(120% 80% at 50% -10%, #241f18 0%, var(--board) 60%);
  color: var(--chalk);
  padding: 1rem 0.75rem 4rem;
}
body.becoming .paper {
  background: transparent;
  box-shadow: none;
  max-width: 780px;
  padding: 1rem 0 0;
}
body.becoming header {
  border-bottom: 1px solid var(--rule);
  text-align: left;
  padding-bottom: 1.5rem;
}
body.becoming .est { color: var(--lamp); letter-spacing: 0.4em; }
body.becoming h1 {
  color: var(--chalk);
  font-size: clamp(2rem, 7vw, 3.4rem);
  line-height: 1.05;
  letter-spacing: -0.02em;
  margin-top: 0.6rem;
}
body.becoming h2 {
  color: var(--lamp);
  font-size: 0.78rem;
  letter-spacing: 0.28em;
  text-transform: uppercase;
  font-weight: normal;
  border: 0;
  margin: 3.25rem 0 1.25rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid var(--rule);
}
body.becoming section { margin: 0; }
body.becoming .menu-desc { color: var(--chalk-dim); }
body.becoming .menu-meta { color: var(--chalk-dim); font-size: 0.85rem; }
body.becoming a { color: var(--lamp); }

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

/* THE THESES — the reason the page exists. */
body.becoming .thesis {
  position: relative;
  padding: 0 0 2.25rem 0;
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
  font-weight: normal;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-size: 0.72rem;
  display: block;
  margin-bottom: 0.35rem;
}

/* SETTLED — a ruling and the reasoning that produced it. */
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
   A screenshot at --window-size=390 appeared to show the whole
   document overflowing, so this was written as a fix. It was not one:
   headless Chrome clamps its window to a 500px minimum, so the shot
   was a 500px layout cropped to 390 and the overflow was an artifact
   of the instrument. A page that predates this file showed exactly the
   same thing, which is what gave it away. The stacking stays because
   it is better on a small screen; it never repaired anything, and
   nothing below 500px here has actually been verified. */
body.becoming .ledger-wrap { overflow-x: auto; margin-top: 1.5rem; }
body.becoming table {
  width: 100%;
  border-collapse: collapse;
  border: 0;
}
body.becoming th {
  text-align: left;
  color: var(--lamp);
  font-weight: normal;
  font-size: 0.68rem;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  border-bottom: 1px solid var(--rule);
  padding: 0 0.9rem 0.6rem 0;
}
body.becoming td {
  vertical-align: top;
  padding: 1rem 0.9rem 1rem 0;
  border-bottom: 1px solid var(--rule);
  color: var(--chalk-dim);
  font-size: 0.9rem;
  line-height: 1.55;
  overflow-wrap: anywhere;
}
body.becoming td:first-child { color: var(--chalk); }
@media (min-width: 720px) {
  body.becoming table { min-width: 620px; }
}
@media (max-width: 719px) {
  body.becoming thead, body.becoming tr:first-child th { display: none; }
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
  body.becoming td:first-child {
    font-size: 1.05rem;
    padding-bottom: 0.5rem;
  }
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
body.becoming .fine-print {
  border-top: 1px solid var(--rule);
  margin-top: 3rem;
  padding-top: 1.25rem;
  color: var(--chalk-dim);
}
body.becoming .fine-print code { color: var(--lamp); }
`;
