import { describe, expect, it } from "vitest";
import { buyDiscoveryExtensions, buyInputSchema } from "@/lib/bazaar-discovery";
import { MENU_ITEMS } from "@/store";

/**
 * OUR OWN EXAMPLE MUST SATISFY OUR OWN SCHEMA.
 *
 * Found 2026-08-02 by CV, running CDP's free /x402/validate against
 * every item on the shelf rather than reasoning about it. Three came
 * back rejected outright — "invalid discovery configuration" — and the
 * cause was the same in each case: grudge, phantom_check and
 * the_confession each declare a REQUIRED query parameter (grievance,
 * url, confession) that the item's own worked example omitted. We were
 * publishing a schema our own sample payload fails.
 *
 * WHY IT MATTERS MORE THAN IT LOOKS. A rejected route cannot enter the
 * Bazaar catalog at all, buyer or no buyer — so this was never the
 * "nobody has bought it yet" story that covered the other five. Two of
 * the three sit on the six-purchase list, which means money was about
 * to be spent proving nothing while the real blocker sat in this file.
 *
 * WHY IT SURVIVED. buyInputSchema and buyInputExample are two
 * hand-maintained lists that must agree, and nothing compared them.
 * That is AT_SCALE rule 1 exactly — derive it or make the tool refuse
 * — and this is the refusal. It also means the next required field
 * somebody adds cannot ship without its example, which is the actual
 * fix; the three values were only the symptom.
 *
 * WHAT THIS TEST STILL CANNOT SEE (rule 5b): it checks our declaration
 * against itself, not against CDP's validator. A schema both internally
 * consistent AND unacceptable to Bazaar would pass here. The instrument
 * for that question is `npm run bazaar:validate`, which asks them.
 */
/**
 * Read through the SAME builder Bazaar is served from, not from the
 * private helper — a test that reaches past the published surface can
 * pass while the published surface is broken.
 */
function exampleFor(item: (typeof MENU_ITEMS)[number]): Record<string, unknown> {
  const extensions = buyDiscoveryExtensions(item) as Record<
    string,
    { info?: { input?: { queryParams?: Record<string, unknown> } } }
  >;
  // The published shape is bazaar.info.input.queryParams. Reading one
  // level off returned {} for every item and reported seven offences
  // where there were three — a reminder that a test walking the wrong
  // path fails loudly, which is the good case, and could equally have
  // passed vacuously.
  return extensions["bazaar"]?.info?.input?.queryParams ?? {};
}

describe("every declared example satisfies its own declared schema", () => {
  it("supplies a value for every required input", () => {
    const offences: string[] = [];
    for (const item of MENU_ITEMS) {
      const schema = buyInputSchema(item);
      const required = schema.required ?? [];
      if (required.length === 0) {
        continue;
      }
      const example = exampleFor(item);
      for (const field of required) {
        if (
          !(field in example) ||
          example[field] === undefined ||
          example[field] === ""
        ) {
          offences.push(`${item.id} requires "${field}" and its example omits it`);
        }
      }
    }
    expect(
      offences,
      "an item publishes a worked example that fails its own required-field list; CDP's validator rejects the whole route for this, which keeps it out of Bazaar entirely",
    ).toEqual([]);
  });

  /**
   * The three that were actually rejected, named individually so a
   * regression on any one of them fails with its own name rather than
   * inside a list. These are the items the finding was about.
   */
  it.each(["grudge", "phantom_check", "the_confession"])(
    "%s carries the field CDP rejected it for",
    (id) => {
      const item = MENU_ITEMS.find((entry) => entry.id === id);
      expect(item, `${id} is no longer on the shelf`).toBeDefined();
      const required = buyInputSchema(item!).required ?? [];
      const example = exampleFor(item!);
      expect(required.length).toBeGreaterThan(0);
      for (const field of required) {
        expect(
          example[field],
          `${id}'s example is missing ${field} again — this is the exact defect that kept it out of Bazaar`,
        ).toBeTruthy();
      }
    },
  );

  /**
   * An example that satisfies the schema by carrying a placeholder is
   * a different failure wearing the same pass. The value is read by an
   * agent deciding what to put in the field, so it has to be a thing
   * somebody could actually send.
   */
  it("uses values a caller could really send, not placeholders", () => {
    const lazy = /^(string|todo|tbd|xxx|placeholder|example|\.\.\.)$/i;
    const offences: string[] = [];
    for (const item of MENU_ITEMS) {
      for (const [field, value] of Object.entries(exampleFor(item))) {
        if (typeof value === "string" && lazy.test(value.trim())) {
          offences.push(`${item.id}.${field} = ${JSON.stringify(value)}`);
        }
      }
    }
    expect(offences, "a worked example carries a placeholder").toEqual([]);
  });
});
