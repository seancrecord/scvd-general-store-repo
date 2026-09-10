import { citeBlock } from "@/lib/cite";
import type { CorpusRecord } from "@/services/corpus";
import { digestsOf } from "@/services/operator-facts";
import { diffRecords } from "@/services/trajectory";
import type { WardHostResult } from "@/services/ward-round";
import { NEVER_A_RANKING_SENTENCE } from "@/store/copy/doctrine";

/**
 * THE CHANGES, WEEK BY WEEK (roadmap C6, 2026-09-04): one signed week
 * against the one before it, as plain fields a subscriber can act on
 * — additions, removals, recoveries, regressions, changed payment
 * routes, changed prices, changed defect state — and a plain-English
 * changelog derived from the same fields. Derived at read from the
 * two snapshots, never stored; every line names the rows it came from
 * by sequence so a reader can redo the comparison. Counts travel with
 * their denominators. Never a ranking.
 */

export interface DefectStateChange {
  host: string;
  /** Check names failing this week that were not failing last week. */
  added: string[];
  /** Check names failing last week that are not failing this week. */
  cleared: string[];
}

export interface WeekChanges {
  artifact: "corpus_changes";
  week: string;
  sequence: number;
  digest: string;
  taken_at: string;
  previous: { week: string; sequence: number; digest: string } | null;
  additions: string[];
  removals: string[];
  recoveries: { host: string; from: string; to: "ready" }[];
  regressions: { host: string; from: "ready"; to: string }[];
  changed_payment_routes: { host: string; field: "networks" | "schemes"; from: unknown; to: unknown }[];
  changed_prices: { host: string; field: "min_usdc" | "max_usdc"; from: unknown; to: unknown }[];
  /**
   * WHERE A DOOR ASKS TO BE PAID, WEEK AGAINST WEEK (2026-09-10). The
   * one change a buyer must know before paying: the receiving
   * address moved between two signed observations, which is the
   * shape of a hijacked door as much as of a rotated wallet. This
   * feed cannot tell which — it says the set differed, and names the
   * rows. Addresses ride as the salted, publicly recomputable digests
   * the sealed rows carry (the G2 ruling: never verbatim in a derived
   * view); a reader holding the address recomputes the digest and
   * matches. Rule 52: a week that captured no address is not a
   * change — only hosts captured in BOTH weeks are compared, and
   * `pay_to_compared` is that denominator.
   */
  changed_pay_to: PayToChange[];
  pay_to_compared: number;
  changed_defect_state: DefectStateChange[];
  changelog: string[];
  hosts_in_week: number;
  hosts_in_previous: number;
  hosts_in_both: number;
  what_this_is_not: string;
  how_to_rederive: string;
  cite: string;
  cite_format: string;
}

export interface PayToChange {
  host: string;
  /** Digests observed last week, sorted. */
  from: string[];
  /** Digests observed this week, sorted. */
  to: string[];
  /** Digests in both sets: a door that ADDED an address keeps its old one here. */
  in_common: number;
}

function sameSet(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

/**
 * Pure over two rounds' rows: every host captured in both whose
 * digest set differed, with the denominator. Async only because a
 * pre-ruling row digests its verbatim address at read.
 */
export async function payToChanges(
  from: WardHostResult[],
  to: WardHostResult[],
): Promise<{ changes: PayToChange[]; compared: number }> {
  const before = new Map(from.map((h) => [h.host, h]));
  const changes: PayToChange[] = [];
  let compared = 0;
  for (const now of to) {
    const was = before.get(now.host);
    if (!was) continue;
    const [fromDigests, toDigests] = await Promise.all([digestsOf(was), digestsOf(now)]);
    if (fromDigests.length === 0 || toDigests.length === 0) continue;
    compared += 1;
    const a = [...new Set(fromDigests)].sort();
    const b = [...new Set(toDigests)].sort();
    if (sameSet(a, b)) continue;
    const common = new Set(a);
    changes.push({ host: now.host, from: a, to: b, in_common: b.filter((d) => common.has(d)).length });
  }
  return { changes, compared };
}

function hostsOf(record: CorpusRecord): WardHostResult[] {
  return (record.snapshot.round.hosts ?? []) as WardHostResult[];
}

function plural(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

export async function deriveChanges(records: CorpusRecord[], week: string, base: string): Promise<WeekChanges | null> {
  const index = records.findIndex((record) => record.snapshot.week === week);
  if (index === -1) return null;
  const to = records[index]!;
  const from = index > 0 ? records[index - 1]! : null;
  const ref = (record: CorpusRecord) => ({ week: record.snapshot.week, sequence: record.snapshot.sequence, digest: record.digest });
  const cite = citeBlock({ base, what: "corpus changes, week", which: `${week} (snapshot ${to.snapshot.sequence})`, observed_at: to.snapshot.taken_at, url: `${base}/corpus/changes/${week}.json`, verify_url: `${base}/corpus/${to.snapshot.sequence}.json` });
  const common = {
    artifact: "corpus_changes" as const,
    week,
    sequence: to.snapshot.sequence,
    digest: to.digest,
    taken_at: to.snapshot.taken_at,
    what_this_is_not: `${NEVER_A_RANKING_SENTENCE} A change here is two dated observations a week apart, one instrument, one vantage; nothing is claimed about the days between, and a host absent from a round was unlisted, beyond the round's caps, or dropped by our own coverage — the rounds say which. A changed pay-to is a changed set of address digests between the two rounds, compared only where both captured one; it is not a finding of compromise, and the verbatim addresses are not published here.`,
    ...cite,
  };
  if (!from) {
    return {
      ...common,
      previous: null,
      additions: [],
      removals: [],
      recoveries: [],
      regressions: [],
      changed_payment_routes: [],
      changed_prices: [],
      changed_pay_to: [],
      pay_to_compared: 0,
      changed_defect_state: [],
      changelog: [`${week} is the first signed week in the chain (snapshot ${to.snapshot.sequence}); there is no earlier week to compare it with.`],
      hosts_in_week: hostsOf(to).length,
      hosts_in_previous: 0,
      hosts_in_both: 0,
      how_to_rederive: `Fetch ${base}/corpus/${to.snapshot.sequence}.json; it is the first snapshot, so there is nothing to diff.`,
    };
  }
  const diff = diffRecords(from, to);
  const recoveries = diff.transitions.filter((t) => t.to === "ready").map((t) => ({ host: t.host, from: t.from, to: "ready" as const }));
  const regressions = diff.transitions.filter((t) => t.from === "ready").map((t) => ({ host: t.host, from: "ready" as const, to: t.to }));
  const changedRoutes = diff.drift.filter((d): d is typeof d & { field: "networks" | "schemes" } => d.field === "networks" || d.field === "schemes");
  const changedPrices = diff.drift.filter((d): d is typeof d & { field: "min_usdc" | "max_usdc" } => d.field === "min_usdc" || d.field === "max_usdc");
  const payTo = await payToChanges(hostsOf(from), hostsOf(to));
  const before = new Map(hostsOf(from).map((h) => [h.host, h]));
  const defectState: DefectStateChange[] = [];
  for (const now of hostsOf(to)) {
    const was = before.get(now.host);
    if (!was || was.verdict === "not_probed" || now.verdict === "not_probed") continue;
    const wasFailed = new Set(was.failed ?? []);
    const nowFailed = new Set(now.failed ?? []);
    const added = [...nowFailed].filter((name) => !wasFailed.has(name)).sort();
    const cleared = [...wasFailed].filter((name) => !nowFailed.has(name)).sort();
    if (added.length > 0 || cleared.length > 0) defectState.push({ host: now.host, added, cleared });
  }
  const changelog: string[] = [];
  changelog.push(`${week} (snapshot ${to.snapshot.sequence}) against ${from.snapshot.week} (snapshot ${from.snapshot.sequence}): ${plural(diff.hosts_in_to, "host")} this week, ${plural(diff.hosts_in_from, "host")} last week, ${plural(diff.hosts_in_both, "host")} in both.`);
  if (diff.appeared.length > 0) changelog.push(`Newly listed by a feed: ${diff.appeared.join(", ")}.`);
  if (diff.disappeared.length > 0) changelog.push(`No longer listed by any feed: ${diff.disappeared.join(", ")}.`);
  for (const r of recoveries) changelog.push(`${r.host} answered ready this week after ${r.from} last week.`);
  for (const r of regressions) changelog.push(`${r.host} answered ${r.to} this week after ready last week.`);
  for (const d of changedRoutes) changelog.push(`${d.host} changed its ${d.field}: ${JSON.stringify(d.from ?? null)} to ${JSON.stringify(d.to ?? null)}.`);
  for (const d of changedPrices) changelog.push(`${d.host} changed its ${d.field}: ${JSON.stringify(d.from ?? null)} to ${JSON.stringify(d.to ?? null)}.`);
  for (const d of payTo.changes) {
    changelog.push(
      `${d.host} changed where it asks to be paid: ${plural(d.from.length, "address digest")} last week, ${plural(d.to.length, "address digest")} this week, ${d.in_common} in common. Whether that is a rotated wallet or a hijacked door is not something two observations can say; a buyer holding the address recomputes the digest and matches.`,
    );
  }
  if (payTo.compared > 0 && payTo.changes.length === 0) {
    changelog.push(`Where doors ask to be paid: unchanged for every host captured in both weeks (${plural(payTo.compared, "host")} compared).`);
  }
  for (const d of defectState) {
    if (d.added.length > 0) changelog.push(`${d.host} now fails ${d.added.join(", ")}.`);
    if (d.cleared.length > 0) changelog.push(`${d.host} no longer fails ${d.cleared.join(", ")}.`);
  }
  if (changelog.length === 1) changelog.push("Nothing else changed between the two snapshots.");
  return {
    ...common,
    previous: ref(from),
    additions: diff.appeared,
    removals: diff.disappeared,
    recoveries,
    regressions,
    changed_payment_routes: changedRoutes.map((d) => ({ host: d.host, field: d.field, from: d.from, to: d.to })),
    changed_prices: changedPrices.map((d) => ({ host: d.host, field: d.field, from: d.from, to: d.to })),
    changed_pay_to: payTo.changes,
    pay_to_compared: payTo.compared,
    changed_defect_state: defectState,
    changelog,
    hosts_in_week: diff.hosts_in_to,
    hosts_in_previous: diff.hosts_in_from,
    hosts_in_both: diff.hosts_in_both,
    how_to_rederive: `Fetch ${base}/corpus/${from.snapshot.sequence}.json and ${base}/corpus/${to.snapshot.sequence}.json, compare the rounds' rows yourself, and check both digests against the chain.`,
  };
}

/** RFC 9110 Last-Modified for a corpus document: the snapshot's own taken_at. */
export function lastModifiedOf(takenAt: string | undefined): Record<string, string> {
  if (!takenAt) return {};
  const at = new Date(takenAt);
  return Number.isNaN(at.getTime()) ? {} : { "Last-Modified": at.toUTCString() };
}
