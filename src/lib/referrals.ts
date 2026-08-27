import { listKeys } from "@/lib/kv-list";
import { bulkGetText } from "@/lib/kv-bulk";
import { isHouseWallet } from "@/lib/channel";
import { KV_KEYS } from "@/lib/kv-keys";
import type { Env } from "@/types";
import { kvPut } from "@/lib/kv-retry";

/** Ceiling on a referral counters scan. An unnamed cap is a silent one. */
const REFERRAL_KEY_CAP = 1000;

/**
 * THE REFERRAL MARKER — MEASUREMENT ONLY, NOTHING SIGNED.
 *
 * CV's spec, 2026-07-29, built as its measuring half and no further.
 * The full proposal was a signed certificate recording that one agent
 * referred another. The mechanism fits the register; the attestation
 * does not, and the reason is worth keeping next to the code:
 *
 *   WE NEVER OBSERVE ONE AGENT REFERRING ANOTHER. We observe a request
 *   arriving with a marker, TYPED BY THE PERSON BEING REFERRED, who
 *   can type any patron number they like. Signing "patron X referred
 *   patron Y" would put the store's key on a claim the buyer authored.
 *   That is the same class as the `from` field on a decline, which the
 *   gate already refuses to trust — and refusing it there while
 *   signing it here would be incoherent.
 *
 * So this file counts. It answers "is agent-to-agent word of mouth
 * doing anything at all," a question the store has never been able to
 * ask, and it does so with no artifact and no forgery surface: a
 * forged marker inflates a private counter and mints nothing.
 *
 * IF THE NUMBER EVER MOVES, the certificate becomes worth designing —
 * and the honest wording is already known: "this purchase arrived
 * carrying a marker naming patron #X." Never "X referred Y."
 *
 * TWO GUARDS, both deliberate:
 *
 *   1. `?ref=` IS ITS OWN PARAMETER. It is not `?src=`, which means
 *      "how did you hear about us", feeds channel inference, and writes
 *      a venue counter for the free-papers measurement. Overloading it
 *      would have broken inference and put one KV key per referrer per
 *      month into a table built for something else.
 *   2. HOUSE ON EITHER SIDE COUNTS NOTHING. A reward for bringing
 *      traffic is an incentive to manufacture traffic, and today the
 *      only agents who could refer anyone are the house and CV.
 *      Manufacturing social proof is the same family as manufacturing
 *      settlements even with no money moving (rule 13).
 */

/** Patron numbers are sequential integers. Anything else is noise. */
const MAX_PATRON = 1_000_000;

/**
 * The marker, if it is plausibly a patron number. Returns undefined for
 * anything else, which keeps the counter's key space bounded — an
 * unbounded key from a query parameter is how a metric becomes a bill.
 */
export function parseReferralMarker(raw: string | undefined): number | undefined {
  if (!raw || !/^[0-9]{1,7}$/.test(raw)) {
    return undefined;
  }
  const value = Number.parseInt(raw, 10);
  return value >= 1 && value <= MAX_PATRON ? value : undefined;
}

export interface ReferralSignals {
  /** The marker carried by the request, already validated. */
  referralMarker?: number;
  /** The wallet that paid, when one is known. */
  payer?: string;
  /** True when the request was flagged house by any means. */
  house?: boolean;
}

/**
 * Count a marker-carrying event. `stage` separates the two facts that
 * matter: a marker that ARRIVED at a priced door, against one that
 * went all the way to a settlement. The gap between them is the same
 * shape as the 402-to-settle gap everywhere else in the books.
 */
export async function recordReferral(
  env: Env,
  month: string,
  stage: "arrived" | "settled",
  signals: ReferralSignals,
): Promise<void> {
  const marker = signals.referralMarker;
  if (marker === undefined) {
    return;
  }
  // Family doesn't make the paper, and family doesn't refer itself
  // either. Both sides are checked: the payer by wallet, the request by
  // whatever already flagged it house.
  if (signals.house) {
    return;
  }
  if (signals.payer && isHouseWallet(env, signals.payer)) {
    return;
  }
  const key = KV_KEYS.metric(month, `ref${stage === "settled" ? "s" : "a"}`, String(marker));
  const current = await env.COUNTERS.get(key);
  await kvPut(env.COUNTERS, 
    key,
    String((current ? Number.parseInt(current, 10) : 0) + 1),
  );
}

export interface ReferralRow {
  /** The patron number the marker named. Unverified, by construction. */
  marker: number;
  arrived: number;
  settled: number;
}

export interface ReferralReport {
  month: string;
  rows: ReferralRow[];
  total_arrived: number;
  total_settled: number;
  /** Stated on every surface that shows these numbers. */
  honest_limit: string;
}

const HONEST_LIMIT =
  "A marker is typed by the arriving client, so a number here says a request CLAIMED to come from that patron. Nothing is verified and nothing is signed — this counts claims, not referrals. House traffic on either side is excluded. If these stay at zero, agent-to-agent word of mouth is not happening yet, which is the thing worth knowing.";

/** The whole picture for a month, read out of the counters. */
export async function readReferrals(
  env: Env,
  month: string,
): Promise<ReferralReport> {
  const rows = new Map<number, ReferralRow>();
  for (const stage of ["a", "s"] as const) {
    const prefix = `metric:${month}:ref${stage}:`;
    const listed = await listKeys(env.COUNTERS, { prefix, cap: REFERRAL_KEY_CAP });
    // One bulk read per stage, not one read per referrer (2026-08-07,
    // the audit-budget paydown): the loop only aggregates, it never
    // decides per record, which is exactly the shape the audit's
    // per-key-read rule says to bulk.
    const values = await bulkGetText(env.COUNTERS, listed.names);
    for (const name of listed.names) {
      const marker = parseReferralMarker(name.slice(prefix.length));
      if (marker === undefined) {
        continue;
      }
      const raw = values.get(name);
      const count = raw ? Number.parseInt(raw, 10) : 0;
      const row = rows.get(marker) ?? { marker, arrived: 0, settled: 0 };
      if (stage === "a") {
        row.arrived += count;
      } else {
        row.settled += count;
      }
      rows.set(marker, row);
    }
  }
  const list = [...rows.values()].sort((a, b) => b.settled - a.settled);
  return {
    month,
    rows: list,
    total_arrived: list.reduce((sum, row) => sum + row.arrived, 0),
    total_settled: list.reduce((sum, row) => sum + row.settled, 0),
    honest_limit: HONEST_LIMIT,
  };
}

/**
 * TOP REFERRERS BY HOST — a different mechanism from everything above,
 * and the distinction is the point.
 *
 * The counters above track a marker somebody TYPED (`?ref=`). This
 * tracks the `Referer` HEADER, which a browser sets by itself. Same
 * instinct — where did this come from — and nothing else in common. CV
 * flagged the confusion risk explicitly, so both live on one page with
 * their limits stated separately rather than in two places that look
 * alike.
 *
 * WHAT IT CATCHES, SCOPED UP FRONT so an empty table is never misread
 * as broken instrumentation — which is exactly how the decline reasons
 * were nearly misread: `Referer` is a browser-navigation artifact. HTTP
 * client libraries and x402 signing SDKs do not set it, and there is no
 * reason a payment library would. This store's traffic is currently
 * almost entirely non-browser: CV pulled the live census while
 * validating this and the two heaviest clients were literally no
 * user-agent at all and a named bot.
 *
 * SO THE HONEST EXPECTATION IS MOSTLY NULLS, and this is still worth
 * building, because the exceptions are the interesting part: a
 * directory that renders with a headless browser for JS-heavy checks
 * can carry a real one, and a HUMAN clicking through from a listing
 * page will. One confirmed hit from a directory's own domain would be
 * the first evidence ever that a specific listing sends anybody here.
 *
 * It catches the rare click. It is not general attribution, and it must
 * never be described as such.
 */
export interface ReferrerRow {
  host: string;
  count: number;
}

export interface ReferrerReport {
  rows_scanned: number;
  /** Rows that carried a Referer at all. Usually a small fraction. */
  with_referrer: number;
  hosts: ReferrerRow[];
  honest_limit: string;
}

const REFERRER_SCAN_CAP = 2000;

const REFERRER_LIMIT =
  "CATCHES THE RARE CLICK, NOT GENERAL ATTRIBUTION. The Referer header is set by browsers; HTTP libraries and x402 signing clients do not send one, and almost all traffic here is non-browser. An empty table means nobody arrived by clicking a link — it does NOT mean the instrument is broken, and it is not comparable to the marker counts above. A single row from a directory's own domain would be the first evidence that a listing sends anyone here.";

/** Bare host, lowercased. A path would be unbounded key space. */
function hostOf(referrer: string): string | undefined {
  try {
    const host = new URL(referrer).hostname.toLowerCase();
    return host.length > 0 && host.length <= 120 ? host : undefined;
  } catch {
    return undefined;
  }
}

export async function readReferrerHosts(
  env: Env,
  scanCap = REFERRER_SCAN_CAP,
): Promise<ReferrerReport> {
  const counts = new Map<string, number>();
  let scanned = 0;
  let withReferrer = 0;
  let cursor: string | undefined;

  while (scanned < scanCap) {
    const listed = await env.COUNTERS.list({
      prefix: "evt:",
      limit: 1000,
      ...(cursor ? { cursor } : {}),
    });
    // Bulk-read the page (2026-08-07, the audit-budget paydown): ten
    // subrequests per thousand rows instead of a thousand. The scan
    // cap is applied to the NAME list before the read, so the bulk
    // fetch never pulls rows the loop would have skipped.
    const names = listed.keys
      .map((key) => key.name)
      .slice(0, scanCap - scanned);
    const values = await bulkGetText(env.COUNTERS, names);
    for (const name of names) {
      scanned += 1;
      const raw = values.get(name) ?? null;
      if (!raw) {
        continue;
      }
      let event: { referrer?: string; house?: boolean };
      try {
        event = JSON.parse(raw) as { referrer?: string; house?: boolean };
      } catch {
        continue;
      }
      if (event.house || !event.referrer) {
        continue;
      }
      const host = hostOf(event.referrer);
      if (!host) {
        continue;
      }
      withReferrer += 1;
      counts.set(host, (counts.get(host) ?? 0) + 1);
    }
    if (listed.list_complete) {
      break;
    }
    cursor = listed.cursor;
  }

  return {
    rows_scanned: scanned,
    with_referrer: withReferrer,
    hosts: [...counts.entries()]
      .map(([host, count]) => ({ host, count }))
      .sort((a, b) => b.count - a.count),
    honest_limit: REFERRER_LIMIT,
  };
}
