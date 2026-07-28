import { newTagId } from "@/lib/ids";
import { bulkGetJson } from "@/lib/kv-bulk";
import { KV_KEYS } from "@/lib/kv-keys";
import { sanitizeText } from "@/lib/sanitize";
import type { Env, TrainTagRecord, TrainTagStatus } from "@/types";

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
  const name = sanitizeText(input.name, 80);
  if (name) {
    record.name = name;
  }
  await env.ORDERS.put(
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
  const listed = await env.ORDERS.list({
    prefix: KV_KEYS.trainTagPrefix,
    limit,
  });
  const values = await bulkGetJson<TrainTagRecord>(
    env.ORDERS,
    listed.keys.map((key) => key.name),
  );
  const tags: QueuedTag[] = [];
  for (const key of listed.keys) {
    const record = values.get(key.name);
    if (record) {
      tags.push({ record, kvKey: key.name });
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
  if (status === "approved") {
    found.record.displayed_at = new Date().toISOString();
  } else {
    delete found.record.displayed_at;
  }
  await env.ORDERS.put(found.kvKey, JSON.stringify(found.record));
  return found.record;
}
