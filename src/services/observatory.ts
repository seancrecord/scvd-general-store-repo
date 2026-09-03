import { PORCH_EXACT } from "@/lib/porch-surface";
import { metricsMonth, monthsSinceOpening, readPorchLedger } from "@/lib/metrics";
import { CORRECTIONS_POINTER } from "@/store/corrections";
import { HOUSE_FLAG_POLICY } from "@/services/stats";
import { PULSE_MONTHS } from "@/services/pulse";
import type { Env } from "@/types";

/**
 * THE OBSERVATORY PAGE (roadmap L9's first line, the third of the
 * three the keeper agreed to on 2026-09-02): the porch's counts,
 * finally read by something.
 *
 * The porch has counted every surface an agent reads since 2026-08-21
 * — the menu, the guide, the corpus, the passports, the atlas — and
 * nothing public ever read the counters back. A measurement with no
 * reading is a number nobody can be wrong about. This page prints
 * them: per month, per surface, organic visits beside the house and
 * infrastructure buckets that are kept out of them, and the channel
 * split inside the organic count. It answers, with a number instead
 * of an opinion, the question the keeper asked on 2026-08-29 when the
 * atlas shipped: did anyone read it.
 *
 * ALPHABETICAL, NEVER BY COUNT. A table of our own surfaces sorted by
 * visits would be a ranking of our own rooms, and the doctrine does
 * not make an exception for rankings of ourselves. Surfaces are in
 * name order and the reader may sort.
 *
 * FLOORS, SAID. The porch writes at most PORCH_WRITES_PER_MINUTE
 * rows a minute per isolate and the ledger scans at most
 * METRIC_KEY_CAP keys, so every count here is a floor; the page says
 * so and carries the two numbers it is bounded by. Counts travel with
 * what they are out of; no share or rate is served, and the funnel's
 * rate lives on /pulse where its denominator is explained.
 */

export interface SurfaceCount {
  surface: string;
  /** Organic visits: house and infrastructure excluded at the door. */
  organic: number;
  /** The organic count split by the channel the visitor arrived on. */
  by_channel: Record<string, number>;
  house: number;
  infrastructure: number;
}

export interface ObservatoryMonth {
  month: string;
  organic_visits: number;
  surfaces: SurfaceCount[];
  /** True when the ledger's key scan hit its cap: the counts are floors even more than usual. */
  truncated: boolean;
}

export interface Observatory {
  computed_at: string;
  months: ObservatoryMonth[];
  /** Every path the porch counts by name, derived from the roster the counter reads; a surface absent here is not counted, not unvisited. */
  counted_paths: Record<string, string>;
  floors: {
    porch_writes_per_minute: number;
    ledger_key_cap: number;
    note: string;
  };
  house_flag_policy: string;
  what_this_is: string;
  what_this_is_not: string;
  corrections: string;
}

/** Mirrors the constants in lib/metrics.ts; a test holds them equal so the page cannot quote a bound the counter does not enforce. */
export const OBSERVATORY_PORCH_WRITES_PER_MINUTE = 100;
export const OBSERVATORY_LEDGER_KEY_CAP = 5000;

export const OBSERVATORY_WHAT_THIS_IS =
  "What gets read here, counted: every surface the porch counts, per month, organic visits beside the house and infrastructure buckets kept out of them, and the channel split inside the organic count. Surfaces are in name order, never by count. Read live from the same counters the admin desk reads; nothing here is typed.";

export const OBSERVATORY_WHAT_THIS_IS_NOT =
  "Not a ranking of our own rooms, not a visitor count (one agent reading a page ten times is ten), and not a claim about anyone but this store. No rate is served: the funnel's one rate lives on /pulse with its denominator explained. No user-agents, no referrers, no per-visitor rows — this store keeps no cookies and no IPs.";

export const OBSERVATORY_FLOORS_NOTE =
  "Every count is a floor. The porch records at most a fixed number of visits a minute per isolate and drops the rest on the floor rather than queue them; the monthly ledger scans at most a fixed number of counter keys and says when it hit that cap. Both numbers are beside this note.";

function surfaceRows(ledger: Awaited<ReturnType<typeof readPorchLedger>>): SurfaceCount[] {
  return Object.entries(ledger.surfaces)
    .map(([surface, buckets]) => {
      const byChannel: Record<string, number> = {};
      for (const [key, value] of Object.entries(buckets)) {
        if (key.startsWith("organic:")) byChannel[key.slice("organic:".length)] = value;
      }
      return {
        surface,
        organic: buckets["organic"] ?? 0,
        by_channel: Object.fromEntries(Object.entries(byChannel).sort(([a], [b]) => a.localeCompare(b))),
        house: buckets["house"] ?? 0,
        infrastructure: buckets["infrastructure"] ?? 0,
      };
    })
    .sort((a, b) => a.surface.localeCompare(b.surface));
}

export async function computeObservatory(env: Env, now: Date = new Date()): Promise<Observatory> {
  const months = monthsSinceOpening(now).slice(-PULSE_MONTHS).reverse();
  const current = metricsMonth(now);
  if (!months.includes(current)) months.unshift(current);
  const read: ObservatoryMonth[] = [];
  for (const month of months) {
    const ledger = await readPorchLedger(env, month).catch(() => null);
    if (!ledger) {
      read.push({ month, organic_visits: 0, surfaces: [], truncated: true });
      continue;
    }
    read.push({
      month,
      organic_visits: ledger.organicVisits,
      surfaces: surfaceRows(ledger),
      truncated: ledger.truncated,
    });
  }
  return {
    computed_at: now.toISOString(),
    months: read,
    counted_paths: Object.fromEntries([...PORCH_EXACT.entries()].sort(([a], [b]) => a.localeCompare(b))),
    floors: {
      porch_writes_per_minute: OBSERVATORY_PORCH_WRITES_PER_MINUTE,
      ledger_key_cap: OBSERVATORY_LEDGER_KEY_CAP,
      note: OBSERVATORY_FLOORS_NOTE,
    },
    house_flag_policy: HOUSE_FLAG_POLICY,
    what_this_is: OBSERVATORY_WHAT_THIS_IS,
    what_this_is_not: OBSERVATORY_WHAT_THIS_IS_NOT,
    corrections: CORRECTIONS_POINTER,
  };
}
