import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { app } from "@/index";

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

describe("the criteria page tells the truth about badges", () => {
  it("does not claim this store serves no badges", async () => {
    for (const accept of ["application/json", "text/html"]) {
      const response = await SELF.fetch(`${BASE}/criteria`, {
        headers: { Accept: accept },
      });
      expect(response.status).toBe(200);
      const body = await response.text();
      expect(body).not.toContain(THE_FALSE_SENTENCE);
      // And not merely reworded into a different denial: the page has
      // to publish a number, and the number has to be the real one.
      expect(body).toContain("5");
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
