import { KV_KEYS } from "@/lib/kv-keys";
import { webBotAuthHeaders } from "@/lib/web-bot-auth";
import { STORE_CONTACT_EMAIL } from "@/store/metadata";
import { getMenuItem } from "@/store/menu";
import { passportEmbedFor } from "@/pages/passport-card";
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
        observed_at: latest.at,
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
  const verifiedLine = opts.firstSeenWeek
    ? `\n(First seen on our ${opts.firstSeenWeek} weekly pass; re-checked seconds before this note was sent, so the observation above is current as of the send, not the week.)\n`
    : "";
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
export function mailtoFor(email: string, draft: string): string {
  const match = /^Subject:\s*(.*)\r?\n\r?\n?([\s\S]*)$/.exec(draft);
  const subject = match?.[1] ?? "";
  const body = match?.[2] ?? draft;
  return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
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
