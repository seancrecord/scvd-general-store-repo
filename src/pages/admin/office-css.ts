/**
 * KEEP'S OFFICE — the study behind the shop.
 *
 * Written 2026-07-30 to the keeper's brief: an old English smoking
 * room, a man's study. Walnut and oxblood, green baize on the working
 * surfaces, brass for anything that would have been brass, and a lamp
 * somewhere off the top of the page.
 *
 * IT IS A WORKING ROOM BEFORE IT IS AN ATMOSPHERE, and that decides
 * the one real design question here. Every page in this office exists
 * to be read for numbers — declines, census, recount, the bell ledger
 * — so the DATA stays monospace, where a column of figures lines up
 * and a wrong digit is visible. The room around the data goes serif.
 * That split is not a compromise; it is what a study actually looks
 * like. The ledger is in a clerk's hand and the spines on the shelf
 * are not.
 *
 * NOT THE THING THE KEEPER JUST CONDEMNED. The public rooms wore a
 * repeating wood-grain gradient for a fortnight and it read as a
 * texture swatch rather than as a room. Depth here comes from layered
 * warmth and hairlines, never from a stripe pattern pretending to be
 * timber.
 *
 * Deliberately unlike the public rooms in one further way: those are
 * lit for a stranger arriving at night, and this one is lit for the
 * man who owns it. Richer, warmer, and it does not have to explain
 * itself to anybody.
 */
export const OFFICE_CSS = `
:root {
  --walnut: #16110d;
  --walnut-lift: #1e1812;
  --panel: #221b15;
  --baize: #1a2a21;
  --baize-rule: #2f4436;
  --brass: #c9a961;
  --brass-dim: #8b7444;
  --ivory: #ece3d2;
  --ivory-dim: #a2947d;
  --oxblood: #a8443c;
  --rule: #35291f;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  padding: 2rem 1rem 5rem;
  background:
    radial-gradient(90% 55% at 50% -8%, #2b2118 0%, var(--walnut) 58%);
  background-attachment: fixed;
  min-height: 100vh;
  color: var(--ivory);
  font-family: Georgia, 'Times New Roman', serif;
  line-height: 1.6;
  -webkit-text-size-adjust: 100%;
}
.room { max-width: 940px; margin: 0 auto; }

h1 {
  font-size: clamp(1.6rem, 4.5vw, 2.3rem);
  font-weight: normal;
  letter-spacing: 0.02em;
  color: var(--ivory);
  margin: 0 0 0.15rem;
}
h1 .lamp { color: var(--brass); }
.room-sub {
  color: var(--brass-dim);
  font-size: 0.64rem;
  letter-spacing: 0.34em;
  text-transform: uppercase;
  margin-bottom: 1.4rem;
}
h2 {
  font-size: 0.72rem;
  letter-spacing: 0.26em;
  text-transform: uppercase;
  font-weight: normal;
  color: var(--brass);
  margin: 0 0 1rem;
  padding-bottom: 0.55rem;
  border-bottom: 1px solid var(--rule);
}
h3 { font-size: 1rem; font-weight: normal; color: var(--ivory); margin: 1.25rem 0 0.5rem; }

/* The brass rail: the room list, and the readings beneath it. */
nav {
  margin: 0 0 0.4rem;
  padding-bottom: 0.55rem;
  border-bottom: 1px solid var(--rule);
}
nav a, nav strong {
  margin-right: 1.35rem;
  display: inline-block;
  font-weight: normal;
}
nav a { color: var(--brass); text-decoration: none; border-bottom: 1px solid transparent; }
nav a:hover { color: var(--ivory); border-bottom-color: var(--brass-dim); }
nav strong { color: var(--ivory); border-bottom: 1px solid var(--brass); }
nav.readings {
  margin-bottom: 1.75rem;
  font-size: 0.86rem;
  border-bottom: 0;
  padding-bottom: 0;
}
nav.readings::before {
  content: "readings";
  color: var(--brass-dim);
  letter-spacing: 0.24em;
  text-transform: uppercase;
  font-size: 0.6rem;
  margin-right: 1.1rem;
}

/* A working surface: baize under glass, brass at the edge. */
section {
  background: var(--panel);
  border: 1px solid var(--rule);
  border-top: 2px solid var(--brass-dim);
  border-radius: 2px;
  padding: 1.4rem 1.5rem;
  margin-bottom: 1.25rem;
  box-shadow: 0 1px 0 rgba(0,0,0,0.5), 0 12px 28px rgba(0,0,0,0.35);
}
@media (max-width: 600px) { section { padding: 1.1rem 1rem; } }

p { margin: 0 0 0.85rem; }
p:last-child { margin-bottom: 0; }
a { color: var(--brass); text-underline-offset: 0.18em; }
a:hover { color: var(--ivory); }
strong { color: var(--ivory); }
ul, ol { margin: 0.5rem 0 0.85rem 1.1rem; }
li { margin-bottom: 0.7rem; }
hr { border: 0; border-top: 1px solid var(--rule); margin: 1.5rem 0; }

/* THE LEDGER STAYS IN A CLERK'S HAND. Figures line up, a wrong digit
   shows, and no amount of panelling is worth losing that. */
table {
  border-collapse: collapse;
  width: 100%;
  font-family: ui-monospace, 'SF Mono', Menlo, 'Courier New', monospace;
  font-size: 0.82rem;
  background: var(--baize);
  border: 1px solid var(--baize-rule);
  margin: 0.5rem 0;
}
th {
  text-align: left;
  color: var(--brass);
  font-weight: normal;
  font-size: 0.6rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  font-family: Georgia, serif;
  padding: 0.6rem 0.75rem;
  border-bottom: 1px solid var(--baize-rule);
  white-space: nowrap;
}
td {
  padding: 0.55rem 0.75rem;
  border-bottom: 1px solid rgba(47,68,54,0.55);
  color: var(--ivory-dim);
  vertical-align: top;
}
tr:last-child td { border-bottom: 0; }
td:first-child { color: var(--ivory); }
.table-wrap { overflow-x: auto; }
@media (max-width: 700px) { table { display: block; overflow-x: auto; } }

code, pre {
  font-family: ui-monospace, 'SF Mono', Menlo, 'Courier New', monospace;
  font-size: 0.84em;
}
code {
  background: var(--walnut-lift);
  border: 1px solid var(--rule);
  padding: 0.05em 0.35em;
  border-radius: 2px;
  color: var(--ivory);
  overflow-wrap: anywhere;
}
pre {
  background: var(--walnut-lift);
  border: 1px solid var(--rule);
  border-radius: 2px;
  padding: 0.9rem 1rem;
  overflow-x: auto;
}
pre code { background: none; border: 0; padding: 0; }

/* The levers. A study's fittings, not a dashboard's. */
input[type=text], input[type=number], input[type=password], textarea, select {
  width: 100%;
  max-width: 520px;
  background: var(--walnut-lift);
  border: 1px solid var(--rule);
  border-radius: 2px;
  color: var(--ivory);
  font-family: ui-monospace, 'SF Mono', Menlo, 'Courier New', monospace;
  font-size: 0.88rem;
  padding: 0.55rem 0.7rem;
  margin: 0.3rem 0 0.6rem;
}
input:focus, textarea:focus, select:focus {
  outline: 0;
  border-color: var(--brass-dim);
}
button, input[type=submit] {
  background: var(--walnut-lift);
  color: var(--brass);
  border: 1px solid var(--brass-dim);
  border-radius: 2px;
  padding: 0.5rem 1.1rem;
  font-family: Georgia, serif;
  font-size: 0.9rem;
  letter-spacing: 0.06em;
  cursor: pointer;
}
button:hover, input[type=submit]:hover { color: var(--ivory); border-color: var(--brass); }
label { color: var(--ivory-dim); font-size: 0.88rem; }

details > summary {
  cursor: pointer;
  color: var(--brass);
  margin-bottom: 0.6rem;
  list-style: none;
}
details > summary::before { content: "\\2023\\00a0"; color: var(--brass-dim); }
details[open] > summary { margin-bottom: 0.9rem; }

/* A shelf that failed to load says so in oxblood, not in a stack trace. */
.shelf-trouble {
  color: var(--oxblood);
  border-left: 3px solid var(--oxblood);
  background: var(--panel);
  padding: 0.75rem 1rem;
  margin-bottom: 1.25rem;
}
`;
