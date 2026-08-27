import type { CorpusRecord } from "@/services/corpus";
import type { WardHostResult } from "@/services/ward-round";
import { payToDigest } from "@/lib/pay-to-digest";

/**
 * WALLET FACTS, UNDER THE G2 RULING (roadmap 3.6; the ruling is
 * docs/G2_OPERATOR_LINKING_RULING_2026-08.md, keeper-ruled
 * 2026-08-27). The one-line law: the store provides the wallet fact
 * and the receiver makes the call.
 *
 * Nothing in this module ever says "operator". T1 serves counts with
 * their denominators — no addresses, no digests, no host names. T2
 * serves ONE door's own fact — its advertised address also receives
 * at N OTHER doors — without naming any other door. Both derive at
 * read from the signed snapshots, same law as every corpus view, and
 * both carry the caveat inline, because a cross-host fact served
 * without it is a call wearing a fact's clothes.
 *
 * Rows join by DIGEST: new chain rows carry pay_to_digest (the seal
 * in corpus.ts); rows signed before the ruling carry verbatim
 * addresses, stand as history, and are digested at read so old and
 * new weeks cluster identically.
 */

export const SHARED_WALLET_CAVEAT =
  "A shared receiving address is a fact about the address, not a verdict about operators: custodial wallets, platform checkouts and facilitator-managed payTo addresses make unrelated doors share one address. This store publishes the observation; the inference is yours to make, and yours to defend.";

export interface WalletFacts {
  week: string;
  sequence: number;
  /** The signed snapshot these counts derive from. */
  digest: string;
  /** Denominators first: every count below lives over these. */
  hosts_probed: number;
  hosts_with_offer: number;
  hosts_with_pay_to: number;
  distinct_addresses: number;
  addresses_at_multiple_doors: number;
  largest_cluster_doors: number;
  shared_wallet_caveat: string;
  what_this_is: string;
  what_this_is_not: string;
}

export interface HostWalletFact {
  week: string;
  sequence: number;
  digest: string;
  /**
   * Rule 52: a round where the probe captured no payment address for
   * this door cannot answer "zero" — it did not look at the thing the
   * question is about. captured:false says so, and the count is
   * absent rather than 0.
   */
  captured: boolean;
  not_captured_reason?: string;
  also_receives_at_other_doors?: number;
  shared_wallet_caveat: string;
  /**
   * The wallet-holder's own standing note (G2 ruling §5), attached by
   * proof of control, riding beside this fact on every door that
   * advertises the address. Populated by the serving layer, never
   * derived from the chain.
   */
  standing_note?: import("@/services/standing-note").StandingNote;
}

async function digestsOf(host: WardHostResult): Promise<string[]> {
  const offer = host.offer;
  if (!offer) return [];
  if (offer.pay_to_digest && offer.pay_to_digest.length > 0) {
    return offer.pay_to_digest;
  }
  // A row signed before the ruling: verbatim address, digested at
  // read so history joins the present without being rewritten.
  if (offer.pay_to && offer.pay_to.length > 0) {
    return Promise.all(offer.pay_to.map(payToDigest));
  }
  return [];
}

function hostsOf(record: CorpusRecord): WardHostResult[] {
  return (record.snapshot.round.hosts ?? []) as WardHostResult[];
}

/** digest -> hosts advertising it, within one signed week. */
async function clustersOf(
  record: CorpusRecord,
): Promise<Map<string, Set<string>>> {
  const clusters = new Map<string, Set<string>>();
  for (const host of hostsOf(record)) {
    for (const digest of await digestsOf(host)) {
      const doors = clusters.get(digest) ?? new Set<string>();
      doors.add(host.host);
      clusters.set(digest, doors);
    }
  }
  return clusters;
}

/**
 * T1 — the public counts. Latest signed week only: this is a
 * state-of-the-market number, not a timeline, and serving it per week
 * would tempt exactly the accumulation the ruling forbids.
 */
export async function deriveWalletFacts(
  records: CorpusRecord[],
): Promise<WalletFacts | null> {
  const latest = records[records.length - 1];
  if (!latest) return null;
  const hosts = hostsOf(latest);
  const clusters = await clustersOf(latest);
  let hostsWithOffer = 0;
  let hostsWithPayTo = 0;
  for (const host of hosts) {
    if (host.offer) hostsWithOffer += 1;
    if ((await digestsOf(host)).length > 0) hostsWithPayTo += 1;
  }
  let multi = 0;
  let largest = 0;
  for (const doors of clusters.values()) {
    if (doors.size > 1) multi += 1;
    if (doors.size > largest) largest = doors.size;
  }
  return {
    week: latest.snapshot.week,
    sequence: latest.snapshot.sequence,
    digest: latest.digest,
    hosts_probed: hosts.filter((h) => h.verdict !== "not_probed").length,
    hosts_with_offer: hostsWithOffer,
    hosts_with_pay_to: hostsWithPayTo,
    distinct_addresses: clusters.size,
    addresses_at_multiple_doors: multi,
    largest_cluster_doors: largest,
    shared_wallet_caveat: SHARED_WALLET_CAVEAT,
    what_this_is:
      "Counts over the latest signed weekly snapshot: how many receiving addresses the probed doors advertised, and how many of those addresses receive at more than one door. Counts travel with their denominators; divide two named numbers yourself if you want a ratio, and you will know exactly what was divided.",
    what_this_is_not:
      "Not a list, not a graph, and never a statement about operators. No address, digest or host name is served here; the per-host fact lives on each door's own /corpus/host/{host}.json page, and named evidence exists only with the operator's consent or inside a purchased, signed artifact.",
  };
}

/**
 * T2 — one door's own fact, on its own page and nowhere else. The
 * count is OTHER doors sharing any of this door's advertised
 * addresses in the latest signed week that observed the door; the
 * other doors are not named, per the ruling.
 */
export async function sharedWalletFactFor(
  records: CorpusRecord[],
  host: string,
): Promise<HostWalletFact | null> {
  for (let i = records.length - 1; i >= 0; i -= 1) {
    const record = records[i]!;
    const row = hostsOf(record).find((h) => h.host === host);
    if (!row) continue;
    const provenance = {
      week: record.snapshot.week,
      sequence: record.snapshot.sequence,
      digest: record.digest,
    };
    const digests = await digestsOf(row);
    if (digests.length === 0) {
      return {
        ...provenance,
        captured: false,
        not_captured_reason:
          "The round that last observed this door captured no payment address — the door served no parseable offer, or the round predates address capture (2026-08-20). Absence of the fact, not a fact of absence.",
        shared_wallet_caveat: SHARED_WALLET_CAVEAT,
      };
    }
    const clusters = await clustersOf(record);
    let others = 0;
    for (const digest of digests) {
      const doors = clusters.get(digest);
      if (!doors) continue;
      const sharing = doors.size - (doors.has(host) ? 1 : 0);
      if (sharing > others) others = sharing;
    }
    return {
      ...provenance,
      captured: true,
      also_receives_at_other_doors: others,
      shared_wallet_caveat: SHARED_WALLET_CAVEAT,
    };
  }
  return null;
}
