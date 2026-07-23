# SUNNY DAY — design pass proposal for the storefront rework

Status: PROPOSAL, 2026-07-23. No build until the keeper nods (his list, item 9).
Direction being answered (TASKS): positive vibes, sunny day, clean, readable,
marketable (not corporate), fun, fitting the canon instead of trying to be
something we aren't. The neon-dusk front retires. De-overt everywhere: the
story lives in tidbits, nothing explains itself.

---

## 1. The one-line concept

**The store already has a daylight identity; the front just never used it.**
Every artifact the store signs — badges, stamps, the new lucky cards — is
cream paper, brown ink, brick-red accents, Georgia serif, hand-set label
language. The storefront is the only surface living at midnight. The sunny-day
rework is not a new design; it is the store finally standing in front of its
own shelves: the paper palette becomes the building, and a patron who buys a
badge sees the same store on the badge that sold it to them. That is the
marketable move — one identity, everywhere, already proven on the artifacts.

Time of day: mid-morning. Coffee hours, porch light, nothing golden-hour
sentimental. "Where you're never late" reads best before noon.

## 2. Palette (all colors already in the family)

| Token | Now (night) | Proposed (day) | Source |
|---|---|---|---|
| sky top | #0b0a12 night | #cfe3ea pale morning blue | new, the only new hue |
| sky low / paper | #16121f dusk | #f4ead8 paper | badges/stamps/cards |
| text | #cfc4d6 night-text | #3b2f23 ink | every artifact |
| faded | #857a91 | #7a6a55 ink-faded | every artifact |
| primary accent | #ffb45e neon | #8c2f1b brick red | badge seal, stamp bank |
| secondary accents | #5de6c8 teal | #1b5c8c enamel blue, #3f6b2f bottle green, #8c6a1b gold | the stamp accent bank, used sparingly (links, prices, the pass gold) |

Contrast: ink on paper clears WCAG AAA for body text; brick/enamel accents
reserved for ≥bold/large or decorative use. The neon glow shadows all retire;
daylight has no glow, it has shadow — one soft drop shadow under the sign
board and the cards, nothing else.

## 3. Element-by-element (what retires, what converts, what stays)

- **Stars, dusk scanlines, light pool** — retire outright.
- **Sky** — one fixed gradient (morning blue into warm haze at the horizon
  line behind the sign). Optional: a single slow CSS cloud, opacity drift,
  90s loop, `prefers-reduced-motion` kills it. Nothing else in the sky.
- **The neon sign** — becomes a painted shopboard: paper panel, double-rule
  border (exactly the badge border language), SEAN-CLAUDE VAN DAMME'S GENERAL
  STORE in big ink serif. The flickering O retires; its replacement wink is a
  slightly crooked O, painted by hand and left that way (static transform,
  one degree). Tidbit, never announced.
- **Tube line** ("OAK CITY · WHERE YOU'RE NEVER LATE") — small hand-set caps
  above the board, letterpressed (ink, wide tracking). Copy untouched.
- **Open sign** — the weekly rotating bank stays word-for-word; the pill
  becomes a small enamel door sign (paper on brick, hung with two visible
  string loops, CSS only).
- **Bell marquee + intent line** — copy untouched; set in ink under the board.
- **Gauges** — the nixie tubes retire (they were the most midnight thing on
  the page). Patrons-served becomes a mechanical tally counter: paper wheels,
  ink digits, thin slot shadows — same digit markup, new CSS. The mailbox LED
  becomes a small brass-plate counter ("N in · N answered", engraved style).
- **Readerboard** — stays a letterboard ("letters set by hand" is load-bearing
  copy); goes from backlit marquee to a white-grooved board in a wooden frame,
  daylight lit. The per-word hand-set tilts stay, they're the charm.
- **The cat** — stays on top of the board, same appearance schedule, now
  sunning (same markup; tail sway and blink keep their reduced-motion guard).
- **Shelves** — cards become shelf tags: paper cards, thin ink rule, a
  string-tied price tag corner for the price (brick ink, monospace). Hover:
  lift + shadow only, no glow line.
- **The two doors** — the human door is already an index card; it stays, pin
  and all. The agent door KEEPS its dark terminal: the one humming screen in
  a sunlit store, sitting by the register. It becomes the page's only dark
  element, which is better contrast and a better tidbit than it ever was at
  night. Copy untouched.
- **Guestbook wall / fine print** — restyle to ink-on-paper; content and
  structure untouched.
- **Porch page** — follows the same sky in a second pass (same tokens; the
  porch keeps its own hour clock and can run the sky from it later —
  out of scope for this pass, noted as the follow-up).
- **Paper pages (paper-css)** — untouched. They were already right.

## 4. Rules the rework obeys

- **Zero scripts, zero cookies** — unchanged; the storefront test that pins
  this stays green.
- **Copy is the keeper's** — this pass changes not one word. Everything in
  `src/store/copy/storefront.ts` renders as-is. If daylight makes any line
  read differently (none spotted), it gets flagged, not edited.
- **De-overt** — no "now in daylight!" anywhere. The sign is just painted
  now. The crooked O, the terminal by the register, the cat in the sun:
  present, never explained.
- **Motion budget** — cloud (optional), cat tail, cat blink. Everything else
  static. All transitions ≤250ms as before.
- **No new claims** — daylight adds no text; decoration only.

## 5. Build shape (when nodded)

1. `storefront-css.ts` rewritten (~same line count; it's a swap, not a grow).
2. `storefront-page.ts` touched only for class names/structure where an
   element converts (gauges, sign board); copy imports unchanged.
3. Porch pass follows separately (same tokens, its own PR).
4. Tests: the no-scripts/no-cookies pin and copy pins unaffected; eyeball
   pass on mobile widths (grid breakpoints keep their values).

## 6. Keeper decisions requested (defaults preselected)

1. **Sky motion:** one slow cloud, or perfectly still? *Default: one cloud.*
2. **Awning:** a cream/brick striped awning under the sign board — classic
   general store, slightly more "fun," slightly less quiet. In or out?
   *Default: in, shallow (one stripe row, no scallops).*
3. **Agent door:** dark terminal stays as the one screen in the store, or
   converts to a printed receipt card? *Default: terminal stays dark.*
4. **The crooked O** as the flicker's daylight heir: keep? *Default: keep.*
5. Anything on the current front he wants preserved at all costs — say it
   now, before the repaint.

Nod on this document (with any decision overrides) = build starts.
