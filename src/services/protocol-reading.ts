import { readPorchLedger } from "@/lib/metrics";
import { readPaymentOperations, type PaymentOperations } from "@/lib/payment-operations";
import { readBuyerSignals } from "@/services/buyer-signals";
import { latestWardRound } from "@/services/ward-round";
import { mppCensusOf, type MppCensus } from "@/services/mpp-census";
import { PURCHASE_DOORS, type PurchaseDoor } from "@/services/purchase-intent";
import { BUYER_SURFACES, BUYER_SURFACE_NOTES, type BuyerSurface } from "@/lib/surfaces";
import { CHECKOUT_STATUSES } from "@/lib/ucp/checkout/state";
import type { Env } from "@/types";

/**
 * THE PROTOCOL READING (2026-09-21).
 *
 * The office could read MPP in two places, UCP in none, and A2A in
 * none, while the store has been serving all of them. This is the one
 * page that answers "what do we speak, and who used it" — and, beside
 * it, "what does the market speak", off the ward's own census.
 *
 * THE TWO AXES ARE NEVER MULTIPLIED. lib/surfaces.ts names them apart:
 * RAIL is how money moved, SURFACE is how the buyer arrived. This
 * reading keeps them in separate sections for that reason, and the
 * page repeats the public /rails discipline out loud — these are
 * counts along two dimensions of the same purchases, and summing
 * across them double-counts every sale.
 *
 * EVERY BLOCK CARRIES ITS DENOMINATOR AND ITS BLINDNESS. What cannot
 * be counted at all is listed as plainly as what can: the checkouts
 * and kits in Durable Objects, which are addressable by id and not
 * enumerable, and the pre-seam rows whose door was never written.
 */

/** The day the doors began naming themselves; before it, everything was "direct". */
export const DOOR_SEAM_DATE = "2026-09-21";

export interface DoorArrivals {
  /** Channel as the porch recorded it, including the two new doors. */
  channel: string;
  organic: number;
}

export interface TillDoor {
  door: PurchaseDoor;
  /** Organic settles the buyer-signals desk observed at this door. */
  settles: number;
  networks: Record<string, number>;
}

export interface ProtocolReading {
  month: string;
  read_at: string;
  /** Who arrived, by the channel the porch inferred. */
  arrivals: DoorArrivals[];
  arrivals_total: number;
  arrivals_truncated: boolean;
  /** Who paid, by the door the till recorded. */
  till: TillDoor[];
  till_total: number;
  /** How they paid: the two rails, at the HTTP payment gate. */
  operations: PaymentOperations | null;
  /** What the market speaks, off the last ward round. Never a ranking. */
  market: { week: string; census: MppCensus } | null;
  /** The declared surfaces, with the note each carries for a buyer. */
  surfaces: { surface: BuyerSurface; note: string }[];
  /** Named so the page can say what it did not read, not just what it did. */
  unreadable: string[];
  notes: string[];
}

/**
 * One read, several shelves, each failing on its own. A shelf that
 * throws is named in `unreadable` rather than rendered as a zero — the
 * house rule the whole office runs on: a missing reading is not a
 * quiet door.
 */
export async function readProtocols(env: Env): Promise<ProtocolReading> {
  const read_at = new Date().toISOString();
  const month = read_at.slice(0, 7);
  const unreadable: string[] = [];

  const [porch, signals, operations, round] = await Promise.all([
    readPorchLedger(env, month).catch(() => {
      unreadable.push("the porch (who arrived)");
      return null;
    }),
    readBuyerSignals(env).catch(() => {
      unreadable.push("buyer signals (who paid, by door)");
      return null;
    }),
    readPaymentOperations(env).catch(() => {
      unreadable.push("the HTTP payment gate's outcome counters");
      return null;
    }),
    latestWardRound(env).catch(() => {
      unreadable.push("the ward round (what the market speaks)");
      return null;
    }),
  ]);

  // ARRIVALS. The porch keys organic rows as surface:channel, so the
  // channel totals are a sum across surfaces, never a second index.
  const byChannel: Record<string, number> = {};
  for (const buckets of Object.values(porch?.surfaces ?? {})) {
    for (const [key, count] of Object.entries(buckets)) {
      if (!key.startsWith("organic:")) continue;
      const channel = key.slice("organic:".length);
      byChannel[channel] = (byChannel[channel] ?? 0) + count;
    }
  }
  const arrivals = Object.entries(byChannel)
    .map(([channel, organic]) => ({ channel, organic }))
    .sort((a, b) => b.organic - a.organic || a.channel.localeCompare(b.channel));

  // THE TILL. One row per door in the closed list, so a door with no
  // sales shows as a zero it can be held to rather than as an absence.
  const till: TillDoor[] = PURCHASE_DOORS.map((door) => {
    const networks: Record<string, number> = {};
    let settles = 0;
    for (const [key, count] of Object.entries(signals?.rail ?? {})) {
      const [head, ...rest] = key.split(":");
      if (head !== door) continue;
      const network = rest.join(":") || "not recorded";
      networks[network] = (networks[network] ?? 0) + count;
      settles += count;
    }
    return { door, settles, networks };
  });

  return {
    month,
    read_at,
    arrivals,
    arrivals_total: arrivals.reduce((sum, row) => sum + row.organic, 0),
    arrivals_truncated: porch?.truncated ?? false,
    till,
    till_total: till.reduce((sum, row) => sum + row.settles, 0),
    operations,
    market: round ? { week: round.week, census: mppCensusOf(round.hosts ?? []) } : null,
    surfaces: BUYER_SURFACES.map((surface) => ({
      surface,
      note: BUYER_SURFACE_NOTES[surface],
    })),
    unreadable,
    notes: [
      `Checkout states are not countable here. A UCP checkout lives in its own Durable Object, addressed by its id (${CHECKOUT_STATUSES.length} states: ${CHECKOUT_STATUSES.join(", ")}), and Durable Objects cannot be listed. The calls that created and completed them ARE counted, at the door, above.`,
      "A2A kits and rechecks are in Durable Objects for the same reason, and are counted the same way: at the door, never as a settle.",
      `Doors began naming themselves on ${DOOR_SEAM_DATE}. Rows written before that read "direct" whatever door answered, and cannot be re-derived — the door was never on them. An empty ucp or a2a row for an earlier month is a missing label, never a quiet door.`,
      "The porch counts calls, not callers: no cookie, no account, no unique heads. One agent polling a catalog is many rows.",
      "Arrivals and settles are different requests, and the same buyer can be counted in both. Neither column is a conversion of the other.",
    ],
  };
}
