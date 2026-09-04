import { TWO_SEATS_SENTENCE } from "@/store/copy/doctrine";

/**
 * THE SCORERS' ROOM, ITS THREE SENTENCES (house rule 60, 2026-09-04).
 * Typed once here; the feature register, the page, its JSON twin and
 * the guide import them, and test/feature-surfaces.spec.ts holds them
 * identical across all four. No quotes inside a sentence: the page
 * escapes them and the match dies.
 */
export const SCORERS_OPENED = "2026-09-03";

/** The proposition: the two seats, in the keeper's ink. */
export const SCORERS_PROPOSITION = TWO_SEATS_SENTENCE;

/** The money sentence, for a room that sells nothing. */
export const SCORERS_FOR_MONEY =
  "Nothing here costs money: the corpus, the citations, the verify URL and the look with its reproduce block are free to read and to call, and the paid dispute artifacts are priced on the shelf where they are sold.";

/** Free first, as every room says it. */
export const SCORERS_FREE_FIRST =
  "The corpus index and the look are free first; a paid artifact is only ever the signed, dated version of what the free door already showed.";
