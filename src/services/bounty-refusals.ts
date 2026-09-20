import { KV_KEYS } from "@/lib/kv-keys";
import { kvGetJson, kvPut } from "@/lib/kv-retry";
import {
  DOOR_REFUSAL_CODES,
  type BountyRefusalCode,
} from "@/services/bounty-board";
import type { Env } from "@/types";

/**
 * WHAT THE DOORS SAID LAST TIME WE KNOCKED (2026-09-20, from the
 * 2026-09-19 round: three of twenty doors refused, and all three had
 * read "ready, never walked" on the desk).
 *
 * The desk learned to do the PRICE arithmetic before a press. It could
 * not do the liveness arithmetic, because liveness is not in the
 * census row — the round said ready, and by the time the press knocked
 * the door answered 526, 401 and 301. Those three doors stayed
 * "ready, never walked, cheap" afterwards, sitting at the top of the
 * candidate list, ready to be offered to the next press and the one
 * after that. A standing order posting every twelve hours would have
 * collected the same three refusals fourteen times a week.
 *
 * So a press writes down what it was told, per domain, and the desk
 * reads it back.
 *
 * TWO RULES KEEP THIS FROM BECOMING A BLACKLIST, which is a thing this
 * store does not keep (rule 43: no scores on doors).
 *
 * ONE: ONLY WHAT IS ABOUT THE DOOR. A refusal saying a bounty already
 * stands there this week, or that this press's reward does not clear
 * this door's price, is a fact about the PRESS — a different week or a
 * different reward changes the answer, and caching it would hide a
 * door the keeper could post by moving a dial. `DOOR_REFUSAL_CODES`
 * draws that line at the throw site, where the fact is known.
 *
 * TWO: IT EXPIRES AGAINST THE CENSUS, NOT THE CLOCK. Each memory
 * carries the round it was taken against. The moment a NEWER round has
 * probed that host, the memory is ignored and the door comes back to
 * the desk on its own — because the thing that would settle the
 * question has happened. Nothing here is permanent, nothing here is
 * published, and no door is ever ranked against another.
 */

export interface DoorRefusal {
  /** When the press was refused. */
  at: string;
  /** The census round the press was made against (its `at`). */
  round_at: string;
  code: BountyRefusalCode;
  /** The refusal as the posting door worded it, for the desk to show. */
  refusal: string;
}

export type RefusalMemory = Record<string, DoorRefusal>;

/**
 * The most domains remembered. A round offers 24 and a press posts 10,
 * so this holds many weeks of refusals; past the cap the oldest go,
 * because an old memory is the one the census is most likely to have
 * settled already.
 */
export const REFUSAL_MEMORY_CAP = 150;

export async function readRefusalMemory(env: Env): Promise<RefusalMemory> {
  const stored = await kvGetJson<RefusalMemory>(
    env.COUNTERS,
    KV_KEYS.bountyRefusals,
    "json",
  );
  return stored && typeof stored === "object" ? stored : {};
}

/**
 * Record a press's refusals, keyed by domain.
 *
 * LAST WRITE WINS, AND THAT IS FINE. This is KV without a lock, and
 * two presses racing can drop one's memory. The cost of losing a row
 * is exactly one wasted knock on one door — so a mutex here would buy
 * nothing and a failed write must never take a press down. Every
 * error is swallowed on purpose.
 */
export async function recordRefusals(
  env: Env,
  roundAt: string,
  refusals: ReadonlyArray<{ domain: string; code?: BountyRefusalCode; refusal: string }>,
  now: Date = new Date(),
): Promise<void> {
  const keepable = refusals.filter(
    (row): row is { domain: string; code: BountyRefusalCode; refusal: string } =>
      Boolean(row.domain) &&
      Boolean(row.code) &&
      DOOR_REFUSAL_CODES.includes(row.code as BountyRefusalCode),
  );
  if (keepable.length === 0) return;
  try {
    const held = await readRefusalMemory(env);
    for (const row of keepable) {
      held[row.domain] = {
        at: now.toISOString(),
        round_at: roundAt,
        code: row.code,
        refusal: row.refusal.slice(0, 300),
      };
    }
    const trimmed = Object.entries(held)
      .sort(([, a], [, b]) => b.at.localeCompare(a.at))
      .slice(0, REFUSAL_MEMORY_CAP);
    await kvPut(
      env.COUNTERS,
      KV_KEYS.bountyRefusals,
      JSON.stringify(Object.fromEntries(trimmed)),
    );
  } catch {
    /* An optimisation that fails is a knock wasted, never a press lost. */
  }
}

/**
 * The memory that still applies to THIS round.
 *
 * A memory taken against an older round is dropped: a newer round has
 * knocked on that host since, and the census is the thing that settles
 * the question. This is why the door comes back on its own and why no
 * keeper ever has to clear a list.
 */
export function refusalsForRound(
  memory: RefusalMemory,
  roundAt: string,
): RefusalMemory {
  const live: RefusalMemory = {};
  for (const [domain, row] of Object.entries(memory)) {
    if (row.round_at >= roundAt) live[domain] = row;
  }
  return live;
}
