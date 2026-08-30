import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { ROOMS } from "@/store/rooms";

/**
 * ONE FIRST-LEVEL HEADING PER ROOM (rule 58.1, found 2026-08-30).
 *
 * /developers served TWO <h1> tags, and had since it shipped. Both
 * were correct, sensible, and in the right place: renderSimplePage
 * emits one from the page's own title, and the route's body emitted
 * its own on top. There were simply two of them, and a document with
 * two first-level headings has told every crawler and every screen
 * reader that it is two documents.
 *
 * IT SURVIVED EVERY HAND-READ BECAUSE NEITHER HEADING LOOKS WRONG.
 * You find this by counting the served bytes of all thirty-six rooms
 * at once, which is what the rule-58 audit did and what this keeps
 * doing.
 *
 * THE REGEX MATTERS, and the audit's first version got it wrong: it
 * matched `<h1>` literally, so it scored /porch — whose heading
 * carries a class and an inline style — as having none, and I nearly
 * filed a defect against a page that was fine. Match the TAG, not the
 * tag with no attributes.
 */
const H1 = /<h1[\s>]/g;

const BROWSER = {
  Accept: "text/html,application/xhtml+xml",
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36",
};

describe("every room is one document", () => {
  it("serves exactly one first-level heading, in every room there is", async () => {
    // A guard over an empty list is a guard that cannot fail.
    expect(ROOMS.length).toBeGreaterThan(30);
    const wrong: string[] = [];
    for (const room of ROOMS) {
      const response = await SELF.fetch(`https://scvd.store${room.path}`, {
        headers: BROWSER,
      });
      if (response.status !== 200) {
        wrong.push(`${room.path} answered ${response.status}`);
        continue;
      }
      const count = ((await response.text()).match(H1) ?? []).length;
      if (count !== 1) wrong.push(`${room.path} has ${count}`);
    }
    expect(
      wrong,
      "a room serves no first-level heading or more than one. Two h1s tell a crawler and a screen reader that one page is two documents; none leaves them guessing which line is the title.",
    ).toEqual([]);
  });
});
