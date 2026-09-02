import { payToDigest } from "@/lib/pay-to-digest";
import { listCorpus } from "@/services/corpus";
import { deriveDoorIndex } from "@/services/door-index";
import { deriveProvenance } from "@/services/provenance-check";
import { subjectHistory } from "@/services/subject-history";
import type { Env } from "@/types";

/**
 * DEPTH BEFORE YOU BUY (roadmap S7, 2026-09-02).
 *
 * The three items that sell this store's own history — the spot
 * check, the provenance check, the hosted profile — showed nowhere,
 * before the money, how much history existed for the subject asked
 * about. A buyer paid to find out whether there was anything to find.
 * An outside desk publishes its archive depth to free callers before
 * paying (their ADR-011); we held the same numbers and printed none.
 *
 * So the depth rides the 402 for those items when the subject is
 * named, and the item page carries the archive's own depth when no
 * subject is. Every figure is a count derived from the signed chain
 * at read time; zero is printed as zero, and a subject the chain never
 * met says so rather than counting nothing as something.
 *
 * WHAT IT IS NOT: a preview of the verdict. The depth says how many
 * signed rounds stand behind an answer, never what the answer is. A
 * tier is not printed here, because a tier before the money would be
 * the grade for free with the check sold after it.
 */

/** The items that sell history, and what names their subject. */
export const DEPTH_ITEMS: Record<string, "host" | "url" | "address"> = {
  spot_check: "host",
  trust_profile: "url",
  provenance_check: "address",
};

export interface HostDepth {
  kind: "host";
  subject: string;
  never_observed: boolean;
  rounds_probed: number;
  rounds_since_first_sighting: number;
  first_observed: string | null;
  last_observed: string | null;
  verdict_changes: number;
  rows_url: string;
}

export interface AddressDepth {
  kind: "address";
  subject: string;
  never_seen: boolean;
  weeks_seen: number;
  doors_seen: number;
  first_week: string | null;
  last_week: string | null;
}

export interface ArchiveDepthWide {
  kind: "archive";
  weeks_in_chain: number;
  hosts_seen: number;
  first_week: string | null;
  latest_week: string | null;
}

export type ArchiveDepth = (HostDepth | AddressDepth | ArchiveDepthWide) & {
  what_this_is: string;
  what_this_is_not: string;
};

const WHAT_THIS_IS =
  "How much signed history stands behind what this item would sell you, counted from the chain at read time, before any money moves. Zero is printed as zero.";
const WHAT_THIS_IS_NOT =
  "Not a preview of the answer. The depth says how many signed rounds an answer would draw on, never what they say; a subject the chain never met is stated as never met, not counted as anything.";

function hostOf(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;
  try {
    return new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`).host || null;
  } catch {
    return null;
  }
}

async function hostDepth(env: Env, base: string, host: string): Promise<HostDepth> {
  const history = await subjectHistory(env, host, base);
  return {
    kind: "host",
    subject: host,
    never_observed: history.rounds_probed === 0,
    rounds_probed: history.rounds_probed,
    rounds_since_first_sighting: history.rounds_since_first_sighting,
    first_observed: history.first_observed,
    last_observed: history.last_observed,
    verdict_changes: history.verdict_changes.length,
    rows_url: `${base}/corpus/host/${host}.json`,
  };
}

async function addressDepth(env: Env, address: string): Promise<AddressDepth> {
  const records = await listCorpus(env);
  const digest = await payToDigest(address);
  const { weeks } = await deriveProvenance(records, digest);
  const doors = new Set<string>();
  for (const week of weeks) for (const door of week.doors) doors.add(door.host);
  return {
    kind: "address",
    subject: address,
    never_seen: weeks.length === 0,
    weeks_seen: weeks.length,
    doors_seen: doors.size,
    first_week: weeks[0]?.week ?? null,
    last_week: weeks[weeks.length - 1]?.week ?? null,
  };
}

/** The archive's own depth, for the surfaces that name no subject. */
export async function archiveWideDepth(env: Env): Promise<ArchiveDepth> {
  const records = await listCorpus(env);
  const index = deriveDoorIndex(records);
  return {
    kind: "archive",
    weeks_in_chain: records.length,
    hosts_seen: index.total_hosts,
    first_week: records[0]?.snapshot.week ?? null,
    latest_week: index.latest_week,
    what_this_is: WHAT_THIS_IS,
    what_this_is_not: WHAT_THIS_IS_NOT,
  };
}

/**
 * The depth for one item and one request's query, or null when the
 * item does not sell history. A named subject gets its own depth; an
 * unnamed one gets the archive's.
 */
export async function archiveDepthFor(
  env: Env,
  base: string,
  itemId: string,
  query: Record<string, string | undefined>,
): Promise<ArchiveDepth | null> {
  const names = DEPTH_ITEMS[itemId];
  if (!names) return null;
  if (names === "address") {
    const address = (query.address ?? "").trim();
    if (!/^0x[0-9a-fA-F]{40}$/.test(address)) return archiveWideDepth(env);
    return { ...(await addressDepth(env, address)), what_this_is: WHAT_THIS_IS, what_this_is_not: WHAT_THIS_IS_NOT };
  }
  const host = hostOf(names === "url" ? query.url : query.host);
  if (!host) return archiveWideDepth(env);
  return { ...(await hostDepth(env, base, host)), what_this_is: WHAT_THIS_IS, what_this_is_not: WHAT_THIS_IS_NOT };
}

/** One line for a page: the numbers with their nouns, never a ratio. */
export function depthLine(depth: ArchiveDepth): string {
  if (depth.kind === "archive") {
    return `The archive holds ${depth.weeks_in_chain} signed week${depth.weeks_in_chain === 1 ? "" : "s"} over ${depth.hosts_seen} host${depth.hosts_seen === 1 ? "" : "s"}${depth.first_week ? `, ${depth.first_week} to ${depth.latest_week ?? depth.first_week}` : ""}. Name a subject on the 402 and it says how much of that history is about the subject, before you pay.`;
  }
  if (depth.kind === "address") {
    return depth.never_seen
      ? `The signed chain has never carried this address at any door. What you would buy is that fact, signed.`
      : `This address appears in ${depth.weeks_seen} signed week${depth.weeks_seen === 1 ? "" : "s"} across ${depth.doors_seen} door${depth.doors_seen === 1 ? "" : "s"}, ${depth.first_week} to ${depth.last_week}.`;
  }
  return depth.never_observed
    ? `The census has never probed this host. What you would buy is not_observed, signed — an answer about our books, not about the door.`
    : `${depth.rounds_probed} signed round${depth.rounds_probed === 1 ? "" : "s"} probed this host out of ${depth.rounds_since_first_sighting} since we first met it, ${depth.first_observed?.slice(0, 10)} to ${depth.last_observed?.slice(0, 10)}, with ${depth.verdict_changes} verdict change${depth.verdict_changes === 1 ? "" : "s"}.`;
}
