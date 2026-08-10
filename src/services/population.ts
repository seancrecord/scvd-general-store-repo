import { KV_KEYS } from "@/lib/kv-keys";
import type { Env } from "@/types";

/**
 * THE POPULATION LAYER — enumeration held apart from observation,
 * because the two cost wildly different amounts and we had been
 * conflating them.
 *
 * PROBING IS EXPENSIVE. One GET per host per week, capped at 200,
 * against a subrequest budget the audit script exists to police.
 *
 * COUNTING IS NEARLY FREE. A directory listing arrives in one fetch
 * and names every host in it. We do not have to probe a host to know
 * it EXISTS.
 *
 * Separating them buys three things the ward could not have on its own:
 *
 *   A DENOMINATOR. `population_walked / population_known` is our
 *   coverage, stated on the artifact next to the finding rather than
 *   left for a reader to wonder about. The same move as
 *   `days_unchecked` on the watch and `unclassified` on the sweep,
 *   applied to breadth instead of time.
 *
 *   MORTALITY WITHOUT A PROBE. A host that was listed and is now
 *   listed nowhere is a delisting we can record having never spent a
 *   request on it. That is most of the "activity outside the window"
 *   the weekly cadence cannot see, and it is the cheapest corpus
 *   volume available.
 *
 *   RESURRECTION. A host that comes back after being written off is a
 *   fact about the DIRECTORY at least as much as about the host, and
 *   nothing else we run would notice it.
 *
 * THE FAILURE MODE THIS IS BUILT AROUND, because it would poison the
 * corpus permanently: a directory that 500s makes every host in it
 * vanish at once. Recorded naively, one bad fetch writes a mass
 * extinction into a record that cannot be rewritten. So a source that
 * could not be read has its hosts CARRIED FORWARD rather than dropped,
 * and a union that collapses past the floor refuses to record any
 * disappearance at all that run. A missed delisting is recoverable
 * next week; a fabricated one is in the chain forever.
 */

/**
 * One directory's answer. `hosts: null` means the source could not be
 * READ — distinct from a source that answered with nothing, which is
 * a real (and alarming) observation about that directory.
 *
 * A PARTIAL read counts as unread. A page-capped listing cannot tell
 * "gone" from "on page two", and the ward already detects that shape
 * as `coverage_suspect`; passing such a read through as an answer is
 * exactly how the mass extinction gets written.
 */
export interface SourceResult {
  source: string;
  hosts: string[] | null;
}

/** What the population layer knows about one host, across all rounds. */
export interface PopulationRecord {
  first_seen: string;
  /**
   * The last round a source ACTUALLY listed this host.
   *
   * It used to advance on carry-forward too, which made it a lie: a
   * host kept alive because its directory went dark would report a
   * last_seen of this round, on a round where nobody saw it at all.
   * That field is published — `populationHistory` feeds the `listing`
   * block on /corpus/host/{host}.json — so the store was serving an
   * observation that never happened, which is the one thing this
   * whole file exists to refuse.
   */
  last_seen: string;
  /** Set while a host is only on the register by carry-forward. */
  carried_since?: string;
  /** Every directory that has ever listed it, for provenance. */
  sources: string[];
  /**
   * Set the round it stopped being listed anywhere we read; cleared if
   * it comes back. Its presence is what makes disappearance an EVENT
   * rather than a standing state re-reported every week forever.
   */
  gone_at?: string;
}

export interface PopulationCensus {
  at: string;
  /** The union across every source that answered, plus carry-forward. */
  population_known: number;
  /** How many of those the ward actually probed this round. */
  population_walked: number;
  /** walked / known, the number that belongs beside every verdict. */
  coverage_pct: number | null;
  per_source: { source: string; hosts: number | null }[];
  sources_failed: string[];
  /** Hosts kept alive on the register because their source went dark. */
  carried_forward: number;
  /**
   * NAME LISTS ARE CAPPED, COUNTS ARE EXACT. The census rides every
   * corpus snapshot verbatim, and the snapshot's own graduation
   * trigger is "when snapshots stop being weekly-and-small". The day
   * the ward widened to a ten-thousand-host directory (2026-08-10),
   * the first census would have written every one of them into
   * `appeared` — one round's event list becoming a permanent
   * megabyte in an append-only chain. So the lists carry the first
   * EVENT_LIST_CAP names and the `_count` fields carry the truth;
   * the register underneath still holds every host in full.
   */
  appeared: string[];
  /** Exact totals; the arrays above are capped. Absent on pre-cap rounds. */
  appeared_count?: number;
  /** Newly delisted this round — an event, raised once. */
  disappeared: string[];
  disappeared_count?: number;
  /** Listed again after having been written off. */
  returned: string[];
  returned_count?: number;
  /**
   * Set when the union fell past the floor against the last census.
   * Disappearances are suppressed for the run — see the header.
   */
  collapse_suspect: boolean;
  what_this_cannot_see: string[];
}

/**
 * The same 60% the ward already uses for `coverage_drop`. Reusing its
 * number rather than inventing a second one: two thresholds for the
 * same idea drift apart, and the ward's has precedent behind it.
 */
export const COLLAPSE_FLOOR = 0.6;

/** See PopulationCensus: names capped, counts exact. */
export const EVENT_LIST_CAP = 250;

type Register = Record<string, PopulationRecord>;

/**
 * The register plus the one number the floor is measured against.
 *
 * `last_known` IS THE PREVIOUS CENSUS'S COUNT, and it has to be, which
 * a test caught the hard way. Measuring the floor against the live
 * records instead makes suppression permanent: a suppressed round
 * writes nobody off, so the baseline never falls, so every later round
 * collapses against it too and a real contraction can never be
 * recorded at all.
 *
 * So the instrument gets ONE round of the benefit of the doubt. If the
 * union is still small next round, that is taken as the world rather
 * than the tooling. The cost of being wrong is bounded because
 * delisting is reversible here — a host that comes back is recorded as
 * `returned`, and its first_seen survives the gap.
 */
interface RegisterFile {
  hosts: Register;
  last_known: number;
}

async function readRegister(env: Env): Promise<RegisterFile> {
  const stored = await env.COUNTERS.get<Partial<RegisterFile>>(
    KV_KEYS.populationRegister,
    "json",
  );
  const hosts = stored?.hosts ?? {};
  return {
    hosts,
    last_known:
      typeof stored?.last_known === "number"
        ? stored.last_known
        : Object.values(hosts).filter((record) => !record.gone_at).length,
  };
}

/**
 * ONE HOST, ONE ENTRY. Lowercase and trim were not enough, and the gap
 * was live in our own ingest rather than hypothetical: ward-round
 * builds its host list from `new URL(url).host`, and `.host` KEEPS THE
 * PORT and PRESERVES A TRAILING DOT. So one seller reachable at
 * example.com, example.com. and example.com:8443 became three
 * register entries — three first_seens, three phantom appearances,
 * and a denominator inflated by duplicates of a single host.
 *
 * A trailing dot is the DNS root, valid and equivalent. A port is not
 * part of the host's identity for enumeration: we are counting who
 * exists, not which socket answered.
 */
function normalize(host: string): string {
  let name = host.trim().toLowerCase();
  /*
   * Strip the port, but only where it cannot be part of an IPv6
   * literal — "[::1]:443" has colons inside the brackets, so the port
   * is whatever follows the closing one.
   */
  if (name.startsWith("[")) {
    const close = name.indexOf("]");
    if (close !== -1) name = name.slice(0, close + 1);
  } else {
    const colon = name.lastIndexOf(":");
    if (colon !== -1 && !name.slice(colon + 1).includes(":")) {
      name = name.slice(0, colon);
    }
  }
  // The DNS root dot is equivalent, never a different host.
  while (name.endsWith(".")) name = name.slice(0, -1);
  return name;
}

/**
 * Fold this round's directory answers into the standing register and
 * report the census. Pure over its inputs apart from the register
 * read/write: the SOURCES are fetched by the caller, so this adds no
 * network calls of its own and a feed the ward already read is not
 * fetched twice.
 */
export async function takeCensus(
  env: Env,
  results: SourceResult[],
  walked: number,
  now: Date = new Date(),
): Promise<PopulationCensus> {
  const at = now.toISOString();
  const { hosts: register, last_known: previousKnown } = await readRegister(env);

  const answered = results.filter((result) => result.hosts !== null);
  const failed = results
    .filter((result) => result.hosts === null)
    .map((result) => result.source);

  const seenNow = new Map<string, Set<string>>();
  for (const result of answered) {
    for (const host of result.hosts ?? []) {
      const key = normalize(host);
      if (!key) continue;
      const sources = seenNow.get(key) ?? new Set<string>();
      sources.add(result.source);
      seenNow.set(key, sources);
    }
  }

  /*
   * CARRY FORWARD. A host last listed only by a source that went dark
   * this round is not gone — we simply did not get to ask. Keeping it
   * is the conservative direction: a phantom on the register costs a
   * line, while a false death costs the truth of the record.
   */
  const failedSet = new Set(failed);
  const carriedNow = new Set<string>();
  let carriedForward = 0;
  for (const [host, record] of Object.entries(register)) {
    if (seenNow.has(host) || record.gone_at) continue;
    if (record.sources.some((source) => failedSet.has(source))) {
      carriedForward += 1;
      carriedNow.add(host);
      seenNow.set(host, new Set(record.sources));
    }
  }

  const known = seenNow.size;
  const collapseSuspect =
    previousKnown > 0 && known < Math.floor(previousKnown * COLLAPSE_FLOOR);

  const appeared: string[] = [];
  const returned: string[] = [];
  for (const [host, sources] of seenNow) {
    const existing = register[host];
    if (!existing) {
      appeared.push(host);
      register[host] = {
        first_seen: at,
        last_seen: at,
        sources: [...sources].sort(),
      };
      continue;
    }
    if (existing.gone_at) {
      returned.push(host);
      delete existing.gone_at;
    }
    /*
     * ONLY A REAL SIGHTING MOVES last_seen. A carried-forward host was
     * not seen — its directory went dark and we declined to bury it —
     * and stamping today's date on it would turn a conservative guess
     * into a claimed observation.
     */
    if (carriedNow.has(host)) {
      existing.carried_since ??= at;
    } else {
      existing.last_seen = at;
      delete existing.carried_since;
      existing.sources = [...new Set([...existing.sources, ...sources])].sort();
    }
  }

  /*
   * Disappearance is only recorded when the round is trustworthy. A
   * collapsed union means the instrument is the likelier explanation,
   * and the record says so instead of naming the dead. On a suspect
   * round nothing is marked gone either — so next week's good round
   * still gets to raise it, once.
   */
  const disappeared: string[] = [];
  if (!collapseSuspect) {
    for (const [host, record] of Object.entries(register)) {
      if (seenNow.has(host) || record.gone_at) continue;
      record.gone_at = at;
      disappeared.push(host);
    }
  }

  await env.COUNTERS.put(
    KV_KEYS.populationRegister,
    JSON.stringify({ hosts: register, last_known: known } satisfies RegisterFile),
  );

  return {
    at,
    population_known: known,
    population_walked: walked,
    coverage_pct: known === 0 ? null : Math.round((walked / known) * 1000) / 10,
    per_source: results.map((result) => ({
      source: result.source,
      hosts: result.hosts?.length ?? null,
    })),
    sources_failed: failed,
    carried_forward: carriedForward,
    appeared: appeared.sort().slice(0, EVENT_LIST_CAP),
    appeared_count: appeared.length,
    disappeared: disappeared.sort().slice(0, EVENT_LIST_CAP),
    disappeared_count: disappeared.length,
    returned: returned.sort().slice(0, EVENT_LIST_CAP),
    returned_count: returned.length,
    collapse_suspect: collapseSuspect,
    what_this_cannot_see: [
      "Whether a listed host is payable. Enumeration says a host EXISTS; only a probe says anything else, and coverage_pct is the share we probed.",
      "Endpoints that never appear in any directory we read. The universe here is the union of our sources, never the universe.",
      collapseSuspect
        ? "Disappearances this round: SUPPRESSED. The union fell past the floor against the last census, which the instrument explains more plausibly than the ecosystem does."
        : "Why a host stopped being listed. 'disappeared' means NO LONGER LISTED where we look — never 'dead', and never 'stopped taking payment'.",
      "Anything between rounds. Enumeration is as periodic as the probe it rides with.",
      carriedForward > 0
        ? `${carriedForward} host(s) are on this count by CARRY-FORWARD, not by sighting: their directory went dark and burying them would have been a guess. Their last_seen still reads the last round somebody actually listed them, and carried_since says when we started taking them on trust.`
        : "Nothing on this count is here by carry-forward — every host was listed by a source that answered this round.",
      ...(Math.max(appeared.length, disappeared.length, returned.length) >
      EVENT_LIST_CAP
        ? [
            `An event list overflowed its ${EVENT_LIST_CAP}-name cap this round. The _count fields are exact and the register holds every host; only the names published on this census are truncated, so the corpus snapshot stays weekly-and-small.`,
          ]
        : []),
    ],
  };
}

/** The standing register, for reads that want history rather than a census. */
export async function populationHistory(
  env: Env,
  host: string,
): Promise<PopulationRecord | null> {
  const { hosts } = await readRegister(env);
  return hosts[normalize(host)] ?? null;
}
