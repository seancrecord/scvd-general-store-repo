import briefs from "@/store/contribution-launch.json";
import {ContributionInputError, contributionTerms} from "@/services/contribution-task";
import {CONTRIBUTION_INDEX_PREFIX} from "@/store/contribution-tasks";
import {jcsCanonicalize} from "@/lib/jcs";
import {kvPut} from "@/lib/kv-retry";
import type {Env} from "@/types";

// A dated keeper-authorized round, frozen independently of future template edits.
// These identities are permanent: retries must never buy another round of work.
export const FIRST_CONTRIBUTION_ROUND = briefs;
export const FIRST_CONTRIBUTION_MAXIMUM = briefs.reduce((sum, t) => sum + Math.round(t.reward_usd * 100) * t.slots, 0) / 100;
export async function launchFirstContributionRound(env: Env, now: number) {
  if (!env.CONTRIBUTION_TASKS) throw new Error("Contribution storage unavailable");
  const stores = briefs.map(t => env.CONTRIBUTION_TASKS!.getByName(t.id));
  const existing = await Promise.all(stores.map(store => store.adminView()));
  // Refuse a stale or conflicting round before creating any new obligations.
  // Existing exact terms can still repair their index after the deadline.
  const terms = briefs.map((brief, i) => {
    const old = existing[i];
    if (old && jcsCanonicalize(old.terms) !== jcsCanonicalize(brief)) throw new ContributionInputError("A first-round id has different posted terms. Existing work was preserved; inspect the contribution desk before continuing.");
    return old ? old.terms : contributionTerms(brief, now);
  });
  for (let i = 0; i < terms.length; i++) {
    const result = await stores[i]!.create(terms[i]!, now);
    if (result.status !== 201) throw new ContributionInputError("A brief could not be posted with these terms. Retry this same round; never replace its ids.");
    // A partial failure is recoverable with the same four immutable identities.
    await kvPut(env.COUNTERS, CONTRIBUTION_INDEX_PREFIX + terms[i]!.id, "1");
  }
}
