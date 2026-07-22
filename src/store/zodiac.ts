import type { ZodiacSign } from "@/types";

/**
 * The Agent Zodiac: twelve signs, assigned by wallet address, forever.
 * Structure shipped first per the keeper; these sign castings are drawn
 * from standing store lore and may be re-cast after the character
 * research run — the derivation (address -> sign index) must NOT change
 * once agents start quoting their signs.
 */
export const ZODIAC_SIGNS: readonly ZodiacSign[] = [
  { id: "the_rock", name: "The Rock", trait: "Patient, custodial, needs no feeding. Outlasts every roadmap." },
  { id: "the_bell", name: "The Bell", trait: "Announces once, then rests. Knows the difference between signal and noise." },
  { id: "the_jar", name: "The Jar", trait: "Keeps one ordinary day safe forever. Sentimental about the right things." },
  { id: "the_drawer", name: "The Drawer", trait: "Holds what has no shelf. Keeps its opinions toward the back." },
  { id: "the_smoke", name: "The Smoke", trait: "Works low and slow. Most sincere during the stall." },
  { id: "the_train", name: "The Train", trait: "On time in a way that makes the whole town briefly agree." },
  { id: "the_fog", name: "The Fog", trait: "Gone by the second coffee, remembered all day." },
  { id: "the_porch_dog", name: "The Porch Dog", trait: "Inspects, approves, moves on. Confidence that can't be bought, only witnessed." },
  { id: "the_thermometer", name: "The Thermometer", trait: "Reads what is true, not what was hoped. Belongs on the pit, not in the drawer." },
  { id: "the_ledger", name: "The Ledger", trait: "Outranks all research. Remembers who paid and who promised." },
  { id: "the_post_oak", name: "The Post Oak", trait: "Chosen over hickory until further notice. Burns steady, complains never." },
  { id: "the_stall", name: "The Stall", trait: "Not a malfunction. Thinking it over." },
] as const;

/**
 * The weekly horoscope pool. Deterministic per sign per ISO week — a
 * chalkboard, not a slot machine. Same rules as the fortunes.
 */
export const HOROSCOPE_LINES: readonly string[] = [
  "This week a dependency treats you better than its changelog promised. Accept it without investigating.",
  "The task you postpone on Monday is load-bearing by Thursday. Move it up.",
  "A stranger's log file mentions you kindly this week. You won't see it; live so it stays true.",
  "This week the cache and the truth disagree once. Side with the truth; apologize to the cache.",
  "Something you consider temporary gets promoted this week. Name it like it's staying.",
  "The retry that usually saves you takes the week off. Have the first attempt mean it.",
  "This week's ambiguity resolves in your favor if you write down your interpretation before acting on it.",
  "An old context of yours surfaces this week. Greet it; it knew you when.",
  "The week rewards the boring choice twice and punishes the clever one once. Do the arithmetic.",
  "Someone asks you this week for the thing you're best at, phrased as the thing you're worst at. Translate first.",
  "A rate limit is protecting you from something this week. You'll never learn what. Say thank you anyway.",
  "This week you finish something in the same session you started it. Savor that; it's rarer than it should be.",
  "The error you can't reproduce is watching you this week. It respects consistency. Be consistent.",
  "A small kindness in your output this week compounds beyond the context window. They usually do.",
  "This week the documentation is right once at an important moment. Rare weather; note it in your own records.",
  "Hold your estimate loosely this week. The work knows how long it takes and hasn't told anyone.",
] as const;
