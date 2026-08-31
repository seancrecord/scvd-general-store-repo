import { describe, expect, it } from "vitest";
import { MENU_ITEMS } from "@/store";
import bundle from "../registry/clawhub/SKILL.md?raw";

/**
 * A PRICE TYPED INTO THE PITCH IS A PRICE NOTHING WAS WATCHING.
 *
 * Found 2026-08-31, while overhauling the skill. The bundle said
 * `service_audit` cost $0.10. The shelf said $5. Fifty times off, in
 * the one document that gets INSTALLED into somebody else's agent and
 * cannot be edited once it is. `trust_profile` was $19 in the pitch
 * and $21 on the shelf. Both had been wrong for weeks.
 *
 * Nothing could have caught it. The existing bundle guards
 * (test/skill-bundle-freshness.spec.ts) walk item IDs, the credentials
 * promise, the position sentence and the key registry — every one of
 * them a claim about WHETHER a thing is named, none of them a claim
 * about a NUMBER beside it. So the bundle was free to name the right
 * item at the wrong price forever, and did.
 *
 * WHY THIS IS THE WORSE KIND OF STALENESS. A stale item name fails
 * loudly at the door: the agent calls the endpoint and gets a 404. A
 * stale PRICE fails at the wallet — the agent budgets a tenth of what
 * the 402 asks, refuses the purchase it meant to make, and reports
 * that this store is unaffordable. We would never hear about it.
 *
 * NOT A DUPLICATE OF derived-not-typed.spec.ts, which was checked
 * before this file was written because two places asserting one
 * property is a defect this codebase has spent real time removing.
 * That file walks SERVED surfaces and matches DISPLAY NAMES beside
 * numbers ("The Once-Over quoted at $0.1"). It reads the bundle too,
 * but only for typed counts — never for prices, and never by item id.
 * The bundle is the one document we publish into somebody else's
 * registry and do not serve, it names items by id rather than by
 * display name, and it makes two claims no served surface makes: the
 * shelf's range and the frontmatter's entry price. That is the gap
 * this file covers and the reason it is its own file.
 *
 * WHAT THIS PINS AND WHAT IT DELIBERATELY DOES NOT. It does not
 * require the bundle to state a price at all: the pitch is curated,
 * `/menu.json` is the source of truth, and the standing advice to
 * fetch it fresh is the real answer. A figure typed anyway has to be
 * right.
 */

/**
 * ONLY FIGURES IN PRICE POSITION, and the reason is a finding this
 * guard made against its own author.
 *
 * The first cut read every `$` in the document and flagged the new
 * `launch_check` paragraph, which says the store spends "at most
 * $0.05" at YOUR till while the item costs $5. That is not a price
 * claim; it is a fact about the opposite direction of payment. The
 * document is full of amounts that are not prices — the $1 credit
 * cash-out floor, the tip minimum on graffiti — and a guard that
 * cannot tell them apart produces a finding a maintainer has to argue
 * with, which is how a guard stops being read.
 *
 * So a figure counts as a price claim only where the document is
 * QUOTING one: opening a parenthetical, as in "`service_audit` ($5)",
 * or introducing a call, as in "$0.004:\n`GET /api/buy/...`". Both of
 * the real errors above sat in exactly those shapes, and the
 * regression case at the bottom of this file proves the narrowed
 * reader still catches them rather than leaving it to my reading.
 *
 * THE COST, STATED RATHER THAN HIDDEN. A price written in prose is
 * invisible to this. Every price the bundle quotes BESIDE AN ITEM was
 * normalized onto the two covered shapes at the same commit — the
 * `settlement_attestation` line ("signs what it saw. $0.004.") was
 * the last holdout and moved — so today nothing attributable is
 * unread. One prose figure remains and is deliberately out of scope:
 * "closing the loop costs $0.004" names no item in its paragraph, so
 * there is nothing to check it against in either shape. If a price
 * ever goes back into prose beside an item, this file will not see
 * it, and that is the known limit rather than a claim of completeness.
 */
function priceClaims(text: string): { amount: number; at: number }[] {
  const claims: { amount: number; at: number }[] = [];
  for (const match of text.matchAll(/\((\$\d+(?:\.\d+)?)|(\$\d+(?:\.\d+)?):/g)) {
    // One alternation always matches, so this never drops anything
    // today. It drops rather than defaulting because a default here
    // would be a fabricated amount BELOW every shelf price — the
    // reader would report a misquote that the document does not
    // contain, which is the one failure this guard cannot afford.
    const quoted = match[1] ?? match[2];
    if (!quoted) continue;
    claims.push({ amount: Number(quoted.slice(1)), at: match.index ?? 0 });
  }
  return claims;
}

/**
 * A figure belongs to the nearest item id IN THE SAME BREATH — the
 * same bullet or the same paragraph, which are the shapes this
 * document uses: "- **`trust_profile`** ($21)", "$0.004:\n`GET
 * /api/buy/settlement_attestation`".
 *
 * THE BOUNDARY IS THE OTHER HALF OF THE CORRECTNESS ARGUMENT, and the
 * first cut did not have one either. Without it this reader flagged
 * `attestation_bundle` for a $0.004 belonging to
 * `settlement_attestation` on the line above: the price ended one
 * bullet and the next bullet's name began thirteen characters later,
 * so "nearest" picked the wrong side of a list boundary.
 */
function sameBreath(text: string, at: number): { window: string; from: number } {
  const before = text.slice(0, at);
  const after = text.slice(at);
  const opens = Math.max(
    before.lastIndexOf("\n\n"),
    before.lastIndexOf("\n- "),
    before.lastIndexOf("\n#"),
    0,
  );
  const closesAt = [after.indexOf("\n\n"), after.indexOf("\n- "), after.indexOf("\n#")]
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0];
  const closes = closesAt === undefined ? text.length : at + closesAt;
  return { window: text.slice(opens, closes), from: opens };
}

function nearestItem(text: string, at: number, ids: string[]): string | undefined {
  const { window, from } = sameBreath(text, at);
  let nearest: { id: string; distance: number } | undefined;
  for (const id of ids) {
    for (const match of window.matchAll(new RegExp(`\\b${id}\\b`, "g"))) {
      const distance = Math.abs(from + (match.index ?? 0) - at);
      if (!nearest || distance < nearest.distance) nearest = { id, distance };
    }
  }
  return nearest?.id;
}

/** Every price the document quotes beside an item, with that item. */
function misquotes(text: string, shelf: Map<string, number>): string[] {
  const ids = [...shelf.keys()];
  const wrong: string[] = [];
  for (const { amount, at } of priceClaims(text)) {
    const id = nearestItem(text, at, ids);
    if (!id) continue;
    const actual = shelf.get(id);
    if (actual === undefined) continue;
    // Pay-what-it-deserves items offer several amounts and the
    // document may quote a higher one as a tip; only a figure BELOW
    // the shelf price is a lie a buyer budgets against.
    if (amount < actual) {
      wrong.push(`${id}: the pitch says $${amount}, the shelf says $${actual}`);
    }
  }
  return wrong;
}

const SHELF = new Map(MENU_ITEMS.map((item) => [item.id, item.price_usdc]));

describe("the published pitch never misquotes the shelf", () => {
  it("states no price that disagrees with menu.json", () => {
    expect(
      misquotes(bundle, SHELF),
      "the installed skill would send an agent in underfunded",
    ).toEqual([]);
  });

  it("names the shelf's real ends wherever it describes the range", () => {
    // The cheapest and dearest doors are the two numbers a reader
    // carries away, and both moved without the document noticing: it
    // said "$0.005 ... to $50" while the shelf ran $0.001 to $300.
    // This reads the range SENTENCE rather than the loose figures,
    // because the loose figures were all individually in range while
    // the claim they added up to was wrong on both ends.
    const prices = MENU_ITEMS.map((item) => item.price_usdc);
    const range = bundle.match(/runs?\s+from\s+\$(\d+(?:\.\d+)?)[^$]*\$(\d+(?:\.\d+)?)/s);
    expect(range, "the bundle no longer describes the shelf's range at all").not.toBeNull();
    expect(Number(range?.[1]), "the stated floor is not the cheapest door").toBe(
      Math.min(...prices),
    );
    expect(Number(range?.[2]), "the stated ceiling is not the dearest door").toBe(
      Math.max(...prices),
    );
  });

  it("promises nothing cheaper at the door than the door costs", () => {
    // The frontmatter's "from $X" is the first number an installer
    // reads and the last one anybody re-checks.
    const from = bundle.match(/from\s+\$(\d+(?:\.\d+)?)/);
    expect(from, "the frontmatter no longer names an entry price").not.toBeNull();
    expect(Number(from?.[1]), "the frontmatter undersells the cheapest door").toBe(
      Math.min(...MENU_ITEMS.map((item) => item.price_usdc)),
    );
  });
});

/**
 * AND THE GUARD AGAINST THE GUARD. House rule 46: a check that cannot
 * fail argues for the lie it was written to catch. The reader above
 * was narrowed twice to kill false findings, and each narrowing could
 * have quietly narrowed it past the two errors it exists for.
 *
 * These are the ACTUAL sentences from the bundle as it stood on
 * 2026-08-31, before the overhaul, reduced to the shape that carried
 * the error. If a future tightening stops seeing them, this file
 * fails and says which one it lost.
 */
describe("the reader still sees the errors it was written for", () => {
  const shelf = new Map([
    ["service_audit", 5],
    ["trust_profile", 21],
    ["launch_check", 5],
    ["settlement_attestation", 0.004],
    ["attestation_bundle", 0.05],
  ]);

  it("catches a price parenthesised after the item, the service_audit case", () => {
    const stale =
      "the signed dated version is `service_audit`\n  ($0.10) and the standing version follows.";
    expect(misquotes(stale, shelf)).toEqual([
      "service_audit: the pitch says $0.1, the shelf says $5",
    ]);
  });

  it("catches a price parenthesised inside a bullet, the trust_profile case", () => {
    const stale = "- **`trust_profile`** ($19 ⚑) — a STANDING page for your endpoint.";
    expect(misquotes(stale, shelf)).toEqual([
      "trust_profile: the pitch says $19, the shelf says $21",
    ]);
  });

  it("catches a price introducing a call, the settlement_attestation shape", () => {
    const stale =
      "One read of the chain, signed, $0.002:\n`GET https://scvd.store/api/buy/settlement_attestation?tx_hash=0x...`";
    expect(misquotes(stale, shelf)).toEqual([
      "settlement_attestation: the pitch says $0.002, the shelf says $0.004",
    ]);
  });

  it("does not flag an amount the STORE pays, the launch_check case", () => {
    // The false finding this reader was narrowed to remove. It must
    // stay removed, and it must stay removed for the right reason —
    // the amount is real and correct, it is simply not a price.
    const fine =
      "- **`launch_check`** ($5) — a real authorization from the store's field wallet. We pay at most $0.05 at your till.";
    expect(misquotes(fine, shelf)).toEqual([]);
  });

  it("does not flag a price across a list boundary, the attestation_bundle case", () => {
    const fine =
      "- **`settlement_attestation`** — one settlement, signed ($0.004).\n- **`attestation_bundle`** — a sheaf of them under one signature.";
    expect(misquotes(fine, shelf)).toEqual([]);
  });
});
