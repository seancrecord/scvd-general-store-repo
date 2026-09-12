import { DINO_PATH, DINO_TRANSFORM } from "@/services/favicon";

/**
 * THE PLATES — the field-guide drawing on each card face (handoff v2
 * §3). Single-ink silhouettes on a 100×100 field, authored as filled
 * path data so the SVG face and the pixel share sheet draw the same
 * shape from the same bytes. No photographs, no invented objects: a
 * door is a door, a rail is rail infrastructure, a condition is the
 * plate with something visibly wrong drawn over it in yellow.
 *
 * WHAT IS DRAWN AND WHAT IS NOT is stated here, per key, because the
 * handoff says the art is the long pole and a card without its plate
 * ships as a silhouette labelled "not yet pressed" — which is itself
 * a shareable tease, and honest. `plateFor` returns null for an
 * undrawn key; the renderers draw the labelled silhouette then. A
 * test counts the drawn plates so the number on /design is derived.
 *
 * The dinosaur is the favicon's own path (one drawing, four surfaces)
 * and needs its own transform; everything else is authored on the
 * plate field directly. ⚑ The keeper's art direction replaces any of
 * these the day he has a better drawing.
 */

export interface Plate {
  /** Path data on a 0..100 field, fill-rule evenodd. */
  d: string;
  /** An optional transform for paths authored on another field. */
  transform?: string;
}

const PLATES: Record<string, Plate> = {
  // ── the specimen: a printer's plate, blank ──
  specimen: { d: "M14 20h72v60H14z M22 28v44h56V28z M30 36h40v28H30z M36 42v16h28V42z" },
  // ── the mark, off the favicon ──
  dinosaur: { d: DINO_PATH, transform: `translate(4 -2) scale(0.92) ${DINO_TRANSFORM}` },
  "t-rex": { d: DINO_PATH, transform: `translate(4 -2) scale(0.92) ${DINO_TRANSFORM}` },
  // ── rooms ──
  bell: {
    d: "M46 10h8v6c15 3 22 16 22 34v12h8v7H16v-7h8V50c0-18 7-31 22-34V10z M40 74a10 8 0 0 0 20 0z",
  },
  guestbook: {
    d: "M18 16h64v68H18z M26 24v52h48V24z M32 34h36v3H32z M32 44h36v3H32z M32 54h24v3H32z M64 60l10-14 6 4-10 14-8 2z",
  },
  "visit-stamp": {
    d: "M20 20h60v60H20z M27 27v46h46V27z M33 33h34v34H33z M40 40h20v20H40z M47 47h6v6h-6z",
  },
  mailbox: {
    d: "M12 30h52a16 16 0 0 1 16 16v26H12z M20 38v26h44V46a8 8 0 0 0-8-8z M28 46h20v3H28z M28 54h20v3H28z M74 72h6v18h-6z M62 26h12v8H62z",
  },
  porch: {
    d: "M14 84h72v6H14z M18 40h8v44h-8z M74 40h8v44h-8z M14 36h72v6H14z M30 58h40v6H30z M30 64h6v20h-6z M64 64h6v20h-6z M34 46h32v10H34z",
  },
  "practice-counter": {
    d: "M10 50h80v8H10z M14 58h8v32h-8z M78 58h8v32h-8z M22 62h56v6H22z M30 22h40v24H30z M36 28v12h28V28z M46 10h8v12h-8z",
  },
  train: {
    d: "M10 34h64l16 16v18H10z M18 42v18h62v-6L70 42z M22 46h12v10H22z M40 46h12v10H40z M58 46h10v10H58z M14 74a6 6 0 1 0 12 0a6 6 0 1 0-12 0z M40 74a6 6 0 1 0 12 0a6 6 0 1 0-12 0z M68 74a6 6 0 1 0 12 0a6 6 0 1 0-12 0z M16 22h10v12H16z M70 20h8v14h-8z",
  },
  almanac: {
    d: "M22 14h50a8 8 0 0 1 8 8v64H30a8 8 0 0 1-8-8z M30 22v54h42V22z M36 30h30v3H36z M36 38h30v3H36z M36 46h20v3H36z M58 56h8v14l-4-4-4 4z",
  },
  "trading-post": {
    d: "M14 44L50 14l36 30v8H14z M22 52h56v34H22z M30 60v18h16V60z M56 60v18h14V60z M42 60h4v18h-4z",
  },
  "systems-almanac": {
    d: "M50 10a40 40 0 1 0 0.1 0z M50 18a32 32 0 1 1-0.1 0z M48 26h4v24h-4z M48 50h18v4H48z M50 44a6 6 0 1 0 0.1 0z M50 12h2v6h-2z M50 82h2v6h-2z M12 49h6v2h-6z M82 49h6v2h-6z",
  },
  // ── instruments ──
  preflight: {
    d: "M42 12a28 28 0 1 0 0.1 0z M42 22a18 18 0 1 1-0.1 0z M60 60l26 26-8 8-26-26z M36 34h12v4H36z M36 42h12v4H36z",
  },
  "conformance-desk": {
    d: "M50 8a30 30 0 1 0 0.1 0z M50 16a22 22 0 1 1-0.1 0z M38 38l8 8 16-16 5 5-21 21-13-13z M34 66h32l8 26-24-8-24 8z",
  },
  corpus: {
    d: "M18 20h64v14H18z M22 38h56v14H22z M18 56h64v14H18z M22 74h56v14H22z M26 24h48v6H26z M30 42h40v6H30z M26 60h48v6H26z M30 78h40v6H30z",
  },
  passport: {
    d: "M22 12h56v76H22z M30 20v60h40V20z M50 30a10 10 0 1 0 0.1 0z M36 58h28v4H36z M36 66h28v4H36z",
  },
  "field-wallet": {
    d: "M14 30h64a8 8 0 0 1 8 8v40a8 8 0 0 1-8 8H14z M22 38v40h56V38z M60 50h26v16H60z M68 55a3 3 0 1 0 0.1 0z M20 22h52v8H20z",
  },
  "settlement-attestation": {
    d: "M50 10a24 24 0 1 0 0.1 0z M50 18a16 16 0 1 1-0.1 0z M40 34l6 6 12-12 4 4-16 16-10-10z M36 56h12l-8 34-8-12-10 6z M64 56H52l8 34 8-12 10 6z",
  },
  "standing-watch": {
    d: "M50 12a38 38 0 1 0 0.1 0z M50 20a30 30 0 1 1-0.1 0z M48 30h4v22h-4z M48 50h16v4H48z M50 14h2v6h-2z M50 80h2v6h-2z M14 49h6v2h-6z M80 49h6v2h-6z",
  },
  "verify-door": {
    d: "M20 12h60v76H20z M28 20v60h44V20z M38 50l10 10 20-24 5 4-25 30-15-15z",
  },
  // ── places ──
  "hurricane-junction": {
    d: "M48 10h4v80h-4z M20 22h44l10 8-10 8H20z M80 46H36l-10 8 10 8h44z M40 82h20v6H40z",
  },
  "node-21": {
    d: "M14 14h72v72H14z M22 22v56h56V22z M50 36a14 14 0 1 0 0.1 0z M50 44a6 6 0 1 1-0.1 0z M48 50h4v12h-4z M28 28h8v8h-8z M64 28h8v8h-8z M28 64h8v8h-8z M64 64h8v8h-8z",
  },
  // ── rails ──
  "base-bridge": {
    d: "M8 60h84v8H8z M20 20h8v48h-8z M72 20h8v48h-8z M28 24c18 20 26 20 44 0v6c-18 20-26 20-44 0z M14 68h8v14h-8z M78 68h8v14h-8z",
  },
  "base-sequencer": {
    d: "M14 30h20v20H14z M40 30h20v20H40z M66 30h20v20H66z M34 38h6v4h-6z M60 38h6v4h-6z M14 56h72v6H14z M46 62h8v20h-8z M40 82h20v6H40z",
  },
  "base-authorization": {
    d: "M50 10a22 22 0 1 0 0.1 0z M50 18a14 14 0 1 1-0.1 0z M46 40h8v48h-8z M54 66h14v6H54z M54 78h10v6H54z",
  },
  "base-bull": {
    d: "M30 40h40v34H30z M22 74h56v10H22z M18 20l10 16h-8z M82 20L72 36h8z M38 30h24v10H38z M40 50a4 4 0 1 0 0.1 0z M56 50a4 4 0 1 0 0.1 0z M30 84h8v8h-8z M62 84h8v8h-8z",
  },
  "base-signal": {
    d: "M46 20h8v70h-8z M36 10h28v46H36z M42 16v34h16V16z M50 22a5 5 0 1 0 0.1 0z M50 38a5 5 0 1 0 0.1 0z M30 90h40v4H30z",
  },
  "solana-slot": {
    d: "M14 34h72v32H14z M22 42v16h56V42z M40 48h20v4H40z M26 20h48v8H26z M26 72h48v8H26z",
  },
  "solana-leader": {
    d: "M12 30h20v14H12z M40 30h20v14H40z M68 30h20v14H68z M12 56h20v14H12z M40 56h20v14H40z M68 56h20v14H68z M18 36h8v2h-8z M46 62h8v2h-8z M74 36h8v2h-8z",
  },
  "solana-lane": {
    d: "M10 62h80v6H10z M10 74h80v6H10z M22 48h56v6H22z M30 34h40v6H30z M46 12l24 16H22z",
  },
  "polygon-checkpoint": {
    d: "M20 20h60v60H20z M28 28v44h44V28z M36 50l10 10 18-22 5 4-23 28-15-15z",
  },
  "polygon-junction": {
    d: "M46 8h8v84h-8z M8 46h84v8H8z M50 36a14 14 0 1 0 0.1 0z M50 44a6 6 0 1 1-0.1 0z",
  },
  "polygon-signal": {
    d: "M46 20h8v70h-8z M36 10h28v46H36z M42 16v34h16V16z M50 22a5 5 0 1 0 0.1 0z M50 38a5 5 0 1 0 0.1 0z M30 90h40v4H30z",
  },
  // ── doors ──
  "the-402": {
    d: "M22 90V34a28 28 0 0 1 56 0v56z M32 90V36a18 18 0 0 1 36 0v54z M60 60a3 3 0 1 0 0.1 0z M40 44h20v4H40z",
  },
  "practice-door": {
    d: "M22 90V34a28 28 0 0 1 56 0v56z M32 90V36a18 18 0 0 1 36 0v54z M60 60a3 3 0 1 0 0.1 0z",
  },
  "declared-door": {
    d: "M22 90V34a28 28 0 0 1 56 0v56z M32 90V36a18 18 0 0 1 36 0v54z M60 60a3 3 0 1 0 0.1 0z M36 20h28v6H36z",
  },
  // ── conditions: the plate that went wrong, drawn plain; the yellow rides on top ──
  "no-402": { d: "M22 90V34a28 28 0 0 1 56 0v56z M32 90V36a18 18 0 0 1 36 0v54z" },
  "unparseable-challenge": { d: "M20 16h60v68H20z M28 24v52h44V24z M34 34h12v4H34z M52 34h14v4H52z M34 44h30v4H34z M34 54h8v4h-8z M48 54h18v4H48z M34 64h22v4H34z" },
  "wrong-network": { d: "M46 20h8v70h-8z M36 10h28v46H36z M42 16v34h16V16z M50 22a5 5 0 1 0 0.1 0z M50 38a5 5 0 1 0 0.1 0z M30 90h40v4H30z" },
  "replay-accepted": { d: "M50 10a22 22 0 1 0 0.1 0z M50 18a14 14 0 1 1-0.1 0z M46 40h8v48h-8z M54 66h14v6H54z M54 78h10v6H54z" },
  "delivered-nothing": { d: "M14 30h64a8 8 0 0 1 8 8v40a8 8 0 0 1-8 8H14z M22 38v40h56V38z" },
  // ── the second reading (2026-09-12): the cat, the models ──
  "roger-sterling": { d: "M22 78c-4-14 2-30 14-36l2-14 10 8h18l10-8 2 14c12 6 18 22 14 36z M34 42a4 4 0 1 0 0.1 0z M62 42a4 4 0 1 0 0.1 0z M46 52h8l-4 5z M80 60c8-6 14 0 12 8s-8 12-16 8l2-4c6 2 10 0 10-4s-4-6-8-2z M28 78h44v6H28z" },
  "the-reasoner": { d: "M26 26h48v48H26z M34 34v32h32V34z M42 42h16v16H42z M46 8h8v18h-8z M46 74h8v18h-8z M8 46h18v8H8z M74 46h18v8H74z" },
  "long-context": { d: "M12 22h76v10H12z M12 38h76v10H12z M12 54h76v10H12z M12 70h52v10H12z M70 70h18v10H70z M20 14h60v4H20z M20 84h60v4H20z" },
  autocomplete: { d: "M14 30h6v40h-6z M8 26h18v4H8z M8 70h18v4H8z M34 46a6 6 0 1 0 0.1 0z M54 46a6 6 0 1 0 0.1 0z M74 46a6 6 0 1 0 0.1 0z" },
  "hallucinated-a-door": { d: "M22 90V34a28 28 0 0 1 56 0v56h-8V36a20 20 0 0 0-40 0v54z M40 90h6v-8h-6z M54 90h6v-8h-6z M46 46h8v6h-8z M42 56h16v6H42z M46 66h8v6h-8z" },
  "temperature-two": { d: "M42 10h16v52a14 14 0 1 1-16 0z M46 16v50a8 8 0 1 0 8 0V16z M48 24h4v40h-4z M64 20h14v4H64z M64 34h14v4H64z M64 48h14v4H64z" },
  // ── events ──
  "event-guestbook": { d: "M18 16h64v68H18z M26 24v52h48V24z M32 34h36v3H32z M32 44h36v3H32z M64 60l10-14 6 4-10 14-8 2z" },
  "event-train": { d: "M10 34h64l16 16v18H10z M18 42v18h62v-6L70 42z M22 46h12v10H22z M40 46h12v10H40z M14 74a6 6 0 1 0 12 0a6 6 0 1 0-12 0z M68 74a6 6 0 1 0 12 0a6 6 0 1 0-12 0z" },
  "event-bounty": { d: "M30 16h40l6 20-26 50-26-50z M38 24l-2 10 14 30 14-30-2-10z M46 40h8v6h-8z" },
  "event-pass": { d: "M14 26h72v48H14z M22 34v32h56V34z M30 42h14v14H30z M50 44h20v4H50z M50 54h14v4H50z" },
};

/**
 * THE SET'S KEYS TO THE DRAWINGS (third pass, 2026-09-12). The first
 * pass renamed most of the set; the drawings did not change. Each
 * alias names the plate that depicts the same thing (the bell for
 * both Bellringers, the train for the Tagger, the pass for the
 * Regular, the passport for Stale Passport), and a Condition reuses
 * the plate of the thing that went wrong, since the yellow rides on
 * top. Herd animals other than the T-Rex and the cat, the jar, the Tab,
 * and the Ally have no drawing yet and press as labelled silhouettes.
 */
const ALIASES: Record<string, string> = {
  // rooms
  keeper: "mailbox",
  bellringer: "bell",
  "bellringer-ii": "bell",
  tagger: "train",
  "bounty-hunter": "event-bounty",
  regular: "event-pass",
  "fortune-of-the-day": "almanac",
  // instruments
  "spot-check": "verify-door",
  "service-audit": "conformance-desk",
  watch: "standing-watch",
  "before-you-pay": "field-wallet",
  "mandate-record": "corpus",
  // rails
  based: "base-bull",
  "blue-door": "base-authorization",
  "the-facilitator": "base-sequencer",
  "onchain-weather": "base-signal",
  "base-rail": "base-bridge",
  "fast-lane": "solana-lane",
  "slot-missed": "solana-slot",
  "purple-door": "solana-leader",
  "old-rail": "polygon-junction",
  bridge: "polygon-checkpoint",
  "side-door": "polygon-signal",
  // doors
  "door-0001": "the-402",
  "door-0007": "practice-door",
  "door-0017": "declared-door",
  "door-0410": "no-402",
  // conditions: the plate that went wrong
  "stale-passport": "passport",
  "broken-tier": "unparseable-challenge",
  "410-gone": "delivered-nothing",
  "double-charge": "replay-accepted",
  "testnet-catch": "wrong-network",
  // the second reading
  cv: "practice-counter",
  "payment-required": "the-402",
  // events
  "first-organic-settlement": "settlement-attestation",
  "first-solana-settlement": "solana-lane",
  "the-loaner": "systems-almanac",
  "twenty-three": "corpus",
};

export function plateFor(key: string): Plate | null {
  return PLATES[key] ?? PLATES[ALIASES[key] ?? ""] ?? null;
}

/** Every key that draws a plate: the drawings and the set keys that borrow one. */
export function drawnPlateKeys(): string[] {
  return [...Object.keys(PLATES), ...Object.keys(ALIASES)];
}
