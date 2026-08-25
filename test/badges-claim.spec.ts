import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { app } from "@/index";
import { badgesTodayLine } from "@/store/badges";

const BASE = "https://scvd.store";

/**
 * ROADMAP 0.1 / LEDGER A1 — `/criteria` SAID THERE WERE NO BADGES.
 *
 * The page read: "None. Nothing this store serves carries a badge."
 * Four badge surfaces were shipping at the time — the free visitor
 * sticker, the patron badge, the purchased audit badge, and the
 * passport chip. Same class as the auto-refund incident that the
 * claim chain was built for: not a lie anyone told, but a
 * true-sounding line nobody re-checked, on the page that exists
 * specifically to govern when this store may put a mark on anything.
 *
 * A false claim on the criteria page is worse than a false claim
 * anywhere else, because that page is the standard the others are
 * measured against.
 *
 * TWO TESTS, AND THE SECOND IS WHY THIS IS NOT JUST A COPY EDIT. One
 * pins the claim to reality now; one walks the ROUTER so a fifth
 * badge cannot ship without this page knowing about it. A hand-typed
 * inventory is the same defect with a later date.
 */

/*
 * PROXIMITY MATCHING WAS THE WRONG TOOL, and this comment is here
 * because the first version of this test failed against the FIX. A
 * regex for "nothing ... badge" within 120 characters flags the
 * honest copy too: every entry states what it refuses to assert
 * ("Nothing about the patron's conduct...") and sits beside the word
 * badge. A guard that cannot tell a denial from a disclaimer would
 * have to be silenced the first time somebody wrote a careful
 * sentence — and a silenced guard is worse than none.
 *
 * So this pins the exact claim that was false, and the count does the
 * rest of the work.
 */
const THE_FALSE_SENTENCE = "Nothing this store serves carries a badge";

/*
 * PINNING ONE SENTENCE WAS STILL THE WRONG TOOL — found 2026-08-25,
 * by a review pass rather than by this guard.
 *
 * The page stopped saying THE_FALSE_SENTENCE and started saying
 * "Nothing carries a badge today." A different denial of the same
 * fact, and this test was green through all of it: the literal did
 * not match, and `toContain("5")` was satisfied by the derived
 * section that sat three paragraphs below the denial contradicting
 * it. Two more copies had drifted into the standfirst, the meta
 * description and llms.txt by then.
 *
 * That is rule 46 exactly, on the page rule 46 cites as its example.
 * A guard that memorises one wording only ever catches that wording;
 * the next author writes a careful new sentence and the guard
 * applauds.
 *
 * SO: DERIVE BOTH HALVES. The page must carry badgesTodayLine()
 * verbatim — the count the router produces — and must not carry a
 * DENIAL. The proximity-matching problem the comment above describes
 * is real and the answer is not looser matching, it is matching on
 * the grammar of denial: a negation whose subject is the store's own
 * badge inventory. "Nothing about the patron's conduct" is a
 * disclaimer about what one badge asserts and does not match; "no
 * badge class has shipped" is a denial and does.
 */
const DENIALS = [
  /nothing[^.]{0,40}carries a badge/i,
  /badges that do not exist/i,
  /before anything carries a badge/i,
  /no badge (class )?(has )?(yet )?ship/i,
  /\bbadge count[^.]{0,20}\bnone\b/i,
];

describe("the criteria page tells the truth about badges", () => {
  it("publishes the derived count and denies nothing", async () => {
    for (const accept of ["application/json", "text/html"]) {
      const response = await SELF.fetch(`${BASE}/criteria`, {
        headers: { Accept: accept },
      });
      expect(response.status).toBe(200);
      const body = await response.text();
      expect(body).not.toContain(THE_FALSE_SENTENCE);
      // The number is not typed anywhere: it comes off BADGE_SURFACES,
      // so a sixth badge changes this assertion without an edit.
      expect(body, `${accept} dropped the derived count`).toContain(
        badgesTodayLine(),
      );
      for (const denial of DENIALS) {
        expect(
          denial.test(body),
          `${accept} denies the badges it serves: ${denial}`,
        ).toBe(false);
      }
    }
  });

  it("names every badge the router actually serves", async () => {
    /*
     * The guard on the guard. Derived from app.routes rather than a
     * list somebody maintains, so shipping a badge without declaring
     * it fails here by name — AT_SCALE rule 1, every derived number
     * stays derived.
     */
    const served = new Set<string>();
    for (const route of app.routes) {
      if (!route.path.startsWith("/badges")) continue;
      served.add(route.path);
    }
    expect(served.size).toBeGreaterThan(0);

    const response = await SELF.fetch(`${BASE}/criteria`, {
      headers: { Accept: "application/json" },
    });
    const payload = (await response.json()) as {
      badges_today?: { count?: number; serves?: { route: string }[] };
    };
    // The count is the claim; it must equal what the router serves.
    expect(payload.badges_today?.count).toBe(served.size);
    const declared = new Set(
      (payload.badges_today?.serves ?? []).map((entry) => entry.route),
    );
    for (const path of served) {
      expect(declared).toContain(path);
    }
  });
});
