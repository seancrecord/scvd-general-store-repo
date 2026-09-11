import { captureCommissionPurchase, fulfillCommissionPurchase } from "@/services/commission-purchase";
import { httpArtifactDigest } from "@/lib/artifact-checkpoint";
import { deliveryFailedBody, pageDeliveryFailed } from "@/lib/delivery-failed";
import type { SettledPayment } from "@/lib/payments";
import { freeReadRecovery } from "@/lib/buyer-guidance";
import { Hono } from "hono";
import type { Context, MiddlewareHandler } from "hono";
import { paymentGate } from "@/lib/payment-gate";
import { SettlementDeclined, SettlementUnknown } from "@/lib/payments";
import { sanitizeText } from "@/lib/sanitize";
import {
  deskStatusOf,
  getCommission,
  listDeclinedCommissions,
  payUrlFor,
} from "@/services/commission-desk";
import { capacityVerdict } from "@/services/queue-capacity";
import { requiresPresentKeeper, shutterState } from "@/services/shutter";
import { getMenuItem } from "@/store";
import {
  COMMISSION_ITEM_ID,
  COMMISSION_RUNGS,
  DESK_STANDFIRST,
} from "@/store/commission-desk";
import type { CommissionRequest, HonoEnv, MenuItem } from "@/types";

/**
 * THE COMMISSION DESK's public face (keeper's ruling C2, 2026-08-10):
 *
 *   GET /api/commission/declined     — every decline, reply attached
 *   GET /api/commission/:id          — one request's standing
 *   GET /api/commission/pay/:rung    — the ladder, x402-gated
 *
 * The write-in door stays POST /api/request (free, unchanged). The
 * pay routes are STATIC — one per published rung, priced at boot in
 * lib/payments.ts — and admission refuses before settlement. Authenticated recovery runs
 * before admission so an old obligation survives a closed desk.
 */
export const commissionRoutes = new Hono<HonoEnv>();

/** Paid material and personal ledgers never sit in a shared cache. */
const noStore: MiddlewareHandler<HonoEnv> = async (c, next) => {
  await next();
  c.res.headers.set("Cache-Control", "no-store");
};

/** Mirrors buy.ts: a signature means buying; its absence asks the price. */
function isBuying(c: Parameters<MiddlewareHandler<HonoEnv>>[0]): boolean {
  return Boolean(
    c.req.header("PAYMENT-SIGNATURE") ?? c.req.header("X-PAYMENT"),
  );
}

/**
 * What the desk says about a request in public. The CONTACT NEVER
 * RIDES: the id is a capability the requester holds, but a leaked or
 * guessed id must not hand over an email address — the reply channel
 * stays between the ledger and the keeper.
 */
function deskView(
  request: CommissionRequest,
  base: string,
): Record<string, unknown> {
  const status = deskStatusOf(request);
  return {
    id: request.id,
    received_at: request.date,
    status,
    description: request.description,
    offer_usdc: request.offer_usdc,
    ...(request.status === "quoted"
      ? {
          quote: {
            usdc: request.quote_usdc,
            window_hours: request.quote_window_hours,
            quoted_at: request.quoted_at,
            expires_at: request.quote_expires_at,
            ...(request.quote_note ? { note: request.quote_note } : {}),
            ...(status === "quoted"
              ? {
                  pay_url: payUrlFor(base, request),
                  how_to_pay:
                    "GET the pay_url over x402 with ?commission= exactly as given. The 402 challenge quotes the rung; payment above it records as a tip. The quote dies at expires_at and the money door dies with it.",
                }
              : {
                  note_on_expiry:
                    "This quote has expired and its pay route will refuse the id. Write in again at POST /api/request if the work still wants doing — terms may differ.",
                }),
          },
        }
      : {}),
    ...(request.status === "declined"
      ? {
          declined_at: request.declined_at,
          reply: request.decline_reply,
        }
      : {}),
    ...(request.status === "accepted"
      ? {
          accepted_at: request.accepted_at,
          ...(request.order_id
            ? { order_url: `${base}/api/order/${request.order_id}` }
            : {}),
        }
      : {}),
  };
}

/** Registered before /:id so "declined" is never read as an id. */
commissionRoutes.get("/api/commission/declined", noStore, async (c) => {
  const declined = await listDeclinedCommissions(c.env);
  return c.json({
    what_this_is:
      "Every commission request the keeper has declined, with the reply stated in public — the ruling is that a refusal owes its reason. Requester contacts are never published.",
    desk: DESK_STANDFIRST,
    rungs_usdc: [...COMMISSION_RUNGS],
    write_in: `POST ${c.env.STORE_BASE_URL}/api/request`,
    declined: declined.map((request) => ({
      id: request.id,
      received_at: request.date,
      declined_at: request.declined_at,
      // The request in the requester's words, capped: the reply has
      // to make sense without publishing anyone's whole brief.
      asked_for: sanitizeText(request.description, 200),
      offered_usdc: request.offer_usdc,
      reply: request.decline_reply,
    })),
  });
});

/**
 * The desk sells KEEPER LABOR, so the shutter and the bench govern it
 * exactly as they govern /api/buy/the_collab — a live quote paid while
 * the keeper is away would be money taken for work nobody is present
 * to do, which is the promise both instruments exist to keep.
 */
const deskLaborCheck = async (c: Context<HonoEnv>): Promise<Response | void> => {
  const item = getMenuItem(COMMISSION_ITEM_ID);
  if (!item) {
    // The desk fronts a menu item; a menu without it is a build error
    // surfaced honestly rather than a free pass around the bench.
    return c.json(
      { error: "The desk's shelf is missing from the menu. Nothing charged." },
      500,
    );
  }
  if (await requiresPresentKeeper(c.env, item)) {
    const state = await shutterState(c.env);
    if (state.closed) {
      return c.json(
        {
          error:
            "The human-labor shelf is shuttered, the keeper is away from the counter. No charge taken; your quote's clock keeps running, so come back before it expires.",
          machine_shelves: `${c.env.STORE_BASE_URL}/menu.json`,
        },
        503,
      );
    }
  }
  const verdict = await capacityVerdict(c.env, item);
  if (!verdict.ok) {
    return c.json(
      {
        error: verdict.reason,
        code: "capacity_unavailable",
        charged: false,
        open_orders: verdict.open,
        cap: verdict.cap,
      },
      503,
    );
  }
};

/**
 * THE QUOTE CHECK, before settlement, when a signature rides in. This is
 * the desk's whole security posture in one place: the ROUTE fixes the
 * price (static, boot-time), and this check fixes WHICH quote that
 * price honours. Everything refused here is refused unpaid.
 */
const quoteCheck = async (c: Context<HonoEnv>): Promise<Response | void> => {
  if (!isBuying(c)) {
    // Asking the price: the gate's 402 answers, and its body says a
    // commission id is required before any payment is honoured.
    return;
  }
  const rung = Number(c.req.param("rung"));
  const id = sanitizeText(c.req.query("commission"), 60);
  if (!id) {
    return c.json(
      {
        ...freeReadRecovery(`${c.env.STORE_BASE_URL}/api/commission/declined`),
        error:
          "The rungs pay quotes, not menu prices. Send ?commission=<id> for a request the keeper has quoted at this rung. No quote, no charge — write in free at POST /api/request.",
      },
      400,
    );
  }
  const request = await getCommission(c.env, id);
  if (!request) {
    return c.json(
      { error: "No request by that id on the ledger. Nothing charged.", ...freeReadRecovery(`${c.env.STORE_BASE_URL}/api/commission/declined`) },
      404,
    );
  }
  const status = deskStatusOf(request);
  if (status !== "quoted") {
    const why: Record<typeof status, string> = {
      requested:
        "The keeper has not quoted this request yet — payment only ever happens against a live quote. Check back at GET /api/commission/{id}.",
      expired:
        "That quote has expired. Write in again at POST /api/request if the work still wants doing; terms may differ.",
      declined:
        "That request was declined, with the reply on the public record at GET /api/commission/declined.",
      accepted:
        "That commission is already paid and on the bench. Its order is the record now.",
    };
    return c.json({ error: `${why[status]} This attempt submitted no payment.`,
      ...freeReadRecovery(`${c.env.STORE_BASE_URL}/api/commission/${encodeURIComponent(id)}`),
      ...(status === "accepted" && request.order_id ? { already_purchased:true, order_url:`${c.env.STORE_BASE_URL}/api/order/${request.order_id}` } : {}),
    }, 409);
  }
  if (request.quote_usdc !== rung) {
    return c.json(
      {
        ...freeReadRecovery(`${c.env.STORE_BASE_URL}/api/commission/${encodeURIComponent(id)}`),
        error: `That request is quoted at $${request.quote_usdc}, and this is the $${rung} rung. Pay at the quoted rung: ${payUrlFor(c.env.STORE_BASE_URL, request)}. Nothing charged.`,
      },
      409,
    );
  }
  c.set("commissionPurchase", captureCommissionPurchase(request, c.req.query("agent_name"), c.req.header("User-Agent")));
};

commissionRoutes.use("/api/commission/pay/:rung", noStore);
commissionRoutes.use("/api/commission/pay/:rung", async (c, next) => {
  const admit = async () => await deskLaborCheck(c) ?? await quoteCheck(c);
  if (isBuying(c)) c.set("purchaseAdmission", admit);
  else {
    const refusal = await admit();
    if (refusal) return refusal;
  }
  await next();
});
commissionRoutes.use("/api/commission/pay/:rung", paymentGate);

commissionRoutes.get("/api/commission/pay/:rung", async (c) => {
  // Admission captured the live quote before any settlement.
  const item = getMenuItem(COMMISSION_ITEM_ID) as MenuItem;
  const purchase = c.get("commissionPurchase");
  const pending = c.get("pending");
  if (!pending) {
    // The gate never lets an unpaid request through; belt-and-braces.
    return c.json({ error: "The till hasn't heard from you yet." }, 402);
  }
  if (!purchase) throw new Error("Accepted commission terms unavailable");
  let settled: SettledPayment | null = null;
  const watched = { ...pending, settle: async () => { settled = await pending.settle(); return settled; } };
  try {
    return c.json(await fulfillCommissionPurchase(c.env, item, watched, purchase,
      { path: c.req.path, digest: await httpArtifactDigest(c.req.url) }));
  } catch (error) {
    if (error instanceof SettlementUnknown) return error.response();
    if (error instanceof SettlementDeclined) return error.response;
    const paid: SettledPayment | null = settled;
    if (paid) {
      await pageDeliveryFailed(c.env, item, paid, "http", error);
      return c.json({ ...deliveryFailedBody(c.env.STORE_BASE_URL, item, paid),
        recovery: pending.purchaseRecovery?.() }, 500);
    }
    throw error;
  }
});

commissionRoutes.get("/api/commission/:id", noStore, async (c) => {
  const request = await getCommission(c.env, c.req.param("id"));
  if (!request) {
    return c.json(
      {
        error: "No request by that id on the ledger.",
        write_in: `POST ${c.env.STORE_BASE_URL}/api/request`,
      },
      404,
    );
  }
  return c.json(deskView(request, c.env.STORE_BASE_URL));
});
