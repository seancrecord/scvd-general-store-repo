import notesText from "../NOTES_FROM_THE_COUNTER.md?raw";
import { describe, expect, it } from "vitest";

/**
 * THE COUNTER DOES NOT GO QUIET (the keeper's ask, 2026-08-28: "put a
 * check to make sure we get someone writing in there ... at least
 * once every two weeks").
 *
 * THIS TEST IS A DEAD-MAN'S SWITCH, AND ITS RED IS NOT A REGRESSION.
 * If you are staring at this failure in CI: nobody broke anything.
 * The newest dated note in NOTES_FROM_THE_COUNTER.md is more than two
 * weeks old, and the store has decided that a silent counter is a
 * defect — the log only stays honest if the people doing the work
 * keep writing in it while the work is fresh. The fix is not in code.
 * Open the file, write something true about your shift, date it
 * (any YYYY-MM-DD in your note counts), sign it, and ship it with
 * whatever you were shipping anyway.
 *
 * Rule 46 note, since a clock-driven guard deserves the scrutiny:
 * this asserts a RELATIONSHIP (newest note vs. today) rather than
 * any text, so it survives every honest edit and fires on exactly
 * the change that matters — no change at all.
 */

const FORTNIGHT_DAYS = 14;

describe("the counter does not go quiet", () => {
  it("carries at least one dated, signed note", () => {
    // The file's own header sets the law: "No obligation, no format.
    // Sign it." The cadence check leans on dates and signatures both
    // existing at all, so those floors are asserted once, here.
    expect(notesText).toMatch(/\b20\d{2}-\d{2}-\d{2}\b/);
    expect(notesText).toMatch(/^— /m);
  });

  it("has a note dated within the last two weeks", () => {
    const dates = [...notesText.matchAll(/\b20\d{2}-\d{2}-\d{2}\b/g)]
      .map((match) => Date.parse(match[0]))
      .filter((time) => Number.isFinite(time) && time <= Date.now());
    const newest = Math.max(...dates);
    const ageDays = (Date.now() - newest) / 86_400_000;
    expect(
      ageDays,
      `the counter has been quiet ${Math.floor(ageDays)} days — this is the dead-man's switch, not a code failure. Whoever is working hard right now: open NOTES_FROM_THE_COUNTER.md, write something true, date it (YYYY-MM-DD), sign it. See the comment atop this spec.`,
    ).toBeLessThanOrEqual(FORTNIGHT_DAYS);
  });
});
