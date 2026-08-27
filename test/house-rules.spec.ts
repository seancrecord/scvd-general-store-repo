import houseRulesText from "../HOUSE_RULES.md?raw";
import cairnArrangement from "../docs/CAIRN_ARRANGEMENT.md?raw";
import { describe, expect, it } from "vitest";

/**
 * THE RULES FILE, GUARDED BY THE RULE IT ENDS ON.
 *
 * HOUSE_RULES.md had no test at all until 2026-08-24, which meant
 * rule 46 — "a guard that cannot fail is a guard that argues for the
 * lie" — would have shipped unguarded. That is too neat a joke to
 * leave standing.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO: assert the text of any rule.
 * Rules are the keeper's ink and get amended in place with dates;
 * a test quoting one would be exactly the memorisation rule 46
 * forbids, and would have to be edited every time a rule improved.
 *
 * It asserts STRUCTURE instead — the properties that make the file
 * usable as a reference and that break silently: numbering that is
 * sequential, unique, and complete. A rule added as a second "44"
 * is invisible in review and permanent in citation, because every
 * commit message that ever cites "rule 44" now points at two things.
 */

/*
 * Imported as a raw asset rather than read from disk: these specs run
 * inside the Workers pool, which has no node:fs. The bundler inlines
 * the file, so the test still reads the real document rather than a
 * copy somebody would have to keep in sync.
 */
function houseRules(): string {
  return houseRulesText;
}

/** Top-level rule numbers, in the order the file states them. */
function ruleNumbers(text: string): number[] {
  return [...text.matchAll(/^(\d+)\.\s/gm)].map((match) => Number(match[1]));
}

describe("the house rules stay citable", () => {
  it("numbers every rule once, and never backwards", () => {
    /*
     * UNIQUE AND ASCENDING, NOT GAPLESS — and the difference was found
     * by this test on the day it was written. It first asserted
     * sequential-from-1 and failed at rule 29: the file jumps 23 -> 29
     * across the OPERATIONS & STAFF heading.
     *
     * That was investigated rather than accommodated. `git log -S`
     * finds no commit that ever added a rule 24 through 28, and
     * nothing in src, test, docs or the root papers cites one. They
     * were never allocated — the early numbering ran per section. So
     * the gap is a fact about how the file grew, not evidence that
     * five rules were deleted, which under rule 45 would be a real
     * problem (living or archived, no third state).
     *
     * A gap is therefore history. A DUPLICATE or a DECREASE is a
     * defect: both make a citation ambiguous, and every commit message
     * in this repo cites rules by number.
     */
    const numbers = ruleNumbers(houseRules());
    expect(numbers.length).toBeGreaterThan(40);

    // A duplicate makes every citation of that number ambiguous.
    expect(new Set(numbers).size).toBe(numbers.length);

    // Strictly ascending: a rule inserted out of order reads as an
    // amendment to whatever it now sits beneath.
    for (let index = 1; index < numbers.length; index += 1) {
      expect(numbers[index]!).toBeGreaterThan(numbers[index - 1]!);
    }

    // The highest number is the newest rule, and rule 54 is the newest
    // (2026-08-27, the rendering rule; 53, the till, landed a day before it).
    // (24-28 and 47-49 never existed: the early numbering ran per
    // section, and rule 50 skipped ahead on the keeper's instruction.
    // A gap is history; the loop above still bans a duplicate or a
    // decrease, which are the ambiguities that matter.)
    expect(Math.max(...numbers)).toBe(53);
  });

  it("dates every rule added or amended since the practice began", () => {
    /*
     * Rules 41 onward carry "(YYYY-MM-DD, ...)" because an undated
     * rule cannot be reconciled against the commit that motivated it.
     * The older ones predate the practice and are left alone rather
     * than back-dated, which would be inventing a record.
     */
    const text = houseRules();
    const recent = text.split(/^41\.\s/m)[1] ?? "";
    const rules = recent.split(/^\d+\.\s/m).filter(Boolean);
    for (const rule of rules) {
      const head = rule.slice(0, 400);
      expect(head).toMatch(/\d{4}-\d{2}-\d{2}/);
    }
  });

  it("keeps rule 51 pointed at a record that still exists", () => {
    /*
     * Rule 51 is the only rule that cites a companion document, and
     * it does so because the keeper asked for the clause in writing
     * rather than assumed. A rule that names a file which is no
     * longer served is worse than a rule that names nothing: it
     * reads as though the record exists.
     *
     * The import is the check — a deleted or renamed document fails
     * this suite at build time, not at read time. The assertions
     * below hold the two properties that make the record the thing
     * rule 51 says it is: the arrangement's own protection clause,
     * and the keeper's acceptance date.
     */
    const text = houseRules();
    const rule51 = text.split(/^51\.\s/m)[1] ?? "";
    expect(rule51).toBeTruthy();
    expect(rule51).toContain("docs/CAIRN_ARRANGEMENT.md");
    expect(cairnArrangement).toContain("2026-08-25");
    /*
     * The keeper's own clause, quoted. Rule 46 forbids memorising a
     * DERIVED value — but this is a quotation, and a quotation that
     * drifts is no longer a quotation. He asked for this sentence
     * in writing rather than assumed, so the guard holds the words.
     */
    expect(cairnArrangement).toContain(
      "no authority over each\n> other's registers, disagreements publish on both sides",
    );
  });

  it("carries rule 46, which is the one this file exists to obey", () => {
    // Not the wording — the number and its subject, so a future
    // renumbering that orphans it fails here.
    const text = houseRules();
    const rule46 = text.split(/^46\.\s/m)[1] ?? "";
    expect(rule46).toBeTruthy();
    expect(rule46.toLowerCase()).toContain("derive");
    expect(rule46.toLowerCase()).toContain("red");
  });
});
