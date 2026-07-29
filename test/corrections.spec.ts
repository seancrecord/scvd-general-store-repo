import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { CORRECTIONS } from "@/store/corrections";

/**
 * THE CORRECTIONS RECORD, AND CV'S REQUIREMENT AS A TEST.
 *
 * He validated publishing it with one condition that shapes the whole
 * artifact: every entry must pair the mistake with what changed
 * STRUCTURALLY, because a list of admissions with no hardening behind
 * it reads as "this keeps happening" rather than "this gets caught."
 *
 * Enforcing that with a test rather than a note is the only consistent
 * choice available, since the first entry on the page is the store
 * discovering that a rule in a file is not a test.
 */
describe("/corrections", () => {
  it("pairs every mistake with a mechanism, not an intention", () => {
    for (const entry of CORRECTIONS) {
      expect(entry.what_changed.length, entry.date).toBeGreaterThan(60);
      // "We'll be careful" is not a fix. An entry has to name a thing
      // that now exists: a test, a derived list, a workflow, a page.
      expect(
        /test|tests|CI|derived|workflow|built|asserts|fails the build/i.test(
          entry.what_changed,
        ),
        `${entry.date} names no mechanism, only an intention`,
      ).toBe(true);
    }
  });

  it("says how long each one was live, and who found it", () => {
    for (const entry of CORRECTIONS) {
      expect(entry.how_long.length, entry.date).toBeGreaterThan(10);
      expect(entry.found_by.length, entry.date).toBeGreaterThan(10);
      expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("credits outside eyes as outside eyes", () => {
    // Two of the five were found by somebody who does not work here.
    // Taking credit for those would be the vainest possible edit.
    const outside = CORRECTIONS.filter((entry) =>
      /outside|directory/i.test(entry.found_by),
    );
    expect(outside.length).toBeGreaterThanOrEqual(2);
  });

  it("leads with the mechanism rather than the chronology", async () => {
    // CV's second condition: five dates inside one week read as
    // "launched in a hurry" unless what goes first is how they get
    // caught. On the HTML page the mechanism must precede the entries.
    const page = await (
      await SELF.fetch("https://scvd.store/corrections", {
        headers: { Accept: "text/html" },
      })
    ).text();
    const mechanism = page.indexOf("HOW THINGS GET CAUGHT HERE");
    const firstEntry = page.indexOf("What was wrong:");
    expect(mechanism).toBeGreaterThan(-1);
    expect(mechanism).toBeLessThan(firstEntry);
  });

  it("says what it is not, so it is never read as a bug log", async () => {
    const body = (await (
      await SELF.fetch("https://scvd.store/corrections")
    ).json()) as Record<string, unknown>;
    expect(String(body.scope)).toContain("not");
    expect(String(body.scope)).toContain("bug log");
    // And it invites a sixth rather than implying there won't be one.
    expect(String(body.invitation)).toContain("/api/letter");
  });

  it("carries the CI correction, which is the one about itself", async () => {
    // The entry admitting we claimed a CI we did not have is the entry
    // whose fix is the machinery every other entry's fix relies on.
    const ci = CORRECTIONS.find((entry) =>
      entry.what_was_wrong.includes("CI validates"),
    );
    expect(ci, "the CI correction is missing from the record").toBeTruthy();
    expect(ci?.what_changed).toContain("every push");
  });

  it("serves newest first", async () => {
    const body = (await (
      await SELF.fetch("https://scvd.store/corrections")
    ).json()) as { corrections: { date: string }[] };
    const dates = body.corrections.map((entry) => entry.date);
    expect(dates).toEqual([...dates].sort((a, b) => b.localeCompare(a)));
  });
});
