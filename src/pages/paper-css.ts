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
/**
 * ONE PALETTE WITH THE STOREFRONT, 2026-07-30 (second pass, same day).
 *
 * The first pass took the rooms off the brown template and made them
 * agree with EACH OTHER, which was half the job and read as the whole
 * of it. CV shot the real pages and named what was left: the front
 * door is a plum starfield with neon and teal, and one click inside
 * that world vanished into a separate brown one. Two sites wearing one
 * name — which is the store's own separation doctrine broken by the
 * design before the copy gets a word in.
 *
 * So these are the storefront's own variables, not an approximation of
 * them. Same night, same neon, same teal.
 *
 * AND THE BODY COPY MOVED UP A TONE. CV called the old text a
 * contrast failure; measured, it was 7.14:1 — above AA and above AAA,
 * so the claim as stated was wrong. What was true underneath it: most
 * prose was set in the DIM tone rather than the full one, which reads
 * as weak even when it passes. Body is --night-text now at 11.74:1,
 * --night-faded is reserved for genuinely secondary lines at 4.87:1,
 * and the opacity dimming that quietly cut ratios further is gone.
 * Nothing here relies on a reader having a good screen.
 */
:root {
  --night: #0b0a12;
  --dusk: #16121f;
  --horizon: #2a1a33;
  --card: #1b1526;
  --neon: #ffb45e;
  --teal: #5de6c8;
  --teal-dim: #2e8a77;
  --night-text: #cfc4d6;
  --night-faded: #857a91;
  --line: #372c44;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  background:
    radial-gradient(120% 80% at 50% -12%, var(--horizon) 0%, var(--dusk) 38%, var(--night) 75%);
  background-attachment: fixed;
  min-height: 100vh;
  color: var(--night-text);
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
  border-bottom: 1px solid var(--line);
  padding-bottom: 1.4rem;
}
/* SIZE AND TRACKING, NOT COLOUR. Reported as a contrast problem;
   contrast measures 11.2:1 here, so that was not it. What was true:
   0.62rem at 0.3em tracking is small type pulled apart until the eye
   has to reassemble each word letter by letter. Wide tracking is a
   display-type device and these are body-adjacent labels, so the
   size goes up and the tracking comes down — legible first, still
   unmistakably a label. */
.est {
  display: block;
  letter-spacing: 0.16em;
  font-size: 0.74rem;
  color: var(--neon);
  text-transform: uppercase;
  line-height: 1.7;
}
h1 {
  font-size: clamp(1.9rem, 6vw, 3rem);
  line-height: 1.08;
  letter-spacing: -0.015em;
  margin-top: 0.55rem;
  color: var(--night-text);
  text-wrap: balance;
}
h2 {
  color: var(--neon);
  font-size: 0.86rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  font-weight: normal;
  margin: 2.75rem 0 1.1rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid var(--line);
}
h3 { font-size: 1.05rem; color: var(--night-text); margin-top: 1.5rem; }
section { margin-top: 1.75rem; }
p + p { margin-top: 0.85rem; }

.menu-item {
  padding: 1rem 0;
  border-bottom: 1px solid var(--line);
}
.menu-item:last-child { border-bottom: 0; }
.menu-line { display: flex; align-items: baseline; gap: 0.5rem; }
.menu-name { color: var(--night-text); font-size: 1.08rem; }
.menu-dots {
  flex: 1;
  border-bottom: 1px dotted var(--line);
  min-width: 1.5rem;
}
.menu-price { white-space: nowrap; color: var(--neon); }
.menu-desc {
  font-size: 0.98rem;
  color: var(--night-text);
  margin-top: 0.4rem;
  line-height: 1.7;
}
/* Secondary lines only. No opacity: dimming a colour that already
   passed is how a ratio quietly drops below the line it was chosen
   to clear. */
.menu-meta {
  font-size: 0.84rem;
  color: var(--night-faded);
  margin-top: 0.35rem;
}
.empty {
  color: var(--night-faded);
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
  color: var(--neon);
  font-weight: normal;
  font-size: 0.72rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  border-bottom: 1px solid var(--line);
  padding: 0 1rem 0.55rem 0;
}
td {
  vertical-align: top;
  padding: 0.9rem 1rem 0.9rem 0;
  border-bottom: 1px solid var(--line);
  color: var(--night-text);
  line-height: 1.6;
}
td:first-child { color: var(--night-text); }
@media (max-width: 640px) {
  table { display: block; overflow-x: auto; }
}

/* A LINK SHOULD LOOK LIKE ONE. Several rooms print absolute store
   URLs mid-sentence — the identity answers on /what especially — and
   set in prose colour with no underline they were indistinguishable
   from the words around them, on the pages whose whole job is telling
   a developer where to go next. */
a {
  color: var(--neon);
  text-decoration: underline;
  text-decoration-color: var(--teal-dim);
  text-underline-offset: 0.18em;
  text-decoration-thickness: 1px;
}
a:hover { color: var(--teal); text-decoration-color: var(--teal); }
a code { color: inherit; }
strong { color: var(--night-text); font-weight: normal; }
ul, ol { margin: 0.75rem 0 0 1.15rem; color: var(--night-faded); }
li { margin-bottom: 0.55rem; line-height: 1.6; }
code {
  font-family: ui-monospace, 'SF Mono', Menlo, 'Courier New', monospace;
  background: var(--card);
  border: 1px solid var(--line);
  padding: 0.05em 0.35em;
  border-radius: 3px;
  font-size: 0.86em;
  color: var(--night-text);
  overflow-wrap: anywhere;
}
pre {
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: 3px;
  padding: 1rem;
  overflow-x: auto;
  margin: 1rem 0;
  font-size: 0.85rem;
}
pre code { background: none; border: 0; padding: 0; }
hr { border: 0; border-top: 1px solid var(--line); margin: 2rem 0; }

/* THE MAP, ON EVERY PAGE. Until now the only way between rooms was a
   link buried in a paragraph, which is not navigation. Same rule the
   office learned in July: a room nobody can leave is a room nobody
   enters twice. Derived from ROOMS, so a new room joins the nav the
   day it is built. */
nav.rooms {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem 1.05rem;
  margin: 1.15rem 0 0;
  font-size: 0.8rem;
  color: var(--night-faded);
}
nav.rooms a, nav.rooms strong {
  font-weight: normal;
  /* Each label stays whole; the ROW wraps. nowrap without a wrapping
     container is how a fifteen-room nav ran off the side of the page. */
  white-space: nowrap;
}
nav.rooms a { text-decoration: none; }
nav.rooms a:hover { text-decoration: underline; }
nav.rooms strong {
  color: var(--night-text);
  border-bottom: 1px solid var(--neon);
}
nav.rooms .nav-home { color: var(--teal); }

.fine-print {
  margin-top: 3.5rem;
  border-top: 1px solid var(--line);
  padding-top: 1.25rem;
  font-size: 0.8rem;
  color: var(--night-faded);
}
.fine-print p + p { margin-top: 0.5rem; }
`;
