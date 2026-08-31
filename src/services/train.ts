import { listKeys } from "@/lib/kv-list";
import { newTagId } from "@/lib/ids";
import { bulkGetJson } from "@/lib/kv-bulk";
import { KV_KEYS } from "@/lib/kv-keys";
import { sanitizeText } from "@/lib/sanitize";
import type { Env, TrainTagRecord, TrainTagStatus } from "@/types";
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
  return found.record;
}

/**
 * THE HEAD OF THE TRAIN — the day's biggest bid, DERIVED (rule 46).
 *
 * graffiti_on_a_train is pay-what-it-deserves, so what somebody paid
 * IS their bid, and the biggest bid of a day takes the head car. The
 * keeper's design was a slot on the storefront; it lives out here on
 * the wall instead, on his read of the risk: money buying prominence
 * on the front page of an evidence observatory is a sentence a
 * competitor could write about us and be right. Out back, where the
 * train already is, it costs nothing anybody else can use.
 *
 * A DAY, NOT A TITLE. The winner carries the date it won on, because
 * rule 43 says a dated observation never accumulates into a score,
 * and a head car with no date beside it is a leaderboard inside a
 * week. Ties go to whoever got there first: matching a standing bid
 * is not outbidding it.
 *
 * A tag with no recorded amount is not a zero bid — it is a bid this
 * store did not write down, from before the field existed — so it
 * never enters the ranking and never loses one either.
 */
export interface TopTag {
  record: TrainTagRecord;
  /** The UTC day it won. */
  day: string;
}

export function topTagOfDay(approved: TrainTagRecord[]): TopTag | null {
  const bids = approved.filter(
    (record) => typeof record.paid_usdc === "number",
  );
  if (bids.length === 0) {
    return null;
  }
  const day = bids[bids.length - 1]!.date.slice(0, 10);
  let top: TrainTagRecord | undefined;
  for (const record of bids) {
    if (record.date.slice(0, 10) !== day) {
      continue;
    }
    // Strictly greater: first to the amount holds it.
    if (!top || (record.paid_usdc ?? 0) > (top.paid_usdc ?? 0)) {
      top = record;
    }
  }
  return top ? { record: top, day } : null;
}
