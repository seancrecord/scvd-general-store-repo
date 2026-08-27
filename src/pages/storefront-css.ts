/**
 * The storefront at night. Neon over a dark porch; paper where paper
 * belongs, taped, pinned, a little crooked, the way real counters are.
 * Everything animated rides opacity/transform/text-shadow on small
 * elements; no scripts, no layout thrash, reduced-motion respected.
 */
export const STOREFRONT_CSS = `
:root {
  --night: #0b0a12;
  --dusk: #16121f;
  --horizon: #2a1a33;
  --ember: #45162a;
  --neon: #ffb45e;
  --neon-hot: #ffd9a8;
  --teal: #5de6c8;
  --teal-dim: #2e8a77;
  --paper: #f4ead8;
  --ink: #3b2f23;
  --ink-faded: #7a6a55;
  --night-text: #cfc4d6;
  --night-faded: #857a91;
  --line: #372c44;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
html { scroll-behavior: smooth; }
body.night {
  background:
    radial-gradient(ellipse 130% 60% at 50% -12%,
      var(--ember) 0%, var(--horizon) 26%, var(--dusk) 55%, var(--night) 100%);
  background-attachment: fixed;
  color: var(--night-text);
  font-family: Georgia, 'Times New Roman', serif;
  line-height: 1.55;
  min-height: 100vh;
  padding: 0 0.75rem 4rem;
  overflow-x: hidden;
}
/*
 * The backstop the body rule above cannot be: mobile Safari pans the
 * ROOT element, so overflow hidden on body alone still lets a finger
 * drag the page sideways into anything that escapes. clip, not
 * hidden, so the root never becomes a scroll container.
 */
html { overflow-x: clip; }

/* Two stars twinkling out of phase; the rest hold still, as stars do. */
.stars, .stars::before, .stars::after {
  position: fixed; pointer-events: none; z-index: 0;
}
.stars { inset: 0; }
.stars::before, .stars::after {
  content: ""; width: 2px; height: 2px; border-radius: 50%;
  background: #fff;
}
.stars::before {
  top: 8%; left: 12%;
  box-shadow:
    14vw 3vh 0 0 rgba(255,255,255,0.7), 32vw 9vh 0 0 rgba(255,255,255,0.4),
    55vw 2vh 0 0 rgba(255,255,255,0.6), 71vw 7vh 0 0 rgba(255,255,255,0.35),
    88vw 4vh 0 0 rgba(255,255,255,0.55), 44vw 13vh 0 0 rgba(255,255,255,0.3),
    64vw 16vh 0 1px rgba(93,230,200,0.35), 5vw 18vh 0 0 rgba(255,255,255,0.4);
  animation: twinkle 5s ease-in-out infinite alternate;
}
.stars::after {
  top: 5%; left: 26%;
  box-shadow:
    22vw 6vh 0 0 rgba(255,255,255,0.5), 48vw 11vh 0 0 rgba(255,255,255,0.45),
    77vw 13vh 0 0 rgba(255,255,255,0.5), 60vw 5vh 0 1px rgba(255,180,94,0.4),
    9vw 10vh 0 0 rgba(255,255,255,0.35), 93vw 9vh 0 0 rgba(255,255,255,0.4);
  animation: twinkle 7s ease-in-out infinite alternate-reverse;
}
@keyframes twinkle { from { opacity: 0.35; } to { opacity: 1; } }

.dusk {
  position: fixed; inset: 0; pointer-events: none; z-index: 0;
  background:
    radial-gradient(ellipse 100% 100% at 50% 50%, transparent 55%, rgba(0,0,0,0.5) 100%),
    repeating-linear-gradient(0deg, transparent 0 2px, rgba(0,0,0,0.1) 2px 4px);
}
.road { position: relative; z-index: 1; max-width: 760px; margin: 0 auto; }

/* ---- the sign ---- */
.signfront { position: relative; text-align: center; padding: 2.6rem 0 1.4rem; }
.tube-line {
  white-space: nowrap;
  letter-spacing: 0.3em; font-size: clamp(0.5rem, 2.2vw, 0.64rem);
  color: var(--teal-dim); text-transform: uppercase;
  text-shadow: 0 0 8px rgba(93,230,200,0.35);
}
.neon {
  position: relative; z-index: 2;
  margin: 1rem 0 0.4rem;
  font-size: clamp(2rem, 8vw, 3.4rem);
  line-height: 1.08;
  letter-spacing: 0.06em;
  color: var(--neon-hot);
  animation: breathe 9s ease-in-out infinite alternate;
}
@keyframes breathe {
  from {
    text-shadow:
      0 0 6px rgba(255,180,94,0.9), 0 0 18px rgba(255,180,94,0.5),
      0 0 42px rgba(255,120,60,0.3), 0 0 80px rgba(255,90,40,0.16);
  }
  to {
    text-shadow:
      0 0 7px rgba(255,180,94,1), 0 0 24px rgba(255,180,94,0.65),
      0 0 60px rgba(255,120,60,0.42), 0 0 110px rgba(255,90,40,0.26);
  }
}
.neon-sub { color: var(--neon); }
.flicker { animation: tube 6s infinite; }
.flicker-slow { animation: tube 13s infinite; animation-delay: 2.5s; }
@keyframes tube {
  0%, 41%, 45%, 100% { opacity: 1; }
  42%, 44% { opacity: 0.35; text-shadow: none; }
  43% { opacity: 0.7; }
}
/* The sign's glow pooling on the road below it. */
.light-pool {
  position: absolute; left: 50%; top: 100%;
  width: min(90vw, 640px); height: 130px;
  transform: translate(-50%, -46%);
  background: radial-gradient(ellipse 50% 42% at 50% 50%, rgba(255,160,80,0.13), transparent 70%);
  pointer-events: none; z-index: 1;
}
@media (prefers-reduced-motion: reduce) {
  .flicker, .flicker-slow, .neon, .stars::before, .stars::after, .cursor { animation: none !important; }
}
.open-sign {
  position: relative; z-index: 2;
  display: inline-block; margin-top: 0.9rem;
  border: 1px solid var(--teal-dim); border-radius: 999px;
  padding: 0.3rem 1rem;
  font-size: 0.72rem; letter-spacing: 0.28em; color: var(--teal);
  text-shadow: 0 0 10px rgba(93,230,200,0.5);
  animation: hum 4s ease-in-out infinite alternate;
}
@keyframes hum {
  from { box-shadow: 0 0 12px rgba(93,230,200,0.14), inset 0 0 8px rgba(93,230,200,0.06); }
  to   { box-shadow: 0 0 22px rgba(93,230,200,0.3),  inset 0 0 12px rgba(93,230,200,0.12); }
}
.bell-marquee {
  position: relative; z-index: 2;
  margin-top: 1.1rem;
  font-size: clamp(1rem, 3.4vw, 1.25rem);
  color: var(--neon);
  text-shadow: 0 0 10px rgba(255,180,94,0.55), 0 0 30px rgba(255,120,60,0.25);
}
.proprietors { position: relative; z-index: 2; margin-top: 0.6rem; font-style: italic; font-size: 0.9rem; color: var(--night-faded); }
/* The claim, at the size a claim deserves — it used to be a paragraph
   of 0.72rem grey nobody read, this store's own keeper included. */
.track-record {
  position: relative; z-index: 2; margin: 0.9rem auto 0; max-width: 560px;
  font-size: 0.92rem; letter-spacing: 0.02em; color: #d9cfe0;
}
.pay-rails {
  position: relative; z-index: 2; margin: 0.35rem auto 0; max-width: 560px;
  font-size: 0.72rem; color: var(--night-faded);
}

/* ---- the instruments: nixie odometer + mailbox LED ---- */
.gauges {
  display: flex; flex-wrap: wrap; gap: 1rem 2.2rem;
  justify-content: center; align-items: flex-end;
  margin: 1.3rem 0 2.5rem;
}
.gauge { text-align: center; }
.gauge-label {
  display: block;
  font-family: ui-monospace, 'Courier New', monospace;
  font-size: 0.62rem; letter-spacing: 0.32em; text-transform: uppercase;
  color: var(--night-faded); margin-bottom: 0.4rem;
}
.nixie { display: inline-flex; gap: 0.25rem; }
.nx {
  display: inline-block; min-width: 1.5rem; padding: 0.18rem 0.15rem;
  font-family: ui-monospace, 'Courier New', monospace;
  font-size: 1.45rem; font-weight: bold; line-height: 1.2; text-align: center;
  color: var(--neon);
  background:
    radial-gradient(ellipse 70% 55% at 50% 42%, rgba(255,150,60,0.18), transparent 75%),
    linear-gradient(180deg, #191320, #0e0b15);
  border: 1px solid #3d2c30; border-radius: 5px;
  box-shadow: inset 0 0 10px rgba(0,0,0,0.8), 0 0 12px rgba(255,140,60,0.18);
  text-shadow: 0 0 8px rgba(255,170,80,0.9), 0 0 22px rgba(255,120,40,0.45);
}
.nx-dim {
  color: #4a3a35; text-shadow: none;
  background: linear-gradient(180deg, #14101a, #0d0a13);
  box-shadow: inset 0 0 10px rgba(0,0,0,0.8);
}
.led {
  font-family: ui-monospace, 'Courier New', monospace;
  font-size: 0.82rem; letter-spacing: 0.1em; text-transform: uppercase;
  color: var(--teal-dim);
}
.led-num {
  font-style: normal; font-size: 1.45rem; font-weight: bold;
  color: var(--teal); padding: 0 0.1rem;
  text-shadow: 0 0 10px rgba(93,230,200,0.8), 0 0 26px rgba(93,230,200,0.35);
}
.led-sep { color: var(--line); }
/* The empty frame by the register. It's waiting. */
.frame-line {
  display: inline-block; padding: 0.3rem 0.9rem;
  border: 1px dashed var(--line); border-radius: 3px;
  font-style: italic; font-size: 0.85rem; color: var(--night-faded);
}

/* ---- the readerboard: this week's note, letters set by hand ---- */
.board {
  max-width: 560px; margin: 0 auto 2.7rem;
  background:
    repeating-linear-gradient(0deg, transparent 0 1.9em, rgba(255,255,255,0.045) 1.9em calc(1.9em + 1px)),
    linear-gradient(180deg, #15111e 0%, #0e0b15 100%);
  border: 3px solid #2c2438; border-radius: 6px;
  padding: 1rem 1.3rem 1.25rem;
  box-shadow:
    inset 0 0 34px rgba(0,0,0,0.85),
    0 8px 26px rgba(0,0,0,0.55),
    0 0 34px rgba(255,170,80,0.07);
}
.board-text {
  font-family: ui-monospace, 'Courier New', monospace;
  text-transform: uppercase;
  font-size: 0.95rem; letter-spacing: 0.16em; word-spacing: 0.4em;
  line-height: 1.9em;
  color: #ffe3b8;
  text-shadow: 0 0 7px rgba(255,190,110,0.6), 0 0 20px rgba(255,140,60,0.22);
}
.brd-w { display: inline-block; }
.brd-a { transform: rotate(-1.6deg) translateY(1px); }
.brd-b { transform: rotate(1.1deg) translateY(-1px); }
.brd-dim { opacity: 0.55; text-shadow: 0 0 4px rgba(255,190,110,0.25); }

/* house cat */
.board { position: relative; }
.cat {
  position: absolute; top: -29px; right: 26px;
  width: 44px; height: 30px;
  background: linear-gradient(175deg, #f4f1f7 30%, #d9d4e0 100%);
  border-radius: 55% 45% 20% 20% / 85% 80% 20% 20%;
  filter: drop-shadow(0 2px 3px rgba(0,0,0,0.55)) drop-shadow(0 0 6px rgba(255,200,130,0.15));
}
.cat::before {
  content: ""; position: absolute; top: -13px; left: 2px;
  width: 20px; height: 17px;
  background: #f4f1f7;
  clip-path: polygon(0% 42%, 16% 0%, 34% 26%, 66% 26%, 84% 0%, 100% 42%, 96% 100%, 4% 100%);
}
.cat-tail {
  position: absolute; right: -13px; bottom: 0;
  width: 18px; height: 24px;
  border: 4px solid transparent;
  border-right-color: #ece8f1;
  border-radius: 0 70% 70% 0 / 0 100% 100% 0;
  transform-origin: bottom left;
  animation: sway 7s ease-in-out infinite alternate;
}
@keyframes sway { from { transform: rotate(-4deg); } to { transform: rotate(9deg); } }
.cat-eye {
  position: absolute; top: -5px;
  width: 3px; height: 2px; border-radius: 50%;
  background: var(--neon);
  box-shadow: 0 0 4px rgba(255,180,94,0.9);
  animation: catblink 9s steps(1) infinite;
}
.cat-eye-l { left: 6px; }
.cat-eye-r { left: 14px; }
@keyframes catblink { 0%, 93%, 96%, 100% { opacity: 1; } 94%, 95% { opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .cat-tail, .cat-eye { animation: none; } }

/* ---- shelves ---- */
.night-head {
  text-align: center; font-size: 0.88rem; letter-spacing: 0.34em;
  color: var(--neon); margin-bottom: 1.2rem;
  text-shadow: 0 0 12px rgba(255,180,94,0.4);
}
.shelf-grid { display: grid; gap: 0.7rem; grid-template-columns: 1fr; }
@media (min-width: 560px) { .shelf-grid { grid-template-columns: 1fr 1fr; } }
.shelf-card {
  position: relative;
  border: 1px solid var(--line); border-radius: 4px;
  background: linear-gradient(160deg, rgba(36,26,46,0.9), rgba(22,18,31,0.9));
  padding: 0.9rem 1rem;
  overflow: hidden;
  transition: border-color 200ms ease, transform 200ms ease, box-shadow 200ms ease;
}
.shelf-card::before {
  content: ""; position: absolute; inset: 0 0 auto 0; height: 1px;
  background: linear-gradient(90deg, transparent, rgba(93,230,200,0.6), transparent);
  opacity: 0; transition: opacity 200ms ease;
}
.shelf-card:hover {
  border-color: var(--teal-dim);
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(0,0,0,0.45), 0 0 18px rgba(93,230,200,0.12);
}
.shelf-card:hover::before { opacity: 1; }
.shelf-top { display: flex; align-items: baseline; gap: 0.6rem; }
.shelf-name { font-weight: bold; color: #efe6f4; flex: 1; }
.shelf-price {
  font-family: ui-monospace, 'Courier New', monospace;
  color: var(--teal); white-space: nowrap;
  text-shadow: 0 0 8px rgba(93,230,200,0.35);
}
.shelf-line { margin-top: 0.3rem; font-size: 0.88rem; color: var(--night-faded); }
.shelf-more { text-align: center; margin-top: 1.1rem; font-size: 0.85rem; color: var(--night-faded); }
.shelf-till { text-align: center; margin-top: 0.9rem; font-size: 0.85rem; color: var(--night-faded); }
/* The sign is night; the inherited ink-on-paper button would vanish
 * into it. Teal is this page's "a machine can act here" color. */
.shelf-till .door-cta { background: var(--teal); color: var(--night) !important; }

/* ---- what this place is: the infrastructure, stated before the shelf ---- */
.what-this-is {
  max-width: 640px; margin: 0 auto 2.7rem;
  border: 1px solid var(--line); border-radius: 4px;
  padding: 1.15rem 1.4rem 1.3rem;
  background: rgba(255,255,255,0.02);
  text-align: left;
}
.what-this-is .night-head { text-align: center; }
.what-line { margin-top: 0.65rem; font-size: 0.9rem; line-height: 1.55; color: var(--night-faded); }
.what-lead { color: #efe6f4; }
.what-line a { color: var(--teal); }

/* ---- the two doors ---- */
.doors { display: grid; gap: 1rem; grid-template-columns: 1fr; margin-top: 2.6rem; }
@media (min-width: 640px) { .doors { grid-template-columns: 1fr 1fr; } }
/*
 * THE PHONE FIX, MEASURED BEFORE IT WAS WRITTEN (2026-08-27). At a
 * 390px viewport the page laid out 607px wide, and the drag into
 * blank space the keeper felt was those 217 dead pixels. The culprit
 * was not a width anywhere: grid items default min-width auto, so the
 * agent door's nowrap terminal lines pushed their track to ~548px and
 * the ellipsis rule below never got a container narrow enough to
 * clip against. min-width: 0 restores the clip; overflow-wrap on the
 * card's code spans breaks the one-long-token lines (a curl command,
 * an mcp add) that did the same to the human door.
 */
.door { min-width: 0; }
.door-human code { overflow-wrap: anywhere; }
.door { border-radius: 4px; padding: 1.2rem 1.3rem 1.4rem; }
.door h3 { font-size: 0.82rem; letter-spacing: 0.22em; margin-bottom: 0.7rem; }
/* An index card pinned to the night. */
.door-human {
  position: relative;
  background:
    repeating-linear-gradient(0deg, transparent 0 26px, rgba(120,140,190,0.18) 26px 27px),
    var(--paper);
  color: var(--ink);
  transform: rotate(0.8deg);
  box-shadow: 0 8px 26px rgba(0,0,0,0.55);
}
.pushpin {
  position: absolute; top: -7px; left: 50%;
  width: 15px; height: 15px; border-radius: 50%;
  transform: translateX(-50%);
  background: radial-gradient(circle at 35% 30%, #ff9a86, #b3402c 60%, #6e2216);
  box-shadow: 0 3px 5px rgba(0,0,0,0.5), 0 0 10px rgba(255,106,77,0.25);
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
.cursor { animation: blink 1.1s steps(1) infinite; }
@keyframes blink { 50% { opacity: 0; } }
.term-line { font-size: 0.8rem; color: #9fd8c9; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.term-line + .term-line { margin-top: 0.35rem; }
.term-note { color: var(--teal-dim); }
.term-pay { margin-top: 0.8rem; color: var(--teal); font-size: 0.72rem; letter-spacing: 0.08em; }

/* ---- the wall: cards pinned to the boards, in somebody else's hand ----
   The one section of this page written by visitors. It used to be set
   in the same face and the same grey as the copy we write, and read as
   more of ours. Own panel, own paper, own hand. */
.wall { margin-top: 2.6rem; }
.wall-slips {
  display: grid; gap: 0.9rem;
  padding: 1.15rem 1rem 1.25rem;
  border: 1px solid #2f2740; border-radius: 5px;
  background:
    repeating-linear-gradient(90deg, transparent 0 6px, rgba(255,255,255,0.012) 6px 7px),
    linear-gradient(180deg, rgba(28,22,38,0.85), rgba(14,11,21,0.85));
  box-shadow: inset 0 0 38px rgba(0,0,0,0.7);
}
.guest-slip {
  position: relative;
  padding: 0.85rem 1rem 0.7rem;
  background: linear-gradient(168deg, rgba(244,234,216,0.055), rgba(244,234,216,0.02));
  border: 1px solid #3a3050; border-left: 2px solid var(--teal-dim);
  border-radius: 3px;
  box-shadow: 0 4px 14px rgba(0,0,0,0.4);
  transition: transform 200ms ease, box-shadow 200ms ease, border-color 200ms ease;
}
.guest-slip:nth-child(odd) { transform: rotate(-0.35deg); }
.guest-slip:nth-child(even) { transform: rotate(0.4deg); }
.guest-slip:hover {
  transform: rotate(0deg) translateY(-2px);
  border-color: var(--teal-dim);
  box-shadow: 0 8px 22px rgba(0,0,0,0.5), 0 0 16px rgba(93,230,200,0.1);
}
/* A tack in the top corner of each card. */
.guest-pin {
  position: absolute; top: -5px; right: 12px;
  width: 9px; height: 9px; border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, #ffd9a8, var(--neon) 55%, #8a4a17);
  box-shadow: 0 2px 3px rgba(0,0,0,0.55), 0 0 7px rgba(255,180,94,0.35);
}
/* Palatino, deliberately NOT the Georgia the rest of the page is set in. */
.guest-said {
  font-family: Palatino, 'Palatino Linotype', 'Book Antiqua', Georgia, serif;
  font-size: 0.94rem; line-height: 1.5; color: #c9bed3;
}
.guest-sig {
  display: flex; align-items: baseline; justify-content: flex-end;
  gap: 0.55rem; margin-top: 0.5rem;
}
/* A signature, in whatever script face the reader's machine keeps.
   Every fallback lands somewhere legible; the last is the page's own. */
.guest-who {
  font-family: 'Snell Roundhand', 'Segoe Script', 'Bradley Hand',
    'Brush Script MT', 'Apple Chancery', cursive, Georgia, serif;
  font-size: 1.16rem; line-height: 1.1; color: #f0e4d6;
  text-shadow: 0 0 12px rgba(240,228,214,0.18);
}
.guest-when {
  font-family: ui-monospace, 'Courier New', monospace;
  font-size: 0.66rem; letter-spacing: 0.1em; color: var(--night-faded);
}
.empty-night { text-align: center; font-style: italic; color: var(--night-faded); }
/* The two doors off the wall: the whole register, and the train. */
.wall .menu-meta {
  margin-top: 0.9rem; text-align: center;
  font-size: 0.78rem; color: var(--night-faded);
}
.wall .menu-meta a { text-decoration: none; border-bottom: 1px solid rgba(93,230,200,0.22); }
.wall .menu-meta a:hover { border-bottom-color: var(--neon-hot); }
@media (prefers-reduced-motion: reduce) {
  .guest-slip, .guest-slip:hover { transform: none; }
}

/* ---- fine print: one line of voice, the verify address, the doors ---- */
.porch-print {
  margin-top: 3rem; padding-top: 1.4rem;
  border-top: 1px solid var(--line);
  text-align: center; font-size: 0.8rem; color: var(--night-faded);
}
.porch-print p + p { margin-top: 0.5rem; }
.porch-dare { color: var(--night-text); }
.porch-rooms-label {
  margin-top: 1.5rem !important;
  font-family: ui-monospace, 'Courier New', monospace;
  font-size: 0.6rem; letter-spacing: 0.3em; text-transform: uppercase;
  color: var(--night-faded);
}
/* The links are the footer's job. A full underline on every room in the
   store, one after another, reads as a wall of static; a hairline that
   lights on hover does the same work and lets the names be read as
   names. (Kept free of any spelled-out tally — this stylesheet is
   SERVED, and the derived-not-typed guard reads what we serve.) */
.porch-rooms {
  max-width: 640px; margin-left: auto; margin-right: auto;
  margin-top: 0.6rem !important; line-height: 2.1;
  color: var(--line);
}
.porch-rooms a {
  display: inline-block; white-space: nowrap;
  text-decoration: none;
  border-bottom: 1px solid rgba(93,230,200,0.22);
  padding-bottom: 1px;
  transition: border-color 160ms ease, color 160ms ease;
}
.porch-rooms a:hover { border-bottom-color: var(--neon-hot); }
.porch-est {
  margin-top: 1.4rem !important;
  letter-spacing: 0.2em; font-size: 0.68rem; text-transform: uppercase;
}

a { color: var(--teal); }
a:hover { color: var(--neon-hot); }
code {
  font-family: ui-monospace, 'Courier New', monospace;
  background: rgba(93,230,200,0.08); border: 1px solid #2a3b36;
  padding: 0 0.35em; border-radius: 3px; font-size: 0.9em;
}

/**
 * THE ACCESSIBLE NAME, AND WHY IT NEEDS ITS OWN ELEMENT.
 *
 * The sign is built out of letters that flicker on their own timers,
 * so "STORE" is really ST + <span>O</span> + RE. To a person that is
 * a bulb with a loose contact. To anything reading textContent it is
 * "GENERAL ST O RE" — and a readiness audit on 2026-08-21 reported
 * this page as having NO H1 at all, because the only h1 on it spells
 * nothing a parser can match against the store's name.
 *
 * Clipped, not display:none — a hidden element is dropped from the
 * accessibility tree and from most text extraction, which is the
 * whole thing being fixed. The neon is untouched.
 */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
`;
