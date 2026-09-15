import { listKeys } from "@/lib/kv-list";
import { bulkGetJson } from "@/lib/kv-bulk";
import { kvGetJson, kvPut } from "@/lib/kv-retry";
import type { AlertCondition } from "@/lib/alerts";
import type { Env } from "@/types";

/**
 * TURNING OFF ONE ALARM WITHOUT TURNING OFF THE ALARM.
 *
 * The keeper, 2026-09-15, holding a `worker_health` page about a note
 * this desk sent to one host: "I don't want to get this particular
 * alarm anymore." Until today the only answers were to keep taking
 * the email, or to delete the condition from the code — and deleting
 * it takes the same page away for every OTHER host and every other
 * failure that rides that condition, including the ones that mean the
 * Worker is genuinely unhealthy. A store whose only volume control is
 * a pair of wire cutters gets its wire cut.
 *
 * So a mute is a row, per alarm or per condition, and it silences
 * EXACTLY ONE THING: the email. It does not touch the console line,
 * the alarm trail, the open-row bookkeeping, the repeat count or the
 * admin surfaces. That is the whole point — `lib/alerts` already says
 * a mute store must never become a silent one, and a mute that hid
 * the row would be the alerting defect this codebase has fixed four
 * times (the retired-key sample, the probe-decline flood, the
 * standing-row duplication, the six-hour nag): an instrument that
 * degrades while nobody is looking at it.
 *
 * A muted alarm therefore keeps happening in the open. Its row is
 * stamped MUTED on the trail, its repeat count keeps climbing where
 * the keeper can see it, and every live mute is listed beside the
 * trail with the lever to lift it. There is no TTL: an expiring mute
 * would start paging again on a date nobody chose, about a fact
 * nobody has learned anything new about.
 */

const MUTE_PREFIX = "alert_mute:";

/** Enough for every condition plus a long tail of per-alarm mutes. */
const MUTE_CAP = 300;

export interface AlertMute {
  /**
   * `alarm` silences one standing row — one condition at one key, so
   * the same condition at a different key still pages. `condition`
   * silences the whole class, which is the bigger hammer and is named
   * as such on the page that offers it.
   */
  scope: "alarm" | "condition";
  /**
   * What is silenced: the alarm's identity (`condition:key`) for
   * `alarm` scope, the bare condition for `condition` scope. The two
   * never collide, because an identity always carries a colon after
   * its condition and a condition never carries one.
   */
  target: string;
  /** The condition this mute covers, for grouping and for the page. */
  condition: string;
  /** When the lever was pulled. */
  at: string;
  /** Why, in the keeper's words. A mute nobody can explain later is a bug. */
  reason?: string;
}

function muteKey(target: string): string {
  return `${MUTE_PREFIX}${target}`;
}

/**
 * The condition half of an identity. `worker_health:note-audit:look:x`
 * is muted by a `worker_health` condition mute; `worker_health` alone
 * is its own condition mute. Splitting on the FIRST colon is the
 * whole rule, because `alertIdentity` builds identities that way.
 */
export function conditionOf(identity: string): string {
  const colon = identity.indexOf(":");
  return colon === -1 ? identity : identity.slice(0, colon);
}

/**
 * Which mute covers this alarm, if any. The per-alarm mute wins when
 * both exist, because it is the more specific fact and it is the one
 * the page should name when it says why the phone stayed quiet.
 *
 * A failed read THROWS rather than answering "not muted", and the
 * caller decides what that means. In `sendAlert` it means page: not
 * knowing whether an alarm was silenced is not permission to silence
 * it.
 */
export async function muteFor(
  env: Env,
  identity: string,
): Promise<AlertMute | null> {
  const condition = conditionOf(identity);
  const [byAlarm, byCondition] = await Promise.all([
    kvGetJson<AlertMute>(env.COUNTERS, muteKey(identity), "json"),
    condition === identity
      ? Promise.resolve(null)
      : kvGetJson<AlertMute>(env.COUNTERS, muteKey(condition), "json"),
  ]);
  return byAlarm ?? byCondition ?? null;
}

export interface MuteRequest {
  scope: AlertMute["scope"];
  /** An identity for `alarm` scope, a condition name for `condition` scope. */
  target: string;
  reason?: string;
}

/**
 * Pull the lever. Refuses a target that does not name a condition,
 * because a mute keyed to a typo is a mute that silences nothing and
 * reads, on the page, exactly like one that works.
 */
export async function muteAlarm(
  env: Env,
  request: MuteRequest,
  conditions: readonly AlertCondition[],
  paging: readonly string[],
  now = new Date(),
): Promise<AlertMute | { refused: string }> {
  const target = request.target.trim();
  if (!target) return { refused: "A mute needs something to mute." };
  const condition = conditionOf(target);
  if (!conditions.includes(condition as AlertCondition)) {
    return {
      refused: `"${condition}" is not a condition this store raises. Nothing was muted.`,
    };
  }
  /*
   * A DESK CONDITION HAS NOTHING TO MUTE, and saying so is better
   * than writing a row that silences a channel it was never in. The
   * keeper pressing this would otherwise see a mute standing on his
   * page forever, doing nothing, with no way to tell it apart from
   * one that works.
   */
  if (!paging.includes(condition)) {
    return {
      refused: `"${condition}" never emails you — it writes to the alarm trail and stops there. Nothing to mute.`,
    };
  }
  if (request.scope === "condition" && condition !== target) {
    return {
      refused: "A condition mute is keyed to the condition alone.",
    };
  }
  const mute: AlertMute = {
    scope: request.scope,
    target,
    condition,
    at: now.toISOString(),
    ...(request.reason ? { reason: request.reason } : {}),
  };
  await kvPut(env.COUNTERS, muteKey(target), JSON.stringify(mute));
  return mute;
}

/** Let it page again. Missing is success: the end state is what was asked for. */
export async function unmuteAlarm(env: Env, target: string): Promise<void> {
  await env.COUNTERS.delete(muteKey(target));
}

export interface MuteListing {
  /** Newest first. */
  mutes: AlertMute[];
  /**
   * TRUE WHEN THE CAP CUT THE READING SHORT. A capped list of
   * silenced alarms that renders as the whole list is the same defect
   * as the mute itself would be if it hid the row: the page would be
   * saying "these are the alarms that cannot reach you" while holding
   * back some of them.
   */
  truncated: boolean;
}

/**
 * Every live mute, newest first. This list is not a convenience — it
 * is the thing that keeps a mute from being a wire quietly cut. The
 * alarm page renders it whether or not anything is muted.
 */
export async function listMutes(env: Env): Promise<MuteListing> {
  const listed = await listKeys(env.COUNTERS, { prefix: MUTE_PREFIX, cap: MUTE_CAP });
  const values = await bulkGetJson<AlertMute>(env.COUNTERS, listed.names);
  const mutes: AlertMute[] = [];
  for (const record of values.values()) {
    if (record) mutes.push(record);
  }
  return {
    mutes: mutes.sort((a, b) => b.at.localeCompare(a.at)),
    truncated: listed.truncated,
  };
}
