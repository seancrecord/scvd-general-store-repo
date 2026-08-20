/**
 * THE MAKER'S MARK — who actually made the thing you are holding.
 *
 * Called the strongest unbuilt idea in the partnership doc, narrowed
 * 2026-07-30 by CV holding the certificates: on settlement_attestation
 * the item copy already says "no human looked at this, and that is the
 * point," so a mark there is redundant with something more specific.
 * Where it is NEW INFORMATION is the shelves with a PICK — the_drawer
 * and luckies — where nothing told a buyer whether a person or a script
 * chose what they got.
 *
 * SCOPING IT FOUND A FALSE CLAIM, which is the argument for it in one
 * sentence. The listing spec said luckies were "graded honestly, by a
 * person." drawLuckyParts() picks the animal, the note and the strength
 * from an FNV-1a hash of the certificate id, and luckies.ts says so in
 * its own comment: "the keeper does nothing per order." The question
 * "who made this pick" was never asked in a form anything could check,
 * so the answer drifted from the code for five days.
 *
 * THREE VALUES, NOT TWO, because the interesting case is in the middle.
 * "A human made it" and "a machine made it" do not describe the drawer:
 * the keeper physically stocks the units by hand through the office,
 * and takeStockUnit decides which one a given buyer gets. A person
 * filled the drawer; a machine chose the envelope. Collapsing that into
 * either pole would be a new inaccuracy in the field built to end one.
 */
export type MakerMark = "keeper" | "house" | "machine";

export const MAKER_MARKS: Record<
  MakerMark,
  { label: string; means: string }
> = {
  keeper: {
    label: "The keeper's hand",
    means:
      "A person chose or made this specific thing, for you, after your order. Not a template and not a draw: if two buyers ask on the same day they get different work, because a human did it twice.",
  },
  house: {
    label: "The house's hand",
    means:
      "A person authored the pool and the odds; a machine chose which one you got. The herd, the drawer's contents and the weighting are the keeper's work, done before your order and not repeated for it. Nobody looked at your particular draw.",
  },
  machine: {
    label: "No hand at all",
    means:
      "No human is in this path at any point. The store observed something or computed something and signed what it found. That is the property that makes it worth anything — a human in the loop here would be a defect, not a feature.",
  },
};

/**
 * Marked shelves only, and the omissions are deliberate.
 *
 * NOT MARKED, with the reason, so the next person to look does not read
 * the gaps as oversight:
 *
 *   settlement_attestation, phantom_check — their own copy already says
 *     no human looked, and says it more specifically than a mark could.
 *     CV's narrowing; a mark here is pure redundancy.
 *   phone_call, portrait, human_witness, app_gutcheck, quick_judgment,
 *     the_collab — the item IS the human. A mark saying "a person did
 *     this" on a shelf that sells a person doing it adds nothing.
 *
 * What is left is the set where a buyer genuinely could not tell.
 */
export const ITEM_MAKER_MARK: Readonly<Record<string, MakerMark>> = {
  /**
   * The herd is a list he wrote and the strength wheel is weighted by
   * him; drawLuckyParts hashes the cert id against both. This is the
   * shelf whose copy claimed otherwise until 2026-07-30.
   */
  luckies: "house",
};

export function makerMarkFor(itemId: string): MakerMark | undefined {
  return ITEM_MAKER_MARK[itemId];
}
