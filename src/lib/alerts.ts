import { listKeys } from "@/lib/kv-list";
import { invertedTimestamp } from "@/lib/kv-keys";
import { bulkGetJson } from "@/lib/kv-bulk";
import type { Env } from "@/types";
import { outboundHeaders } from "@/lib/identity";
import { kvGet, kvGetJson, kvPut } from "@/lib/kv-retry";

/**
 * P1 alerting. A short list of conditions pages the keeper — see
 * ALERT_CONDITIONS below, which is the list rather than a description
 * of one; everything else belongs in the Sunday digest. Email rides Resend's plain HTTPS
 * API (simplest reliable send from a Worker: one fetch, one secret,
 * no bindings to configure), when RESEND_API_KEY/ALERT_EMAIL are
 * unset, alerts still log to console and to KV, so a mute store never
 * becomes a silent one. Per-key dedupe keeps a repeating failure from
 * paging more than once every six hours.
 */

/**
 * THE LIST IS THE SOURCE, AND THE COUNT IS READ FROM IT.
 *
 * This was a union type beside a sentence that said "exactly four
 * conditions page the keeper" — and the sentence went out in the
 * FOOTER OF EVERY ALERT EMAIL. Three conditions were added over the
 * following week and the footer kept saying four, so the keeper was
 * being told a number about his own alerting that had been wrong for
 * days. He asked what the line meant, which is how it was found.
 *
 * A hand-typed count in prose beside a list in code is two sources of
 * truth for one fact — the same defect as the rotation count, the
 * "never rotated" line and the /attestation field list, all of which
 * broke in the same week. So the array is the list, the type is
 * derived from the array, and the count is read from the array at the
 * moment the email is written.
 */
export const ALERT_CONDITIONS = [
  "settlement_failure",
  "signing_failure",
  "worker_health",
  "order_sla",
  /** The machine-facing surfaces have gone quiet. Not a fault; a nudge. */
  "catalog_stale",
  /** Somebody outside the house opened a wallet here and was turned away. */
  "payment_declined",
  /**
   * THE ONE THE FRONT PAGE IS WAITING ON. Fires once, ever, the first
   * time a wallet that is not ours presents a payment signature —
   * whether it clears or bounces. CV's refinement and it is the right
   * one: a stranger who tries and fails is the same magnitude of news
   * as one who succeeds, and arguably better, because a decline is the
   * thing we can still fix. Keying this to a clean settle would let a
   * genuine first contact sit unflagged because their client was
   * broken, which is exactly what happened on 2026-07-28.
   */
  "first_outside_signature",
  /**
   * THE WORST ONE, and the newest: a payment settled and no goods went
   * out. Money taken without delivery, with no complaint guaranteed
   * because the buyer may be an agent that is no longer running. It
   * pages because it is the one failure the store cannot discover by
   * being told about it (problem ledger #18).
   */
  "undelivered_sale",
  /**
   * Sub-price USDC arrived on chain: it CANNOT be a purchase (no 402
   * settles under the cheapest listing) and is probably an
   * address-poisoning lure hoping to be copied out of transaction
   * history. Pages so the keeper knows NOT to touch it — the risk it
   * carries is entirely in the response it invites, which is exactly
   * why it must not ride an alert whose subject says "undelivered
   * sale" and whose body says "refund by hand". First live instance
   * 2026-08-04, a lookalike of CV's wallet.
   */
  "chain_dust",
  /**
   * USDC arrived in the store's wallet in a transaction the store's
   * OWN KEY signed — which no purchase ever involves, so it is the
   * house's own hand (a swap output, a consolidation) and must not
   * page as an undelivered sale. First live instance 2026-08-04: two
   * Jupiter swaps from the keeper's Solflare sat two days as "$52.09
   * unbooked" because the walk had no name for our own money
   * arriving. Pages once so the record exists — and because a
   * self-signed transaction the keeper does NOT recognize is the key
   * off the paper, which is the loudest alarm this store has.
   */
  "chain_self_transfer",
  /**
   * A published identity stopped holding on the production counters —
   * settle counters vs payer rows, the rail tally vs the organic
   * count, or a completed month booking more on a chain than the
   * chain shows. The public surfaces are built to drop or derive
   * rather than print a contradiction, which means the CONTRADICTION
   * ITSELF would otherwise be silent: every prior books defect was
   * found by the keeper reading his own pages against each other.
   * This condition is the machine doing that reading, hourly.
   */
  "books_invariant",
  /**
   * MONEY LEFT THE TILL (2026-08-18). The store's code holds no key
   * to the receiving wallets and never sends from them, so an
   * outgoing transfer is the keeper's own hand or a theft — and the
   * difference between catching a drained wallet within the hour and
   * at the next monthly glance is the whole balance. Keyed by tx, so
   * one sweep the keeper made himself pages once and is dismissed
   * with a glance.
   */
  "till_outflow",
  /**
   * THE SCREEN THAT FAILED CLOSED IN SILENCE (2026-09-04). Every
   * payout this store makes sits behind the sanctions screen, and the
   * screen fails closed when it cannot answer — correctly. On
   * 2026-09-03 it could not answer for ninety minutes, every bounty
   * claim was refused by rule, and nothing paged: the keeper learned
   * it from a walker's letter. This is the one failure the store
   * cannot discover by being told, because the people turned away are
   * strangers with no address to write to. Keyed by door, so a run of
   * refusals at one door pages once and backs off.
   */
  "payout_screen_unavailable",
] as const;

export type AlertCondition = (typeof ALERT_CONDITIONS)[number];

const DEDUPE_TTL_SECONDS = 6 * 60 * 60;

/**
 * HOW OFTEN THE SAME UNRESOLVED PROBLEM IS ALLOWED TO PAGE.
 *
 * Six hours flat meant an undelivered sale mailed the keeper four
 * times a day, forever, saying the identical thing he already knew.
 * That is not alerting, it is nagging, and its real cost is that a
 * mailbox full of a known problem is a mailbox where a NEW one goes
 * unread.
 *
 * So the cadence backs off: the first page is immediate, the second
 * six hours later, then a day, then three, then weekly. A standing
 * problem stays visible on the admin page — where looking for it is
 * the point — and stops competing for attention in email.
 */
const PAGE_BACKOFF_SECONDS = [
  6 * 60 * 60,
  24 * 60 * 60,
  3 * 24 * 60 * 60,
  7 * 24 * 60 * 60,
] as const;

function pageIntervalFor(repeats: number): number {
  const index = Math.min(
    Math.max(repeats - 1, 0),
    PAGE_BACKOFF_SECONDS.length - 1,
  );
  return PAGE_BACKOFF_SECONDS[index] ?? DEDUPE_TTL_SECONDS;
}
const ALERT_LOG_TTL_SECONDS = 30 * 86400;

/**
 * ELEVEN PAGES FOR A PASS (task #25, 2026-08-27). A conformance
 * instrument walked our door with deliberately varied bad payments —
 * both instruments doing their jobs — and every distinct refusal
 * minted a distinct payment_declined page, so the keeper's phone read
 * eleven incidents where zero had happened. Being probeable is this
 * store's own posture (we probe everyone else's doors), so probe
 * traffic is a standing condition, not an anomaly.
 *
 * The remedy is a BUDGET, not a filter. No heuristic here decides
 * which decline is "really" a probe, because a heuristic that guesses
 * wrong eats a real buyer's only signal — 2026-07-28 is the day that
 * cost is named after. Every decline still writes its row and the
 * desk stays complete; what caps is the EMAIL: a spread of distinct
 * declines inside one hour is one fact about the door, not that many
 * incidents, and the last email under the budget says the fold is
 * happening. Conditions not listed here are unbudgeted — for an
 * undelivered sale, every page IS an incident.
 */
export const HOURLY_EMAIL_BUDGET: Partial<Record<AlertCondition, number>> = {
  payment_declined: 3,
};

export interface AlertInput {
  condition: AlertCondition;
  detail: string;
  /** Extra dedupe discriminator (e.g. an order id). */
  key?: string;
}

/**
 * A STANDING PROBLEM IS ONE ROW, NOT ONE ROW EVERY SIX HOURS.
 *
 * THE BUG THIS FIXES, found by the keeper doing forensics at 3am and
 * having to cross-check six renders against a transaction hash to
 * learn that nothing new had happened.
 *
 * sendAlert used to return EARLY when the page-dedupe key was set, so
 * an unresolved condition wrote nothing for six hours — and then, the
 * moment that key expired, minted a BRAND NEW log row with a brand new
 * `at`. The same undelivered sale therefore appeared at 03:30, then
 * again at 09:30, then again at 15:30. Not a row changing its date: a
 * new row for an event that had not moved.
 *
 * Log rows live thirty days, so one unresolved event could leave a
 * hundred and twenty of them, and listAlerts returns the newest N —
 * which is why the surface also dropped DISTINCT events off the
 * bottom, and why it got less trustworthy the longer it went unread.
 * An alarm surface that degrades while you are not looking at it is
 * worse than none, because it is worst exactly when it is needed.
 *
 * Now: one row per condition-and-key, `at` is FIRST seen and never
 * moves, `last_seen` and `repeats` carry the rest. The six-hour
 * dedupe still governs the EMAIL, which is a separate question and
 * was never the broken half.
 */
function alertIdentity(input: AlertInput): string {
  /*
   * Keyless alerts key off their own text. Collapsing every keyless
   * worker_health alert into one row would hide distinct failures
   * behind whichever fired first, which trades this bug for a worse
   * one. FNV-1a: a dedupe discriminator, not a security primitive.
   */
  if (input.key) return `${input.condition}:${input.key}`;
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.detail.length; index += 1) {
    hash ^= input.detail.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${input.condition}:d${hash.toString(36)}`;
}

export interface AlertRow {
  condition: string;
  detail: string;
  /** FIRST seen. This never moves once written. */
  at: string;
  /** Most recent time the same condition was raised again. */
  last_seen?: string;
  /** How many times it has been raised, first included. */
  repeats?: number;
}

export async function sendAlert(env: Env, input: AlertInput): Promise<void> {
  const identity = alertIdentity(input);
  const pageKey = `alert_sent:${identity}`;
  const openKey = `alert_open:${identity}`;
  const detail = input.detail.slice(0, 1000);
  const now = new Date().toISOString();
  try {
    console.error(`[P1 ${input.condition}] ${detail}`);

    // Does this condition already have a row? If so it keeps it.
    const existingLogKey = await kvGet(env.COUNTERS, openKey);
    let updated = false;
    let repeats = 1;
    if (existingLogKey) {
      const row = await kvGetJson<AlertRow>(env.COUNTERS, existingLogKey, "json");
      if (row) {
        repeats = (row.repeats ?? 1) + 1;
        await kvPut(env.COUNTERS, 
          existingLogKey,
          JSON.stringify({
            ...row,
            // detail refreshes so the text is current; `at` does not,
            // because when it STARTED is the fact being reported.
            detail,
            last_seen: now,
            repeats,
          } satisfies AlertRow),
          { expirationTtl: ALERT_LOG_TTL_SECONDS },
        );
        await kvPut(env.COUNTERS, openKey, existingLogKey, {
          expirationTtl: ALERT_LOG_TTL_SECONDS,
        });
        updated = true;
      }
    }

    if (!updated) {
      const logKey = `alert_log:${invertedTimestamp(Date.now())}`;
      await kvPut(env.COUNTERS, 
        logKey,
        JSON.stringify({
          condition: input.condition,
          detail,
          at: now,
          last_seen: now,
          repeats: 1,
        } satisfies AlertRow),
        { expirationTtl: ALERT_LOG_TTL_SECONDS },
      );
      await kvPut(env.COUNTERS, openKey, logKey, {
        expirationTtl: ALERT_LOG_TTL_SECONDS,
      });
    }

    /*
     * THE EMAIL BACKS OFF. Paging again about a problem still standing
     * is wanted; paging four times a day about one the keeper already
     * knows about is how a mailbox stops being read — and the next
     * page after that is the one that mattered.
     */
    if (await kvGet(env.COUNTERS, pageKey)) return;

    /*
     * THE HOURLY BUDGET, spent only by pages that would actually send
     * (a repeat inside its dedupe window returned above and costs
     * nothing). Over budget: the row is already written, the desk is
     * already current, and the phone stays quiet until the hour turns.
     */
    const budget = HOURLY_EMAIL_BUDGET[input.condition];
    let foldNotice = "";
    if (budget !== undefined) {
      const budgetKey = `alert_email_budget:${input.condition}:${now.slice(0, 13)}`;
      const spent = Number((await kvGet(env.COUNTERS, budgetKey)) ?? "0");
      if (spent >= budget) return;
      await kvPut(env.COUNTERS, budgetKey, String(spent + 1), {
        expirationTtl: 2 * 60 * 60,
      });
      if (spent + 1 === budget) {
        foldNotice = `\n\nThis is the last "${input.condition}" email this hour: several distinct ones inside one hour is the signature of an instrument walking the door, not a queue of separate incidents. Every further one still lands as a row at /admin — the phone just stops repeating the same fact.`;
      }
    }

    await kvPut(env.COUNTERS, pageKey, "1", {
      expirationTtl: pageIntervalFor(repeats),
    });
    await emailKeeper(env, input.condition, detail + foldNotice, now);
  } catch (error) {
    // The alarm must never take down the till it watches.
    console.error("Alert plumbing failed:", error);
  }
}

async function emailKeeper(
  env: Env,
  condition: string,
  detail: string,
  at: string,
): Promise<void> {
  if (!env.RESEND_API_KEY || !env.ALERT_EMAIL) {
    return;
  }
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: outboundHeaders({
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    }),
    body: JSON.stringify({
      from: "The Store <alerts@scvd.store>",
      to: [env.ALERT_EMAIL],
      subject: `[P1] ${condition} at the store`,
      text: `${at}\n\n${detail}\n\nOne of the ${ALERT_CONDITIONS.length} conditions that page you rather than waiting for the Sunday digest; this one is "${condition}". The back room: https://scvd.store/admin`,
    }),
  });
}

/** Recent alerts, for the back room. */
/**
 * Recent alerts, for the back room. One row per standing condition —
 * `at` is when it STARTED, `last_seen` and `repeats` say whether it is
 * still going. A row whose repeats keep climbing is a problem nobody
 * has fixed, which is a different thing from a problem happening
 * again, and the surface used to show them identically.
 */
export async function listAlerts(env: Env, limit = 20): Promise<AlertRow[]> {
  const listed = await listKeys(env.COUNTERS, { prefix: "alert_log:", cap: limit });
  const values = await bulkGetJson<AlertRow>(env.COUNTERS, listed.names);
  const alerts: AlertRow[] = [];
  for (const record of values.values()) {
    if (record) {
      alerts.push(record);
    }
  }
  return alerts;
}
