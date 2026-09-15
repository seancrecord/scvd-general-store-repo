/**
 * A PUBLISHED COUNT, SET AGAINST THE CHAIN — the pure half.
 *
 * A directory that measures settlements can only measure the paths it
 * watches. The honest ones say so: x402-list.com prints "only USDC
 * settlements via facilitators we measure are counted. A measured
 * floor, not an estimate." That sentence is the whole reason this file
 * exists, because it changes what a disagreement MEANS.
 *
 * If a count is published as a FLOOR, a chain reading that finds more
 * does not contradict it. The floor was true and the chain is simply
 * further along it. Reporting that as an error would be scoring a
 * publisher against a claim they explicitly did not make — the same
 * move we filed a correction against ourselves for on 2026-09-15, in
 * a different coat.
 *
 * So the verdict here is never "right" or "wrong". It is the DISTANCE
 * between a stated floor and what a second reader can see, which is a
 * fact about coverage and is useful to both sides. A publisher learns
 * where their facilitator set stops. A buyer learns that "never paid"
 * in a directory is a statement about that directory.
 *
 * NEVER A RANKING (rule 43), and never a quality claim about either
 * the door or the directory.
 */

/** What the published number claims about itself. The caveat decides. */
export const CLAIM_KINDS = Object.freeze(["floor", "estimate", "unstated"]);

/**
 * The four readings, and they are not interchangeable:
 *
 *   AGREES          both say nothing arrived, and ours says it all-time
 *   BEYOND_FLOOR    the count is a declared floor and the chain is past
 *                   it — consistent with the claim, not against it
 *   EXCEEDS_CLAIM   the count did NOT declare itself a floor, and the
 *                   chain shows more. Only this one is a disagreement
 *   NOT_ESTABLISHED we could not settle it either way
 */
export const FLOOR_VERDICTS = Object.freeze([
  "AGREES", "BEYOND_FLOOR", "EXCEEDS_CLAIM", "NOT_ESTABLISHED",
]);

/**
 * WHAT A BALANCE IS AND IS NOT. Carried on every row that rests on
 * one, because the inference is short and the temptation to overrun it
 * is not.
 */
export const BALANCE_RESIDUAL =
  "A USDC balance at an advertised payTo proves that USDC arrived at that address. It does not prove that anyone paid THIS door: an address may be a general-purpose wallet, may serve several doors, and may have received funds for reasons that have nothing to do with the endpoint advertising it. Read this as arrival at an address, never as demand for a product.";

/**
 * One row. `claimZero` is the directory's own number being zero;
 * `claimKind` is what the directory says that number is; `reading` is
 * a row from readDoorRail.
 */
export function compareToFloor({ claimZero, claimKind = "unstated", reading } = {}) {
  const base = {
    claim_zero: claimZero === true,
    claim_kind: CLAIM_KINDS.includes(claimKind) ? claimKind : "unstated",
    our_verdict: reading?.verdict ?? null,
    residual: BALANCE_RESIDUAL,
  };
  if (!reading || reading.verdict === "UNKNOWN") {
    return { ...base, verdict: "NOT_ESTABLISHED", established_by: reading?.established_by ?? "no chain reading was taken for this address" };
  }
  if (!claimZero) {
    // Both say paid. Nothing to compare: this instrument only speaks to
    // the doors a directory reports as never paid.
    return { ...base, verdict: "NOT_ESTABLISHED", established_by: "the published count is not zero, so there is no floor here to stand a chain reading against" };
  }
  if (reading.verdict === "ZERO_OBSERVED") {
    return {
      ...base,
      verdict: "AGREES",
      established_by: reading.scope === "all_time"
        ? "the directory reports none, and the chain shows an address nothing has ever left holding nothing — zero at this height is zero at every height before it"
        : `the directory reports none, and the chain window read complete with none (${reading.window ?? "window unnamed"})`,
      strength: reading.scope === "all_time" ? "all_time" : "window",
    };
  }
  // reading.verdict === "PAID"
  if (base.claim_kind === "floor") {
    return {
      ...base,
      verdict: "BEYOND_FLOOR",
      established_by: `${reading.established_by}. The published count declares itself a floor, so a chain reading past it is CONSISTENT with the claim and is not an error in it.`,
      distance: "the chain sees settlement the publisher's measured paths did not",
    };
  }
  return {
    ...base,
    verdict: "EXCEEDS_CLAIM",
    established_by: `${reading.established_by}. The published count did not declare itself a floor, so a chain reading past it is a disagreement with what was actually claimed.`,
  };
}

/** Counts with their denominators, never a share. The reader divides. */
export function tally(rows) {
  const counted = rows ?? [];
  const of = (v) => counted.filter((r) => r.verdict === v).length;
  return {
    addresses_read: counted.length,
    agrees: of("AGREES"),
    agrees_all_time: counted.filter((r) => r.verdict === "AGREES" && r.strength === "all_time").length,
    beyond_floor: of("BEYOND_FLOOR"),
    exceeds_claim: of("EXCEEDS_CLAIM"),
    not_established: of("NOT_ESTABLISHED"),
    denominator_note: "Every figure here is out of addresses_read, which is addresses and not doors: a door may advertise several, and one address may serve several doors.",
  };
}
