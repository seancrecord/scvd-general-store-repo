import { isHouseWallet } from "@/lib/channel";
import { KV_KEYS } from "@/lib/kv-keys";
import type { Env } from "@/types";

/**
 * THE REFERRAL MARKER — MEASUREMENT ONLY, NOTHING SIGNED.
 *
 * CV's spec, 2026-07-29, built as its measuring half and no further.
 * The full proposal was a signed certificate recording that one agent
 * referred another. The mechanism fits the register; the attestation
 * does not, and the reason is worth keeping next to the code:
 *
 *   WE NEVER OBSERVE ONE AGENT REFERRING ANOTHER. We observe a request
 *   arriving with a marker, TYPED BY THE PERSON BEING REFERRED, who
 *   can type any patron number they like. Signing "patron X referred
 *   patron Y" would put the store's key on a claim the buyer authored.
 *   That is the same class as the `from` field on a decline, which the
 *   gate already refuses to trust — and refusing it there while
 *   signing it here would be incoherent.
 *
 * So this file counts. It answers "is agent-to-agent word of mouth
 * doing anything at all," a question the store has never been able to
 * ask, and it does so with no artifact and no forgery surface: a
 * forged marker inflates a private counter and mints nothing.
 *
 * IF THE NUMBER EVER MOVES, the certificate becomes worth designing —
 * and the honest wording is already known: "this purchase arrived
 * carrying a marker naming patron #X." Never "X referred Y."
 *
 * TWO GUARDS, both deliberate:
 *
 *   1. `?ref=` IS ITS OWN PARAMETER. It is not `?src=`, which means
 *      "how did you hear about us", feeds channel inference, and writes
 *      a venue counter for the free-papers measurement. Overloading it
 *      would have broken inference and put one KV key per referrer per
 *      month into a table built for something else.
 *   2. HOUSE ON EITHER SIDE COUNTS NOTHING. A reward for bringing
 *      traffic is an incentive to manufacture traffic, and today the
 *      only agents who could refer anyone are the house and CV.
 *      Manufacturing social proof is the same family as manufacturing
 *      settlements even with no money moving (rule 13).
 */

/** Patron numbers are sequential integers. Anything else is noise. */
const MAX_PATRON = 1_000_000;

/**
 * The marker, if it is plausibly a patron number. Returns undefined for
 * anything else, which keeps the counter's key space bounded — an
 * unbounded key from a query parameter is how a metric becomes a bill.
 */
export function parseReferralMarker(raw: string | undefined): number | undefined {
  if (!raw || !/^[0-9]{1,7}$/.test(raw)) {
    return undefined;
  }
  const value = Number.parseInt(raw, 10);
  return value >= 1 && value <= MAX_PATRON ? value : undefined;
}

export interface ReferralSignals {
  /** The marker carried by the request, already validated. */
  referralMarker?: number;
  /** The wallet that paid, when one is known. */
  payer?: string;
  /** True when the request was flagged house by any means. */
  house?: boolean;
}

/**
 * Count a marker-carrying event. `stage` separates the two facts that
 * matter: a marker that ARRIVED at a priced door, against one that
 * went all the way to a settlement. The gap between them is the same
 * shape as the 402-to-settle gap everywhere else in the books.
 */
export async function recordReferral(
  env: Env,
  month: string,
  stage: "arrived" | "settled",
  signals: ReferralSignals,
): Promise<void> {
  const marker = signals.referralMarker;
  if (marker === undefined) {
    return;
  }
  // Family doesn't make the paper, and family doesn't refer itself
  // either. Both sides are checked: the payer by wallet, the request by
  // whatever already flagged it house.
  if (signals.house) {
    return;
  }
  if (signals.payer && isHouseWallet(env, signals.payer)) {
    return;
  }
  const key = KV_KEYS.metric(month, `ref${stage === "settled" ? "s" : "a"}`, String(marker));
  const current = await env.COUNTERS.get(key);
  await env.COUNTERS.put(
    key,
    String((current ? Number.parseInt(current, 10) : 0) + 1),
  );
}

export interface ReferralRow {
  /** The patron number the marker named. Unverified, by construction. */
  marker: number;
  arrived: number;
  settled: number;
}

export interface ReferralReport {
  month: string;
  rows: ReferralRow[];
  total_arrived: number;
  total_settled: number;
  /** Stated on every surface that shows these numbers. */
  honest_limit: string;
}

const HONEST_LIMIT =
  "A marker is typed by the arriving client, so a number here says a request CLAIMED to come from that patron. Nothing is verified and nothing is signed — this counts claims, not referrals. House traffic on either side is excluded. If these stay at zero, agent-to-agent word of mouth is not happening yet, which is the thing worth knowing.";

/** The whole picture for a month, read out of the counters. */
export async function readReferrals(
  env: Env,
  month: string,
): Promise<ReferralReport> {
  const rows = new Map<number, ReferralRow>();
  for (const stage of ["a", "s"] as const) {
    const prefix = `metric:${month}:ref${stage}:`;
    const listed = await env.COUNTERS.list({ prefix, limit: 1000 });
    for (const key of listed.keys) {
      const marker = parseReferralMarker(key.name.slice(prefix.length));
      if (marker === undefined) {
        continue;
      }
      const raw = await env.COUNTERS.get(key.name);
      const count = raw ? Number.parseInt(raw, 10) : 0;
      const row = rows.get(marker) ?? { marker, arrived: 0, settled: 0 };
      if (stage === "a") {
        row.arrived += count;
      } else {
        row.settled += count;
      }
      rows.set(marker, row);
    }
  }
  const list = [...rows.values()].sort((a, b) => b.settled - a.settled);
  return {
    month,
    rows: list,
    total_arrived: list.reduce((sum, row) => sum + row.arrived, 0),
    total_settled: list.reduce((sum, row) => sum + row.settled, 0),
    honest_limit: HONEST_LIMIT,
  };
}
