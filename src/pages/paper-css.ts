/**
 * The stylesheet for every room that is not the storefront: the
 * directory, the gazette rack, the almanac index, /what, the practice
 * counter, the zodiac wall, corrections, the stack, the neighbours,
 * the visitors' register, the pulse, the attestation page and the
 * wind-down notice.
 *
 * REPLACED 2026-07-30, on the keeper's verdict and he was right. The
 * old one printed wood grain behind beige paper and centred every
 * heading under a double rule, on the theory that the storefront was
 * night outside and the rooms were daytime within. Fourteen rooms wore
 * it, which is exactly the problem: it read as a template rather than
 * as a place, and the more rooms the store gained the more obviously
 * it was one form filled in fourteen times.
 *
 * WHAT REPLACES IT KEEPS THE STOREFRONT'S HOURS. The sign outside is
 * neon against a dark sky and there was never a good reason for the
 * rooms to be lit like a different building. Warm ink, one
 * lamp-coloured accent, and typography doing the work that borders and
 * drop shadows were doing before.
 *
 * EVERY CLASS NAME IS UNCHANGED, deliberately. Fourteen rooms render
 * through here and not one of them was edited to make this work — a
 * restyle that needs every caller touched is a restyle that will be
 * half-applied by the third page and inconsistent forever after. Even
 * the tables that set border and cellpadding as HTML attributes, from
 * before there was a stylesheet worth trusting, are overridden here
 * rather than chased across the routes.
 *
 * The leader dots on a menu line survive. They were the one thing in
 * the old sheet doing real work.
 */
export const PAPER_CSS = `
:root {
  --board: #100e0b;
  --board-lift: #17140f;
  --card: #1c1811;
  --chalk: #ece5d8;
  --chalk-dim: #a99c85;
  --lamp: #e8a33d;
  --rule: #332c23;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  background:
    radial-gradient(130% 90% at 50% -15%, #221d16 0%, var(--board) 62%);
  background-attachment: fixed;
  min-height: 100vh;
  color: var(--chalk);
  font-family: Georgia, 'Times New Roman', serif;
  line-height: 1.6;
  padding: 1.25rem 1rem 4rem;
  -webkit-text-size-adjust: 100%;
}
.paper {
  max-width: 760px;
  margin: 0 auto;
  background: transparent;
  padding: 0.5rem 0 0;
}

/* The head of the room. Left-aligned: a centred heading under a double
   rule is the single thing that made every page look like the same
   form with a different title typed into it. */
header {
  border-bottom: 1px solid var(--rule);
  padding-bottom: 1.4rem;
}
.est {
  display: block;
  letter-spacing: 0.3em;
  font-size: 0.62rem;
  color: var(--lamp);
  text-transform: uppercase;
  line-height: 1.7;
}
h1 {
  font-size: clamp(1.9rem, 6vw, 3rem);
  line-height: 1.08;
  letter-spacing: -0.015em;
  margin-top: 0.55rem;
  color: var(--chalk);
  text-wrap: balance;
}
h2 {
  color: var(--lamp);
  font-size: 0.74rem;
  letter-spacing: 0.26em;
  text-transform: uppercase;
  font-weight: normal;
  margin: 2.75rem 0 1.1rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid var(--rule);
}
h3 { font-size: 1.05rem; color: var(--chalk); margin-top: 1.5rem; }
section { margin-top: 1.75rem; }
p + p { margin-top: 0.85rem; }

.menu-item {
  padding: 1rem 0;
  border-bottom: 1px solid var(--rule);
}
.menu-item:last-child { border-bottom: 0; }
.menu-line { display: flex; align-items: baseline; gap: 0.5rem; }
.menu-name { color: var(--chalk); font-size: 1.08rem; }
.menu-dots {
  flex: 1;
  border-bottom: 1px dotted var(--rule);
  min-width: 1.5rem;
}
.menu-price { white-space: nowrap; color: var(--lamp); }
.menu-desc {
  font-size: 0.95rem;
  color: var(--chalk-dim);
  margin-top: 0.4rem;
  line-height: 1.65;
}
.menu-meta {
  font-size: 0.82rem;
  color: var(--chalk-dim);
  margin-top: 0.35rem;
  opacity: 0.85;
}
.empty {
  color: var(--chalk-dim);
  font-style: italic;
  padding: 1.25rem 0;
}

/* Narrow screens scroll the table rather than the page. */
table {
  width: 100%;
  border-collapse: collapse;
  border: 0;
  margin-top: 0.5rem;
  font-size: 0.92rem;
}
th, td { border: 0; }
th {
  text-align: left;
  color: var(--lamp);
  font-weight: normal;
  font-size: 0.65rem;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  border-bottom: 1px solid var(--rule);
  padding: 0 1rem 0.55rem 0;
}
td {
  vertical-align: top;
  padding: 0.9rem 1rem 0.9rem 0;
  border-bottom: 1px solid var(--rule);
  color: var(--chalk-dim);
  line-height: 1.55;
}
td:first-child { color: var(--chalk); }
@media (max-width: 640px) {
  table { display: block; overflow-x: auto; }
}

a { color: var(--lamp); text-underline-offset: 0.18em; }
a:hover { color: var(--chalk); }
strong { color: var(--chalk); font-weight: normal; }
ul, ol { margin: 0.75rem 0 0 1.15rem; color: var(--chalk-dim); }
li { margin-bottom: 0.55rem; line-height: 1.6; }
code {
  font-family: ui-monospace, 'SF Mono', Menlo, 'Courier New', monospace;
  background: var(--card);
  border: 1px solid var(--rule);
  padding: 0.05em 0.35em;
  border-radius: 3px;
  font-size: 0.86em;
  color: var(--chalk);
  overflow-wrap: anywhere;
}
pre {
  background: var(--card);
  border: 1px solid var(--rule);
  border-radius: 3px;
  padding: 1rem;
  overflow-x: auto;
  margin: 1rem 0;
  font-size: 0.85rem;
}
pre code { background: none; border: 0; padding: 0; }
hr { border: 0; border-top: 1px solid var(--rule); margin: 2rem 0; }

.fine-print {
  margin-top: 3.5rem;
  border-top: 1px solid var(--rule);
  padding-top: 1.25rem;
  font-size: 0.8rem;
  color: var(--chalk-dim);
}
.fine-print p + p { margin-top: 0.5rem; }
`;
