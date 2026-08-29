import type { CorpusRecord } from "@/services/corpus";

/**
 * EVERY DOOR WE HAVE EVER LOOKED AT, ENUMERATED (#26, 2026-08-29).
 *
 * THE GAP THIS CLOSES, AND IT WAS NOT THE GAP THE TASK DESCRIBED.
 * #26 asks for "every endpoint we checked, machine-readable", and
 * the first reading of the shelf said that was long done: the corpus
 * publishes as JSON, per-host histories serve at
 * /corpus/host/{host}.json, trajectory and diff and battery-delta all
 * answer at their own doors. That reading was wrong, and the way it
 * was wrong is the interesting part.
 *
 * /corpus.json indexes SNAPSHOTS — sequence, week, digest, host
 * counts. /corpus/host/{host}.json is a TEMPLATE. Between them there
 * was no way to answer "which hosts do you have?" A caller could
 * fetch every snapshot and union the rows itself, which is a real
 * path and is why nothing here was hidden — but the store's own
 * rule 57.4 asks whether a small model completes the call on the
 * first try, and "download the whole chain and fold it" is not that.
 * The census had hundreds of subjects and no index of them.
 *
 * WHAT THIS IS NOT, and the line is the store's oldest one. This is
 * not a scoreboard. There is no ratio here, no standing, no ordering
 * by quality: every entry carries ONE dated observation — the most
 * recent verdict and the week it was taken — exactly as
 * /corpus/host/{host}.json already serves it, and the list is
 * alphabetical. `rounds_scored` is published as a denominator so a
 * reader knows how much looking is behind an entry, and the ratio
 * that would turn it into a reliability figure is left undivided for
 * the same reason it is left undivided everywhere else here: it is a
 * score on an actor, and this store does not keep one.
 *
 * DERIVED AT READ, from signed rows, like every other view over the
 * chain. Nothing is stored, nothing is resigned, and a reader who
 * distrusts the fold can rebuild it from the entries themselves —
 * which is the whole point of publishing the recipe beside it.
 */

/** One host, as the chain has seen it. */
export interface DoorIndexEntry {
  host: string;
  /** Week of the earliest round that carried this host at all. */
  first_seen: string;
  /** Week of the most recent round that carried it at all. */
  last_seen: string;
  /** Rounds this host appeared in, probed or merely listed. */
  rounds_present: number;
  /**
   * Rounds that reached a real verdict (ready / not_ready). The
   * denominator, published so an entry's weight is legible — never
   * divided into anything.
   */
  rounds_scored: number;
  /** The most recent verdict of any kind, and when it was taken. */
  latest_verdict: string;
  latest_verdict_week: string;
  latest_verdict_sequence: number;
  /** The check names that failed at that observation, verbatim. */
  latest_failed: readonly string[];
  /** The full replayed history for this host. */
  url: string;
}

export interface DoorIndex {
  hosts: DoorIndexEntry[];
  /** Distinct hosts the chain has ever carried. */
  total_hosts: number;
  /**
   * How many hosts carry each latest-verdict value. A census of
   * observations, not a league table: the same host moves between
   * these buckets week to week and the bucket is only ever the last
   * thing one probe saw.
   */
  by_latest_verdict: Record<string, number>;
  /** Signed weeks the fold read. */
  weeks_read: number;
  latest_week: string | null;
}

/** Verdicts that mean a battery actually ran and reached a conclusion. */
const SCORED = new Set(["ready", "not_ready"]);

interface Row {
  host?: unknown;
  verdict?: unknown;
  failed?: unknown;
}

/**
 * Fold the signed chain into one entry per host.
 *
 * Records are read in the order given and the LAST occurrence of a
 * host wins its `latest_*` fields, so the caller must pass them in
 * chain order (ascending sequence) — the same order listCorpus
 * returns and the same order every other view here assumes. Passing
 * them shuffled would quietly publish an old verdict as the current
 * one, which is the failure mode most worth naming out loud in a
 * file whose entire product is dates.
 */
export function deriveDoorIndex(records: readonly CorpusRecord[]): DoorIndex {
  const byHost = new Map<string, DoorIndexEntry>();
  let latestWeek: string | null = null;

  for (const record of records) {
    const week = record.snapshot.week;
    const sequence = record.snapshot.sequence;
    latestWeek = week;
    const rows = (record.snapshot.round.hosts ?? []) as Row[];
    for (const row of rows) {
      const host = typeof row.host === "string" ? row.host : "";
      if (!host) continue;
      const verdict = typeof row.verdict === "string" ? row.verdict : "not_probed";
      const failed = Array.isArray(row.failed)
        ? row.failed.filter((name): name is string => typeof name === "string")
        : [];
      const existing = byHost.get(host);
      if (!existing) {
        byHost.set(host, {
          host,
          first_seen: week,
          last_seen: week,
          rounds_present: 1,
          rounds_scored: SCORED.has(verdict) ? 1 : 0,
          latest_verdict: verdict,
          latest_verdict_week: week,
          latest_verdict_sequence: sequence,
          latest_failed: failed,
          url: `/corpus/host/${host}.json`,
        });
        continue;
      }
      existing.last_seen = week;
      existing.rounds_present += 1;
      if (SCORED.has(verdict)) existing.rounds_scored += 1;
      existing.latest_verdict = verdict;
      existing.latest_verdict_week = week;
      existing.latest_verdict_sequence = sequence;
      existing.latest_failed = failed;
    }
  }

  /*
   * ALPHABETICAL, AND THAT IS A RULING NOT A DEFAULT. Any other
   * order here is an editorial claim about which door matters most,
   * and the store has spent a year refusing to make that claim. A
   * reader who wants a different order has the whole list.
   */
  const hosts = [...byHost.values()].sort((a, b) => (a.host < b.host ? -1 : 1));

  const byLatestVerdict: Record<string, number> = {};
  for (const entry of hosts) {
    byLatestVerdict[entry.latest_verdict] =
      (byLatestVerdict[entry.latest_verdict] ?? 0) + 1;
  }

  return {
    hosts,
    total_hosts: hosts.length,
    by_latest_verdict: byLatestVerdict,
    weeks_read: records.length,
    latest_week: latestWeek,
  };
}
