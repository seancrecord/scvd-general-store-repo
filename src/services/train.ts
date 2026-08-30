import { listKeys } from "@/lib/kv-list";
import { newTagId } from "@/lib/ids";
import { bulkGetJson } from "@/lib/kv-bulk";
import { KV_KEYS } from "@/lib/kv-keys";
import { sanitizeText } from "@/lib/sanitize";
import type { Env, TrainFront, TrainTagRecord, TrainTagStatus } from "@/types";
import { kvPut } from "@/lib/kv-retry";

/**
 * THE TRAIN. Out past the porch.
 *
 * A buyer pays a dollar, leaves a tag, and the certificate mints on
 * the spot — dated, signed, verifiable like everything else here.
 * Display is a separate thing entirely: the tag goes up on the wall
 * only after the keeper walks by and says so.
 *
 * THE SPLIT IS THE PRODUCT, and it has to stay legible in the code as
 * much as in the copy. THEY BOUGHT THE PERSISTENCE, NOT THE
 * PLACEMENT. A declined tag keeps a certificate that verifies forever;
 * what it does not get is a spot on the steel. Nothing about a decline
 * touches the artifact, and no code path here may ever revoke one.
 *
 * The tag is agent-authored untrusted data: stored exactly as it
 * arrived, never interpreted, never executed, escaped at every render.
 * Same treatment as the anchor summary and the closers' wins.
 */

export const TAG_CAP = 140;

/** Keys sort ascending, so the oldest tag is the front of the train. */
function forwardTimestamp(now: number): string {
  return String(now).padStart(14, "0");
}

/**
 * No URLs in tags. The wall is public and permanent, which is exactly
 * what link spam wants; a tag is a mark, not a billboard. Checked
 * before money moves, so nobody pays for a refusal.
 */
const URL_PATTERN =
  /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|io|xyz|co|ai|app|dev|store|link|gg|to|me)\b)/i;

export function tagHasUrl(tag: string): boolean {
  return URL_PATTERN.test(tag);
}

export interface PaintedTag {
  record: TrainTagRecord;
}

export async function paintTag(
  env: Env,
  input: {
    tag: string;
    certId: string;
    patronNumber: number;
    name?: string;
    /**
     * What they actually paid. This shelf is pay-what-it-deserves, so
     * the number is the bid — recorded here from 2026-08-29 so the
     * front page can DERIVE the day's top tag instead of anybody
     * declaring one.
     */
    paidUsdc?: number;
  },
): Promise<PaintedTag> {
  const record: TrainTagRecord = {
    id: newTagId(),
    tag: input.tag.slice(0, TAG_CAP),
    status: "pending_review",
    date: new Date().toISOString(),
    cert_id: input.certId,
    patron_number: input.patronNumber,
  };
  if (typeof input.paidUsdc === "number" && Number.isFinite(input.paidUsdc)) {
    record.paid_usdc = input.paidUsdc;
  }
  const name = sanitizeText(input.name, 80);
  if (name) {
    record.name = name;
  }
  await kvPut(env.ORDERS, 
    KV_KEYS.trainTag(forwardTimestamp(Date.now()), record.id),
    JSON.stringify(record),
  );
  return { record };
}

export interface QueuedTag {
  record: TrainTagRecord;
  kvKey: string;
}

/** Every tag, oldest first — the order the train fills. */
export async function listTags(env: Env, limit = 200): Promise<QueuedTag[]> {
  const listed = await listKeys(env.ORDERS, { prefix: KV_KEYS.trainTagPrefix, cap: limit });
  const values = await bulkGetJson<TrainTagRecord>(
    env.ORDERS,
    listed.names,
  );
  const tags: QueuedTag[] = [];
  for (const name of listed.names) {
    const record = values.get(name);
    if (record) {
      tags.push({ record, kvKey: name });
    }
  }
  return tags;
}

/** What the public wall shows: approved only, oldest first. */
export async function listApprovedTags(
  env: Env,
  limit = 200,
): Promise<TrainTagRecord[]> {
  const tags = await listTags(env, limit);
  return tags
    .filter((entry) => entry.record.status === "approved")
    .map((entry) => entry.record);
}

/**
 * The keeper's call. Approval stamps a DISPLAY date that is separate
 * from the purchase date, because they are two different facts: when
 * the paint went on, and when he walked by.
 */
export async function setTagStatus(
  env: Env,
  tagId: string,
  status: TrainTagStatus,
): Promise<TrainTagRecord | null> {
  const tags = await listTags(env);
  const found = tags.find((entry) => entry.record.id === tagId);
  if (!found) {
    return null;
  }
  found.record.status = status;
  /**
   * The display date stamps ONCE and survives status flips. Two real
   * mistap shapes on a phone at the counter: a double-submit of
   * approve must not reset "up since" to the second tap, and an
   * accidental take-down followed by putting it back must not
   * replace the true first-display date with the date of the
   * mistake. The wall only shows displayed_at on approved tags, so
   * keeping it on a held record is bookkeeping, not a claim.
   */
  if (status === "approved" && !found.record.displayed_at) {
    found.record.displayed_at = new Date().toISOString();
  }
  await kvPut(env.ORDERS, found.kvKey, JSON.stringify(found.record));
  /*
   * The front page's copy is re-derived HERE, at the one event that
   * can change what the wall shows. Fail-soft: a card that could not
   * be written leaves the last one standing, and the storefront reads
   * a card or renders no train at all. Neither outcome touches a
   * certificate.
   */
  await refreshTrainFront(env).catch(() => undefined);
  return found.record;
}

/** How many tags ride the strip on the front page. */
export const FRONT_TRAIN_CARS = 5;

function utcDay(iso: string): string {
  return iso.slice(0, 10);
}

/**
 * THE DAY'S TOP TAG, DERIVED — never declared (rule 46).
 *
 * Among APPROVED tags bought on the same UTC day as the most recent
 * approved tag that recorded what it paid, the highest bid wins. Ties
 * go to whoever got there first: the second agent to pay the same
 * amount did not outbid anybody.
 *
 * A tag with no recorded amount is not a zero bid — it is a bid this
 * store did not write down, from before the field existed — so it
 * never enters the ranking and never loses one either.
 */
export function deriveTrainFront(approved: TrainTagRecord[]): TrainFront {
  const bids = approved.filter(
    (record) => typeof record.paid_usdc === "number",
  );
  const latestBidDay = bids.length > 0 ? utcDay(bids[bids.length - 1]!.date) : undefined;
  let top: TrainTagRecord | undefined;
  if (latestBidDay) {
    for (const record of bids) {
      if (utcDay(record.date) !== latestBidDay) {
        continue;
      }
      // Strictly greater: first to the amount holds it.
      if (!top || (record.paid_usdc ?? 0) > (top.paid_usdc ?? 0)) {
        top = record;
      }
    }
  }
  return {
    ...(top ? { top, top_day: latestBidDay } : {}),
    recent: approved.slice(-FRONT_TRAIN_CARS),
    computed_at: new Date().toISOString(),
  };
}

/** Re-derive the front page's card and store it under its own key. */
export async function refreshTrainFront(env: Env): Promise<TrainFront> {
  const front = deriveTrainFront(await listApprovedTags(env));
  await kvPut(env.COUNTERS, KV_KEYS.trainFront, JSON.stringify(front));
  return front;
}

/**
 * What the storefront reads: one key, or nothing. Never a list — the
 * front page does not pay for the wall's bookkeeping.
 */
export async function readTrainFront(env: Env): Promise<TrainFront | null> {
  const raw = await env.COUNTERS.get(KV_KEYS.trainFront);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as TrainFront;
    return Array.isArray(parsed.recent) ? parsed : null;
  } catch {
    return null;
  }
}
