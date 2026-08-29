/*
 * FROM THE INDEX, NOT FROM @/store/menu, AND THE ORDER IS LOAD-BEARING.
 *
 * @/store/menu reaches @/services/launch-check through the utility
 * shelf, which reaches back into @/store — so a module that enters
 * the shelf BEFORE the index inverts the store's own initialization
 * order and MENU_ITEMS is undefined when metadata reads it. Four test
 * files went red the moment this file imported the shelf directly.
 * The index is the safe entrance; the cycle is older than this file.
 */
import { getMenuItem } from "@/store";
import { cadenceLine, priceLine } from "@/services/menu-markdown";

/**
 * THE FIVE ANSWERS RULE 57 REQUIRES, AS A SHAPE THREE DOORS SHARE.
 *
 * Rule 57 says every surface owes an agent five things: findable from
 * any door; what it is and what it is FOR without narrowing the use
 * case; free or paid with the amount and the cadence; instructions a
 * Haiku-class model completes on the first try, with errors named and
 * actionable; and what we hold ourselves to on safety.
 *
 * docs/SURFACE_CONTRACT_2026-08.md recorded, the evening the rule was
 * adopted, that 57.2, 57.4 and 57.5 were held against /doors and
 * nowhere else, and named the sweep owed: the free doors an agent
 * meets BEFORE it pays, first. This is that sweep's shared half.
 *
 * WHAT IS SHARED AND WHAT IS NOT. The house-wide safety clauses are
 * shared, because they are promises about the house rather than about
 * a door — two copies of one promise is how one of them goes stale
 * arguing with the other. Everything a door-specific answer needs
 * stays door-specific and is REQUIRED by the type, so a new
 * instrument cannot get the shape by importing it and leave the
 * substance blank.
 *
 * The paid rungs derive from the menu. A free instrument that names
 * its paid neighbour is quoting a price, and a quoted price at this
 * store is read off the shelf or it is not quoted.
 */

/** One named failure a caller can actually do something about. */
export interface SurfaceError {
  /** The stable name. A code is what a client branches on. */
  code: string;
  /** The status it arrives with. */
  http: number;
  /** What happened, in a sentence. */
  means: string;
  /**
   * THE HALF THAT MAKES IT A CATEGORY RATHER THAN A LABEL. Rule 57.4
   * asks for errors a small model can act on; "invalid_url" with no
   * next step is a name, not an instruction.
   */
  what_to_do: string;
}

export interface SurfaceSecurity {
  /** What this door reads, including anything it fetches for you. */
  what_this_surface_reads: string;
  /** What it keeps. "Nothing" where that is true, and only there. */
  what_it_stores_about_you: string;
  /** What the data IS — how it was come by, and from whom. */
  what_the_data_is: string;
  /**
   * Whether the answer is signed, and what to do if you need it to
   * be. A free live read is not a signed artifact and must not be
   * described as one.
   */
  integrity: string;
  /** House-wide. Filled by surfaceSecurity. */
  standards: string;
  /** House-wide. Filled by surfaceSecurity. */
  reporting: string;
}

/**
 * The two clauses that are about the house, not the door. Written
 * once here and served everywhere, for the reason the CONTENT_SIGNAL
 * constant gives one file over: two hand-typed copies of a policy
 * line is how one of them goes stale arguing with the other.
 */
const STANDARDS =
  "Disclosure is private-first and symmetric — an operator hears from us before the public does, and we hold ourselves to the same rule when the defect is ours. Corrections are dated and public, never silent. An operator who proves control of a door can attach a standing note that rides beside our observation everywhere it appears.";

const REPORTING =
  "/.well-known/security.txt, and the corrections desk at /corrections takes anything we got wrong — including anything this door told you.";

export function surfaceSecurity(
  specific: Omit<SurfaceSecurity, "standards" | "reporting">,
): SurfaceSecurity {
  return { ...specific, standards: STANDARDS, reporting: REPORTING };
}

/**
 * Clause 57.3 for a door that charges nothing: the amount, the
 * cadence, and — because "free" invites the question — what money
 * buys instead, priced off the shelf rather than typed here.
 *
 * `rungs` names the paid items that answer the SAME question with a
 * signed artifact behind it. An id the menu does not carry is
 * dropped rather than rendered as a broken promise.
 */
export function freeInstrumentPrice(
  base: string,
  rungs: readonly { id: string; instead: string }[],
  /**
   * What the shelf does NOT sell above this door, when a reader would
   * reasonably expect it to. Pointing at an item that answers a
   * different question is worse than admitting the rung is absent.
   */
  notSold?: string,
): Record<string, unknown> {
  return {
    ...(notSold === undefined ? {} : { what_is_not_sold: notSold }),
    this_surface: "free",
    amount: "$0.00",
    cadence:
      "not applicable — nothing is charged for calling this, at any frequency, now or later. There is no metered tier above it and no key that unlocks more of it.",
    what_money_buys:
      "Our labour on the answer, never the answer itself. Every rung below is a separate one-off or term purchase; nothing at this store charges twice by itself.",
    if_you_want_it_signed: rungs.flatMap(({ id, instead }) => {
      const item = getMenuItem(id);
      if (!item) return [];
      return [
        {
          id: item.id,
          name: item.name,
          instead,
          price: `${priceLine(item)}, ${cadenceLine(item)}`,
          price_usdc: item.price_usdc,
          cadence: item.cadence,
          ...(item.term_days === undefined ? {} : { term_days: item.term_days }),
          buy_url: `${base}/api/buy/${item.id}`,
        },
      ];
    }),
  };
}
