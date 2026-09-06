import { familyOf } from "@/lib/pay-to";

/**
 * READINGS THIS STORE HAS RETRACTED, AND WHAT MAY NO LONGER BE
 * DERIVED FROM THEM (2026-09-05).
 *
 * THE PROBLEM THIS SOLVES. A correction fixes the instrument going
 * forward. It does not reach the rows the broken instrument already
 * wrote, and it must not: the corpus is hash-chained and a round
 * stays in the chain as walked, which is the whole reason anyone can
 * check us. But every DERIVED surface — the passport, the chip, the
 * decision an agent acts on — kept publishing verdicts computed from
 * those rows for as long as it took the next weekly walk to replace
 * them. On 2026-09-05 the operator of 402signal.com read a passport
 * saying not-ready, on a payTo our own correction of the day before
 * had already said we misread, and had to write and tell us. Rule 56
 * says a claim that loses its check is withdrawn out loud; this is
 * the machinery that withdraws the derived ones without editing a
 * single signed byte.
 *
 * WHAT IT NEVER DOES: turn a retracted not_ready into a ready. We do
 * not know this door is payable — we know our reason for saying it
 * was not is gone (rule 52: a lookup that cannot see everything must
 * not answer). The honest state is "no verdict, and here is the
 * correction that took it away," which is what a reader gets.
 *
 * WHY EACH ENTRY CARRIES A PREDICATE rather than a host list. Naming
 * hosts would freeze a judgment we would have to keep by hand, and
 * the failing rows are not all wrong — an EVM door with a genuinely
 * unpayable payTo failed `payto-payable` correctly in the same round.
 * So the entry states the condition under which the OLD reader is
 * known to have been unable to judge, and it is re-derived from the
 * row's own recorded terms every time it is asked.
 */
export interface RetractedReading {
  /** The correction that withdrew it, by date, on /corrections. */
  correction_date: string;
  /** Rounds whose rows were produced by the retracted instrument. */
  weeks: readonly string[];
  /** Checks whose verdicts that instrument could not be trusted for. */
  checks: readonly string[];
  /** Said to a reader of a passport that will not issue because of this. */
  why: string;
  /**
   * True when the row's own recorded terms show the retracted reader
   * could not have judged it. Rows this returns false for keep their
   * verdicts: the instrument was wrong about a class, not about
   * everything, and widening a retraction past its class would be the
   * same overreach in the other direction.
   */
  affects: (offeredNetworks: readonly string[]) => boolean;
}

/**
 * The rails the pre-2026-09-04 reader resolved to its EVM branch
 * because it recognised no other namespace — the misread that
 * published 63 hosts not_ready in round 2026-W36.
 */
const UNREADABLE_BEFORE_2026_09_04 = ["xrpl", "stellar", "algorand", "unknown"];

export const RETRACTED_READINGS: readonly RetractedReading[] = [
  {
    correction_date: "2026-09-04",
    weeks: ["2026-W36"],
    checks: ["payto-payable", "amount-atomic", "transfer-method-signable"],
    why:
      "The checks this verdict rested on were retracted on 2026-09-04: until that day this desk resolved every CAIP-2 namespace it did not recognise to its Ethereum branch, so a correct XRPL, Stellar or Algorand payTo was reported unpayable and those rails' amounts were judged by a convention that is not theirs. This door offered such a rail, so the reading is withdrawn rather than published. It is NOT a finding that the door is fine — we are saying we do not have a verdict, and the next weekly walk reads it with the corrected instrument.",
    affects: (networks) =>
      networks.some((network) => UNREADABLE_BEFORE_2026_09_04.includes(familyOf(network))),
  },
];

export interface RetractionFinding {
  correction_date: string;
  why: string;
  /** The failing checks that are retracted — all of them, or this is not a retraction. */
  checks: string[];
}

/**
 * The retraction that withdraws this row's verdict, or null.
 *
 * THE ALL-OR-NOTHING RULE: a row is withdrawn only when EVERY check
 * it failed is retracted for its week. A row that also failed
 * `status-402` failed for a reason the correction never touched, and
 * that verdict stands — withdrawing it would be using a real
 * correction to erase an unrelated true finding.
 */
export function retractionFor(
  week: string | null | undefined,
  failed: readonly string[],
  offeredNetworks: readonly string[] | undefined,
): RetractionFinding | null {
  if (!week || failed.length === 0) return null;
  for (const entry of RETRACTED_READINGS) {
    if (!entry.weeks.includes(week)) continue;
    if (!failed.every((check) => entry.checks.includes(check))) continue;
    /* No recorded terms means we cannot show the reader was blind
     * here, and rule 52 points the same way it always does: we do not
     * answer, so we do not retract either. */
    if (!offeredNetworks || offeredNetworks.length === 0) continue;
    if (!entry.affects(offeredNetworks)) continue;
    return {
      correction_date: entry.correction_date,
      why: entry.why,
      checks: [...failed],
    };
  }
  return null;
}
