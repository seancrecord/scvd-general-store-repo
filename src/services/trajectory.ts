import { catalogAgreementOf, catalogMeasured, type CatalogAgreement } from "@/services/catalog-agreement";
import type { CorpusRecord } from "@/services/corpus";
import type { WardHostResult } from "@/services/ward-round";

/**
 * DERIVED VIEWS OVER THE CORPUS CHAIN (roadmap 3.5 — ledger G5, J2, M3).
 *
 * The chain already holds the history: one signed snapshot per week,
 * every host the round met, verbatim. What nobody could do was read
 * the history AS history. This module is that reading, and it obeys
 * one law with no exceptions: every number here is DERIVED, at read,
 * from the signed snapshots and nothing else. No stored aggregates
 * that could drift from their source, no inputs the chain does not
 * carry, and every point names the digest it came from — a stranger
 * with /corpus/N.json and their own tools reproduces this entire
 * surface byte for byte, which is the only sense in which a
 * time-series from a party with something to sell deserves belief.
 *
 * DENOMINATORS ALWAYS; NO RATIOS. A percentage with a hidden
 * denominator is how a market lies. This surface serves counts and
 * the denominators they live over; a reader who wants a ratio divides
 * two named numbers and knows exactly what was divided.
 *
 * M3 is also the state-of-the-market reporting asset: the weekly
 * artifact quoted in prose is this data, not a parallel set of
 * numbers that could disagree with it.
 */

export interface WeekPoint {
  week: string;
  /** The chain position and digest of the signed snapshot this point
   * derives from — the re-derivation handle. */
  sequence: number;
  digest: string;
  taken_at: string;
  /** The denominator: every host the round's feeds named. */
  hosts_listed: number;
  /** Hosts actually knocked on — the observation denominator. */
  hosts_probed: number;
  /**
   * Which battery the week's probed rows cite (the instrument audit,
   * 2026-08-28 — the RAIL_BASIS law applied to verdicts). The
   * criteria changed 2026-08-24 and 2026-08-26 with no marker on
   * this series, so a ready-count drop at a boundary read as market
   * decay. "mixed" when rows disagree; absent when no probed row
   * states one (pre-2026-08-26 weeks — those verdicts were rendered
   * under criteria the rows do not name, and comparing them across
   * weeks compares rulers as much as doors).
   */
  battery?: string;
  ready: number;
  not_ready: number;
  /**
   * Subject-attributed only (3.4): a tick where OUR vantage was blind
   * — observer_status "degraded" — is not anyone's outage and counts
   * below under its own name, never here.
   */
  unreachable: number;
  not_probed: number;
  observer_degraded: number;
  /** Hosts whose 402 carried a parseable offer this week. */
  offers_seen: number;
  /** Doors per chain, from each offer's own declared networks. */
  networks: Record<string, number>;
  /** Failed-check names, counted by their registered check IDs. */
  failure_classes: Record<string, number>;
  /** The round said its own coverage was suspect; carried, not hidden. */
  coverage_suspect: boolean;
  /**
   * The discovery catalog's copy against the doors (S8 Tier C),
   * counted from the rows: compared is the denominator (agrees +
   * differs); listed-bare and no-challenge rows sit under
   * not_comparable. Absent on weeks before the column, so a reader
   * treats missing as "not measured", never as full agreement.
   */
  catalog?: CatalogAgreement;
}

export interface Trajectory {
  weeks: WeekPoint[];
  what_this_is: string;
  nothing_claimed_between_snapshots: string;
}

export interface DriftFact {
  host: string;
  field: "min_usdc" | "max_usdc" | "networks" | "schemes";
  from: unknown;
  to: unknown;
}

export interface WeekDiff {
  from: { week: string; sequence: number; digest: string };
  to: { week: string; sequence: number; digest: string };
  /**
   * Hosts a FEED newly named or dropped (the instrument audit,
   * 2026-08-28). Revisit rows — "no feed named it THIS round", the
   * door bank's rotating cursor — are excluded on both sides, or the
   * instrument's own cursor motion publishes as the ecosystem
   * churning; the private wardDelta always filtered them, and the
   * public surface sold as "act on transitions" did not.
   */
  appeared: string[];
  disappeared: string[];
  /**
   * Verdict changes between two weeks a host was PROBED in both.
   * not_probed rows are population, not observations — a host moving
   * between feeds used to publish "ready → not_probed" here as if
   * the door had changed. `battery_changed` marks a transition
   * across a criteria boundary (the rows cite different batteries),
   * where the change may be the ruler's, not the door's.
   */
  transitions: {
    host: string;
    from: string;
    to: string;
    battery_changed?: true;
  }[];
  /**
   * G5 — drift, minted as dated facts at last: changes in a door's
   * own declared terms between two signed weeks. Derived
   * retroactively, which is exactly why it could wait for this row
   * while the capture-only fields (G3/G4) could not.
   */
  drift: DriftFact[];
  /** The denominators the lists above live over. */
  hosts_in_from: number;
  hosts_in_to: number;
  hosts_in_both: number;
}

function hostsOf(record: CorpusRecord): WardHostResult[] {
  return (record.snapshot.round.hosts ?? []) as WardHostResult[];
}

function isDegraded(host: WardHostResult): boolean {
  return (
    host.verdict === "unreachable" &&
    (host as { observer_status?: string }).observer_status === "degraded"
  );
}

export function deriveTrajectory(records: CorpusRecord[]): Trajectory {
  const weeks = records.map((record): WeekPoint => {
    const hosts = hostsOf(record);
    const point: WeekPoint = {
      week: record.snapshot.week,
      sequence: record.snapshot.sequence,
      digest: record.digest,
      taken_at: record.snapshot.taken_at,
      hosts_listed: record.snapshot.round.listed_resources ?? hosts.length,
      hosts_probed: 0,
      ready: 0,
      not_ready: 0,
      unreachable: 0,
      not_probed: 0,
      observer_degraded: 0,
      offers_seen: 0,
      networks: {},
      failure_classes: {},
      coverage_suspect: record.snapshot.round.coverage_suspect === true,
    };
    const batteries = new Set<string>();
    for (const host of hosts) {
      if (host.verdict === "not_probed") {
        point.not_probed += 1;
        continue;
      }
      point.hosts_probed += 1;
      if (host.battery) batteries.add(host.battery);
      if (isDegraded(host)) {
        point.observer_degraded += 1;
      } else if (host.verdict === "ready") {
        point.ready += 1;
      } else if (host.verdict === "not_ready") {
        point.not_ready += 1;
      } else if (host.verdict === "unreachable") {
        point.unreachable += 1;
      }
      if (host.offer) {
        point.offers_seen += 1;
        for (const network of host.offer.networks ?? []) {
          point.networks[network] = (point.networks[network] ?? 0) + 1;
        }
      }
      for (const name of host.failed ?? []) {
        point.failure_classes[name] = (point.failure_classes[name] ?? 0) + 1;
      }
    }
    if (batteries.size === 1) {
      point.battery = [...batteries][0]!;
    } else if (batteries.size > 1) {
      point.battery = "mixed";
    }
    if (catalogMeasured(hosts)) {
      point.catalog = catalogAgreementOf(hosts);
    }
    return point;
  });
  return {
    weeks,
    what_this_is:
      "The corpus chain read as time: one point per signed weekly snapshot, every count derived at read from the snapshot's own rows. Each point names its snapshot's digest; fetch /corpus/{sequence}.json, recount with your own tools, and this surface owes you nothing on trust.",
    nothing_claimed_between_snapshots:
      "One snapshot per week, and NOTHING is claimed between snapshots: a door can appear, break and vanish inside a week without a trace here. Counts come with their denominators (hosts_listed, hosts_probed); no ratio is served anywhere, because a percentage with a hidden denominator is how a market lies.",
  };
}

/**
 * The since-diff (J2): the cheapest real agent loop is "poll the
 * diff, act on transitions", and until now the transitions existed
 * only as arithmetic a caller had to do across two full snapshots.
 * `since` names a week already in the chain; the comparison is always
 * against the LATEST entry. Null when the week is not in the chain —
 * a lookup that cannot see the week must not invent a baseline
 * (rule 52).
 */
export function deriveDiff(
  records: CorpusRecord[],
  sinceWeek: string,
): WeekDiff | null {
  if (records.length === 0) return null;
  const from = records.find((record) => record.snapshot.week === sinceWeek);
  if (!from) return null;
  const to = records[records.length - 1]!;
  if (from.snapshot.sequence === to.snapshot.sequence) {
    // Diffing the latest week against itself: a week we CAN see gets
    // an answer (rule 52 cuts both ways), and the honest answer is
    // "nothing changed between this snapshot and this snapshot".
    return {
      from: refOf(from),
      to: refOf(to),
      appeared: [],
      disappeared: [],
      transitions: [],
      drift: [],
      hosts_in_from: hostsOf(from).length,
      hosts_in_to: hostsOf(to).length,
      hosts_in_both: hostsOf(from).length,
    };
  }

  const fromHosts = new Map(hostsOf(from).map((host) => [host.host, host]));
  const toHosts = new Map(hostsOf(to).map((host) => [host.host, host]));

  /*
   * The instrument's own motion is not the ecosystem's (2026-08-28).
   * A revisit row means no feed named the host THIS round — the door
   * bank walked it from an earlier listing — so its presence in a
   * week says nothing about anybody listing or dropping anything.
   * wardDelta's comments named this exact failure; the public diff
   * never inherited the filter.
   */
  const listedIn = (hosts: Map<string, WardHostResult>): Set<string> =>
    new Set(
      [...hosts.values()]
        .filter((host) => host.source !== "revisit")
        .map((host) => host.host),
    );
  const fromListed = listedIn(fromHosts);
  const toListed = listedIn(toHosts);
  const appeared = [...toListed].filter((host) => !fromListed.has(host));
  const disappeared = [...fromListed].filter((host) => !toListed.has(host));

  const transitions: WeekDiff["transitions"] = [];
  const drift: DriftFact[] = [];
  for (const [name, was] of fromHosts) {
    const now = toHosts.get(name);
    if (!now) continue;
    if (
      was.verdict !== now.verdict &&
      // not_probed is population, not an observation: no probe ran.
      was.verdict !== "not_probed" &&
      now.verdict !== "not_probed" &&
      !isDegraded(now) &&
      !isDegraded(was)
    ) {
      const batteryChanged =
        was.battery !== undefined &&
        now.battery !== undefined &&
        was.battery !== now.battery;
      transitions.push({
        host: name,
        from: was.verdict,
        to: now.verdict,
        ...(batteryChanged ? { battery_changed: true as const } : {}),
      });
    }
    const before = was.offer;
    const after = now.offer;
    if (before && after) {
      for (const field of ["min_usdc", "max_usdc"] as const) {
        if (before[field] !== after[field] && (before[field] !== undefined || after[field] !== undefined)) {
          drift.push({ host: name, field, from: before[field], to: after[field] });
        }
      }
      for (const field of ["networks", "schemes"] as const) {
        const a = [...(before[field] ?? [])].sort().join(",");
        const b = [...(after[field] ?? [])].sort().join(",");
        if (a !== b) {
          drift.push({ host: name, field, from: before[field], to: after[field] });
        }
      }
    }
  }

  return {
    from: refOf(from),
    to: refOf(to),
    appeared,
    disappeared,
    transitions,
    drift,
    hosts_in_from: fromHosts.size,
    hosts_in_to: toHosts.size,
    hosts_in_both: [...fromHosts.keys()].filter((host) => toHosts.has(host)).length,
  };
}

function refOf(record: CorpusRecord): { week: string; sequence: number; digest: string } {
  return {
    week: record.snapshot.week,
    sequence: record.snapshot.sequence,
    digest: record.digest,
  };
}
