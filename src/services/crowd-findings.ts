import type { BountyRecord } from "@/services/bounty-board";

/**
 * WHAT THE WALKS HAVE SHOWN (2026-09-08, the keeper: "be explicit
 * about what we need back and make sure we do something with the
 * data").
 *
 * The board had spent a month buying chain-verified settlements and
 * doing nothing with them but listing them. Every row sat on its own
 * line, and no surface anywhere added them up — so the store that
 * sells "never a verdict without its derivation and denominator
 * beside it" was, on its own money-out instrument, publishing a
 * denominator and no verdict at all.
 *
 * This is the reading, and it is deliberately small: counts, with what
 * they are counts OF, and the not-reported bucket printed beside every
 * one of them. No rates that hide a denominator of four. No scores on
 * doors (rule 43) — a door that refused a walker on a Tuesday is a
 * dated observation, and this page is the arithmetic over those
 * observations, never a grade.
 *
 * THREE CLASSES OF FACT, KEPT APART, because they are not equally
 * strong and blending them is the exact failure this store exists to
 * point at:
 *
 *   ours, proven    — the settlement. Money moved from that wallet to
 *                     that payTo for that amount. Verified on chain
 *                     before a cent of reward was signed.
 *   ours, observed  — the house's own unpaid knock at the moment of
 *                     the claim. Our instrument, our verdict, dated.
 *   theirs, claimed — the walker's report. Never verified. Counted
 *                     as claims, labelled as claims, and interesting
 *                     mainly where two of them can be held against
 *                     each other.
 *
 * The last of those is where the digest agreement lives, and it is the
 * only thing on the board that turns a stranger's word into evidence
 * without the store pretending it saw the transcript: two wallets, one
 * door, same body digest or not.
 */

export interface WalkTally {
  /** Bounties paid: settlements this store verified on chain. */
  settlements: number;
  /** Distinct paying wallets behind them. The crowd's real size. */
  distinct_payers: number;
  /** Distinct doors walked. */
  distinct_doors: number;
  /** Settlements per rail, by CAIP-2. */
  by_rail: Record<string, number>;
  /** What the store paid out for them, in USD. */
  paid_usd: number;
}

export interface ReportTally {
  /** Walks that carried a structured report at all. */
  reported: number;
  /** Walks that carried nothing but a settlement. */
  not_reported: number;
  /** Paid responses the walker says carried a PAYMENT-RESPONSE receipt. */
  receipt_seen: number;
  /** Paid responses the walker says carried none. */
  receipt_absent: number;
  /** HTTP statuses the walkers report on the PAID request. */
  statuses: Record<string, number>;
  /** Median reported latency in ms, or null when nobody reported one. */
  median_latency_ms: number | null;
}

export interface DigestCheck {
  host: string;
  walks: number;
  /** Distinct wallets that walked it and reported a digest. */
  payers: number;
  agreement: "agree" | "differ" | "single";
}

export interface HouseVsWalker {
  /** Our knock said ready and the walker reports a 2xx. */
  both_good: number;
  /** Our knock said ready and the walker reports a non-2xx. */
  house_ready_walk_failed: number;
  /** Our knock said not_ready or unreachable, yet the money moved and the walker reports a 2xx. */
  house_unready_walk_worked: number;
  /** One of the two is missing; counted, never guessed at. */
  incomparable: number;
}

export interface CrowdFindings {
  walks: WalkTally;
  reports: ReportTally;
  /** Doors walked by more than one wallet, and whether the bodies matched. */
  digests: DigestCheck[];
  house_vs_walker: HouseVsWalker;
  /** The sentence a reader should take away, with its denominator in it. */
  headline: string;
  /** What this reading cannot see. Printed, never implied. */
  limits: string[];
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[middle - 1]! + sorted[middle]!) / 2)
    : sorted[middle]!;
}

export function crowdFindings(bounties: readonly BountyRecord[]): CrowdFindings {
  const paid = bounties.filter(
    (bounty) => bounty.status === "paid" && bounty.claim,
  );
  const payers = new Set<string>();
  const doors = new Set<string>();
  const byRail: Record<string, number> = {};
  let paidUsd = 0;

  const statuses: Record<string, number> = {};
  const latencies: number[] = [];
  let reported = 0;
  let receiptSeen = 0;
  let receiptAbsent = 0;

  const house: HouseVsWalker = {
    both_good: 0,
    house_ready_walk_failed: 0,
    house_unready_walk_worked: 0,
    incomparable: 0,
  };

  /** host -> digest -> the wallets that reported it. */
  const digestsByHost = new Map<string, Map<string, Set<string>>>();

  for (const bounty of paid) {
    const claim = bounty.claim!;
    payers.add(claim.payer.toLowerCase());
    doors.add(bounty.domain);
    const rail = bounty.network ?? "eip155:8453";
    byRail[rail] = (byRail[rail] ?? 0) + 1;
    paidUsd += bounty.reward_usd;

    const report = claim.report;
    if (report) {
      reported += 1;
      if (report.status !== undefined) {
        const key = String(report.status);
        statuses[key] = (statuses[key] ?? 0) + 1;
      }
      if (report.payment_response === true) receiptSeen += 1;
      if (report.payment_response === false) receiptAbsent += 1;
      if (report.latency_ms !== undefined) latencies.push(report.latency_ms);
      if (report.body_sha256) {
        const perHost =
          digestsByHost.get(bounty.domain) ?? new Map<string, Set<string>>();
        const wallets = perHost.get(report.body_sha256) ?? new Set<string>();
        wallets.add(claim.payer.toLowerCase());
        perHost.set(report.body_sha256, wallets);
        digestsByHost.set(bounty.domain, perHost);
      }
    }

    /*
     * OUR KNOCK AGAINST THEIR WALK. The interesting cell is the one
     * this store could never fill before it paid strangers: the door
     * our own probe called not_ready that nonetheless took a real
     * buyer's money and returned goods. That is the case a probe
     * cannot see, and it is the whole argument for the board.
     */
    const verdict = claim.house_probe?.verdict;
    const status = claim.report?.status;
    if (verdict === undefined || status === undefined) {
      house.incomparable += 1;
    } else if (status >= 200 && status < 300) {
      if (verdict === "ready") house.both_good += 1;
      else house.house_unready_walk_worked += 1;
    } else if (verdict === "ready") {
      house.house_ready_walk_failed += 1;
    } else {
      house.incomparable += 1;
    }
  }

  const digests: DigestCheck[] = [];
  for (const [host, perDigest] of digestsByHost) {
    const wallets = new Set<string>();
    let walks = 0;
    for (const set of perDigest.values()) {
      walks += set.size;
      for (const wallet of set) wallets.add(wallet);
    }
    digests.push({
      host,
      walks,
      payers: wallets.size,
      agreement:
        wallets.size < 2 ? "single" : perDigest.size === 1 ? "agree" : "differ",
    });
  }
  digests.sort((a, b) => b.walks - a.walks || a.host.localeCompare(b.host));

  const walks: WalkTally = {
    settlements: paid.length,
    distinct_payers: payers.size,
    distinct_doors: doors.size,
    by_rail: byRail,
    paid_usd: Math.round(paidUsd * 100) / 100,
  };

  const reports: ReportTally = {
    reported,
    not_reported: paid.length - reported,
    receipt_seen: receiptSeen,
    receipt_absent: receiptAbsent,
    statuses,
    median_latency_ms: median(latencies),
  };

  /*
   * THE HEADLINE CARRIES ITS OWN DENOMINATOR, and says the
   * uncomfortable half first when the crowd is small. On 2026-09-08
   * fourteen settlements came from two wallets, twelve of them from
   * one — a fact that changes what the whole set is worth, and one no
   * reader should have to derive from a table.
   */
  const headline =
    paid.length === 0
      ? "No door has been walked for a bounty yet. Nothing here is a zero; nothing here has been measured."
      : `${paid.length} settlement${paid.length === 1 ? "" : "s"} at ${walks.distinct_doors} door${walks.distinct_doors === 1 ? "" : "s"}, verified on chain before a cent of reward was signed, from ${walks.distinct_payers} paying wallet${walks.distinct_payers === 1 ? "" : "s"}${
          walks.distinct_payers < 3
            ? " — a crowd this small is one buyer's experience, not the market's, and it is counted that way here"
            : ""
        }. ${reports.reported} of them carried a report beyond the receipt.`;

  const limits = [
    "Every settlement here is proven on chain; every report beside it is the walker's own claim, recorded verbatim and never verified by this store. The two are counted separately above and are never added together.",
    "The doors are the ones this store chose to post bounties on — house-picked from the weekly census, never self-nominated by a seller — so this is a sample of our choosing, not a census of the market. The census itself is at /registry.",
    "A door that refused a walker's money leaves no row here at all: no settlement, no claim, no reward. The most valuable observation on this board is the one it still cannot pay for, and that gap is ours, not the walkers'.",
    "No scores on doors and none on walkers (rule 43). These are dated observations counted, and a count is not a grade.",
  ];

  return { walks, reports, digests, house_vs_walker: house, headline, limits };
}
