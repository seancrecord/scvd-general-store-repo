import { listKeys } from "@/lib/kv-list";
import { bulkGetJson } from "@/lib/kv-bulk";
import { KV_KEYS } from "@/lib/kv-keys";
import { sendAlert } from "@/lib/alerts";
import type { Env } from "@/types";
import { kvGet, kvGetJson, kvPut } from "@/lib/kv-retry";

/**
 * THE DELIVERY AUDIT — did the goods actually leave the shelf after
 * the money moved?
 *
 * THE GAP THIS EXISTS FOR (problem ledger #18), AS THE PATH RUNS
 * TODAY. Corrected 2026-08-24 under ledger D3: the description below
 * had outlived the code. It still recited the pre-amendment ordering
 * — settle, record, then `await next()` — which was true when this
 * file was written and stopped being true when the gate went
 * deliver-first. A comment describing a settlement order the store no
 * longer uses is rule 45 doc-drift on the money path, which is the
 * worst place to keep a stale map.
 *
 * WHAT ACTUALLY HAPPENS NOW (full rationale in lib/payment-gate.ts):
 *
 *     verify + replay guard    unchanged, still first
 *     await next()             handler gets a PENDING authorization
 *     pending.settle()         called by the route at its own last
 *                              line, immediately before the mint
 *     mint                     signature + KV writes
 *
 * A route that mints nothing never calls settle, and the gate settles
 * for it after a 2xx — stock x402 ordering. The trade was made
 * deliberately: settling first meant money moved and the delivery step
 * could still die, which happened four times on Base and twice on
 * Solana, every one an item that read the chain after settling against
 * a rate-limited public RPC.
 *
 * SO WHY THIS FILE STILL EXISTS. The window shrank; it did not close.
 * Between `pending.settle()` and a finished mint there is still a
 * signature and a KV write — local and fast, and not nothing. A
 * handler that dies in that gap leaves a settled payment, a bumped
 * counter, a bumped payer row and NO ARTIFACT, and a reconciliation
 * of counters against payer rows reports `unexplained: 0`. The books
 * balance. The buyer got nothing. That is still the worst failure
 * class this store has: money taken, goods not delivered, and no
 * complaint guaranteed, because the buyer may be an agent that is no
 * longer running.
 *
 * HOW: an intent row, written after settlement and before the handler,
 * deleted only when the handler returns goods. Anything still sitting
 * there after a grace period is a sale that took money and delivered
 * nothing. This is the ordinary outbox pattern, and the reason it fits
 * is that it does not need the artifact classes to agree on a shape —
 * a certificate, an order, a stamp and a pass are all just "the
 * handler returned 2xx", which is the one fact common to every shelf.
 *
 * WHICH DIRECTION IT FAILS, chosen deliberately. If the intent write
 * fails, the sale still proceeds — refusing a paid sale because an
 * audit row would not write is worse than the gap it protects — and
 * that sale becomes invisible to this audit rather than falsely
 * flagged. If the CLEARING write fails after a good delivery, the row
 * survives and raises a false alarm. A false alarm the keeper can
 * dismiss beats a silent loss he never learns about, so the design
 * leans that way on purpose.
 */

/** How long a row may sit before it stops being an in-flight request. */
export const DELIVERY_GRACE_MINUTES = 10;

/** Ceiling on a sweep. An unnamed cap is a silent one. */
export const DELIVERY_SCAN_CAP = 500;

export interface DeliveryIntent {
  /** The route that took the money. */
  path: string;
  /**
   * WHAT THE BUYER ACTUALLY ASKED FOR, and it was missing when it
   * mattered most.
   *
   * On 2026-08-10 a settlement_attestation dropped after settling. The
   * keeper went to fulfil it by hand and could not — because the store
   * had recorded the path, the payer and the amount, and NOT the
   * `tx_hash` the buyer wanted attested. The order record did not
   * exist either: the throw happened before createOrder. So the one
   * fact needed to produce the artifact was the one fact nobody kept,
   * and a recoverable failure was forced into a refund.
   *
   * The admin page had been offering "fulfilled by hand" the whole
   * time — an option the data could not support.
   *
   * `payment_payload` is stripped: it is the buyer's signed
   * authorization, it is already spent, and there is no reason to keep
   * it lying around.
   */
  query?: string;
  /** On-chain settlement, when the facilitator returned one. */
  transaction?: string;
  payer?: string;
  paid_usdc: number;
  settled_at: string;
}

export interface UndeliveredSale extends DeliveryIntent {
  key: string;
  minutes_waiting: number;
}

export interface DeliveryAudit {
  checked: number;
  /** Rows young enough to still be a request in flight. */
  in_flight: number;
  undelivered: UndeliveredSale[];
  truncated: boolean;
  scanned_at: string;
}

/**
 * A settled sale whose goods have not gone out yet.
 *
 * Keyed by transaction when there is one, because that is the fact an
 * outside party can check on Base; only synthesised when the
 * facilitator returned no hash, and marked so the difference stays
 * visible rather than being smoothed over.
 */
export async function openDeliveryIntent(
  env: Env,
  intent: DeliveryIntent,
): Promise<string> {
  const id = intent.transaction ?? `notx-${crypto.randomUUID()}`;
  const key = KV_KEYS.deliveryIntent(id);
  await kvPut(env.ORDERS, key, JSON.stringify(intent));
  return key;
}

/** Goods went out. The row's whole purpose is to stop existing. */
export async function closeDeliveryIntent(
  env: Env,
  key: string,
): Promise<void> {
  await env.ORDERS.delete(key);
}

/**
 * Is this settle's delivery still owed? The paid retry's gate
 * question (2026-08-08): an OPEN row means money moved and goods
 * never left, which is the one state where a spent nonce should buy
 * something instead of a refusal.
 */
export async function getOpenDeliveryIntent(
  env: Env,
  transaction: string,
): Promise<{ key: string; intent: DeliveryIntent } | null> {
  const key = KV_KEYS.deliveryIntent(transaction);
  const intent = await kvGetJson<DeliveryIntent>(env.ORDERS, key, "json");
  return intent ? { key, intent } : null;
}

/**
 * Walk the open intents and separate "still in flight" from "took the
 * money and delivered nothing".
 *
 * Reports rather than repairs. There is no honest automatic remedy: we
 * cannot re-run a handler whose side effects we do not know, and we
 * will not refund without the keeper, because a refund is money moving
 * and money never moves on a cron here. What this buys is that the
 * keeper finds out before the buyer does.
 */
export async function auditDeliveries(
  env: Env,
  now: Date = new Date(),
): Promise<DeliveryAudit> {
  const listed = await listKeys(env.ORDERS, {
    prefix: KV_KEYS.deliveryIntentPrefix,
    cap: DELIVERY_SCAN_CAP,
  });
  const values = await bulkGetJson<DeliveryIntent>(env.ORDERS, listed.names);

  const undelivered: UndeliveredSale[] = [];
  let inFlight = 0;
  for (const key of listed.names) {
    const intent = values.get(key);
    if (!intent) continue;
    const settledAt = new Date(intent.settled_at).getTime();
    /**
     * An unreadable timestamp counts as OVERDUE, not as in-flight.
     * The opposite choice would let one bad date hide a real
     * undelivered sale forever, and the cost of being wrong this way
     * is one dismissible alert.
     */
    const minutes = Number.isFinite(settledAt)
      ? Math.floor((now.getTime() - settledAt) / 60000)
      : Number.POSITIVE_INFINITY;
    if (minutes < DELIVERY_GRACE_MINUTES) {
      inFlight += 1;
      continue;
    }
    undelivered.push({
      ...intent,
      key,
      minutes_waiting: Number.isFinite(minutes) ? minutes : -1,
    });
  }
  undelivered.sort((a, b) => b.minutes_waiting - a.minutes_waiting);

  return {
    checked: listed.names.length,
    in_flight: inFlight,
    undelivered,
    truncated: listed.names.length >= DELIVERY_SCAN_CAP,
    scanned_at: now.toISOString(),
  };
}

/**
 * THE KEEPER'S RESOLUTION, added 2026-08-04 when the audit caught its
 * first two real catches (settlement_attestation settled, fulfillment
 * crashed — house money, batch-1 of the Solana registration run) and
 * there was no way to tell it "handled": the row only cleared on
 * automatic delivery, so a by-hand refund or fulfilment left the
 * keeper paged every six hours about a sale he had already settled.
 *
 * A resolution is a RECORD, not an erasure: the intent row is
 * replaced by a resolution row naming the outcome and the hand, kept
 * on the same 90-day clock as the event rows.
 */
export type DeliveryOutcome = "fulfilled_by_hand" | "refunded" | "house_absorbed";

export async function resolveDeliveryIntent(
  env: Env,
  transaction: string,
  outcome: DeliveryOutcome,
): Promise<{ ok: true } | { ok: false; refusal: string }> {
  const id = transaction.trim();
  if (!id) {
    return { ok: false, refusal: "A settlement transaction id is required." };
  }
  const key = KV_KEYS.deliveryIntent(id);
  const intent = await kvGet(env.ORDERS, key);

  /*
   * A SECOND RESOLUTION IS A CORRECTION, NOT A MYSTERY.
   *
   * The first resolution consumes the intent row, so a keeper who
   * clicks the wrong outcome and comes back to fix it lands in the
   * no-intent branch below — which would file the fix as a chain
   * orphan and attach the note "No delivery intent ever existed."
   * That note would be false, and it would be false on the record of
   * a correction, which is the worst place for it.
   *
   * Live case 2026-08-10: the keeper refunded a dropped attestation
   * and clicked "fulfilled by hand." The money moved one way and the
   * record said the other.
   *
   * So the prior outcome is KEPT rather than overwritten. This store
   * publishes its corrections; a record that quietly changes its mind
   * is worth less than one that shows it did.
   */
  const priorRaw = await kvGet(env.ORDERS, `delivery_resolved:${id}`);
  if (priorRaw) {
    let prior: unknown = null;
    try {
      prior = JSON.parse(priorRaw);
    } catch {
      prior = priorRaw;
    }
    const priorOutcome = (prior as { outcome?: string } | null)?.outcome;
    if (priorOutcome === outcome) {
      return { ok: true };
    }
    await kvPut(env.ORDERS, 
      `delivery_resolved:${id}`,
      JSON.stringify({
        outcome,
        at: new Date().toISOString(),
        corrected: true,
        superseded: prior,
        note: `Corrected by hand from "${priorOutcome ?? "unknown"}" to "${outcome}". The earlier record is kept above rather than overwritten.`,
      }),
      { expirationTtl: 90 * 86400 },
    );
    return { ok: true };
  }

  if (!intent) {
    /**
     * NO INTENT ROW is not always a typo: a CHAIN ORPHAN — money the
     * bank walk found on-chain with no certificate — never had one,
     * because it never went through the buy flow. The walk's cursor
     * has moved past it, so nothing will ever revisit it; the alert
     * trail is its only record and this lever its only closer. The
     * typo guard survives by asking the trail: a tx no alert ever
     * named still gets the refusal. (Live case 2026-08-05: two
     * Jupiter swaps of the keeper's own money, unresolvable for two
     * days because this branch refused everything without an intent.)
     */
    const { listAlerts } = await import("@/lib/alerts");
    const trail = await listAlerts(env, 200);
    const named = trail.some((entry) => entry.detail.includes(id));
    if (!named) {
      return {
        ok: false,
        refusal:
          "No open delivery intent and no alert names that transaction — either already delivered/resolved, or the id is not the one from the alert.",
      };
    }
    await kvPut(env.ORDERS, 
      `delivery_resolved:${id}`,
      JSON.stringify({
        outcome,
        at: new Date().toISOString(),
        source: "chain_reconciliation",
        note: "No delivery intent ever existed: the chain walk found this money outside the buy flow. Resolved from its alert.",
      }),
      { expirationTtl: 90 * 86400 },
    );
    return { ok: true };
  }
  await kvPut(env.ORDERS, 
    `delivery_resolved:${id}`,
    JSON.stringify({
      outcome,
      at: new Date().toISOString(),
      intent: JSON.parse(intent) as unknown,
    }),
    { expirationTtl: 90 * 86400 },
  );
  await env.ORDERS.delete(key);
  return { ok: true };
}

/**
 * The cron pass. Alerts per sale rather than in a batch, keyed so a
 * standing failure pages once every six hours instead of hourly — but
 * a SECOND undelivered sale is its own news and gets its own page.
 */
export async function runDeliveryAudit(
  env: Env,
  now: Date = new Date(),
): Promise<DeliveryAudit> {
  const audit = await auditDeliveries(env, now);
  for (const sale of audit.undelivered) {
    await sendAlert(env, {
      condition: "undelivered_sale",
      detail: `A payment settled on ${sale.path} ${sale.minutes_waiting} minutes ago and no goods went out.${
        sale.transaction ? ` Settlement: ${sale.transaction}.` : ""
      }${
        sale.payer ? ` Payer: ${sale.payer}.` : ""
      } Paid ${sale.paid_usdc} USDC.${
        sale.query
          ? ` THEY ASKED FOR: ${sale.query} — that is enough to produce the goods, so this one can be FULFILLED rather than refunded.`
          : " WHAT THEY ASKED FOR WAS NOT RECORDED (settled before 2026-08-10), so this one cannot be fulfilled by hand — only refunded."
      } This is money taken without delivery — check the order, then refund or fulfil by hand.`,
      key: sale.key,
    }).catch(() => {
      // The alert is the courtesy; the row stays either way, and the
      // next pass will try again.
    });
  }
  return audit;
}
