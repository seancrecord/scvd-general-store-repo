import { listAlerts, type ListedAlert } from "@/lib/alerts";
import { bulkGetText } from "@/lib/kv-bulk";
import { KV_KEYS } from "@/lib/kv-keys";
import { kvGet, kvPut } from "@/lib/kv-retry";
import type { Env } from "@/types";

const VISITS = {
  counter: KV_KEYS.alarmsSeenAtCounter,
  reconciliation: KV_KEYS.alarmsLastRead,
} as const;
type Room = keyof typeof VISITS;

export interface AlertInbox {
  room: Room;
  lastVisit: string | null;
  alerts: Array<ListedAlert & { seen: boolean }>;
}

const receiptKey = (room: Room, id: string): string => `alert_seen:${room}:${id}`;

/** A visit time is context, never evidence that a particular row was shown. */
export async function readAlertInbox(env: Env, room: Room, limit: number): Promise<AlertInbox> {
  const [alerts, lastVisit] = await Promise.all([
    listAlerts(env, limit),
    kvGet(env.COUNTERS, VISITS[room]),
  ]);
  const receipts = await bulkGetText(env.COUNTERS, alerts.map(({ id }) => receiptKey(room, id)));
  return {
    room,
    lastVisit,
    alerts: alerts.map((alert) => ({ ...alert, seen: receipts.get(receiptKey(room, alert.id)) === "1" })),
  };
}

/** Call only after rendering every row in this snapshot successfully. */
export async function acknowledgeAlertInbox(env: Env, inbox: AlertInbox): Promise<void> {
  // Separate immutable receipts make overlapping visits additive. Updating
  // the alert row itself could overwrite a concurrent diagnosis/repeat count.
  // No TTL: a standing alert can renew its retention indefinitely, and an
  // expired receipt would make an already-read problem shout NEW again.
  await Promise.all(inbox.alerts.filter(({ seen }) => !seen).map(({ id }) =>
    kvPut(env.COUNTERS, receiptKey(inbox.room, id), "1"),
  ));
  await kvPut(env.COUNTERS, VISITS[inbox.room], new Date().toISOString());
}
