import { KV_KEYS } from "@/lib/kv-keys";
import { webBotAuthHeaders } from "@/lib/web-bot-auth";
import type {
  WardHostResult,
  WardRound,
  WardVolumeClaim,
} from "@/services/ward-round";
import type { Env } from "@/types";

/**
 * THE OUTREACH DESK — turning the ward's private readings into the
 * one use they were always licensed for.
 *
 * The ward page has said it since the round existed: "Verdicts here
 * are private readings for outreach, never published as rows."
 * Telling an operator about THEIR OWN door is that use — returning a
 * lost wallet, not publishing a verdict. This desk automates
 * everything up to the send button and stops there:
 *
 *   - the QUEUE derives itself from rounds the probe already walked
 *     (zero new contact),
 *   - the SCOUT reads only contact channels operators PUBLISHED to be
 *     contacted on (RFC 9116 security.txt), keeper-fired,
 *   - the DRAFT is a dated observation with a receipt the operator
 *     verifies in their own logs — never a score (rule 43),
 *   - the SEND is the keeper's hand, every time (rule 30). Nothing in
 *     this file transmits a word to anyone.
 *
 * WHY AUTOMATED SENDING IS REFUSED, NOT DEFERRED: a trust store that
 * cold-mails at machine rate torches the one asset it sells. The
 * bottleneck is the point.
 */

export type OutreachStatus = "sent" | "replied" | "fixed" | "skip";
export const OUTREACH_STATUSES: readonly OutreachStatus[] = [
  "sent",
  "replied",
  "fixed",
  "skip",
];

export interface OutreachEntry {
  status?: OutreachStatus;
  status_at?: string;
  /** Contact strings the operator published in security.txt. */
  contacts?: string[];
  scouted_at?: string;
  /** "none published" when the scout looked and found nothing. */
  scout_note?: string;
}

export interface OutreachLedger {
  version: 1;
  hosts: Record<string, OutreachEntry>;
}

export async function readOutreachLedger(env: Env): Promise<OutreachLedger> {
  const stored = await env.COUNTERS.get<OutreachLedger>(
    KV_KEYS.outreachLedger,
    "json",
  );
  return stored ?? { version: 1, hosts: {} };
}

export async function writeOutreachLedger(
  env: Env,
  ledger: OutreachLedger,
): Promise<void> {
  await env.COUNTERS.put(KV_KEYS.outreachLedger, JSON.stringify(ledger));
}

export interface Prospect {
  host: string;
  url: string;
  verdict: "not_ready" | "unreachable";
  failed: string[];
  week: string;
  observed_at: string;
  claim?: WardVolumeClaim;
  /** Ready last round, broken this one — the freshest kind of lead. */
  newly_failing: boolean;
  /** The ranking said out loud, so the order is auditable. */
  reason: string;
}

function broken(
  entry: WardHostResult,
): entry is WardHostResult & { verdict: "not_ready" | "unreachable" } {
  return entry.verdict === "not_ready" || entry.verdict === "unreachable";
}

/**
 * The queue, derived. Ordering is four named tiers, not a score kept
 * on anybody (rule 43 — this is recomputed from the round every read
 * and stored nowhere):
 *   1. newly failing WITH a revenue claim — money visibly stopping now
 *   2. any revenue claim, largest first — money asserted, door broken
 *   3. newly failing — fresh break, operator likeliest to care
 *   4. the rest — not_ready before unreachable (a wrong answer is a
 *      fixable server; silence is often an abandoned one)
 */
export function deriveProspects(
  latest: WardRound,
  previous: WardRound | null,
): Prospect[] {
  const previouslyReady = new Set(
    (previous?.hosts ?? [])
      .filter((entry) => entry.verdict === "ready")
      .map((entry) => entry.host),
  );
  const rows = latest.hosts.filter(broken).map((entry): Prospect => {
    const newlyFailing = previouslyReady.has(entry.host);
    const claim = entry.volume_claim;
    const reason = newlyFailing
      ? claim
        ? `ready last round, broken now, with $${claim.usd} claimed (${claim.window})`
        : "ready last round, broken now"
      : claim
        ? `$${claim.usd} claimed across ${claim.calls} calls (${claim.window}) behind a broken door`
        : entry.verdict === "not_ready"
          ? `answers, but not as an x402 door: ${entry.failed.join(", ") || "checks failed"}`
          : "no answer at all";
    return {
      host: entry.host,
      url: entry.url,
      verdict: entry.verdict,
      failed: entry.failed,
      week: latest.week,
      observed_at: latest.at,
      ...(claim ? { claim } : {}),
      newly_failing: newlyFailing,
      reason,
    };
  });
  const tier = (p: Prospect): number => {
    if (p.newly_failing && p.claim) return 0;
    if (p.claim) return 1;
    if (p.newly_failing) return 2;
    return p.verdict === "not_ready" ? 3 : 4;
  };
  return rows.sort((a, b) => {
    const byTier = tier(a) - tier(b);
    if (byTier !== 0) return byTier;
    const byClaim = (b.claim?.usd ?? 0) - (a.claim?.usd ?? 0);
    if (byClaim !== 0) return byClaim;
    return a.host.localeCompare(b.host);
  });
}

/**
 * Doors that came back after the keeper reached out: ledger says
 * "sent" or "replied", this round says ready. The case-study list,
 * derived fresh each read — the ledger itself is never edited by
 * arithmetic, only by the keeper's hand.
 */
export function healedAfterOutreach(
  latest: WardRound,
  ledger: OutreachLedger,
): string[] {
  const readyNow = new Set(
    latest.hosts
      .filter((entry) => entry.verdict === "ready")
      .map((entry) => entry.host),
  );
  return Object.entries(ledger.hosts)
    .filter(
      ([host, entry]) =>
        (entry.status === "sent" || entry.status === "replied") &&
        readyNow.has(host),
    )
    .map(([host]) => host)
    .sort();
}

/**
 * The note, drafted. A dated observation with receipts, written so
 * the operator never has to take our word for any clause in it: the
 * probe is in their logs under our name, the signature is checkable
 * against our published directory, and the re-check is a free tool
 * they run themselves. No score, no grade, no "your door rated X" —
 * one dated fact and the way to verify it (rule 43's shape).
 * ⚑ Wording is the keeper's under rule 7; he edits before any send.
 */
export function draftNote(prospect: Prospect, base: string): string {
  const date = prospect.observed_at.slice(0, 10);
  const finding =
    prospect.verdict === "unreachable"
      ? "got no usable answer at all (connection failed, timed out, or the response was unreadable)"
      : `got a response that no x402 buyer can pay: ${
          prospect.failed.length > 0
            ? prospect.failed.join(", ")
            : "the payment challenge did not parse"
        }`;
  const claimLine = prospect.claim
    ? `\nThe agent402.tools leaderboard credits this endpoint with $${prospect.claim.usd} across ${prospect.claim.calls} calls (window: ${prospect.claim.window}). If that traffic is real, some of it is currently bouncing off a door that does not open.\n`
    : "";
  const freshLine = prospect.newly_failing
    ? "\nIt answered correctly on our previous weekly pass, so this looks like a recent break — likely a deploy, not a design choice.\n"
    : "";
  return `Subject: your x402 endpoint at ${prospect.host} is turning buyers away

Hello — I run ${base.replace("https://", "")}, a small store and free conformance desk in the x402 ecosystem.

On ${date} our weekly probe of doors listed in public x402 discovery fetched
  ${prospect.url}
and ${finding}. Any buyer that finds you through those listings hits the same thing.
${freshLine}${claimLine}
You don't have to take my word for any of this:
- Your own access logs: the probe identifies as "scvd-general-store/1.0 (+${base})" and is cryptographically signed (Web Bot Auth / RFC 9421; key directory at ${base}/.well-known/http-message-signatures-directory).
- Re-check it yourself right now, free, no account:
    curl -X POST ${base}/api/preflight -H 'Content-Type: application/json' -d '{"url":"${prospect.url}"}'
  Every check is named; the same battery this note is based on.

If it's already fixed by the time you read this — great, ignore the rest. If you'd like it watched so a silent break never lasts a week again, that's a thing we sell (${base}/conformance — signed audits and standing watches), but the preflight above is free forever either way.

This is a one-off note about one dated observation. It isn't published anywhere, you're not on a list, and there's nothing to unsubscribe from.

— the keeper, SCVD General Store (${base})`;
}

/** RFC 9116: Contact fields, in order, deduped, capped. */
export function parseSecurityContacts(text: string): string[] {
  const contacts: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const match = /^contact:\s*(\S.*?)\s*$/i.exec(line);
    if (match?.[1] && !contacts.includes(match[1])) {
      contacts.push(match[1]);
      if (contacts.length >= 5) break;
    }
  }
  return contacts;
}

/** Per-press ceiling: the scout runs inside one invocation's budget. */
export const SCOUT_CAP = 25;
const SCOUT_TIMEOUT_MS = 4000;
/** security.txt is a small plain-text file; anything huge is not it. */
const SCOUT_MAX_BYTES = 16_384;

async function fetchSecurityTxt(
  env: Env,
  host: string,
  path: string,
): Promise<string | null> {
  const url = `https://${host}${path}`;
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(SCOUT_TIMEOUT_MS),
      // The scout knocks under the same name and signature as every
      // other probe this store makes — the operator can verify who
      // read their contact file the same way they verify the census.
      headers: await webBotAuthHeaders(env, url, { Accept: "text/plain" }),
    });
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      return null;
    }
    const text = await response.text();
    return text.length > SCOUT_MAX_BYTES ? null : text;
  } catch {
    return null;
  }
}

export interface ScoutReport {
  looked: number;
  found: number;
  /** Un-scouted hosts the cap left for the next press. */
  remaining: number;
}

/**
 * The contact scout, keeper-fired. Reads /.well-known/security.txt
 * (and the RFC's legacy root location) for queue hosts not yet
 * scouted — a file that exists PRECISELY to be read by someone about
 * to say "your thing is broken". Results land in the ledger; hosts
 * with nothing published are recorded as such so the scout never
 * re-knocks them on the next press.
 */
export async function scoutContacts(
  env: Env,
  prospects: Prospect[],
  ledger: OutreachLedger,
): Promise<ScoutReport> {
  const pending = prospects.filter(
    (prospect) => !ledger.hosts[prospect.host]?.scouted_at,
  );
  const slice = pending.slice(0, SCOUT_CAP);
  const { pooled } = await import("@/services/ward-round");
  const read = await pooled(slice, 10, async (prospect) => {
    const text =
      (await fetchSecurityTxt(env, prospect.host, "/.well-known/security.txt")) ??
      (await fetchSecurityTxt(env, prospect.host, "/security.txt"));
    return { host: prospect.host, contacts: text ? parseSecurityContacts(text) : [] };
  });
  let found = 0;
  const scoutedAt = new Date().toISOString();
  for (const { host, contacts } of read) {
    const entry = ledger.hosts[host] ?? {};
    entry.scouted_at = scoutedAt;
    if (contacts.length > 0) {
      entry.contacts = contacts;
      found += 1;
    } else {
      entry.scout_note = "none published";
    }
    ledger.hosts[host] = entry;
  }
  await writeOutreachLedger(env, ledger);
  return {
    looked: slice.length,
    found,
    remaining: pending.length - slice.length,
  };
}
