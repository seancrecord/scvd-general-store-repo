import { bulkGetJson } from "@/lib/kv-bulk";
import { KV_KEYS } from "@/lib/kv-keys";
import type { WardRound } from "@/services/ward-round";
import type { Env } from "@/types";
import { kvPut } from "@/lib/kv-retry";

/**
 * THE DOOR BANK — the ward's memory of declared doors, built for the
 * corpus velocity problem (task #22, 2026-08-18).
 *
 * The numbers that forced it, off the live 2026-W33 snapshot: the
 * discovery feed answers 100 rows with coverage_suspect true (its
 * pagination shape moved 2026-08-05 and no cursor spelling has
 * matched since), the probe list fills 60 of WARD_CAP=200 slots, and
 * the register knows 5,809 hosts of which the round walks 42 — 0.7%
 * coverage. Meanwhile earlier rounds, when pagination worked, read
 * several hundred resources and recorded every one as host + resource
 * URL in the signed chain.
 *
 * So the fix that needs no new source and no homepage-knocking: KEEP
 * the doors. Every discovery round's host→resourceUrl pairs merge in
 * here; when a later round's feed names fewer doors than the cap
 * allows, the spare slots re-probe banked doors on a rotating cursor.
 * The 2026-08-04 lesson stands untouched — a leaderboard homepage is
 * not a door, and the bank only ever holds URLs the discovery
 * directory itself declared. Re-walking a declared door at indexer
 * cadence is the same consent shape as walking it the week it was
 * listed.
 *
 * What a revisit is NOT: a listing. Bank entries prove a door was
 * declared once, not that it is declared now, so revisit results ride
 * the round under their own source and stay out of the listed/gone
 * delta — wardDelta's job is the ecosystem changing, not our memory
 * reaching back.
 */

/** Hosts the bank will hold before evicting the longest-unlisted. */
export const DOOR_BANK_CAP = 2000;

export interface DoorRecord {
  url: string;
  /** Week keys, both from rounds that actually listed the door. */
  first_listed: string;
  last_listed: string;
}

export interface DoorBank {
  doors: Record<string, DoorRecord>;
  /**
   * The rotation cursor: the last host handed out for a revisit.
   * The next round resumes strictly after it in host order and wraps,
   * so every banked door gets its turn instead of the alphabet's
   * front page being observed forever.
   */
  cursor: string | null;
}

export async function readDoorBank(env: Env): Promise<DoorBank> {
  const stored = await env.COUNTERS.get<DoorBank>(KV_KEYS.wardDoorBank, "json");
  if (!stored || typeof stored.doors !== "object" || stored.doors === null) {
    return { doors: {}, cursor: null };
  }
  return { doors: stored.doors, cursor: stored.cursor ?? null };
}

export async function writeDoorBank(env: Env, bank: DoorBank): Promise<void> {
  await kvPut(env.COUNTERS, KV_KEYS.wardDoorBank, JSON.stringify(bank));
}

/**
 * Merge one round's discovery-declared doors. Pure — the caller owns
 * the read and the write. Returns how many hosts eviction dropped, so
 * the round can say the bank is bounded rather than looking total.
 */
export function mergeDoors(
  bank: DoorBank,
  declared: { host: string; url: string }[],
  week: string,
): { bank: DoorBank; evicted: number } {
  const doors = { ...bank.doors };
  for (const { host, url } of declared) {
    const existing = doors[host];
    doors[host] = {
      url,
      first_listed: existing?.first_listed ?? week,
      last_listed: week,
    };
  }
  const hosts = Object.keys(doors);
  let evicted = 0;
  if (hosts.length > DOOR_BANK_CAP) {
    // Oldest last_listed leaves first; the host name breaks ties so
    // eviction is deterministic rather than insertion-order luck.
    const ranked = hosts.sort((a, b) => {
      const byAge = doors[a]!.last_listed.localeCompare(doors[b]!.last_listed);
      return byAge !== 0 ? byAge : a.localeCompare(b);
    });
    for (const host of ranked.slice(0, hosts.length - DOOR_BANK_CAP)) {
      delete doors[host];
      evicted += 1;
    }
  }
  return { bank: { doors, cursor: bank.cursor }, evicted };
}

/**
 * THE BACKFILL — one pass over the STORED ward rounds, so the bank
 * opens holding every door history already declared instead of
 * waiting weeks for the broken feed to re-name them. Keeper-fired
 * (rule 30), idempotent: merging the same rounds twice lands on the
 * same bank. Leaderboard rows are skipped for the same reason they
 * are never probed — a homepage is not a door — and revisit rows are
 * skipped because they came FROM the bank.
 */
export async function backfillDoorBank(env: Env): Promise<{
  rounds_read: number;
  doors_before: number;
  doors_after: number;
  evicted: number;
}> {
  const weekKeys: string[] = [];
  let cursor: string | undefined;
  for (;;) {
    const listed = await env.COUNTERS.list({
      prefix: "ward:",
      limit: 1000,
      ...(cursor ? { cursor } : {}),
    });
    weekKeys.push(...listed.keys.map((key) => key.name));
    if (listed.list_complete || !listed.keys.length) break;
    cursor = listed.cursor;
  }
  // Oldest week first, so last_listed honestly lands on the newest
  // round that actually named each door.
  weekKeys.sort();

  let bank = await readDoorBank(env);
  const doorsBefore = Object.keys(bank.doors).length;
  let roundsRead = 0;
  let evicted = 0;
  // One bulk read for every stored round — the audit's per-key law
  // holds here too, and the merge only needs the values in week order.
  const rounds = await bulkGetJson<WardRound>(env.COUNTERS, weekKeys);
  for (const key of weekKeys) {
    const round = rounds.get(key);
    if (!round?.week || !Array.isArray(round.hosts)) continue;
    roundsRead += 1;
    const declared = round.hosts
      .filter(
        (host) =>
          host.source !== "leaderboard" &&
          host.source !== "revisit" &&
          typeof host.url === "string" &&
          host.url.startsWith("https://"),
      )
      .map((host) => ({ host: host.host, url: host.url }));
    const merged = mergeDoors(bank, declared, round.week);
    bank = merged.bank;
    evicted += merged.evicted;
  }
  await writeDoorBank(env, bank);
  return {
    rounds_read: roundsRead,
    doors_before: doorsBefore,
    doors_after: Object.keys(bank.doors).length,
    evicted,
  };
}

/**
 * Hand out up to `slots` banked doors for re-probing, skipping hosts
 * the round already has. Pure; returns the advanced cursor for the
 * caller to store. Host order is lexicographic — arbitrary but stable,
 * which is all a rotation needs.
 */
export function pickRevisits(
  bank: DoorBank,
  exclude: ReadonlySet<string>,
  slots: number,
): { picks: { host: string; url: string }[]; cursor: string | null } {
  if (slots <= 0) return { picks: [], cursor: bank.cursor };
  const eligible = Object.keys(bank.doors)
    .filter((host) => !exclude.has(host))
    .sort();
  if (eligible.length === 0) return { picks: [], cursor: bank.cursor };

  const start = bank.cursor
    ? eligible.findIndex((host) => host > (bank.cursor as string))
    : 0;
  const from = start === -1 ? 0 : start;
  const picks: { host: string; url: string }[] = [];
  for (let i = 0; i < eligible.length && picks.length < slots; i += 1) {
    const host = eligible[(from + i) % eligible.length]!;
    picks.push({ host, url: bank.doors[host]!.url });
  }
  const cursor = picks.length ? picks[picks.length - 1]!.host : bank.cursor;
  return { picks, cursor };
}
