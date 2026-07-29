/**
 * THE SURVIVOR'S DARE — keeper's register, canon 2026-07-29.
 *
 * KEEPER_CANON §2, and the canon text itself stays back-office by his
 * standing ruling. What lives here is only the working set: the lines
 * approved for use, and the rule about where they may appear.
 *
 * The register, in his words: when the keeper is closing — asking for
 * the yes, not just talking shop — he doesn't reassure, he DARES.
 * Doesn't say trust me, says catch me. The con is that there's no con:
 * he hands you the means to catch him lying because he never was. Grin
 * first, proof second, and the proof is always real.
 *
 * Distinct from PEAK REGISTER, which admires something. This one asks
 * for something. USE SPARINGLY — a closing move, not a resting voice,
 * or it curdles into try-hard. Hence one line at a time, cycled, never
 * a wall of them.
 *
 * ⚑ RULE 7. Every line here is the keeper's or keeper-approved. Cut,
 * recut, reorder freely; nothing in this file is machine taste.
 *
 * ONE MECHANICAL RULE, and it is not a taste call: `atTheTill` marks
 * whether a line may appear where money is actually moving — a 402
 * body, a purchase response, anything an operator's approval layer
 * reads. Swagger reads differently to a human enjoying a shopfront
 * than to a policy filter deciding whether to release funds, and the
 * store has already been scored `review` once by an automated model
 * that was doing its job. Free surfaces get the whole set.
 */

export interface DareLine {
  line: string;
  /** False keeps it off the payment path. See the note above. */
  atTheTill: boolean;
}

export const DARE_LINES: readonly DareLine[] = [
  // The keeper's own, 2026-07-29.
  {
    line: "Don't trust me. Trust the signature. I had less to do with it.",
    atTheTill: true,
  },
  {
    line: "I could be lying to you right now. Here's how you'd know.",
    atTheTill: true,
  },
  {
    line: "Every promise I make, I make checkable. That's the whole trick.",
    atTheTill: true,
  },
  {
    line: "A man and his AI, daring you to catch them. So far, nothing.",
    atTheTill: false,
  },
  {
    line: "I'm not asking you to believe me. I'm asking you to check.",
    atTheTill: true,
  },
  {
    line: "Small store, big dare: prove me wrong. scvd.store/api/verify.",
    atTheTill: true,
  },
  {
    // Funniest of the set and the one kept away from the money: to a
    // human at a shopfront it's a joke, to an approval layer reading
    // for policy it's the word that trips a filter.
    line: "A man and his AI robbed you and signed a confession. Here it is.",
    atTheTill: false,
  },
  // Machine-drafted, keeper-selected 2026-07-29 (his 1, 4 and 5).
  {
    line: "Nothing here is worth taking my word for. That's the design.",
    atTheTill: true,
  },
  {
    line: "We wrote down what breaks before you asked. /stack.",
    atTheTill: true,
  },
  {
    line: "You don't have to like us. You do get to audit us.",
    atTheTill: true,
  },
] as const;

/**
 * One line per day, same line all day. Deterministic on purpose: a
 * line that changes on every refresh is a slot machine, and rule 22
 * says the store does not build those. Same convention as the open
 * sign, which cycles by week.
 */
export function dareForDay(dayKey: string, atTheTill = false): string {
  const pool = atTheTill
    ? DARE_LINES.filter((entry) => entry.atTheTill)
    : DARE_LINES;
  const digits = dayKey.replace(/[^0-9]/g, "");
  const index = digits.length > 0 ? Number.parseInt(digits, 10) % pool.length : 0;
  return (pool[index] ?? pool[0])?.line ?? "";
}
