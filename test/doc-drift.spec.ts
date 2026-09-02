import { describe, expect, it } from "vitest";
import { MENU_ITEMS } from "@/store";
import { mcpToolCatalog } from "@/lib/mcp-tools";

/**
 * THE DOCUMENTS THAT LEAVE THE BUILDING.
 *
 * derived-not-typed.spec.ts walks the SERVED surfaces and says in its
 * own scope note that the source tree is deliberately out of bounds: a
 * stale count in a code comment is untidy, not a lie told to a
 * stranger. That boundary is right, and this file does not move it.
 *
 * It covers the third category neither guard had — repo markdown
 * written to be READ BY SOMEBODY ELSE. registry/*.md is submission
 * copy drafted for pasting into other people's directories, and
 * README.md is what a stranger reads on GitHub before deciding whether
 * this shop is real. The published SKILL.md is already walked for
 * exactly this reason ("it drifts out of sight"); these drift the same
 * way and nothing was watching them.
 *
 * FOUND THE DAY IT WAS WRITTEN, 2026-08-22, which is the argument for
 * it existing: two submission drafts claimed 21 items against a shelf
 * of 24, and one quoted $0.005-$50 against a real $0.004-$25. Those
 * were drafted to be pasted into directories under the store's name.
 *
 * WHY IT VERIFIES RATHER THAN BANS. The first cut of this file banned
 * the SHAPE of a typed count, the way the served-surface guard does,
 * and flagged eighteen things of which three were real: a worked
 * example about somebody else's SaaS bill, a KV setup instruction, and
 * a dated ledger entry all match "N tools". A guard that cries wolf
 * fifteen times gets muted, and a muted guard is worse than none. So
 * each fact here names the code that computes it and checks the number
 * against it. A count this repo cannot compute is not this file's
 * business.
 *
 * WHAT STAYS EXEMPT. Dated records — docs/archive, research/,
 * PROBLEMS.md — are not documents that go stale, they are documents
 * ABOUT a date. The house appends corrections and never overwrites
 * them; a guard that forced last month's field report to match today's
 * code would be rewriting history to keep a test green.
 */

const ALL_DOCS = import.meta.glob("../**/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

/** Written to be read by a stranger, describing the shop as it is now. */
const OUTBOUND = /^\/(README\.md|registry\/(?!clawhub\/SKILL)[^/]+\.md)$/;

function outboundDocs(): Array<[string, string]> {
  return Object.entries(ALL_DOCS)
    .map(([path, body]) => [path.replace(/^\.\./, ""), body] as [string, string])
    .filter(([path]) => OUTBOUND.test(path))
    .sort(([a], [b]) => (a < b ? -1 : 1));
}

const WORD_NUMBERS: Record<string, number> = {
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
  sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
  "twenty-one": 21, "twenty-two": 22, "twenty-three": 23, "twenty-four": 24,
  "twenty-five": 25, "twenty-six": 26, "twenty-seven": 27, "twenty-eight": 28,
  "twenty-nine": 29, thirty: 30, "thirty-one": 31, "thirty-two": 32,
  "thirty-three": 33, "thirty-four": 34, "thirty-five": 35,
};

function asNumber(raw: string): number | null {
  const word = WORD_NUMBERS[raw.toLowerCase().replace(/\s+/g, "-")];
  if (word !== undefined) return word;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

/** A claim this repo can recompute, and the code that recomputes it. */
interface CheckableFact {
  label: string;
  /** Capture group 1 must be the number. */
  pattern: RegExp;
  truth: () => number;
  derivedFrom: string;
}

const FACTS: CheckableFact[] = [
  {
    label: "items on the shelf",
    pattern: /\b([0-9]{1,3}|[A-Za-z]+(?:-[a-z]+)?)\s+items\b/g,
    truth: () => MENU_ITEMS.length,
    derivedFrom: "MENU_ITEMS.length in src/store",
  },
  {
    label: "tools in the live MCP catalog",
    pattern: /live catalog is\s+([0-9]{1,3})\s+tools\b/g,
    truth: () => mcpToolCatalog("https://scvd.store").length,
    derivedFrom: "mcpToolCatalog() in src/lib/mcp-tools.ts",
  },
];

/** The check itself, so it can be aimed at synthetic copy in a test. */
function violations(
  docs: Array<[string, string]>,
  fact: CheckableFact,
): string[] {
  const expected = fact.truth();
  const wrong: string[] = [];
  for (const [path, body] of docs) {
    for (const match of body.matchAll(fact.pattern)) {
      const claimed = asNumber(match[1] ?? "");
      if (claimed === null) continue;
      if (claimed !== expected) {
        wrong.push(`${path}: "${match[0].trim()}" but it is ${expected}`);
      }
    }
  }
  return wrong;
}

/**
 * GUARD THE GUARD. Every assertion below is of the form "this list is
 * empty", which is exactly the shape that passes forever if the regex
 * stops matching. These prove the machinery still bites before the
 * real checks are allowed to report all-clear.
 */
describe("the check can still fail", () => {
  const items = FACTS[0]!;

  it("catches a wrong digit", () => {
    const found = violations([["/fake.md", "We list 21 items today."]], items);
    expect(found).toHaveLength(1);
    expect(found[0]).toContain("21 items");
  });

  it("catches a wrong number spelled out, which is how it shipped last time", () => {
    expect(
      violations([["/fake.md", "Twenty-one items on the shelf."]], items),
    ).toHaveLength(1);
  });

  it("passes the true number in either spelling", () => {
    const truth = items.truth();
    expect(violations([["/fake.md", `${truth} items`]], items)).toEqual([]);
    const spelled = Object.entries(WORD_NUMBERS).find(
      ([, value]) => value === truth,
    )?.[0];
    expect(spelled, "the word table must cover the current shelf").toBeTruthy();
    expect(violations([["/fake.md", `${spelled} items`]], items)).toEqual([]);
  });

  it("stays out of prose that only looks like a tally", () => {
    // "several items", "no items" — English, not a number nobody recomputes.
    expect(
      violations([["/fake.md", "several items and no items at all"]], items),
    ).toEqual([]);
  });
});

describe("outbound copy agrees with the code that computes it", () => {
  it("finds the documents, so the guard cannot be outrun by an empty glob", () => {
    const docs = outboundDocs().map(([path]) => path);
    expect(docs).toContain("/README.md");
    expect(docs.some((path) => path.startsWith("/registry/"))).toBe(true);
    // The bundle guarded elsewhere must not be double-guarded here.
    expect(docs).not.toContain("/registry/clawhub/SKILL.md");
  });

  for (const fact of FACTS) {
    it(`checks every claim about ${fact.label}`, () => {
      const expected = fact.truth();
      // The SAME function the guard-the-guard tests above exercise; a
      // second copy here would let the tested one drift into decoration.
      const wrong = violations(outboundDocs(), fact);
      expect(
        wrong,
        `outbound copy states a number the code disagrees with ` +
          `(${fact.derivedFrom}). Say where to look it up rather than ` +
          `typing it:\n${wrong.join("\n")}`,
      ).toEqual([]);
    });
  }

  it("checks every quoted price range against the actual shelf", () => {
    const prices = MENU_ITEMS.map((item) => item.price_usdc);
    const cheapest = Math.min(...prices);
    const dearest = Math.max(...prices);
    const wrong: string[] = [];
    for (const [path, body] of outboundDocs()) {
      for (const match of body.matchAll(
        /\$([0-9]+(?:\.[0-9]+)?)\s*(?:to|–|—)\s*\$([0-9]+(?:\.[0-9]+)?)/g,
      )) {
        const low = Number.parseFloat(match[1] ?? "");
        const high = Number.parseFloat(match[2] ?? "");
        if (low !== cheapest || high !== dearest) {
          wrong.push(
            `${path}: "${match[0]}" but the shelf runs $${cheapest} to $${dearest}`,
          );
        }
      }
    }
    expect(
      wrong,
      `a price range the menu does not charge:\n${wrong.join("\n")}`,
    ).toEqual([]);
  });
});
