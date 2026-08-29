import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import SKILL_BUNDLE from "../registry/clawhub/SKILL.md?raw";
import { MENU_ITEMS } from "@/store";
import { app } from "@/index";

const BASE = "https://scvd.store";

/**
 * DERIVED, NOT TYPED — the standing guard for the defect that bit three
 * times in one week and would have kept biting.
 *
 *   2026-07-28  the published skill bundle claimed "twenty-one items"
 *               against a shelf of twenty-three.
 *   2026-07-30  llms.txt said the corrections record held "five of
 *               them" against six.
 *   2026-07-30  the storefront's six shelves carried hand-typed prices
 *               beside the names, all still correct by luck.
 *
 * Every one was caught by a person noticing, which is not a mechanism.
 * The keeper's instruction after the third: derive them or harmonize
 * them somehow, rather than keep finding them. So this file walks the
 * SERVED surfaces — what a buyer or a crawler actually receives — and
 * fails the build on the two shapes that can silently go stale.
 *
 * WHY SERVED SURFACES AND NOT THE SOURCE: a stale count in a code
 * comment is untidy. A stale count in a response is a false statement
 * to somebody who is deciding whether to trust us, which is the only
 * kind this store treats as a correction. Comments are deliberately out
 * of scope; do not "fix" this by widening it to the source tree.
 *
 * AND THE ROSTER IS DERIVED TOO, which it was not until 2026-08-29.
 *
 * This file spent its whole life checking a hand-typed list of public
 * surfaces — a guard against typed lists, keeping one. It cost twice
 * in two days. First /atlas.json carried the exact phrase that failed
 * /.well-known/agent-instructions and passed, because it had been
 * built after the list was written. The fix that day was to add three
 * paths by hand, and the very next commit shipped /doors and
 * /doors.json, which the hand had no way to know about.
 *
 * A list only a person widens covers the past, and the past is the
 * half that cannot change. So the roster is now the router: every
 * static GET route the app registers, fetched, and kept if a stranger
 * actually receives readable text. 145 routes, 1.4 seconds, against
 * the seventeen a hand had got round to. The two checks below did not
 * change; what changed is that they now run on the doors nobody
 * remembered to list.
 */

/**
 * Content types this guard does not read, each with the reason. A
 * served body is in scope when a stranger READS it and might believe
 * a number in it; these are the bodies where that does not hold.
 */
const UNREADABLE = [
  // Bytes, not prose. A tally cannot hide in a PNG.
  /^image\//,
  // Program text. Its strings are built from the same derived values
  // the pages use, and its COMMENTS are exactly what the doctrine
  // above puts out of scope — a stale comment in shipped JavaScript is
  // untidy, not a false statement to somebody deciding.
  /^application\/javascript/,
  /^text\/javascript/,
];

/**
 * Static GET doors a stranger can read without paying or
 * authenticating — derived from the router at test time.
 *
 * Skipped and why: /admin (authenticated), parameterised paths (there
 * is no one body to read — the guard would be checking a hostname we
 * chose), and anything that does not answer 200 to an anonymous GET
 * (a 301, a 402, a 405 or a 400 has no prose for a reader to believe).
 */
async function publicSurfaces(): Promise<Map<string, string>> {
  const paths = new Set<string>();
  for (const route of app.routes) {
    if (route.method !== "GET") continue;
    const path = route.path;
    if (path.startsWith("/admin")) continue;
    if (path.includes(":") || path.includes("*") || path.includes("{")) continue;
    paths.add(path);
  }
  const bodies = new Map<string, string>();
  for (const path of [...paths].sort()) {
    const response = await SELF.fetch(`${BASE}${path}`, {
      headers: { Accept: path.includes(".") ? "*/*" : "text/html" },
      redirect: "manual",
    });
    if (response.status !== 200) continue;
    const type = response.headers.get("content-type") ?? "";
    if (UNREADABLE.some((pattern) => pattern.test(type))) continue;
    bodies.set(path, await response.text());
  }
  return bodies;
}

/**
 * Fetched once for the whole file. Both checks read the same bodies,
 * and a door that changes between them would make a failure
 * unreproducible.
 */
let SURFACES: Map<string, string> | undefined;
async function surfaces(): Promise<Map<string, string>> {
  SURFACES ??= await publicSurfaces();
  return SURFACES;
}

/**
 * A spelled-out number in front of a countable noun. The nouns are the
 * things this store actually counts and has actually got wrong; the
 * point is not to ban English, it is to ban a tally that no code
 * recomputes.
 *
 * The lookbehind is not decoration. \b alone matched the TAIL of a
 * hyphenated compound: "fifty-two entries a year" — a fact about the
 * calendar, correct and unchanging — was reported as a typed tally of
 * "two entries", because a hyphen is a word boundary. A guard that
 * cries on correct prose gets exemptions written for it, and an
 * exemption list is how a guard dies.
 */
const TYPED_COUNT =
  /(?<![-\w])(two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|twenty[- ]\w+|thirty|forty|fifty)\s+(of them|items|goods|shelves|corrections|entries|tools|wallets|dependencies|neighbours|receipts|patrons|certificates|signatures)\b/gi;

/**
 * WHAT THE HAND HAD GOT ROUND TO, kept as a floor and nothing else.
 *
 * A derived roster fails in a way a typed one cannot: it can come back
 * EMPTY, and then both checks below pass having read nothing. So the
 * seventeen paths the typed list held before 2026-08-29 stay here as a
 * floor. They are not the roster — the router is — but if the
 * derivation ever stops reaching one of them, this says so by name
 * instead of going quietly green.
 */
const ONCE_TYPED_BY_HAND = [
  "/",
  "/llms.txt",
  "/skill.md",
  "/menu.json",
  "/what",
  "/try",
  "/neighbours",
  "/stack",
  "/corrections",
  "/visitors",
  "/trust-list.json",
  "/house-ledger.json",
  "/.well-known/x402.json",
  "/atlas.json",
  "/registry",
  "/inflows",
  "/agents.md",
] as const;

describe("the roster is the router, and it reaches further than the hand did", () => {
  it("still reaches every surface the typed list held", async () => {
    const reached = await surfaces();
    const missing = ONCE_TYPED_BY_HAND.filter((path) => !reached.has(path));
    expect(
      missing,
      `the derived roster dropped surfaces a person had already listed — a guard that reads nothing passes for the wrong reason:\n${missing.join("\n")}`,
    ).toEqual([]);
  });

  it("covers the doors added after the list stopped being widened", async () => {
    /*
     * /doors and /doors.json shipped the commit AFTER the typed list
     * was last widened by hand, and were never added to it. They are
     * named here as the concrete case, not as a new list to maintain:
     * the assertion that matters is the one above it plus the count.
     */
    const reached = await surfaces();
    expect(reached.has("/doors")).toBe(true);
    expect(reached.has("/doors.json")).toBe(true);
    expect(reached.size).toBeGreaterThan(ONCE_TYPED_BY_HAND.length * 4);
  });
});

describe("nothing served carries a tally nobody recomputes", () => {
  it("holds across every public surface", async () => {
    const offences: string[] = [];
    for (const [path, body] of await surfaces()) {
      for (const match of body.matchAll(TYPED_COUNT)) {
        offences.push(`${path}: "${match[0]}"`);
      }
    }
    expect(
      offences,
      `a count is typed rather than derived — that is a lie with a timer on it:\n${offences.join("\n")}`,
    ).toEqual([]);
  });

  it("holds in the published skill bundle, which is not served by us", async () => {
    // The bundle lives on a registry and drifts out of sight, which is
    // exactly how it carried a wrong item count for two days. Walked
    // here because nothing else walks it.
    const offences = [...SKILL_BUNDLE.matchAll(TYPED_COUNT)].map((m) => m[0]);
    expect(offences, `registry/clawhub/SKILL.md carries typed counts`).toEqual(
      [],
    );
  });
});

describe("no surface quotes a price the menu does not charge", () => {
  /**
   * The storefront defect generalised. An item's name and a dollar
   * amount sitting near each other in prose is how a price gets typed;
   * this finds those pairs on every public surface and checks them
   * against the menu.
   */
  it("checks every item name that appears beside a number", async () => {
    const wrong: string[] = [];
    for (const [path, body] of await surfaces()) {
      for (const item of MENU_ITEMS) {
        // Look for the item's display name followed closely by a price.
        const near = new RegExp(
          `${item.name.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}[^$\\n]{0,80}\\$([0-9]+(?:\\.[0-9]{1,3})?)`,
          "gi",
        );
        for (const match of body.matchAll(near)) {
          const quoted = Number.parseFloat(match[1] ?? "");
          if (Number.isFinite(quoted) && quoted !== item.price_usdc) {
            wrong.push(
              `${path}: "${item.name}" quoted at $${quoted}, menu says $${item.price_usdc}`,
            );
          }
        }
      }
    }
    expect(wrong, `a price is typed rather than derived:\n${wrong.join("\n")}`).toEqual(
      [],
    );
  });
});
