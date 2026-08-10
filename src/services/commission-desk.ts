import { KV_KEYS } from "@/lib/kv-keys";
import { sanitizeText } from "@/lib/sanitize";
import { sendAlert } from "@/lib/alerts";
import { listCommissions } from "@/services/requests";
import {
  COMMISSION_RUNGS,
  DECLINE_REPLY_CAP,
  QUOTE_EXPIRY_DAYS,
  QUOTE_NOTE_CAP,
} from "@/store/commission-desk";
import type { CommissionRequest, Env } from "@/types";

/**
 * THE DESK'S LIFECYCLE, over the request ledger that already existed:
 *
 *   requested → quoted → accepted (paid) ─→ the order machinery
 *        └────→ declined (public reply)  └→ expired (a clock, derived)
 *
 * Every transition here is the KEEPER'S HAND except `accepted`, which
 * is the buyer paying at the quoted rung, and `expired`, which is
 * never written at all — it is derived from `quote_expires_at` at
 * every read, so a quote cannot sit "live" in KV after its clock ran
 * out just because no cron happened to visit it.
 */

export type DeskStatus =
  | "requested"
  | "quoted"
  | "expired"
  | "declined"
  | "accepted";

export async function getCommission(
  env: Env,
  id: string,
): Promise<CommissionRequest | null> {
  const clean = sanitizeText(id, 60);
  if (!clean) return null;
  return env.ORDERS.get<CommissionRequest>(
    KV_KEYS.commissionRequest(clean),
    "json",
  );
}

/** The one place `expired` exists. Derived, never stored. */
export function deskStatusOf(
  request: CommissionRequest,
  now: Date = new Date(),
): DeskStatus {
  if (request.status === "accepted") return "accepted";
  if (request.status === "declined") return "declined";
  if (request.status === "quoted") {
    return request.quote_expires_at &&
      Date.parse(request.quote_expires_at) < now.getTime()
      ? "expired"
      : "quoted";
  }
  return "requested";
}

export function payUrlFor(
  base: string,
  request: CommissionRequest,
): string | null {
  if (request.quote_usdc === undefined) return null;
  return `${base}/api/commission/pay/${request.quote_usdc}?commission=${request.id}`;
}

async function put(env: Env, request: CommissionRequest): Promise<void> {
  await env.ORDERS.put(
    KV_KEYS.commissionRequest(request.id),
    JSON.stringify(request),
  );
}

export interface QuoteTerms {
  usdc: number;
  windowHours: number;
  note?: string;
}

/**
 * The keeper's quote. Refused off the ladder — the desk's whole
 * anti-forgery stance is that a price is a STATIC ROUTE, so a number
 * with no route is a quote nobody could ever pay. Re-quoting a live
 * or expired quote is allowed (terms change when the work is
 * discussed); re-quoting an accepted or declined request is not,
 * because both of those are ends.
 */
export async function quoteCommission(
  env: Env,
  id: string,
  terms: QuoteTerms,
  now: Date = new Date(),
): Promise<{ request: CommissionRequest } | { refused: string }> {
  const request = await getCommission(env, id);
  if (!request) return { refused: "No request by that id on the ledger." };
  const status = deskStatusOf(request, now);
  if (status === "accepted" || status === "declined") {
    return {
      refused: `This request is already ${status}; a quote on it would rewrite an ending.`,
    };
  }
  if (!COMMISSION_RUNGS.some((rung) => rung === terms.usdc)) {
    return {
      refused: `$${terms.usdc} is not on the ladder (${COMMISSION_RUNGS.join(", ")}). The rungs are static pay routes on purpose — a price with no route is a quote nobody can pay.`,
    };
  }
  if (
    !Number.isFinite(terms.windowHours) ||
    terms.windowHours <= 0 ||
    terms.windowHours > 24 * 90
  ) {
    return {
      refused:
        "The window has to be a positive number of hours, at most ninety days. The per-quote window is most of the desk's point; leaving it off would quietly restore the promise being retired.",
    };
  }
  request.status = "quoted";
  request.quote_usdc = terms.usdc;
  request.quote_window_hours = Math.round(terms.windowHours);
  request.quoted_at = now.toISOString();
  request.quote_expires_at = new Date(
    now.getTime() + QUOTE_EXPIRY_DAYS * 24 * 3600_000,
  ).toISOString();
  const note = sanitizeText(terms.note, QUOTE_NOTE_CAP);
  if (note) request.quote_note = note;
  else delete request.quote_note;
  await put(env, request);
  return { request };
}

/**
 * The keeper's decline, WITH the reply, because the keeper ruled the
 * reply public. A decline with no words would publish a bare refusal,
 * which is worse manners than either answering or staying quiet.
 */
export async function declineCommission(
  env: Env,
  id: string,
  reply: unknown,
  now: Date = new Date(),
): Promise<{ request: CommissionRequest } | { refused: string }> {
  const request = await getCommission(env, id);
  if (!request) return { refused: "No request by that id on the ledger." };
  const status = deskStatusOf(request, now);
  if (status === "accepted") {
    return { refused: "This request was paid; it cannot be declined now." };
  }
  const words = sanitizeText(reply, DECLINE_REPLY_CAP);
  if (!words) {
    return {
      refused:
        "A decline needs the reply — it is published, per the ruling, and a bare refusal with no reason is not the house's manners.",
    };
  }
  request.status = "declined";
  request.declined_at = now.toISOString();
  request.decline_reply = words;
  await put(env, request);
  return { request };
}

/**
 * The buyer paid: bind the order to the request. Called AFTER the
 * settle and the order write, so the money's own record never waits
 * on this one. If the row already names an order, the second payment
 * still bought a real order (the money moved; the goods exist) — the
 * conflict is alerted for the keeper's hand, the same shape as the
 * oversell backstop, and never silent.
 */
export async function acceptCommission(
  env: Env,
  id: string,
  orderId: string,
  now: Date = new Date(),
): Promise<void> {
  const request = await getCommission(env, id);
  if (!request) return;
  if (request.status === "accepted" && request.order_id !== orderId) {
    await sendAlert(env, {
      condition: "worker_health",
      detail: `COMMISSION PAID TWICE: request ${id} already accepted with order ${request.order_id}, and a second settle just created order ${orderId}. Two wallets raced the same quote past the pre-gate check. Both orders are real and the money moved twice — settle it by hand: refund one via /admin, or fill both if the week allows.`,
    }).catch(() => undefined);
    return;
  }
  request.status = "accepted";
  request.accepted_at = now.toISOString();
  request.order_id = orderId;
  await put(env, request);
}

/** The public half of the ruling: declined requests, replies attached. */
export async function listDeclinedCommissions(
  env: Env,
): Promise<CommissionRequest[]> {
  const all = await listCommissions(env);
  return all.filter((request) => request.status === "declined");
}
