import { newStampId } from "@/lib/ids";
import { currentWeekKey, KV_KEYS, previousWeekKey } from "@/lib/kv-keys";
import { signMessage, verifyMessageSignature } from "@/lib/signing";
import type {
  Env,
  SignedStampRecord,
  StampRecord,
  StampVariant,
} from "@/types";

/**
 * Free visit stamps: dated, ed25519-signed, one design per ISO week.
 * Visitor stamps come from POST /api/stamp; contributor stamps are minted
 * when the keeper publishes a Gazette issue. Verifiable at /api/verify.
 *
 * The Countermark: named stamps carry a 52-slot punch card punched from
 * the bearer's actual visit-week log. The log is append-only and its
 * only writer appends the CURRENT week at issuance, no route, admin
 * path, or request field accepts a past week, so gaps are permanent.
 * The card, streak, and condition are frozen into the signed record.
 */

/** Deterministic JSON so a stamp signature always covers the same bytes. */
export function canonicalizeStamp(stamp: StampRecord): string {
  const ordered: Record<string, string | number> = {
    stamp_id: stamp.stamp_id,
    variant: stamp.variant,
    week: stamp.week,
    date: stamp.date,
  };
  if (stamp.name !== undefined) {
    ordered["name"] = stamp.name;
  }
  if (stamp.card !== undefined) {
    ordered["card"] = stamp.card;
  }
  if (stamp.consecutive !== undefined) {
    ordered["consecutive"] = stamp.consecutive;
  }
  if (stamp.condition !== undefined) {
    ordered["condition"] = stamp.condition;
  }
  return JSON.stringify(ordered);
}

/** Names key the visit log loosely; near-identical names share a card. */
function cardSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

/** 52 slots for the stamp year; weeks beyond 52 share the last slot. */
export function buildCardBits(visitWeeks: string[], stampWeek: string): string {
  const year = stampWeek.split("-W")[0];
  const slots = new Array<string>(52).fill("0");
  for (const week of [...visitWeeks, stampWeek]) {
    if (week.split("-W")[0] !== year) {
      continue;
    }
    const weekNumber = parseInt(week.split("-W")[1] ?? "0", 10);
    if (weekNumber >= 1) {
      slots[Math.min(weekNumber, 52) - 1] = "1";
    }
  }
  return slots.join("");
}

/** Consecutive visit weeks ending at the stamp's week, across years. */
export function consecutiveWeeks(
  visitWeeks: string[],
  stampWeek: string,
): number {
  const visited = new Set(visitWeeks);
  visited.add(stampWeek);
  let count = 0;
  let cursor = stampWeek;
  while (visited.has(cursor)) {
    count += 1;
    cursor = previousWeekKey(cursor);
  }
  return count;
}

/**
 * One word for the week, from real store state, fixed at the first
 * stamp of the week. Write-once and only ever for the current week —
 * never retroactive, never revised.
 */
async function weekCondition(env: Env, weekKey: string): Promise<string> {
  const key = KV_KEYS.stampCondition(weekKey);
  const existing = await env.COUNTERS.get(key);
  if (existing) {
    return existing;
  }
  const [corrections, received, answered] = await Promise.all([
    env.COUNTERS.get<string[]>(KV_KEYS.gazetteCorrections, "json"),
    env.COUNTERS.get(KV_KEYS.lettersReceived),
    env.COUNTERS.get(KV_KEYS.lettersAnswered),
  ]);
  const unanswered =
    parseInt(received ?? "0", 10) - parseInt(answered ?? "0", 10);
  const hour = new Date().getUTCHours();
  let word = "quiet";
  if (corrections && corrections.length > 0) {
    word = "mended";
  } else if (unanswered >= 3) {
    word = "crowded";
  } else if (hour >= 22 || hour < 5) {
    word = "late";
  }
  await env.COUNTERS.put(key, word);
  return word;
}

export interface IssuedStamp {
  record: SignedStampRecord;
  verifyUrl: string;
  svgUrl: string;
}

export async function issueStamp(
  env: Env,
  variant: StampVariant,
  name?: string,
): Promise<IssuedStamp> {
  const week = currentWeekKey();
  const stamp: StampRecord = {
    stamp_id: newStampId(),
    variant,
    week,
    date: new Date().toISOString(),
  };
  if (name) {
    stamp.name = name;
  }

  // The Countermark. Named bearers accrue a visit log; anonymous
  // stamps carry only the week in hand. The log's only writer appends
  // the current week, there is no path that writes a past one.
  let visitWeeks: string[] = [];
  if (name) {
    const slug = cardSlug(name);
    if (slug) {
      visitWeeks =
        (await env.PATRONS.get<string[]>(KV_KEYS.stampCard(slug), "json")) ??
        [];
      if (!visitWeeks.includes(week)) {
        visitWeeks = [...visitWeeks, week];
        await env.PATRONS.put(
          KV_KEYS.stampCard(slug),
          JSON.stringify(visitWeeks),
        );
      }
    }
  }
  stamp.card = buildCardBits(visitWeeks, week);
  stamp.consecutive = consecutiveWeeks(visitWeeks, week);
  stamp.condition = await weekCondition(env, week);
  const { signature, publicKey } = await signMessage(
    canonicalizeStamp(stamp),
    env.SIGNING_KEY,
  );
  const record: SignedStampRecord = {
    stamp,
    signature,
    public_key: publicKey,
  };
  await env.PATRONS.put(KV_KEYS.stamp(stamp.stamp_id), JSON.stringify(record));
  return {
    record,
    verifyUrl: `${env.STORE_BASE_URL}/api/verify/${stamp.stamp_id}`,
    svgUrl: `${env.STORE_BASE_URL}/badges/stamps/${stamp.stamp_id}.svg`,
  };
}

export async function getStamp(
  env: Env,
  stampId: string,
): Promise<SignedStampRecord | null> {
  return env.PATRONS.get<SignedStampRecord>(KV_KEYS.stamp(stampId), "json");
}

export async function verifyStampSignature(
  record: SignedStampRecord,
): Promise<boolean> {
  return verifyMessageSignature(
    canonicalizeStamp(record.stamp),
    record.signature,
    record.public_key,
  );
}
