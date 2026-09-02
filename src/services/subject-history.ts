import { roundCoverageSuspect } from "@/services/passport-tier";
import { listCorpus } from "@/services/corpus";
import {
  sharedWalletFactFor,
  type HostWalletFact,
} from "@/services/operator-facts";
import { notesForHost, type StandingNote } from "@/services/standing-note";
import { populationHistory, type PopulationRecord } from "@/services/population";
import type { WardHostResult } from "@/services/ward-round";
import type { Env } from "@/types";
import { CORRECTIONS_POINTER } from "@/store/corrections";

/**
 * WHAT HAS THIS STORE OBSERVED ABOUT ONE HOST, OVER TIME — the index
 * read, derived by replaying the signed chain rather than stored.
 *
 * THE WHOLE PRODUCT IS THE GAPS. Anyone can serve the weeks they
 * looked; the large monitors do exactly that, and a timeline with the
 * misses quietly omitted reads as continuous coverage when it is
 * nothing of the kind. So every round in the chain appears here, and
 * the ones with no verdict carry a REASON — which is the difference
 * between "we watched and it was fine" and "we did not look."
 *
 * FIVE REASONS A ROUND HAS NO VERDICT, and they are not the same fact:
 *
 *   BEFORE_FIRST_SIGHTING — the chain predates our first sight of this
 *   host. Not a miss; we had not met.
 *
 *   NOT_LISTED — no feed we read named it that week. That is a fact
 *   about the DIRECTORIES, and it is the one most easily misread as a
 *   fact about the host.
 *
 *   LISTED_NOT_WALKED — named, not knocked on. The enumeration and
 *   observation layers are separate on purpose (see population.ts) and
 *   this is where that split becomes visible per subject.
 *
 *   POSSIBLY_BEYOND_CAP — the round hit its host cap and this host may
 *   have been in the unwalked tail. We cannot tell, and say so.
 *
 *   INSTRUMENT_DEGRADED — the round itself recorded coverage trouble.
 *   The absence is more plausibly ours than theirs.
 *
 * FIRST SIGHTING COMES FROM WHICHEVER RECORD MET THE HOST FIRST. The
 * population register began the day the population layer shipped, so
 * reading first sight from it ALONE would stamp "before_first_sighting"
 * over every historical round the host was plainly observed in. The
 * chain is the longer record. But the chain is also a SAMPLE — a ward
 * round walks a few dozen hosts out of thousands enumerated — so
 * reading first sight from the chain alone stamps the same lie the
 * other way round, on every host we have listed for weeks and never
 * had a slot to knock on. So both are read and the EARLIER wins.
 *
 * FOUND LIVE 2026-08-24, and it is the reason the two-record rule
 * exists. /corpus/host/hypernatt.com.json reported `rounds_probed: 0`
 * with all three rounds marked "Not a miss — we had not met", in the
 * same document whose `listing` block said we first saw the host on
 * 2026-08-11 and last saw it on 2026-08-23. Two adjacent fields, one
 * of them false. The round that host was missing from had walked 40
 * hosts of 5,873 known: it was never "we had not met", it was always
 * LISTED_NOT_WALKED, which is a fact about our cadence and not about
 * the operator. A gap surface that mislabels its own gaps is worse
 * than no gap surface, because it is believed.
 *
 * WHY `listed` CANNOT COME FROM round.hosts. That array holds the
 * hosts a round WALKED, not the hosts it knew of, so the
 * listed-not-walked branch could never fire from it — the two facts
 * it distinguishes were collapsed into one array. Listing comes from
 * the register's [first_seen, last_seen] window instead, and the
 * timeline says which record it came from.
 *
 * WHAT THIS REFUSES TO COMPUTE, and it is the obvious feature: a
 * figure without its working. "Ready in 8 of 12 rounds" is one
 * division away; until 2026-09-02 rule 43 forbade the division by
 * name, and the amended rule permits it only with the rule it came
 * from, the denominator and the rows beside it (the passport tier is
 * that derivation; it lives on the passport, not here). The
 * transitions are published because each one is itself a dated
 * observation. A bare ratio is not, and no amount of it being useful
 * changes what it would be.
 */

export type GapReason =
  | "before_first_sighting"
  | "not_listed"
  | "listed_not_walked"
  | "possibly_beyond_cap"
  | "instrument_degraded";

export interface SubjectRound {
  sequence: number;
  week: string;
  taken_at: string;
  /** The corpus digest this sits inside — fetch it and check us. */
  digest: string;
  entry_url: string;
  /** A feed named it that round. */
  listed: boolean;
  /**
   * Where `listed` came from: the walked set inside the round itself,
   * or the population register's window around it. Absent when the
   * host was not listed at all that round.
   */
  listing_source?: "round" | "register";
  /** We actually knocked, so there is a verdict. */
  probed: boolean;
  /**
   * The exact door we knocked on. A host can serve several paid
   * resources, so "your endpoint failed" without the URL is a riddle
   * rather than a finding. Present only on a probed round — we cannot
   * name a door we never visited.
   */
  url?: string;
  verdict?: WardHostResult["verdict"];
  failed?: string[];
  advisories?: string[];
  /**
   * The door's own declared terms that round, from its 402 — rails
   * and USDC price bounds only. No payment address rides here (G2
   * ruling: verbatim addresses stay out of derived cross-host
   * surfaces; the address digest already has its own lane).
   */
  offer?: { networks: string[]; min_usdc?: number; max_usdc?: number };
  /** Which feed named it: discovery, leaderboard, or both. */
  source?: string;
  gap?: GapReason;
  /**
   * Our coverage that round was suspect FOR THIS HOST (2026-09-02, the
   * passport tier): we did not observe it and the round itself
   * recorded capped, suspect or collapsed coverage, or the instrument
   * was degraded on this row. Chain-derived from the round's own flags,
   * never from the register, so the per-host tier and the tier index
   * read the same fact. False on every observed round.
   */
  coverage_suspect: boolean;
  /** Plain language, always present, including on observed rounds. */
  note: string;
}

export interface VerdictChange {
  at: string;
  week: string;
  from: WardHostResult["verdict"];
  to: WardHostResult["verdict"];
}

export interface SubjectHistory {
  host: string;
  asked_at: string;
  /** The forwarding pointer to the corrections desk — every evidence
   * surface carries it (test/corrections-forwarding.spec.ts). */
  corrections: string;
  /** The host's own standing note (G2 ruling §5), when one is attached. */
  standing_note?: StandingNote;
  /** T2 (G2 ruling): this door's own shared-wallet fact. Absent when
   * the chain never met the host. */
  payment_address?: HostWalletFact;
  /** The enumeration layer's record. Null if never enumerated. */
  listing: PopulationRecord | null;
  rounds_in_chain: number;
  /** Rounds since first sighting — the only fair denominator. */
  rounds_since_first_sighting: number;
  rounds_probed: number;
  rounds_gapped: number;
  /**
   * OUR coverage of this subject, not a statement about the subject:
   * how much of the window since we met it we actually walked.
   */
  observation_coverage_pct: number | null;
  first_observed: string | null;
  last_observed: string | null;
  gaps_by_reason: Record<GapReason, number>;
  verdict_changes: VerdictChange[];
  timeline: SubjectRound[];
  what_this_cannot_see: string[];
}

function emptyGaps(): Record<GapReason, number> {
  return {
    before_first_sighting: 0,
    not_listed: 0,
    listed_not_walked: 0,
    possibly_beyond_cap: 0,
    instrument_degraded: 0,
  };
}

export async function subjectHistory(
  env: Env,
  rawHost: string,
  base: string,
  now: Date = new Date(),
): Promise<SubjectHistory> {
  const host = rawHost.trim().toLowerCase();
  const [records, listing] = await Promise.all([
    listCorpus(env),
    populationHistory(env, host),
  ]);

  /*
   * First sighting from BOTH records, earliest wins. The chain reaches
   * further back; the register covers hosts the chain's sample never
   * had a slot for. Anything before the earlier of the two is not a
   * miss, and counting it as one would make a host we met last month
   * look like one we had been failing to watch all year. Counting the
   * other way — stamping "we had not met" on a host the register has
   * listed since the 11th — is the same lie pointed at ourselves.
   */
  const chainFirstSequence =
    records.find((record) =>
      record.snapshot.round.hosts.some((entry) => entry.host === host),
    )?.snapshot.sequence ?? null;
  const registerFirstSeen = listing?.first_seen ?? null;

  /*
   * The chain side compares by SEQUENCE, not timestamp. Two rounds
   * frozen inside the same millisecond compare equal as strings, and
   * an ordering that can tie is not an ordering. Sequence cannot tie.
   */
  const metByThen = (snapshot: { sequence: number; taken_at: string }): boolean =>
    (chainFirstSequence !== null && snapshot.sequence >= chainFirstSequence) ||
    (registerFirstSeen !== null && registerFirstSeen <= snapshot.taken_at);

  const timeline: SubjectRound[] = [];
  const gaps = emptyGaps();
  const changes: VerdictChange[] = [];
  let probed = 0;
  let firstObserved: string | null = null;
  let lastObserved: string | null = null;
  let previousVerdict: WardHostResult["verdict"] | null = null;

  for (const record of records) {
    const { snapshot, digest } = record;
    const round = snapshot.round;
    const common = {
      sequence: snapshot.sequence,
      week: snapshot.week,
      taken_at: snapshot.taken_at,
      digest,
      entry_url: `${base}/corpus/${snapshot.sequence}.json`,
    };
    const entry = round.hosts.find((candidate) => candidate.host === host);

    /*
     * OUR BLIND WEEK IS NOT THEIR VERDICT (the instrument audit,
     * 2026-08-28). An unreachable row whose observer_status is
     * "degraded" means the probe's own control beacon failed in the
     * same tick — the row's contract forbids counting it against the
     * host or as coverage. This history counted it as a probed round
     * and published `ready → unreachable` — in a signed, sold
     * artifact — as the subject's change. It books below as an
     * instrument_degraded gap instead, and the verdict thread runs
     * across it untouched.
     */
    const degradedRow =
      entry !== undefined &&
      entry.verdict === "unreachable" &&
      entry.observer_status === "degraded";

    if (entry && entry.verdict !== "not_probed" && !degradedRow) {
      probed += 1;
      firstObserved ??= snapshot.taken_at;
      lastObserved = snapshot.taken_at;
      if (previousVerdict !== null && previousVerdict !== entry.verdict) {
        changes.push({
          at: snapshot.taken_at,
          week: snapshot.week,
          from: previousVerdict,
          to: entry.verdict,
        });
      }
      previousVerdict = entry.verdict;
      timeline.push({
        ...common,
        /*
         * LEDGER H2 (2026-08-24). This was `listed: true` on every
         * probed row. A `revisit` row means — in the door bank's own
         * words — "no feed named it THIS round": the probe walked a
         * resource URL a PAST discovery round declared, to keep
         * breadth when a feed's coverage was suspect.
         *
         * So a host delisted from every directory but still in the
         * bank read as continuously listed in its own history. PROBED
         * was being converted into LISTED, which is the same
         * substitution this file was caught making in the other
         * direction the same day. Whether a feed named a host is a
         * fact about the DIRECTORIES; our decision to keep knocking
         * must not be published as their decision to keep listing.
         */
        listed: entry.source !== "revisit",
        ...(entry.source !== "revisit"
          ? { listing_source: "round" as const }
          : {}),
        probed: true,
        coverage_suspect: false,
        url: entry.url,
        verdict: entry.verdict,
        failed: entry.failed,
        advisories: entry.advisories,
        ...(entry.offer
          ? {
              offer: {
                networks: entry.offer.networks,
                ...(entry.offer.min_usdc !== undefined
                  ? { min_usdc: entry.offer.min_usdc }
                  : {}),
                ...(entry.offer.max_usdc !== undefined
                  ? { max_usdc: entry.offer.max_usdc }
                  : {}),
              },
            }
          : {}),
        ...(entry.source ? { source: entry.source } : {}),
        note:
          entry.verdict === "ready"
            ? "One GET at this moment passed every check in the published battery. It says nothing about the minute before or after."
            : `One GET at this moment: ${entry.verdict}${entry.failed.length > 0 ? ` (${entry.failed.join(", ")})` : ""}.`,
      });
      continue;
    }

    /*
     * Listed that round, by either record. round.hosts holds what the
     * round WALKED, so on its own it can only ever say "walked"; the
     * register's window is what actually answers "did we know of it".
     */
    // H2's rule holds here too: a revisit row was walked from the
    // door bank, not named by a feed, so it is not "listed".
    const listedInRound = Boolean(entry) && entry?.source !== "revisit";
    const listedInRegister =
      listing !== null &&
      listing.first_seen <= snapshot.taken_at &&
      snapshot.taken_at <= listing.last_seen;
    const listedThatRound = listedInRound || listedInRegister;

    let gap: GapReason;
    let note: string;
    if (degradedRow) {
      gap = "instrument_degraded";
      note =
        "We knocked, and our own control beacon failed in the same tick: our vantage was blind, and an 'unreachable' seen from a blind vantage is not an observation of this host. Counted against us, not them.";
    } else if (!metByThen(snapshot)) {
      gap = "before_first_sighting";
      note = "This round predates our first sight of this host. Not a miss — we had not met.";
    } else if (listedThatRound) {
      gap = "listed_not_walked";
      note =
        "Named by a feed this round but not knocked on. Enumeration is nearly free and probing is not, so being listed is the cheaper half of what we know.";
    } else if (round.capped) {
      gap = "possibly_beyond_cap";
      note =
        "The round hit its host cap, so this host may have been in the tail it never reached. We cannot tell which, and will not guess.";
    } else if (round.coverage_suspect || round.coverage_drop) {
      gap = "instrument_degraded";
      note =
        "The round recorded coverage trouble of its own. An absence here is more plausibly our instrument than this host.";
    } else {
      gap = "not_listed";
      note =
        "No feed we read named this host that round. That is a fact about the DIRECTORIES — it is not 'went down' and it is not 'stopped taking payment'.";
    }
    gaps[gap] += 1;
    timeline.push({
      ...common,
      listed: listedThatRound,
      ...(listedThatRound
        ? { listing_source: listedInRound ? ("round" as const) : ("register" as const) }
        : {}),
      probed: false,
      coverage_suspect: roundCoverageSuspect(round) || degradedRow,
      ...(entry?.source ? { source: entry.source } : {}),
      gap,
      note,
    });
  }

  const sinceFirst = records.filter((record) =>
    metByThen(record.snapshot),
  ).length;
  const gapped = sinceFirst - probed;

  /**
   * T2 under the G2 ruling (2026-08-27): this door's own wallet fact
   * — its advertised address also receives at N OTHER doors — on its
   * own page and nowhere else. No other door is named; the caveat
   * rides inline; a round that captured no address says NOT_CAPTURED
   * rather than zero. Absent entirely when the chain never met the
   * host, because there is no observation to state.
   */
  const paymentAddress = await sharedWalletFactFor(records, host);

  /**
   * STANDING NOTES (G2 ruling §5) ride here: the host's own note at
   * the top level, the wallet's note beside the wallet fact it is
   * about. Their words BESIDE ours — the observation fields above and
   * below are never altered by either.
   */
  const { hostNote, walletNote } = await notesForHost(env, records, host);
  if (paymentAddress && walletNote) {
    paymentAddress.standing_note = walletNote;
  }

  return {
    host,
    asked_at: now.toISOString(),
    corrections: CORRECTIONS_POINTER,
    ...(hostNote ? { standing_note: hostNote } : {}),
    ...(paymentAddress ? { payment_address: paymentAddress } : {}),
    listing,
    rounds_in_chain: records.length,
    rounds_since_first_sighting: sinceFirst,
    rounds_probed: probed,
    rounds_gapped: gapped,
    observation_coverage_pct:
      sinceFirst === 0 ? null : Math.round((probed / sinceFirst) * 1000) / 10,
    first_observed: firstObserved,
    last_observed: lastObserved,
    gaps_by_reason: gaps,
    verdict_changes: changes,
    timeline,
    what_this_cannot_see: [
      "Anything between rounds. The cadence is weekly, so a host that broke on Tuesday and was fixed by Saturday is invisible here and always will be.",
      "Why a verdict changed. We record what a probe saw, never the cause.",
      "Whether an absence is the host's doing or ours. That is what `gap` is for: read the reason, not the blank.",
      "A bare figure, and this is a refusal rather than a limitation. Dividing rounds-ready by rounds-probed and printing the quotient alone would be a verdict without its derivation, which the house sentence forbids. Every dated observation is here; a derived reading of them is published elsewhere only with its rule, its denominator and its rows.",
      "Anything before the corpus started. The chain is the record, and it does not reach back further than its first entry.",
      "Listing history before the population register existed. `listing` began with the population layer, so on rounds older than the register the timeline can only draw on the chain — and the chain only records the hosts a round WALKED. A `not_listed` on one of those rounds may be an unrecorded listing.",
      "Whether a host listed on the register's first day had been listed earlier. `first_seen` is when the register met it, not when the world did.",
    ],
  };
}
