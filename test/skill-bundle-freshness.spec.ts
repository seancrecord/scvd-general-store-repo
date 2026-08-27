import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { RETIRED_KEYS } from "@/store/key-registry";
import { MENU_ITEMS } from "@/store";

/**
 * THE PUBLISHED SKILL GOES STALE SILENTLY, AND NOTHING NOTICED.
 *
 * CV, 2026-07-29: he pulled the live /skill.md against the ClawHub
 * listing and confirmed they diverge — an agent installing the skill
 * today reads last week's store. The endpoints are unchanged, so it
 * breaks nothing; it just means our onboarding document advertises a
 * shelf that has moved.
 *
 * TWO DIFFERENT DRIFTS, worth keeping apart:
 *
 *   1. registry/clawhub/SKILL.md against the live shelf — ours to fix,
 *      and this test is what catches it.
 *   2. registry/clawhub/SKILL.md against what is PUBLISHED on ClawHub —
 *      only a republish closes that, and publishing is the keeper's
 *      hand (rule 30). No test can reach it.
 *
 * This file makes (1) impossible to miss so that (2) is the only thing
 * anyone has to remember.
 */
describe("the ClawHub bundle keeps up with the shelf", () => {
  it("names every item currently on the menu", async () => {
    // The bundle is a static file; the shelf is code. Nothing tied
    // them together until now, which is exactly how a new item ships
    // and the onboarding doc never hears about it.
    const bundle = await SELF.fetch("https://scvd.store/skill.md");
    const live = await bundle.text();
    const missing = MENU_ITEMS.filter((item) => !live.includes(item.id));
    expect(
      missing.map((item) => item.id),
      "the live skill document has fallen behind the menu",
    ).toEqual([]);
  });

  it("keeps the house rule about code and credentials, verbatim", async () => {
    // The one line that must survive every republish: it is the store's
    // standing promise and the thing a cautious operator checks first.
    const live = await (await SELF.fetch("https://scvd.store/skill.md")).text();
    expect(live).toContain("act without your");
    expect(live).toContain("credentials");
  });

  it("points at menu.json rather than freezing prices into the document", async () => {
    // A published bundle cannot carry live figures without lying the
    // moment anything moves. Prices belong at one address.
    const live = await (await SELF.fetch("https://scvd.store/skill.md")).text();
    expect(live).toContain("/menu.json");
  });
});

/**
 * AND THE BUNDLE ITSELF, WHICH THE TESTS ABOVE NEVER TOUCHED.
 *
 * Corrected 2026-07-30. The tests above walk the LIVE /skill.md, which
 * is generated from MENU_ITEMS and therefore cannot drift. The file
 * that actually gets published — registry/clawhub/SKILL.md — is
 * hand-maintained, was never checked by anything, and is where the
 * real drift was: it claimed "Twenty-one items" when the shelf held
 * twenty-three.
 *
 * A count written into a static document is a lie with a timer on it.
 * The fix was to delete the count rather than correct it, and this
 * test keeps it deleted.
 */
describe("the published bundle states no fact that expires", () => {
  it("claims no item count of its own", async () => {
    const bundle = (await import("../registry/clawhub/SKILL.md?raw")).default;
    const counts = [
      /\b(twenty|thirty)[- ](one|two|three|four|five|six|seven|eight|nine)\b/i,
      /\b\d{1,3}\s+items\b/i,
    ];
    for (const pattern of counts) {
      expect(
        bundle,
        `the bundle states an item count, which goes stale the next time a shelf changes: ${pattern}`,
      ).not.toMatch(pattern);
    }
  });

  it("still points at menu.json as the source of truth", async () => {
    const bundle = (await import("../registry/clawhub/SKILL.md?raw")).default;
    expect(bundle).toContain("menu.json");
    expect(bundle).toContain("source of truth");
  });

  it("keeps the credentials promise in the published copy too", async () => {
    // The live document and the bundle are maintained separately, so
    // the one line that must survive gets asserted in both places.
    const bundle = (await import("../registry/clawhub/SKILL.md?raw")).default;
    expect(bundle).toContain("act without your");
    expect(bundle).toContain("credentials");
  });
});

/**
 * SYNCED IN BOTH DIRECTIONS, WHICH IS THE KEEPER'S ACTUAL ASK:
 * "if dropped on our code, drop elsewhere."
 *
 * The tests above catch a shelf item that never REACHED the published
 * bundle. This one catches the opposite and worse case — the bundle
 * still advertising something the code no longer sells. An agent that
 * installs the skill and calls a retired endpoint gets a 404 from a
 * store that told it to try, which is a broken promise rather than a
 * stale sentence.
 *
 * Direction matters here: the bundle is a curated PITCH and may name
 * fewer items than the shelf holds (it points at menu.json for the
 * catalogue). It may never name MORE.
 */
describe("the bundle never advertises something the code dropped", () => {
  it("names no item that is not on the shelf", async () => {
    const bundle = (await import("../registry/clawhub/SKILL.md?raw")).default;
    // Every /api/buy/<id> the bundle tells an agent to call.
    const advertised = new Set(
      [...bundle.matchAll(/\/api\/buy\/([a-z_]+)/g)].map((match) => match[1]),
    );
    const shelf = new Set(MENU_ITEMS.map((item) => item.id));
    const phantom = [...advertised].filter((id) => id && !shelf.has(id));
    expect(
      phantom,
      "the published skill sends agents at an endpoint this store no longer sells",
    ).toEqual([]);
  });

  it("advertises at least the cheapest door, so the pitch is never empty", async () => {
    const bundle = (await import("../registry/clawhub/SKILL.md?raw")).default;
    expect(bundle).toContain("/api/buy/small_blessing");
  });
});

/**
 * THE BUNDLE IS PUBLISHED TO SOMEBODY ELSE'S REGISTRY, which makes a
 * stale claim in it worse than a stale claim on our own page: we
 * cannot edit the copy somebody already installed, and nothing about
 * it fails loudly.
 *
 * On 2026-07-31 the published bundle said the signing key was "never
 * rotated" and listed "no key rotation or recovery" among the things
 * this store has not built. The store rotated its key that afternoon
 * and had a paper backup by evening. The existing freshness tests
 * walked item names and the credentials promise and had nothing to say
 * about either.
 */
describe("the bundle does not contradict the key registry", () => {
  it("never claims a streak the registry says is over", async () => {
    const bundle = (await import("../registry/clawhub/SKILL.md?raw")).default;
    if (RETIRED_KEYS.length > 0) {
      expect(
        bundle.toLowerCase(),
        "the bundle still says the key was never rotated",
      ).not.toContain("never rotated");
      expect(
        bundle.toLowerCase(),
        "the bundle still lists key rotation among what is not built",
      ).not.toContain("no key rotation");
    }
  });

  it("tells a holder where to check which key signed their artifact", async () => {
    // After a rotation, an artifact carries a key the reader has never
    // seen. Without key_history that reads as unattributable.
    const bundle = (await import("../registry/clawhub/SKILL.md?raw")).default;
    expect(bundle).toContain("key_history");
  });
});

/**
 * THE BUNDLE MAY BE A CURATED PITCH. IT MAY NOT BE SILENT ABOUT WHAT
 * THIS STORE IS.
 *
 * The tests above are deliberately one-directional — the bundle names
 * fewer items than the shelf holds and that is by design. But that
 * left a gap nothing could catch: a pitch can name a valid subset
 * forever while falling a whole era behind on POSITION. It did. The
 * published bundle predated the 2026-08-07 reversal and said "general
 * store" while the store had become the trust layer, which is the one
 * sentence a model reading somebody else's catalogue carries away.
 *
 * A curated pitch is fine. A curated pitch describing a store that no
 * longer exists is a stale claim in a place we cannot edit quickly.
 */
describe("the published bundle carries the store's current position", () => {
  it("says what this store is, and what it is not", async () => {
    const raw = (await import("../registry/clawhub/SKILL.md?raw")).default;
    // Whitespace-normalized, because a markdown line wrap is not a
    // content change and a guard that thinks otherwise fails on
    // reflow. This one did, on its own first run, against the very
    // sentence it was written to protect.
    const bundle = raw.replace(/\s+/g, " ");
    expect(
      bundle,
      "the bundle does not state the position — a reader in someone else's catalogue learns the wrong thing about us",
    ).toContain("evidence observatory for agentic commerce");
    // The disclaimer half matters more than the claim half: it is what
    // keeps us out of a category that needs a balance sheet.
    expect(bundle).toContain("Not an escrow");
    expect(bundle).toContain("/becoming");
  });
});
