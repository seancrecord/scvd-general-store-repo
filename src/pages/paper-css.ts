/**
 * The paper stylesheet for the smaller rooms (directory, gazette rack,
 * almanac index, /what, the zodiac wall). The storefront went neon;
 * these stay wood and paper, inside the store it was always daytime.
 */
export const PAPER_CSS = `
:root {
  --wood-dark: #3e2a1a;
  --wood: #5c4030;
  --paper: #f4ead8;
  --paper-shadow: #e2d4bc;
  --ink: #3b2f23;
  --ink-faded: #7a6a55;
  --barn-red: #8c2f1b;
  --pine: #3f5240;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  background: repeating-linear-gradient(
    90deg,
    var(--wood-dark) 0px, var(--wood) 6px, var(--wood-dark) 90px
  );
  color: var(--ink);
  font-family: Georgia, 'Times New Roman', serif;
  line-height: 1.55;
  padding: 1rem 0.75rem 3rem;
}
.paper {
  max-width: 720px;
  margin: 0 auto;
  background: var(--paper);
  border-radius: 4px;
  box-shadow: 0 4px 0 var(--paper-shadow), 0 10px 30px rgba(0,0,0,0.5);
  padding: 1.75rem 1.25rem 2.25rem;
}
@media (min-width: 600px) { .paper { padding: 2.5rem 3rem 3rem; } }
header { text-align: center; border-bottom: 3px double var(--ink); padding-bottom: 1.25rem; }
.est { letter-spacing: 0.35em; font-size: 0.7rem; color: var(--ink-faded); text-transform: uppercase; }
h1 { font-size: 1.7rem; line-height: 1.2; margin: 0.4rem 0 0.2rem; }
@media (min-width: 600px) { h1 { font-size: 2.2rem; } }
section { margin-top: 2rem; }
.menu-item { padding: 0.9rem 0; border-bottom: 1px dotted var(--ink-faded); }
.menu-line { display: flex; align-items: baseline; gap: 0.5rem; }
.menu-name { font-weight: bold; }
.menu-dots { flex: 1; border-bottom: 2px dotted var(--ink-faded); min-width: 1.5rem; }
.menu-price { white-space: nowrap; color: var(--barn-red); font-weight: bold; }
.menu-desc { font-size: 0.92rem; color: var(--ink-faded); margin-top: 0.25rem; }
.menu-meta { font-size: 0.8rem; color: var(--pine); margin-top: 0.15rem; }
.empty { text-align: center; font-style: italic; color: var(--ink-faded); }
.fine-print {
  margin-top: 2.5rem; border-top: 3px double var(--ink); padding-top: 1.25rem;
  font-size: 0.82rem; color: var(--ink-faded); text-align: center;
}
.fine-print p + p { margin-top: 0.5rem; }
a { color: var(--barn-red); }
code {
  font-family: 'Courier New', monospace; background: var(--paper-shadow);
  padding: 0 0.3em; border-radius: 2px; font-size: 0.9em;
}
`;
