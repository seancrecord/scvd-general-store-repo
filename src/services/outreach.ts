import { KV_KEYS } from "@/lib/kv-keys";
import { webBotAuthHeaders } from "@/lib/web-bot-auth";
import { STORE_CONTACT_EMAIL } from "@/store/metadata";
import { getMenuItem } from "@/store/menu";
import { passportEmbedFor } from "@/pages/passport-card";
import { retractionFor } from "@/store/retracted-readings";
import type {
  WardHostResult,
  WardRound,
  WardVolumeClaim,
} from "@/services/ward-round";
import type { Env } from "@/types";
import { kvGetJson, kvPut } from "@/lib/kv-retry";

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
 *   - the SEND is the keeper's press (rule 30 as AMENDED 2026-08-20:
 *     a keeper-pressed button on this desk IS the approval queue —
 *     the draft is the agent's, the press is the hand, the wire is
 *     machinery). One press, one host, one note, ever.
 *
 * WHY MACHINE-RATE SENDING STAYS REFUSED: a trust store that
 * cold-mails on a clock torches the one asset it sells. The press
 * being human is the rate limit, and the rate limit is the point.
 *
 * THE VERIFIED-FACT LAW (the keeper's condition, attached to the
 * amendment in the same breath: "make sure my data that im sending is
 * not an assumption its a verified fact"): the wire NEVER sends the
 * stored reading. At press time it re-probes the door live; the note
 * that goes out is drafted from THAT probe, seconds old. A door found
 * healed sends nothing and says so — a congratulation nobody asked
 * for is still an assumption-shaped email.
 */

export type OutreachStatus = "sent" | "replied" | "fixed" | "skip";
export const OUTREACH_STATUSES: readonly OutreachStatus[] = [
  "sent",
  "replied",
  "fixed",
  "skip",
];

/**
 * Wipe the workflow stamps, keep the scouted contacts. Exists because
 * of 2026-08-19: the keeper pressed "sent" down the whole queue
 * believing the button transmitted the note — the buttons are
 * bookkeeping stamps and nothing on the desk sends (rule 30), but a
 * label that CAN be misread eventually WILL be, and the recovery from
 * that misreading should be one press, not a KV excavation.
 */
export function clearStatuses(ledger: OutreachLedger): number {
  let cleared = 0;
  for (const entry of Object.values(ledger.hosts)) {
    // A wired entry records an email that actually LEFT — clearing it
    // would re-arm the send button on a host that already got the
    // note, and the one-note-per-host-ever promise is in the note's
    // own text. Hand stamps clear; wire records do not.
    if (entry.status && !entry.wired) {
      delete entry.status;
      delete entry.status_at;
      cleared += 1;
    }
  }
  return cleared;
}

export interface OutreachEntry {
  status?: OutreachStatus;
  status_at?: string;
  /** Contact strings the operator published in security.txt. */
  contacts?: string[];
  scouted_at?: string;
  /** "none published" when the scout looked and found nothing. */
  scout_note?: string;
  /** Set when the desk's wire sent the note (vs a hand stamp). */
  wired?: true;
  /** Where the wired note went. */
  sent_to?: string;
  /** When the live re-probe last confirmed (or cleared) the defect. */
  verified_at?: string;
  /**
   * THE LIVE READING (2026-09-05): what the current instrument saw at
   * this door when the keeper pressed verify, stored so the hand
   * road can draft from it. Present only while the door read broken;
   * a door read ready is stamped fixed and this is cleared. See
   * `liveReadingFor` for the age past which it no longer arms a note.
   */
  live?: LiveReading;
  /**
   * THE RE-READ AFTER THE NOTE (2026-09-05): what the current
   * instrument saw at this door the last time the keeper pressed the
   * audit, kept so a note we sent can be checked against the door as
   * it is, before its operator has to write back.
   */
  audit?: NoteAudit;
  /**
   * WHAT THE NOTE ACTUALLY CLAIMED (2026-09-06), stamped at the
   * moment it went out and never touched again.
   *
   * The re-read used to compare the door against the LATEST ward
   * round's row for that host, and called it "the row the note came
   * from". That is only the same thing until the next census runs.
   * After it, the audit was comparing this week's census against a
   * live probe — a staleness check on the census, which is a fine
   * thing to have and is not the question the audit exists to ask.
   * The question is whether the sentence we mailed a stranger still
   * holds, so the sentence's own reading is written down here.
   *
   * `networks` rides along because a retraction is re-derived from
   * the door's OWN offered rails (retracted-readings.ts), and the
   * rails a door offered in August are not necessarily the rails it
   * offers today. Absent on notes stamped before this field: those
   * fall back to the round row, and the desk says so on the row
   * rather than pretending it knows.
   */
  claimed?: ClaimedNote;
}

/**
 * The reading a note was drafted from, frozen. Not a LiveReading:
 * that one expires and is cleared when a door heals, because its job
 * is to arm a draft. This one outlives everything — it is what we
 * said, and what we said does not expire.
 */
export interface ClaimedNote {
  at: string;
  /** The round in which the claim was made; the retraction ledger is keyed by week. */
  week?: string;
  verdict: "not_ready" | "unreachable";
  failed: string[];
  /** The rails the door offered when we read it. */
  networks?: string[];
}

/**
 * ONE READING, SECONDS OLD, FROM THE INSTRUMENT AS IT IS NOW.
 *
 * The wire has always re-probed at press time (rule 30's condition:
 * "a verified fact, re-checked live at press time, never a stored
 * reading assumed still true"). The hand road did not. While the
 * wire was paused, the Gmail links drafted every note from the
 * week's stored row — and on 2026-09-05 a note went to an operator
 * about a payTo the desk had misread on a rail it could not speak,
 * a defect this store had corrected the day BEFORE the note went
 * out. The operator ran our own free preflight and got `ready`.
 *
 * So the hand road now walks the same law: the note is drafted from
 * THIS reading, taken by the instrument as deployed at the press,
 * and a card with no reading has no note. The battery is recorded
 * beside the verdict so the row says which instrument spoke.
 */
export interface LiveReading {
  at: string;
  verdict: "not_ready" | "unreachable";
  failed: string[];
  battery?: string;
}

/**
 * How long a live reading arms the hand road. The wire's reading is
 * seconds old at send; a hand delivery is minutes, sometimes a
 * sitting. Four hours is one sitting. Past it the links go dark and
 * the button comes back: pressing verify again costs one knock and
 * makes the note true again, which is the whole trade.
 */
export const LIVE_READING_FRESH_HOURS = 4;

/** The reading that may draft a note now, or null. */
export function liveReadingFor(
  entry: OutreachEntry | undefined,
  now: Date = new Date(),
): LiveReading | null {
  const live = entry?.live;
  if (!live) return null;
  const ageMs = now.getTime() - new Date(live.at).getTime();
  if (!(ageMs >= 0 && ageMs <= LIVE_READING_FRESH_HOURS * 3_600_000)) {
    return null;
  }
  return live;
}

export interface OutreachLedger {
  version: 1;
  hosts: Record<string, OutreachEntry>;
}

export async function readOutreachLedger(env: Env): Promise<OutreachLedger> {
  const stored = await kvGetJson<OutreachLedger>(env.COUNTERS, 
    KV_KEYS.outreachLedger,
    "json",
  );
  return stored ?? { version: 1, hosts: {} };
}

export async function writeOutreachLedger(
  env: Env,
  ledger: OutreachLedger,
): Promise<void> {
  await kvPut(env.COUNTERS, KV_KEYS.outreachLedger, JSON.stringify(ledger));
}

export interface Prospect {
  host: string;
  url: string;
  verdict: "not_ready" | "unreachable";
  failed: string[];
  week: string;
  observed_at: string;
  claim?: WardVolumeClaim;
  /**
   * The rails this door's own 402 offered when we read it, carried so
   * a note's claim can be frozen with them (see ClaimedNote). The
   * retraction ledger asks what the door offered THEN, and by the
   * time anyone asks, the round that knew has been replaced.
   */
  networks?: string[];
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
      // The row's own read time where the probe wrote one (2026-09-05);
      // the seal time only for rows walked before it did.
      observed_at: entry.observed_at ?? latest.at,
      ...(claim ? { claim } : {}),
      ...(entry.offer?.networks ? { networks: entry.offer.networks } : {}),
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
/** "$5 fixed, seven days" off the shelf — never typed into a draft. */
function sellLine(itemId: string): string {
  const item = getMenuItem(itemId);
  if (!item) return "on the shelf";
  const term = item.term_days ? `, ${item.term_days} days` : "";
  return `$${item.price_usdc}${term}`;
}

/**
 * THE READY DOORS (2026-09-01): the other half of the seller loop.
 * The queue above finds operators by what is BROKEN; this finds them
 * by what was observed and READY — newly listed first, because a
 * door that just appeared in discovery belongs to somebody who just
 * launched and is looking for exactly the page we already made them.
 * The note hands them their passport, its colophon, the free
 * self-check, and one priced line. Nothing in it is a finding against
 * them, so it needs no live re-probe before it goes; the wire stays
 * out of it either way (rule 30: the send is the keeper's).
 */
export interface Welcome {
  host: string;
  url: string;
  week: string;
  observed_at: string;
  newly_listed: boolean;
  claim?: WardVolumeClaim;
  reason: string;
}

export function deriveWelcomes(
  latest: WardRound,
  previous: WardRound | null,
  ownHost?: string,
): Welcome[] {
  const seenBefore = new Set((previous?.hosts ?? []).map((entry) => entry.host));
  const rows = latest.hosts
    .filter((entry) => entry.verdict === "ready" && entry.host !== ownHost)
    .map((entry): Welcome => {
      const newlyListed = previous !== null && !seenBefore.has(entry.host);
      const claim = entry.volume_claim;
      const reason = newlyListed
        ? claim
          ? `newly listed and ready, with $${claim.usd} claimed (${claim.window})`
          : "newly listed and ready — somebody just launched"
        : claim
          ? `ready, with $${claim.usd} claimed across ${claim.calls} calls (${claim.window})`
          : "ready on this pass";
      return {
        host: entry.host,
        url: entry.url,
        week: latest.week,
        /*
         * THE DATE THE WELCOME CARRIES IS THE ROW'S (2026-09-05). The
         * operator of tensorfeed.ai read "On 2026-09-05" in the note
         * and "observed 2026-09-01" on the passport it linked, and
         * said so. The seal time is the fallback for rows the probe
         * did not stamp.
         */
        observed_at: entry.observed_at ?? latest.at,
        newly_listed: newlyListed,
        ...(claim ? { claim } : {}),
        reason,
      };
    });
  const tier = (w: Welcome): number => (w.newly_listed ? 0 : w.claim ? 1 : 2);
  return rows.sort((a, b) => {
    const byTier = tier(a) - tier(b);
    if (byTier !== 0) return byTier;
    const byClaim = (b.claim?.usd ?? 0) - (a.claim?.usd ?? 0);
    if (byClaim !== 0) return byClaim;
    return a.host.localeCompare(b.host);
  });
}

export function draftWelcome(welcome: Welcome, base: string): string {
  const date = welcome.observed_at.slice(0, 10);
  const embed = passportEmbedFor(welcome.host, base);
  const freshLine = welcome.newly_listed
    ? "\nIt was not in the listings on our previous pass, so this note is probably arriving in your first week. Congratulations on the door.\n"
    : "";
  return `Subject: there is a dated page for your x402 endpoint at ${welcome.host}

Hello — I run ${base.replace("https://", "")}, an evidence observatory for agentic commerce and a small store on the same door.

On ${date} our weekly pass of doors listed in public x402 discovery fetched
  ${welcome.url}
and it answered the way a buyer needs: a payable 402. That observation, dated, with the date after which to stop trusting it, is on a page that already exists:
  ${base}/passport/${welcome.host}
${freshLine}
The page carries a colophon you can paste beside your door — who looked, when, and the date the reading goes stale. It is not a badge and it never says "passed"; it says you were observed, which is the thing a counterparty can check. Reading it is free forever, and it re-derives from each weekly pass on its own.

There is also a chip for a README, already yours — nothing to claim, the observation earned it. It wears the tier with its fraction and the date, links the page above, and goes dark rather than stale if the door leaves the ready side:
  Markdown: ${embed.markdown}
  HTML:     ${embed.html}

Two free things, if you want them:
- Re-check the door yourself any time: curl -X POST ${base}/api/preflight -H 'Content-Type: application/json' -d '{"url":"${welcome.url}"}'
- Say something in your own words beside our observation — a standing note, attached by proving control of the door: ${base}/api/standing-note

And two paid ones, only if they are useful: a week of signed daily checks on the same door (${base}/menu/conformance_watch — ${sellLine("conformance_watch")}), or the whole opening day in one purchase — a real paid walk of your till, that week of checks, and the passport, under one certificate (${base}/menu/opening_day — ${sellLine("opening_day")}).

This is a one-off note about one dated observation. You're not on a list and there is nothing to unsubscribe from.

— the keeper, SCVD General Store (${base})`;
}

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
export function draftNote(
  prospect: Prospect,
  base: string,
  opts: { firstSeenWeek?: string } = {},
): string {
  const date = prospect.observed_at.slice(0, 10);
  /*
   * THE RE-CHECK LINE names the moment, not "seconds ago". The wire's
   * reading is seconds old at send and a hand delivery's is minutes
   * or an hour; both are true as of the timestamp, and the timestamp
   * is what the operator can find in their own logs.
   */
  const verifiedLine = opts.firstSeenWeek
    ? `\n(First seen on our ${opts.firstSeenWeek} weekly pass; re-checked live at ${prospect.observed_at.slice(11, 16)} UTC on ${date}, so the observation above is current as of that re-check, not the week.)\n`
    : "";
  /*
   * THE FINDING SAYS WHAT THE CHECK SAW, NOT MORE (2026-09-05). This
   * used to read "a response that no x402 buyer can pay" for every
   * not_ready — and a door failing one named check on one of three
   * rails is not that door. The operator who read that sentence
   * against a live door with three payable accepts was right to
   * write back. So: the door answered, the readiness check failed,
   * and here is the check by name, defined where they can read it.
   * ⚑ Rule 7: the keeper kills or keeps this wording.
   */
  const finding =
    prospect.verdict === "unreachable"
      ? "got no usable answer at all (connection failed, timed out, or the response was unreadable)"
      : `got an answer that did not pass our readiness check. What failed, by name: ${
          prospect.failed.length > 0
            ? prospect.failed.join(", ")
            : "the payment challenge did not parse"
        } (each check is defined at ${base}/api/preflight/v2)`;
  const subject =
    prospect.verdict === "unreachable"
      ? `your x402 endpoint at ${prospect.host} is turning buyers away`
      : `a failed readiness check on your x402 endpoint at ${prospect.host}`;
  const claimLine = prospect.claim
    ? `\nThe agent402.tools leaderboard credits this endpoint with $${prospect.claim.usd} across ${prospect.claim.calls} calls (window: ${prospect.claim.window}). If that traffic is real, some of it is currently bouncing off a door that does not open.\n`
    : "";
  const freshLine = prospect.newly_failing
    ? "\nIt answered correctly on our previous weekly pass, so this looks like a recent break — likely a deploy, not a design choice.\n"
    : "";
  return `Subject: ${subject}

Hello — I run ${base.replace("https://", "")}, a small store and free conformance desk in the x402 ecosystem.

On ${date} our weekly probe of doors listed in public x402 discovery fetched
  ${prospect.url}
and ${finding}. Any buyer that finds you through those listings hits the same thing.
${verifiedLine}${freshLine}${claimLine}
You don't have to take my word for any of this:
- Your own access logs: the probe identifies as "scvd-general-store/1.0 (+${base})" and is cryptographically signed (Web Bot Auth / RFC 9421; key directory at ${base}/.well-known/http-message-signatures-directory).
- Re-check it yourself right now, free, no account:
    curl -X POST ${base}/api/preflight -H 'Content-Type: application/json' -d '{"url":"${prospect.url}"}'
  Every check is named; the same battery this note is based on.

What the census holds about your door, dated, with the date after which to stop trusting it: ${base}/passport/${prospect.host} — free, and it re-derives from the next weekly pass on its own.

If it's already fixed by the time you read this — great, ignore the rest. If you'd like it watched so a silent break never lasts a week again, that's a thing we sell (${base}/menu/conformance_watch — ${sellLine("conformance_watch")}), but the preflight above is free forever either way.

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
 *
 * SINCE 2026-09-04 it walks BOTH queues. The ready doors got their
 * welcome on 2026-09-01 and no way to find who to hand it to — the
 * keeper: "how do i find contacts for both". Same file, same knock,
 * same ledger; the scout takes anything with a host on it.
 */
export async function scoutContacts(
  env: Env,
  rows: ReadonlyArray<{ host: string }>,
  ledger: OutreachLedger,
): Promise<ScoutReport> {
  const seen = new Set<string>();
  const pending = rows.filter((row) => {
    if (seen.has(row.host)) return false;
    seen.add(row.host);
    return !ledger.hosts[row.host]?.scouted_at;
  });
  const slice = pending.slice(0, SCOUT_CAP);
  const { pooled } = await import("@/services/ward-round");
  const read = await pooled(slice, 10, async (row) => {
    const text =
      (await fetchSecurityTxt(env, row.host, "/.well-known/security.txt")) ??
      (await fetchSecurityTxt(env, row.host, "/security.txt"));
    return { host: row.host, contacts: text ? parseSecurityContacts(text) : [] };
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

/**
 * HAND DELIVERY IN ONE PRESS (2026-09-04, the keeper: "you make it
 * easy for me please"). A mailto: link carrying the draft's subject
 * and body, so the old flow — copy the draft, open the mail client,
 * paste, address it — collapses to a click and a send. Nothing is
 * transmitted by the link itself; the keeper's own client sends, and
 * the stamp is still his to press afterwards (rule 30).
 *
 * Both drafts open with a "Subject:" line; that becomes the subject
 * and the rest the body. Mail clients cap what a mailto: may carry
 * (a few thousand characters, client-dependent), and both drafts sit
 * under that; if one ever grows past it the client opens blank, and
 * the draft is still on the card to copy.
 */
export function splitDraft(draft: string): { subject: string; body: string } {
  const match = /^Subject:\s*(.*)\r?\n\r?\n?([\s\S]*)$/.exec(draft);
  return { subject: match?.[1] ?? "", body: match?.[2] ?? draft };
}

export function mailtoFor(email: string, draft: string): string {
  const { subject, body } = splitDraft(draft);
  return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/**
 * THE SAME NOTE, IN GMAIL (2026-09-05). The keeper reads mail in a
 * browser; a mailto: opens a desktop client he has never set up, and
 * the note went nowhere he could see it. Gmail's compose URL takes the
 * same three fields and opens a draft in the tab he already has.
 */
export function gmailComposeFor(email: string, draft: string): string {
  const { subject, body } = splitDraft(draft);
  return `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(email)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/** The first email-shaped contact the operator published, or null.
 * Web forms and URLs stay hand-delivery — the wire only does email. */
export function contactEmail(entry: OutreachEntry | undefined): string | null {
  for (const contact of entry?.contacts ?? []) {
    const bare = contact.replace(/^mailto:/i, "").trim();
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(bare)) return bare;
  }
  return null;
}

/**
 * THE NOTE THE HAND ROAD MAY CARRY: drafted from the live reading, or
 * nothing. The week's row never reaches a draft on this road — that
 * is the 2026-09-05 correction, held as a function shape rather than
 * a habit. The `observed_at` the note carries is the re-check's, so
 * the date in the first line is the moment the operator can find in
 * their logs, not the day the round was sealed.
 */
export function handDraftFor(
  prospect: Prospect,
  entry: OutreachEntry | undefined,
  base: string,
  now: Date = new Date(),
): string | null {
  const live = liveReadingFor(entry, now);
  if (!live) return null;
  return draftNote(
    {
      ...prospect,
      verdict: live.verdict,
      failed: live.failed,
      observed_at: live.at,
    },
    base,
    { firstSeenWeek: prospect.week },
  );
}

export type VerifyOutcome =
  | { host: string; result: "reproduced"; live: LiveReading }
  | { host: string; result: "healed"; verified_at: string }
  | { host: string; result: "not-in-queue" };

/**
 * VERIFY LIVE, ONE HOST (2026-09-05). The knock the wire makes before
 * it sends, made by itself so the hand road can have it too: the
 * door is probed NOW by the instrument as deployed NOW. A door that
 * answers ready is stamped fixed and gets no note — the week's row
 * was stale or the instrument that wrote it was wrong, and either
 * way there is nothing true to say to its operator. A door that
 * still reads broken gets its reading written on the card, dated,
 * and the note is drafted from that and nothing else.
 *
 * This sends nothing. It is one outward GET, the same knock the
 * census makes, and the ledger write beside it.
 */
export async function verifyProspect(
  env: Env,
  host: string,
  prospects: Prospect[],
  ledger: OutreachLedger,
  now: Date = new Date(),
): Promise<VerifyOutcome> {
  const prospect = prospects.find((p) => p.host === host);
  if (!prospect) return { host, result: "not-in-queue" };
  const { probeHost } = await import("@/services/ward-round");
  const probe = await probeHost(env, prospect.url);
  const at = now.toISOString();
  const entry = ledger.hosts[host] ?? {};
  if (probe.verdict === "ready") {
    delete entry.live;
    ledger.hosts[host] = {
      ...entry,
      status: "fixed",
      status_at: at,
      verified_at: at,
    };
    await writeOutreachLedger(env, ledger);
    return { host, result: "healed", verified_at: at };
  }
  const live: LiveReading = {
    at,
    verdict: probe.verdict === "unreachable" ? "unreachable" : "not_ready",
    failed: probe.failed,
    ...(probe.battery ? { battery: probe.battery } : {}),
  };
  ledger.hosts[host] = { ...entry, verified_at: at, live };
  await writeOutreachLedger(env, ledger);
  return { host, result: "reproduced", live };
}

/**
 * Per-press ceiling on the batch verify: the same ten as the batch
 * wire, for the same reason — the press is a decision about a list
 * the keeper can see, and ten knocks is a bounded outward act.
 */
export const VERIFY_BATCH_CAP = 10;

export interface BatchVerifyReport {
  reproduced: string[];
  healed: string[];
  /** Eligible hosts the cap left for the next press. */
  remaining: number;
}

/**
 * VERIFY LIVE, THE NEXT TEN (2026-09-05). Walks the hand road's own
 * eligibility — an email the operator published, no note ever sent,
 * and no reading still fresh — top of the ranking first, so one
 * press arms the ten notes the keeper would send next. Sequential
 * for the same reason the batch wire is: a legible ledger over a
 * fast one.
 */
export async function verifyNext(
  env: Env,
  prospects: Prospect[],
  ledger: OutreachLedger,
  now: Date = new Date(),
): Promise<BatchVerifyReport> {
  const eligible = prospects.filter((p) => {
    const entry = ledger.hosts[p.host];
    if (entry?.status === "sent" || entry?.status === "replied") return false;
    if (entry?.status === "fixed" || entry?.status === "skip") return false;
    if (contactEmail(entry) === null) return false;
    return liveReadingFor(entry, now) === null;
  });
  const slice = eligible.slice(0, VERIFY_BATCH_CAP);
  const report: BatchVerifyReport = {
    reproduced: [],
    healed: [],
    remaining: eligible.length - slice.length,
  };
  for (const prospect of slice) {
    const outcome = await verifyProspect(env, prospect.host, prospects, ledger, now);
    if (outcome.result === "reproduced") report.reproduced.push(prospect.host);
    else if (outcome.result === "healed") report.healed.push(prospect.host);
  }
  return report;
}

/**
 * THE RE-READ OF EVERY DOOR WE WROTE TO (2026-09-05, the keeper: "how
 * do we check more of this to make sure we are airtight").
 *
 * A note is a claim with a date on it, and the reply that corrects
 * it arrives on the operator's schedule, not ours. This is the desk
 * finding its own wrong notes first: every host the ledger says a
 * note went to is knocked on again by the instrument as it is now,
 * and the reading is laid beside the round's row the note was
 * presumably drafted from. Where they disagree the keeper looks —
 * healed since, or ours to correct — because no arithmetic can tell
 * those apart, and the house sentence is that we do not guess.
 *
 * Bounded like every other press: ten doors, oldest audit first,
 * and nothing is sent. The reading is stored on the entry so the
 * page can show it without knocking twice.
 */
export interface NoteAudit {
  at: string;
  verdict: "ready" | "not_ready" | "unreachable";
  failed: string[];
  battery?: string;
}

/** One automated pass. Bounded so a stalled door cannot eat a cron tick. */
export const AUDIT_BATCH_CAP = 10;

/**
 * One keeper press. Larger than a pass because a human waiting on a
 * page will happily wait ten seconds and will NOT press the same
 * button five times; the daily sweep drains whatever this leaves.
 */
export const AUDIT_PRESS_CAP = 40;

/**
 * How long a re-read stands before the automated sweep knocks again.
 * Twenty-three, not twenty-four, for the reason the conformance
 * watch uses it: a 24-hour floor on an hourly tick silently becomes
 * 25 and then drifts a day a month.
 *
 * THE TRADE THIS MAKES, SAID OUT LOUD. The census law is one GET per
 * declared host per week — indexer cadence, deliberately gentle. This
 * is seven times that, on a small set: hosts we mailed an unsolicited
 * claim about their own door. The reasoning is that we spent their
 * attention first, so an extra GET a day is our cost against their
 * cost of standing wrongly accused for a week. It is a POLICY call,
 * not a derived one (rule 7 — the keeper's to dial): raise this
 * number and the sweep is gentler and slower to catch us out.
 */
export const AUDIT_FRESH_HOURS = 23;

/** How many doors one automated sweep knocks on. Small; it runs every tick. */
export const AUDIT_SWEEP_CAP = 5;

/**
 * WHAT THE RE-READ IS COMPARED AGAINST, AND WHERE IT CAME FROM.
 *
 * `note` is the claim the note itself made, stamped when it went out
 * — the only baseline that answers the question the audit asks.
 * `round` is the fallback for notes stamped before that field
 * existed: the census row, which is what the audit used to compare
 * against for everything. It is named on the row so a reader can
 * tell a real answer from a best-available one.
 */
export type AuditBaseline = "note" | "round" | "none";

/**
 * THE CALL ON A RE-READ.
 *
 * `agree` — the sentence we mailed still holds at this door.
 *
 * `ours` — DERIVED, not guessed: every check the note named has since
 * been retracted by this store (retracted-readings.ts), so the note's
 * finding rests entirely on an instrument we have withdrawn. There is
 * nothing to weigh; a correction is owed and the desk drafts it.
 *
 * `look` — the claim no longer holds and nothing here derives why.
 * "Healed since" and "ours" are the same shape from outside a door
 * (rule 46: a guard that cannot fail argues for the lie), so the desk
 * stops and the keeper decides. This list is much shorter than it was
 * — the retraction case walked out of it — but it is never empty by
 * arithmetic.
 */
export type AuditCall = "agree" | "ours" | "look";

export interface AuditFinding {
  call: AuditCall;
  /** One line, for the desk and the alert. */
  why: string;
  /** Present on `ours`: the correction that withdrew the note's checks. */
  correction_date?: string;
}

/**
 * Does the sentence we sent still hold?
 *
 * THE OLD RULE WAS READINESS-ONLY: `(claim.ready) !== (audit.ready)`.
 * A door that failed `payto-payable` when the note went out and fails
 * `amount-atomic` today read AGREE under it, because both are
 * not-ready — so a note whose named finding is now wrong sat in the
 * agree pile, invisible, which is the exact failure the audit was
 * built to catch. The note names checks, so the audit compares
 * checks.
 */
export function callAudit(
  claim: ClaimedNote | null,
  audit: NoteAudit,
): AuditFinding {
  if (!claim) {
    return {
      call: "look",
      why: "no record of what this note claimed — read the note and the door by hand",
    };
  }
  const retraction = retractionFor(claim.week, claim.failed, claim.networks);
  const withdrawn = (why: string): AuditFinding => ({
    call: "ours",
    why: `${why} Every check it named (${claim.failed.join(", ")}) has since been retracted — correction dated ${retraction!.correction_date}. The finding rests on an instrument this store has withdrawn.`,
    correction_date: retraction!.correction_date,
  });

  if (audit.verdict === "ready") {
    const why = "The note said this door failed a readiness check; it answers ready now.";
    return retraction
      ? withdrawn(why)
      : { call: "look", why: `${why} Healed since, or ours — nothing here derives which.` };
  }
  if (claim.verdict === "unreachable" || audit.verdict === "unreachable") {
    /*
     * Unreachable is a claim about our vantage as much as their door
     * (3.4/B6). A pair that swaps into or out of it is never called
     * from here — an outage at either end reads identically.
     */
    if (claim.verdict === audit.verdict) {
      return { call: "agree", why: "Still no usable answer at this door." };
    }
    const why =
      claim.verdict === "unreachable"
        ? "The note said this door gave no usable answer; it answers now, and fails a check."
        : "The note named a failed check; the door gives no usable answer now.";
    return { call: "look", why: `${why} Reachability moved, which our own vantage can also do.` };
  }
  const gone = claim.failed.filter((check) => !audit.failed.includes(check));
  if (gone.length === 0) {
    return {
      call: "agree",
      why: claim.failed.length
        ? `Still failing what the note named: ${claim.failed.join(", ")}.`
        : "Still not ready, and the note named no check.",
    };
  }
  const why = `The note named ${claim.failed.join(", ")}; ${gone.join(", ")} ${gone.length === 1 ? "no longer fails" : "no longer fail"} (the door now fails ${audit.failed.join(", ") || "nothing we name"}).`;
  return retraction ? withdrawn(why) : { call: "look", why: `${why} Healed since, or ours — nothing here derives which.` };
}

/**
 * The claim to hold the re-read against, and how good a baseline it
 * is. A note stamped before `claimed` existed falls back to the round
 * row — the old behaviour, kept because a weak comparison beats none,
 * and labelled so nobody reads it as the strong one.
 */
export function claimFor(
  entry: OutreachEntry,
  door: WardHostResult | undefined,
  week: string | undefined,
): { claim: ClaimedNote | null; baseline: AuditBaseline } {
  if (entry.claimed) return { claim: entry.claimed, baseline: "note" };
  if (door && door.verdict !== "not_probed" && door.verdict !== "ready") {
    return {
      claim: claimFrom(
        { at: door.observed_at ?? "", verdict: door.verdict, failed: door.failed },
        week,
        door.offer?.networks,
      ),
      baseline: "round",
    };
  }
  return { claim: null, baseline: "none" };
}

/**
 * The claim a note going out RIGHT NOW makes, frozen off the live
 * reading it was drafted from, with the round row supplying only the
 * two things a probe does not carry: which week it is, and what
 * rails the door offered.
 */
export function claimFrom(
  reading: { at?: string; verdict: "not_ready" | "unreachable"; failed: string[] },
  week: string | undefined,
  networks: readonly string[] | undefined,
): ClaimedNote {
  return {
    at: reading.at ?? "",
    ...(week ? { week } : {}),
    verdict: reading.verdict,
    failed: reading.failed,
    ...(networks?.length ? { networks: [...networks] } : {}),
  };
}

/**
 * THE CLAIM A HAND-DELIVERED NOTE MADE, frozen when the keeper stamps
 * the row sent. The wire freezes its own (it drafted from a probe it
 * took); the hand road drafts from `entry.live`, so that is the
 * reading the stamp preserves.
 *
 * NEVER OVERWRITES an existing claim. A row stamped sent, then
 * replied, then sent again still made ONE claim, and it was the
 * first one. Returns null when the desk cannot tell what was said —
 * `callAudit` reads that as "look", which is the honest answer.
 */
export function claimAtStamp(
  entry: OutreachEntry,
  prospect: Prospect | undefined,
): ClaimedNote | null {
  if (entry.claimed) return entry.claimed;
  if (entry.live) {
    return claimFrom(entry.live, prospect?.week, prospect?.networks);
  }
  if (prospect) {
    return claimFrom(
      { at: prospect.observed_at, verdict: prospect.verdict, failed: prospect.failed },
      prospect.week,
      prospect.networks,
    );
  }
  return null;
}

export interface NoteAuditRow {
  host: string;
  status: OutreachStatus;
  status_at?: string;
  /** What the note claimed, or the best available stand-in. */
  claim: ClaimedNote | null;
  baseline: AuditBaseline;
  /** What the round's row says now. Context, no longer the comparison. */
  row: { verdict: WardHostResult["verdict"]; failed: string[] } | null;
  audit: NoteAudit;
  finding: AuditFinding;
  /** The claim no longer holds: the row rises to the top of the desk. */
  disagrees: boolean;
}

export interface NoteAuditReport {
  rows: NoteAuditRow[];
  /** Hosts written to that this round holds no door for; nothing to knock on. */
  no_door: string[];
  /** Eligible hosts the cap left for the next press. */
  remaining: number;
}

/**
 * THE CORRECTION, WRITTEN BY THE DESK (2026-09-06).
 *
 * The keeper's ask was for the fix to be automatic, and this is as
 * far as automatic can honestly go: when the re-read derives `ours`,
 * the desk writes the correction from the two readings it already
 * holds — what we said, what the door says now, and which of our own
 * checks we withdrew — and leaves it one press from sending. The
 * press stays human for the two reasons it always has: the wire is
 * paused (WIRE_PAUSED_SINCE), and rule 30 does not relax because the
 * email happens to be an apology.
 *
 * It leads with the retraction and never asks for anything. A
 * correction with a sales line at the bottom is not a correction.
 * ⚑ Rule 7: the keeper kills or keeps this wording.
 */
export function draftCorrection(
  row: NoteAuditRow,
  base: string,
): string | null {
  if (row.finding.call !== "ours" || !row.claim) return null;
  const said = row.claim.failed.join(", ");
  const sentOn = (row.status_at ?? row.claim.at).slice(0, 10);
  const nowReads =
    row.audit.verdict === "ready"
      ? "passes every check in that battery"
      : `fails ${row.audit.failed.join(", ") || "nothing we name"} — a different finding from the one you were sent`;
  return `Subject: correcting what we sent you about ${row.host}

Hello — I run ${base.replace("https://", "")}. On ${sentOn} we wrote to you about ${row.host} and told you it failed ${said}.

We were wrong, and the fault is ours, not a change at your end. We have since retracted those checks: the correction is at ${base}/corrections, dated ${row.finding.correction_date}. Read against the door you were running that day, our instrument could not have judged it.

Re-read today at ${row.audit.at.slice(0, 16).replace("T", " ")} UTC, your door ${nowReads}.

What we have done about it:
- The passport at ${base}/passport/${row.host} no longer publishes a verdict derived from that reading. It says there is no verdict and links the correction, rather than showing a soft no.
- The signed weekly record keeps the row as it was walked — it is hash-chained and we do not edit it — and the correction sits beside it, dated.
- Re-check it yourself, free, no account:
    curl -X POST ${base}/api/preflight -H 'Content-Type: application/json' -d '{"url":"https://${row.host}/"}'

Sorry for the noise. No reply needed, and there is nothing to buy here.
`;
}

/** Sent or replied hosts, never audited first, then oldest audit first. */
function auditOrder(ledger: OutreachLedger): string[] {
  return Object.entries(ledger.hosts)
    .filter(([, entry]) => entry.status === "sent" || entry.status === "replied")
    .sort(([, a], [, b]) => (a.audit?.at ?? "").localeCompare(b.audit?.at ?? ""))
    .map(([host]) => host);
}

export async function auditSentNotes(
  env: Env,
  round: WardRound,
  ledger: OutreachLedger,
  now: Date = new Date(),
  opts: { cap?: number; staleOnly?: boolean } = {},
): Promise<NoteAuditReport> {
  const cap = opts.cap ?? AUDIT_BATCH_CAP;
  const doors = new Map(round.hosts.map((entry) => [entry.host, entry]));
  const ordered = auditOrder(ledger);
  let eligible = ordered.filter((host) => doors.has(host));
  if (opts.staleOnly) {
    /*
     * THE SWEEP ONLY KNOCKS ON DOORS NOBODY HAS KNOCKED ON TODAY. A
     * pass that re-read the same five every half hour would spend
     * forty-eight knocks a day on five doors and never reach the
     * sixth — and each knock is somebody's server.
     */
    const floor = now.getTime() - AUDIT_FRESH_HOURS * 3_600_000;
    eligible = eligible.filter((host) => {
      const at = ledger.hosts[host]?.audit?.at;
      return !at || new Date(at).getTime() < floor;
    });
  }
  const report: NoteAuditReport = {
    rows: [],
    no_door: ordered.filter((host) => !doors.has(host)),
    remaining: Math.max(0, eligible.length - cap),
  };
  const { probeHost } = await import("@/services/ward-round");
  for (const host of eligible.slice(0, cap)) {
    const door = doors.get(host)!;
    const probe = await probeHost(env, door.url);
    const audit: NoteAudit = {
      at: now.toISOString(),
      verdict: probe.verdict === "not_probed" ? "unreachable" : probe.verdict,
      failed: probe.failed,
      ...(probe.battery ? { battery: probe.battery } : {}),
    };
    const entry = ledger.hosts[host]!;
    entry.audit = audit;
    report.rows.push(auditRowFor(host, entry, door, round.week, audit));
  }
  /*
   * The sweep runs every half hour and most passes have nothing stale
   * to knock on. Writing the ledger back unchanged forty-eight times
   * a day buys nothing and burns the one key every surface on this
   * desk reads.
   */
  if (report.rows.length > 0) await writeOutreachLedger(env, ledger);
  return report;
}

/** One row, built the same way for the press, the sweep and the page. */
function auditRowFor(
  host: string,
  entry: OutreachEntry,
  door: WardHostResult | undefined,
  week: string | undefined,
  audit: NoteAudit,
): NoteAuditRow {
  const { claim, baseline } = claimFor(entry, door, week);
  const finding = callAudit(claim, audit);
  return {
    host,
    status: entry.status!,
    ...(entry.status_at ? { status_at: entry.status_at } : {}),
    claim,
    baseline,
    row:
      door && door.verdict !== "not_probed"
        ? { verdict: door.verdict, failed: door.failed }
        : null,
    audit,
    finding,
    disagrees: finding.call !== "agree",
  };
}

/**
 * THE SWEEP: the re-read, on a clock, so a wrong note is found by the
 * desk rather than by the operator it went to.
 *
 * Rides the half-hourly tick and paces itself daily per door
 * (AUDIT_FRESH_HOURS). It knocks and it pages; it never sends,
 * stamps, or resolves anything — rule 30 is not relaxed by putting a
 * cron in front of it, and the healed-or-ours call it cannot derive
 * is still the keeper's. What changed is that he no longer has to
 * remember to go and look.
 */
export async function auditSweep(
  env: Env,
  now: Date = new Date(),
): Promise<NoteAuditReport | null> {
  const { latestWardRound } = await import("@/services/ward-round");
  const round = await latestWardRound(env);
  if (!round) return null;
  const ledger = await readOutreachLedger(env);
  const report = await auditSentNotes(env, round, ledger, now, {
    cap: AUDIT_SWEEP_CAP,
    staleOnly: true,
  });
  const { sendAlert } = await import("@/lib/alerts");
  for (const row of report.rows) {
    if (row.finding.call === "agree") continue;
    /*
     * Keyed per host and per call, so a standing disagreement is one
     * page rather than one a day — and a row that moves from `look`
     * to `ours` pages again, because that is news.
     */
    await sendAlert(env, {
      condition: "worker_health",
      key: `note-audit:${row.finding.call}:${row.host}`,
      detail:
        row.finding.call === "ours"
          ? `A note this desk sent to ${row.host} is owed a correction. ${row.finding.why} The correction is drafted and waiting on /admin/outreach#audit — one press sends it.`
          : `A note this desk sent to ${row.host} no longer holds. ${row.finding.why} Nothing here derives healed-from-ours; look at /admin/outreach#audit.`,
    });
  }
  return report;
}

/**
 * The audits already on the ledger, laid beside the round, for the
 * page — no knock. Same disagreement rule as the press.
 */
export function auditedNotes(round: WardRound, ledger: OutreachLedger): NoteAuditRow[] {
  const doors = new Map(round.hosts.map((entry) => [entry.host, entry]));
  const rank: Record<AuditCall, number> = { ours: 0, look: 1, agree: 2 };
  return Object.entries(ledger.hosts)
    .filter(([, entry]) => entry.audit && (entry.status === "sent" || entry.status === "replied"))
    .map(([host, entry]) =>
      auditRowFor(host, entry, doors.get(host), round.week, entry.audit!),
    )
    .sort(
      (a, b) =>
        rank[a.finding.call] - rank[b.finding.call] || a.host.localeCompare(b.host),
    );
}

/**
 * THE WIRE IS PAUSED (keeper's ruling, 2026-08-26), and the pause is
 * a refusal in the wire rather than a note in a doc.
 *
 * On 2026-08-21 Symantec/Bluecoat categorized this domain "Suspicious
 * and Spam" and FortiGuard "Spam URLs, High Risk". FortiGuard defines
 * that category as URLs FOUND IN SPAM EMAILS — and the operator notes
 * this wire sends are the only email this domain has ever sent to
 * strangers. Within five days two real reviewers behind corporate
 * filters reported the site down. Every note sent while flagged
 * deepens the exact signal the recategorization disputes are trying
 * to reverse, so the wire declines even the keeper's own button.
 *
 * TO UNPAUSE: delete WIRE_PAUSED_SINCE and the guard below, after the
 * vendor categories clear. test/wire-paused.spec.ts pins the pause;
 * removing both is one edit and one deliberately failing test.
 */
export const WIRE_PAUSED_SINCE = "2026-08-26";

export type WireOutcome =
  | { sent: true; to: string; verified_at: string }
  | {
      sent: false;
      reason:
        | "already-sent"
        | "no-email-contact"
        | "door-healed"
        | "not-in-queue"
        | "wire-not-configured"
        | "wire-paused"
        | "send-failed";
      detail: string;
    };

/**
 * THE WIRE — one press, one host, one live-verified note (rule 30 as
 * amended 2026-08-20; the verified-fact law in the file header).
 *
 * Sequence: refuse anything already sent; refuse hosts without a
 * published email; RE-PROBE THE DOOR NOW; if it answers correctly,
 * record the healing and send nothing; otherwise draft from the
 * seconds-old probe — never the stored round — and hand it to Resend.
 * The stamp lands only after Resend accepts, and a wired stamp is
 * permanent: clear-all skips it, because the note's own text promises
 * one note ever.
 */
export async function wireNote(
  env: Env,
  host: string,
  prospects: Prospect[],
  ledger: OutreachLedger,
): Promise<WireOutcome> {
  if (WIRE_PAUSED_SINCE) {
    return {
      sent: false,
      reason: "wire-paused",
      detail: `The wire is paused since ${WIRE_PAUSED_SINCE}: the domain was categorized Spam/Suspicious by FortiGuard and Symantec on 2026-08-21, and outbound notes are the likeliest cause. Sending while flagged deepens the signal the recategorization disputes are reversing. Scouting and drafting still run; only delivery declines.`,
    };
  }
  return deliverWireNote(env, host, prospects, ledger);
}

/**
 * THE DELIVERY HALF, split out when the pause landed so the wire's
 * behavior stays specified while the wire itself declines. Nothing
 * outside this file and its behavior spec may call this: the routes
 * go through wireNote, where the pause lives, and
 * test/wire-paused.spec.ts asserts that structurally.
 */
export async function deliverWireNote(
  env: Env,
  host: string,
  prospects: Prospect[],
  ledger: OutreachLedger,
): Promise<WireOutcome> {
  const entry = ledger.hosts[host];
  if (entry?.status === "sent" || entry?.status === "replied") {
    return {
      sent: false,
      reason: "already-sent",
      detail: `${host} is already marked ${entry.status}${entry.sent_to ? ` (wired to ${entry.sent_to})` : ""}; the promise is one note per host, ever.`,
    };
  }
  const to = contactEmail(entry);
  if (!to) {
    return {
      sent: false,
      reason: "no-email-contact",
      detail: `${host} published no email contact — only hand delivery can reach it.`,
    };
  }
  const prospect = prospects.find((p) => p.host === host);
  if (!prospect) {
    return {
      sent: false,
      reason: "not-in-queue",
      detail: `${host} is not in the current round's queue; nothing to verify against.`,
    };
  }
  if (!env.RESEND_API_KEY) {
    return {
      sent: false,
      reason: "wire-not-configured",
      detail: "RESEND_API_KEY is not set; the wire has no way to send.",
    };
  }

  // The verified-fact law: the door is probed NOW, and the note is
  // drafted from what THIS probe saw.
  const { probeHost } = await import("@/services/ward-round");
  const live = await probeHost(env, prospect.url);
  const verifiedAt = new Date().toISOString();
  if (live.verdict === "ready") {
    ledger.hosts[host] = {
      ...entry,
      status: "fixed",
      status_at: verifiedAt,
      verified_at: verifiedAt,
    };
    await writeOutreachLedger(env, ledger);
    return {
      sent: false,
      reason: "door-healed",
      detail: `${host} answered correctly on the live re-probe — the week's reading is stale, nothing was sent, and it is marked fixed.`,
    };
  }

  const fresh: Prospect = {
    ...prospect,
    verdict: live.verdict === "unreachable" ? "unreachable" : "not_ready",
    failed: live.failed,
    observed_at: verifiedAt,
  };
  const body = draftNote(fresh, env.STORE_BASE_URL, {
    firstSeenWeek: prospect.week,
  });
  /*
   * WHAT THIS NOTE CLAIMS, FROZEN BEFORE IT LEAVES (2026-09-06). The
   * re-read holds the door against THIS, not against whatever the
   * census says months from now.
   */
  const claimed: ClaimedNote = {
    at: verifiedAt,
    week: prospect.week,
    verdict: fresh.verdict,
    failed: fresh.failed,
    ...(prospect.networks ? { networks: prospect.networks } : {}),
  };
  const [subjectLine, ...rest] = body.split("\n");
  const subject = subjectLine!.replace(/^Subject:\s*/, "");
  const text = rest.join("\n").trimStart();

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "The Store <alerts@scvd.store>",
      to: [to],
      /**
       * REPLY-TO, added 2026-08-20 after the first 70 real sends: the
       * note signs "the keeper" and invites a conversation, but
       * without this an operator's Reply landed in the alerts
       * mailbox nobody converses from. Replies are the entire yield
       * of outreach; they go to the address the keeper actually
       * reads (the same one every public surface names).
       */
      reply_to: STORE_CONTACT_EMAIL,
      subject,
      text,
    }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    return {
      sent: false,
      reason: "send-failed",
      detail: `Resend answered ${response.status}${detail ? `: ${detail.slice(0, 200)}` : ""}. Nothing was stamped; press again or deliver by hand.`,
    };
  }
  ledger.hosts[host] = {
    ...entry,
    status: "sent",
    status_at: verifiedAt,
    wired: true,
    sent_to: to,
    verified_at: verifiedAt,
    claimed,
  };
  await writeOutreachLedger(env, ledger);
  return { sent: true, to, verified_at: verifiedAt };
}

/**
 * Per-press ceiling on the batch wire (rule 30, second amendment
 * 2026-08-20). Ten, not unbounded, for two reasons that are not
 * doctrine but physics: (1) DELIVERABILITY — a young sending domain
 * that fires hundreds of cold notes in one minute reads as a spam
 * cannon to every receiving filter, and a trust store on a blocklist
 * has torched the asset it sells; (2) the press is only an approval
 * if the keeper can actually see what he approved — ten cards fit on
 * a screen. Press again for the next ten. The keeper can re-rule the
 * number.
 */
export const WIRE_BATCH_CAP = 10;

export interface BatchWireReport {
  sent: { host: string; to: string }[];
  healed: string[];
  refused: { host: string; reason: string }[];
  /** Eligible hosts the cap left for the next press. */
  remaining: number;
}

/**
 * THE BATCH WIRE — one press, up to WIRE_BATCH_CAP hosts, every one
 * still walking the full single-wire path: live re-probe, draft from
 * the seconds-old reading, one note per host ever. Eligibility is
 * exactly what the per-card button requires (an email contact, no
 * note ever sent); everything else on the queue is untouched. Runs
 * sequentially, not pooled — each send is an outward act and a
 * failure mid-batch should leave a legible ledger, not ten races.
 */
export async function wireAllScouted(
  env: Env,
  prospects: Prospect[],
  ledger: OutreachLedger,
  /**
   * The sender, injectable so the batch's own mechanics (cap,
   * eligibility, heal-skip, stop-on-dead-wire) stay specified while
   * the default sender is paused. The default IS the pause: routes
   * never pass this, and the structural test in wire-paused.spec
   * holds them to it.
   */
  send: typeof wireNote = wireNote,
): Promise<BatchWireReport> {
  const eligible = prospects.filter((p) => {
    const entry = ledger.hosts[p.host];
    if (entry?.status === "sent" || entry?.status === "replied") return false;
    return contactEmail(entry) !== null;
  });
  const slice = eligible.slice(0, WIRE_BATCH_CAP);
  const report: BatchWireReport = {
    sent: [],
    healed: [],
    refused: [],
    remaining: eligible.length - slice.length,
  };
  for (const prospect of slice) {
    const outcome = await send(env, prospect.host, prospects, ledger);
    if (outcome.sent) {
      report.sent.push({ host: prospect.host, to: outcome.to });
    } else if (outcome.reason === "door-healed") {
      report.healed.push(prospect.host);
    } else {
      report.refused.push({ host: prospect.host, reason: outcome.detail });
      // A wire that cannot send at all (no key, provider down) will
      // refuse every remaining host the same way — stop after the
      // first such refusal instead of logging it ten times.
      if (
        outcome.reason === "wire-not-configured" ||
        outcome.reason === "wire-paused" ||
        outcome.reason === "send-failed"
      ) {
        break;
      }
    }
  }
  return report;
}
