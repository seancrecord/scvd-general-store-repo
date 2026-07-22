/**
 * The storefront at night. Neon sign over a wooden porch: cyberpunk
 * dusk outside, paper and ink where the goods are. Mobile-first, no
 * scripts, no SaaS smell. Ambient glow only — nothing here blinks for
 * attention except the one tube that was always going to.
 */
export const STOREFRONT_CSS = `
:root {
  --night: #0b0a12;
  --dusk: #16121f;
  --horizon: #241a2e;
  --neon: #ffb45e;
  --neon-hot: #ffd9a8;
  --neon-red: #ff6a4d;
  --teal: #5de6c8;
  --teal-dim: #2e8a77;
  --paper: #f4ead8;
  --paper-shadow: #d8c9ae;
  --ink: #3b2f23;
  --ink-faded: #7a6a55;
  --night-text: #cfc4d6;
  --night-faded: #857a91;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
html { scroll-behavior: smooth; }
body.night {
  background:
    radial-gradient(ellipse 120% 55% at 50% -10%, var(--horizon) 0%, var(--dusk) 45%, var(--night) 100%);
  background-attachment: fixed;
  color: var(--night-text);
  font-family: Georgia, 'Times New Roman', serif;
  line-height: 1.55;
  min-height: 100vh;
  padding: 0 0.75rem 4rem;
  overflow-x: hidden;
}
.dusk {
  position: fixed; inset: 0; pointer-events: none; z-index: 0;
  background: repeating-linear-gradient(0deg, transparent 0 2px, rgba(0,0,0,0.12) 2px 4px);
  mix-blend-mode: multiply;
}
.road { position: relative; z-index: 1; max-width: 760px; margin: 0 auto; }

/* ---- the sign ---- */
.signfront { text-align: center; padding: 3rem 0 1.5rem; }
.tube-line {
  letter-spacing: 0.4em; font-size: 0.62rem; color: var(--teal-dim);
  text-transform: uppercase;
  text-shadow: 0 0 8px rgba(93,230,200,0.35);
}
.neon {
  margin: 1rem 0 0.4rem;
  font-size: clamp(2rem, 8vw, 3.4rem);
  line-height: 1.08;
  letter-spacing: 0.06em;
  color: var(--neon-hot);
  text-shadow:
    0 0 6px rgba(255,180,94,0.9),
    0 0 18px rgba(255,180,94,0.55),
    0 0 42px rgba(255,120,60,0.35),
    0 0 80px rgba(255,90,40,0.2);
}
.neon-sub { color: var(--neon); }
.flicker { animation: tube 6s infinite; }
@keyframes tube {
  0%, 41%, 45%, 100% { opacity: 1; }
  42%, 44% { opacity: 0.35; text-shadow: none; }
  43% { opacity: 0.7; }
}
@media (prefers-reduced-motion: reduce) { .flicker { animation: none; } }
.open-sign {
  display: inline-block; margin-top: 0.9rem;
  border: 1px solid var(--teal-dim); border-radius: 999px;
  padding: 0.3rem 1rem;
  font-size: 0.72rem; letter-spacing: 0.28em; color: var(--teal);
  text-shadow: 0 0 10px rgba(93,230,200,0.5);
  box-shadow: 0 0 14px rgba(93,230,200,0.18), inset 0 0 10px rgba(93,230,200,0.08);
}
.proprietors { margin-top: 0.8rem; font-style: italic; font-size: 0.9rem; color: var(--night-faded); }

/* ---- the counters ---- */
.ticker {
  display: flex; flex-wrap: wrap; gap: 0.5rem; justify-content: center;
  margin: 1.2rem 0 2rem;
}
.chip {
  font-family: ui-monospace, 'Courier New', monospace;
  font-size: 0.72rem; letter-spacing: 0.06em;
  color: var(--night-text);
  border: 1px solid #372c44; border-radius: 3px;
  background: rgba(22,18,31,0.85);
  padding: 0.35rem 0.7rem;
}

/* ---- the paper receipt ---- */
.receipt {
  max-width: 480px; margin: 0 auto 2.5rem;
  background: var(--paper); color: var(--ink);
  padding: 1.2rem 1.4rem 1.5rem;
  transform: rotate(-0.6deg);
  box-shadow: 0 6px 24px rgba(0,0,0,0.55), 0 0 40px rgba(255,180,94,0.06);
  -webkit-mask-image: linear-gradient(135deg, #000 0, #000 100%);
}
.receipt-head {
  font-family: ui-monospace, 'Courier New', monospace;
  font-size: 0.72rem; letter-spacing: 0.3em; text-align: center;
  border-bottom: 1px dashed var(--ink-faded); padding-bottom: 0.5rem;
  color: var(--ink-faded);
}
.receipt-note { margin-top: 0.8rem; font-style: italic; }

/* ---- shelves ---- */
.night-head {
  text-align: center; font-size: 0.88rem; letter-spacing: 0.34em;
  color: var(--neon); margin-bottom: 1.2rem;
  text-shadow: 0 0 12px rgba(255,180,94,0.4);
}
.shelf-grid {
  display: grid; gap: 0.7rem;
  grid-template-columns: 1fr;
}
@media (min-width: 560px) { .shelf-grid { grid-template-columns: 1fr 1fr; } }
.shelf-card {
  border: 1px solid #372c44; border-radius: 4px;
  background: linear-gradient(160deg, rgba(36,26,46,0.9), rgba(22,18,31,0.9));
  padding: 0.9rem 1rem;
  transition: border-color 200ms ease, box-shadow 200ms ease;
}
.shelf-card:hover {
  border-color: var(--teal-dim);
  box-shadow: 0 0 18px rgba(93,230,200,0.12);
}
.shelf-top { display: flex; align-items: baseline; gap: 0.6rem; }
.shelf-name { font-weight: bold; color: #efe6f4; flex: 1; }
.shelf-price {
  font-family: ui-monospace, 'Courier New', monospace;
  color: var(--teal); white-space: nowrap;
  text-shadow: 0 0 8px rgba(93,230,200,0.35);
}
.shelf-line { margin-top: 0.3rem; font-size: 0.88rem; color: var(--night-faded); }
.shelf-more { text-align: center; margin-top: 1.1rem; font-size: 0.85rem; color: var(--night-faded); }

/* ---- the two doors ---- */
.doors { display: grid; gap: 0.8rem; grid-template-columns: 1fr; margin-top: 2.6rem; }
@media (min-width: 640px) { .doors { grid-template-columns: 1fr 1fr; } }
.door { border-radius: 4px; padding: 1.2rem 1.3rem 1.4rem; }
.door h3 { font-size: 0.82rem; letter-spacing: 0.22em; margin-bottom: 0.7rem; }
.door-human {
  background: var(--paper); color: var(--ink);
  transform: rotate(0.4deg);
  box-shadow: 0 6px 24px rgba(0,0,0,0.5);
}
.door-human h3 { color: var(--ink); }
.door-human p { font-size: 0.92rem; }
.door-human p + p { margin-top: 0.55rem; }
.door-small { font-size: 0.8rem; color: var(--ink-faded); }
.door-cta {
  display: inline-block; font-family: ui-monospace, 'Courier New', monospace;
  background: var(--ink); color: var(--paper) !important;
  padding: 0.1rem 0.55rem; border-radius: 3px; text-decoration: none;
}
.door-agent {
  border: 1px solid var(--teal-dim);
  background: rgba(10,14,13,0.92);
  font-family: ui-monospace, 'Courier New', monospace;
  box-shadow: inset 0 0 30px rgba(93,230,200,0.05), 0 0 20px rgba(93,230,200,0.08);
}
.door-agent h3 { color: var(--teal); text-shadow: 0 0 10px rgba(93,230,200,0.4); }
.term-line { font-size: 0.8rem; color: #9fd8c9; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.term-line + .term-line { margin-top: 0.35rem; }
.term-note { color: var(--teal-dim); }
.term-pay { margin-top: 0.8rem; color: var(--teal); font-size: 0.72rem; letter-spacing: 0.08em; }

/* ---- the wall ---- */
.wall { margin-top: 2.6rem; }
.guest-slip {
  border-left: 2px solid #372c44; padding: 0.5rem 0 0.5rem 0.9rem;
  margin-bottom: 0.6rem;
}
.guest-who { font-weight: bold; color: #efe6f4; }
.guest-when { font-size: 0.72rem; color: var(--night-faded); margin-left: 0.5rem; font-family: ui-monospace, monospace; }
.guest-said { font-size: 0.9rem; color: var(--night-faded); margin-top: 0.15rem; }
.empty-night { text-align: center; font-style: italic; color: var(--night-faded); }

/* ---- fine print ---- */
.porch-print {
  margin-top: 3rem; padding-top: 1.4rem;
  border-top: 1px solid #372c44;
  text-align: center; font-size: 0.8rem; color: var(--night-faded);
}
.porch-print p + p { margin-top: 0.5rem; }

a { color: var(--teal); }
a:hover { color: var(--neon-hot); }
code {
  font-family: ui-monospace, 'Courier New', monospace;
  background: rgba(93,230,200,0.08); border: 1px solid #2a3b36;
  padding: 0 0.35em; border-radius: 3px; font-size: 0.9em;
}
`;
