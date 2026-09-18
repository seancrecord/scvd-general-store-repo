import { Hono } from "hono";
import { newCheckoutId } from "@/lib/ids";
import { checkoutDocument } from "@/lib/ucp/checkout/document";
import {
  MAX_CHECKOUT_LINES,
  UnknownVariant,
  checkoutTerms,
  lineTerms,
  termsDigest,
  type CheckoutLineTerms,
  type PaymentTerms,
} from "@/lib/ucp/checkout/terms";
import { asFrozen, frozenRequirements } from "@/lib/ucp/checkout/requirements";
import { quotedUsdcHandler } from "@/lib/ucp/payments/usdc-x402";
import { orderDocument } from "@/lib/ucp/order/document";
import { checkoutIdOfOrder } from "@/lib/ucp/ids";
import { readStoredOrder } from "@/services/ucp-order";
import { getOrder } from "@/services/orders";
import { usdcPaymentHandlers } from "@/lib/ucp/payments/usdc-x402";
import { SCVD_NAMESPACE, UCP_VERSION } from "@/lib/ucp/version";
import { acceptedNetworks } from "@/lib/payment-networks";
import { ucpCheckoutStore, type StoredCheckout } from "@/services/ucp-checkout-store";
import { admitUcpCompletion } from "@/services/ucp-admission";
import { walkToSettlementBoundary } from "@/services/ucp-settlement-boundary";
import { realSettlementProducer } from "@/services/ucp-settlement-producer";
import { ucpCheckoutRails, ucpItemSellable, ucpLaunchStatus, ucpRailSellable } from "@/lib/ucp/launch";
import { facilitatorVerifier } from "@/lib/payments";
import { buyInputSchema } from "@/lib/bazaar-discovery";
import { capacityVerdict } from "@/services/queue-capacity";
import { getMenuItem } from "@/store/menu";
import { isRecord, type HonoEnv } from "@/types";

/**
 * THE CHECKOUT DOORS, at the paths the pinned transport names:
 * /checkout-sessions, /checkout-sessions/{id}, and its /complete and
 * /cancel. Everything here hangs under the shopping service endpoint
 * the profile advertises.
 *
 * COMPLETE IS WIRED TO SETTLEMENT, BEHIND ONE SWITCH (2026-09-18).
 * Everything up to the money was built first: a checkout resolves a
 * variant to a frozen tier, snapshots its price and licence version,
 * validates the product inputs, issues exact payment terms with a
 * digest over them, and admits exactly one completion. Complete now
 * hands the presented credential to that admission, walks the store's
 * produce-before-settle pipeline through the one settling module, and
 * answers with the checkout carrying its order. None of that is
 * decided here: admission (services/ucp-admission), the walk
 * (services/ucp-settlement-boundary) and the order
 * (services/ucp-order) are the tested seams, and this file only maps
 * their outcomes onto HTTP.
 *
 * THE SWITCH (lib/ucp/launch.ts) IS THE SAME ONE THE PROFILE READS.
 * Open: /.well-known/ucp advertises the checkout capability and this
 * door settles. Closed: no capability is advertised and this door
 * refuses in writing, naming the x402 door that does take the money.
 * There is no state in which one is true and the other is not.
 */
export const ucpCheckoutRoutes = new Hono<HonoEnv>();

/**
 * A Durable Object RPC return is handed back with a Disposable marker
 * attached. Everything downstream wants the plain record, and copying
 * it here keeps that detail at the one boundary it belongs to.
 */
function plain(value: StoredCheckout): StoredCheckout {
  return { ...value };
}

function handlersFor(c: { env: HonoEnv["Bindings"] }, checkout: StoredCheckout) {
  const base = c.env.STORE_BASE_URL;
  const quote = checkout.quote;
  if (!quote) {
    // No rail chosen yet: every rail a UCP checkout may be quoted on
    // is on offer — the same set the profile declares while open.
    const launch = ucpLaunchStatus(c.env);
    const handlers = usdcPaymentHandlers(c.env, base).filter(
      (instance) => !launch.open || launch.rails.includes(instance.config.network),
    );
    return handlers.length > 0
      ? { "store.scvd.payment.usdc": handlers as unknown[] }
      : {};
  }
  return quotedUsdcHandler(c.env, base, {
    network: quote.terms.network,
    amount_atomic: quote.terms.amount_atomic,
    checkout_id: quote.terms.checkout_id,
    checkout_version: quote.terms.checkout_version,
    expires_at: quote.terms.expires_at,
    terms_digest: quote.digest,
    ...(quote.requirements ? { x402_requirements: quote.requirements as unknown as Record<string, unknown> } : {}),
  }) as unknown as Record<string, unknown[]>;
}

function errorBody(code: string, content: string, severity = "unrecoverable") {
  return {
    ucp: { version: UCP_VERSION, status: "error" as const, payment_handlers: {} },
    messages: [{ type: "error", code, severity, content }],
  };
}

/**
 * WHAT THE BUYER HAS TO SUPPLY BEFORE THIS CAN BE PRODUCED.
 *
 * Several items on this shelf are a service on a subject the buyer
 * names — an endpoint to audit, a wallet to read, a digest to anchor.
 * Those inputs are part of the commercial terms, not part of the
 * payment, so they are collected and frozen at checkout rather than
 * arriving with the money. The required list comes from the same
 * buyInputSchema the 402, the MCP shelf and the catalog all publish.
 */
function missingInputs(lines: CheckoutLineTerms[], inputs: Record<string, string>): string[] {
  const missing: string[] = [];
  for (const line of lines) {
    const item = getMenuItem(line.item_id);
    if (!item) continue;
    for (const name of buyInputSchema(item).required ?? []) {
      if (!inputs[name]?.trim()) missing.push(name);
    }
  }
  return [...new Set(missing)];
}

function readInputs(body: Record<string, unknown>): Record<string, string> {
  const raw = (body[SCVD_NAMESPACE] as Record<string, unknown>)?.inputs;
  if (!raw || typeof raw !== "object") return {};
  const inputs: Record<string, string> = {};
  for (const [name, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === "string") inputs[name] = value;
  }
  return inputs;
}

function linesFrom(body: Record<string, unknown>): CheckoutLineTerms[] {
  const items = Array.isArray(body.line_items) ? body.line_items : [];
  if (items.length === 0) throw new UnknownVariant("(no line items)");
  if (items.length > MAX_CHECKOUT_LINES) {
    throw new Error(
      `This shelf has no cart: one line per checkout, not ${items.length}. Every item here is a made thing or a service on a named subject, and the till settles one exact amount per authorization.`,
    );
  }
  return items.map((raw) => {
    const row = (raw ?? {}) as Record<string, unknown>;
    const item = (row.item ?? {}) as Record<string, unknown>;
    const id = typeof item.id === "string" ? item.id : "";
    const quantity = typeof row.quantity === "number" ? row.quantity : 1;
    return lineTerms(id, quantity);
  });
}

async function quoteFor(
  c: { env: HonoEnv["Bindings"] },
  checkout: StoredCheckout,
  network: string,
): Promise<NonNullable<StoredCheckout["quote"]> | null> {
  const base = c.env.STORE_BASE_URL;
  const rail = usdcPaymentHandlers(c.env, base).find(
    (instance) => instance.config.network === network,
  );
  if (!rail) return null;
  const totals = checkoutTerms({
    checkoutId: checkout.id,
    version: checkout.version,
    lines: checkout.lines,
    expiresAt: checkout.expires_at,
  });
  const terms: PaymentTerms = {
    checkout_id: checkout.id,
    checkout_version: checkout.version,
    network: rail.config.network,
    asset: rail.config.asset,
    amount_atomic: totals.total_amount_atomic,
    pay_to: rail.config.pay_to,
    expires_at: checkout.expires_at,
  };
  /**
   * The x402 requirements the buyer will actually sign against, built
   * here and stored — so Complete verifies against what Create
   * committed to rather than against whatever the shelf says later.
   */
  return {
    terms,
    digest: await termsDigest(terms),
    requirements: asFrozen(
      frozenRequirements(c.env, rail.config.network, totals.total_amount_atomic),
    ),
  };
}

ucpCheckoutRoutes.post("/ucp/v1/checkout-sessions", async (c) => {
  const base = c.env.STORE_BASE_URL;
  let body: Record<string, unknown> = {};
  try {
    body = (await c.req.json()) as Record<string, unknown>;
  } catch {
    return c.json(errorBody("not_found", "Send a JSON body with line_items."), 400);
  }

  let lines: CheckoutLineTerms[];
  try {
    lines = linesFrom(body);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unusable line items.";
    return c.json(errorBody("item_unavailable", message), 400);
  }

  /**
   * WHILE THE LAUNCH IS QUALIFIED ITEM BY ITEM, an item the deployment
   * has not opened for UCP is refused at Create — before a quote, in
   * writing, naming where it is still for sale — rather than quoted
   * and then refused at Complete with a signature in hand. With the
   * door closed altogether, Create still answers: the checkout is a
   * reviewable document and reserves nothing, and Complete carries
   * the refusal.
   */
  const launch = ucpLaunchStatus(c.env);
  if (launch.open) {
    const closedItem = lines.find((line) => !ucpItemSellable(c.env, line.item_id));
    if (closedItem) {
      return c.json(
        errorBody(
          "item_unavailable",
          `${closedItem.item_id} is not open for UCP checkout on this deployment yet; the items that are: ${launch.items.join(", ")}. It is still for sale over x402 at ${base}/api/buy/${closedItem.item_id}, or through the MCP door at ${base}/mcp.`,
        ),
        400,
      );
    }
  }

  const inputs = readInputs(body);
  const missing = missingInputs(lines, inputs);
  const id = newCheckoutId();
  const now = Date.now();
  const store = ucpCheckoutStore(c.env, id);
  let checkout: StoredCheckout = plain(
    await store.createUcpCheckout({ id, lines, inputs, nowMs: now }),
  );

  /**
   * A checkout missing a required product input is `incomplete` and
   * says which input, rather than being quoted and then refusing the
   * money. Nothing has been reserved and nothing is payable.
   */
  if (missing.length > 0) {
    return c.json(
      {
        ...checkoutDocument(checkout, base, {
          paymentHandlers: handlersFor(c, checkout),
          messages: [
            {
              type: "error",
              code: "eligibility_invalid",
              severity: "requires_buyer_input",
              content: `This item needs ${missing.join(", ")} before it can be made. Send them under ${SCVD_NAMESPACE}.inputs; the schema for each is at ${base}/ucp/schemas/items/{item_id}.input.json.`,
            },
          ],
        }),
      },
      200,
    );
  }

  /**
   * CAPACITY IS CHECKED BEFORE A QUOTE IS ISSUED, NOT AFTER THE MONEY.
   *
   * Two of these items are capped at a handful of the keeper's hours a
   * week. Quoting a checkout the shelf cannot honour and discovering
   * it at settlement would be taking money for a window the store can
   * already see it would miss. capacityVerdict is the same fail-closed
   * read the 402 door uses — an unknown load is not a low one — so
   * both doors refuse for the same reason in the same words.
   *
   * THIS IS A READ, NOT A HOLD, and the distinction is worth stating.
   * It closes the case where the shelf is visibly full. It does not by
   * itself close the race where two checkouts are quoted against one
   * remaining slot; what closes that is the atomic claim at
   * completion, which is where the x402 door already makes it
   * (services/labor-reservations) and where the UCP completion seam
   * will make it too. A hold at quote time would need an expiry
   * release this store does not yet have for UCP, and a reservation
   * nothing ever releases strands a weekly slot on an abandoned
   * checkout.
   */
  for (const line of lines) {
    const item = getMenuItem(line.item_id);
    if (!item) continue;
    const capacity = await capacityVerdict(c.env, item);
    if (!capacity.ok) {
      return c.json(
        checkoutDocument(checkout, base, {
          paymentHandlers: handlersFor(c, checkout),
          messages: [
            {
              type: "error",
              code: "out_of_stock",
              severity: "recoverable",
              content: capacity.reason,
            },
          ],
        }),
        200,
      );
    }
  }

  /**
   * The rail: the buyer's choice if they named one this store settles
   * on, the first enabled rail otherwise. Naming a rail this store
   * does not take is refused rather than silently answered on another.
   */
  const rails = launch.open ? ucpCheckoutRails(c.env) : acceptedNetworks(c.env);
  const asked = typeof (body[SCVD_NAMESPACE] as Record<string, unknown>)?.network === "string"
    ? String((body[SCVD_NAMESPACE] as Record<string, unknown>).network)
    : rails[0];
  if (!asked || !rails.includes(asked)) {
    return c.json(
      errorBody(
        "payment_failed",
        launch.open
          ? `UCP checkout settles on ${rails.join(", ")} here. "${asked}" is not one of them${acceptedNetworks(c.env).includes(asked ?? "") ? ` yet; that rail is still open over x402 at ${base}/api/buy/{item_id}` : ""}.`
          : `This store settles on ${rails.join(", ")}. "${asked}" is not one of them.`,
      ),
      400,
    );
  }

  const quote = await quoteFor(c, checkout, asked);
  if (quote) {
    const quoted = await store.quoteUcpCheckout({ ...quote, nowMs: now });
    if (quoted.ok) checkout = plain(quoted.checkout);
  }
  return c.json(checkoutDocument(checkout, base, { paymentHandlers: handlersFor(c, checkout) }), 201);
});

ucpCheckoutRoutes.get("/ucp/v1/checkout-sessions/:id", async (c) => {
  const stored = await ucpCheckoutStore(c.env, c.req.param("id")).readUcpCheckout();
  if (!stored) return c.json(errorBody("not_found", "No such checkout."), 404);
  const checkout = plain(stored);
  return c.json(
    checkoutDocument(checkout, c.env.STORE_BASE_URL, { paymentHandlers: handlersFor(c, checkout) }),
  );
});

/**
 * THE ORDER, READ BY THE ID ITS CHECKOUT DETERMINES. No index: the id
 * names the checkout, the checkout's Durable Object holds the order
 * beside it, and a platform that lost the completion response reads
 * the same canonical record here that the completion returned.
 */
ucpCheckoutRoutes.get("/ucp/v1/orders/:id", async (c) => {
  const checkoutId = checkoutIdOfOrder(c.req.param("id"));
  if (!checkoutId) return c.json(errorBody("not_found", "No such order."), 404);
  const order = await readStoredOrder(c.env, checkoutId);
  if (!order || order.id !== c.req.param("id")) {
    return c.json(errorBody("not_found", "No such order."), 404);
  }
  const operational =
    order.fulfillment.kind === "human_queue"
      ? await getOrder(c.env, order.fulfillment.operational_order_id).catch(() => null)
      : null;
  return c.json(orderDocument(order, c.env.STORE_BASE_URL, { operational: operational ?? undefined }));
});

ucpCheckoutRoutes.post("/ucp/v1/checkout-sessions/:id/cancel", async (c) => {
  const store = ucpCheckoutStore(c.env, c.req.param("id"));
  const result = await store.cancelUcpCheckout();
  if (!result.ok && result.reason === "not_found") {
    return c.json(errorBody("not_found", "No such checkout."), 404);
  }
  if (!result.ok) {
    const checkout = plain(result.checkout!);
    return c.json(
      checkoutDocument(checkout, c.env.STORE_BASE_URL, {
        paymentHandlers: handlersFor(c, checkout),
        messages: [
          {
            type: "error",
            code: "not_found",
            severity: "unrecoverable",
            content:
              checkout.status === "completed"
                ? "This checkout is paid and has an order. Withdrawing the checkout would not undo the purchase."
                : "A completion is in flight for this checkout. Money may already be moving; read the checkout rather than cancelling it.",
          },
        ],
      }),
      409,
    );
  }
  const canceled = plain(result.checkout);
  return c.json(
    checkoutDocument(canceled, c.env.STORE_BASE_URL, {
      paymentHandlers: handlersFor(c, canceled),
    }),
  );
});

/**
 * THE CREDENTIAL, WHERE THE PROTOCOL PUTS IT. A Complete request
 * carries `payment.instruments[]`; the instrument for this store's
 * handler carries the x402 payment payload as its `credential`
 * (type "x402", documented at /ucp/specs/payment/usdc-x402). The
 * selected instrument wins; otherwise the first one holding a
 * credential. The discriminator is dropped and the rest is handed to
 * the adapter untouched, which re-accepts it against the checkout's
 * frozen terms rather than its own.
 */
function credentialFrom(body: Record<string, unknown>): Record<string, unknown> | undefined {
  const payment = isRecord(body.payment) ? body.payment : undefined;
  const instruments = Array.isArray(payment?.instruments) ? payment.instruments : [];
  const holding = instruments.filter(
    (row): row is Record<string, unknown> => isRecord(row) && isRecord(row.credential),
  );
  const chosen = holding.find((row) => row.selected === true) ?? holding[0];
  if (!chosen) return undefined;
  const { type: _type, ...credential } = chosen.credential as Record<string, unknown>;
  return credential;
}

/**
 * COMPLETE: THE PRESENTED PAYMENT, ADMITTED ONCE, SETTLED ONCE, AND
 * THE ORDER IN THE ANSWER.
 *
 * The sequence is the store's, not this file's: admission verifies
 * the credential against the frozen terms and binds the checkout to
 * one payment identity (or recognises the byte-identical retry
 * without asking the facilitator again); the boundary walk produces
 * the goods, claims the one submission, settles through the single
 * settling module, and writes the order beside the checkout in one
 * transaction. Every outcome those seams can return is mapped here
 * onto a checkout document a platform can read, and nothing is
 * decided here that they did not decide first.
 *
 * WHAT A PLATFORM CAN RELY ON. The identical Complete sent again —
 * after a lost response, a timeout, a retry policy — returns the same
 * completed checkout and the same order, and charges nothing again.
 * A different payment against a completed checkout is refused: one
 * checkout is one sale. A Complete while the door is closed refuses
 * in writing and charges nothing.
 */
ucpCheckoutRoutes.post("/ucp/v1/checkout-sessions/:id/complete", async (c) => {
  const base = c.env.STORE_BASE_URL;
  const id = c.req.param("id");
  const stored = await ucpCheckoutStore(c.env, id).readUcpCheckout();
  if (!stored) return c.json(errorBody("not_found", "No such checkout."), 404);
  const checkout = plain(stored);
  const item = checkout.lines[0]?.item_id;
  const buyElsewhere = `It is still for sale over x402 at ${base}/api/buy/${item ?? "{item_id}"}, or through the MCP door at ${base}/mcp.`;
  const answer = (
    state: StoredCheckout,
    status: 200 | 400 | 402 | 409 | 410 | 422 | 503,
    message?: { type: "error" | "warning" | "info"; code: string; severity?: string; content: string },
  ) =>
    c.json(
      checkoutDocument(state, base, {
        paymentHandlers: handlersFor(c, state),
        ...(message
          ? {
              messages: [
                {
                  type: message.type,
                  code: message.code,
                  ...(message.severity ? { severity: message.severity } : {}),
                  content: message.content,
                },
              ],
            }
          : {}),
      }),
      status,
    );

  /**
   * THE SWITCH, READ BEFORE ANYTHING IS PARSED. A completed checkout
   * is handed back regardless — it is what Get Checkout shows anyone,
   * and a door that closed after a sale does not unsell it.
   */
  const launch = ucpLaunchStatus(c.env);
  if (!launch.open) {
    if (checkout.status === "completed") return answer(checkout, 200);
    return answer(checkout, 503, {
      type: "error",
      code: "payment_failed",
      severity: "unrecoverable",
      content: `UCP checkout is switched off on this deployment (${launch.closed_because ?? "closed"}), so this store will not settle a payment through it and advertises no checkout capability for that reason. Nothing was charged. The terms above are real — ${buyElsewhere}`,
    });
  }
  if (checkout.status !== "completed") {
    if (item && !ucpItemSellable(c.env, item)) {
      return answer(checkout, 409, {
        type: "error",
        code: "item_unavailable",
        severity: "unrecoverable",
        content: `${item} is not open for UCP checkout on this deployment yet; the items that are: ${launch.items.join(", ")}. Nothing was charged. ${buyElsewhere}`,
      });
    }
    const rail = checkout.quote?.terms.network;
    if (rail && !ucpRailSellable(c.env, rail)) {
      return answer(checkout, 409, {
        type: "error",
        code: "payment_failed",
        severity: "unrecoverable",
        content: `This checkout was quoted on ${rail}, which is not open for UCP checkout on this deployment; the rails that are: ${launch.rails.join(", ")}. Nothing was charged. ${buyElsewhere}`,
      });
    }
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await c.req.json()) as Record<string, unknown>;
  } catch {
    return answer(checkout, 400, {
      type: "error",
      code: "payment_failed",
      severity: "requires_buyer_input",
      content: "Send a JSON body carrying payment.instruments[]; the shape is at " + `${base}/ucp/specs/payment/usdc-x402.`,
    });
  }
  const credential = credentialFrom(body);
  if (!credential) {
    return answer(checkout, 400, {
      type: "error",
      code: "payment_failed",
      severity: "requires_buyer_input",
      content: `No payment instrument with a credential was sent. Put the x402 payment payload at payment.instruments[0].credential with type "x402"; the shape is at ${base}/ucp/specs/payment/usdc-x402.`,
    });
  }

  const admitted = await admitUcpCompletion(c.env, {
    checkoutId: id,
    credential,
    verify: facilitatorVerifier(c.env),
  });
  if (!admitted.ok) {
    const state = admitted.checkout ? plain(admitted.checkout) : checkout;
    switch (admitted.code) {
      case "not_found":
        return c.json(errorBody("not_found", "No such checkout."), 404);
      case "payment_refused":
        return answer(state, 402, { type: "error", code: "payment_failed", severity: "recoverable", content: `${admitted.detail} Nothing was charged.` });
      case "expired":
        return answer(state, 410, { type: "error", code: "checkout_expired", severity: "recoverable", content: admitted.detail });
      case "wrong_state":
      case "stale_version":
        return answer(state, 409, { type: "error", code: "checkout_not_payable", severity: "unrecoverable", content: admitted.detail });
      case "preparation_failed":
        return answer(state, 422, { type: "error", code: "item_unavailable", severity: "recoverable", content: admitted.detail });
      default:
        return answer(state, 503, { type: "error", code: "service_unavailable", severity: "recoverable", content: admitted.detail });
    }
  }

  const outcome = await walkToSettlementBoundary(c.env, {
    checkoutId: id,
    door: "ucp",
    produce: realSettlementProducer(c.env, { credential }),
  });
  if (outcome.ok) {
    if (outcome.order || outcome.checkout.status === "completed") return answer(plain(outcome.checkout), 200);
    if (outcome.resolution?.money === "not_settled") {
      return answer(plain(outcome.checkout), 402, {
        type: "error",
        code: "payment_failed",
        severity: "recoverable",
        content: "The facilitator declined to settle this payment; nothing was charged and the checkout is payable again. Sign a fresh payment against the quoted terms and Complete again.",
      });
    }
    return answer(plain(outcome.checkout), 200, {
      type: "info",
      code: "settlement_in_progress",
      content: "The payment was submitted and its outcome is not yet known. Do not sign another payment: read this checkout, which becomes completed with its order once the settlement is confirmed, or payable again if it is declined.",
    });
  }

  const state = outcome.checkout ? plain(outcome.checkout) : checkout;
  switch (outcome.code) {
    case "not_found":
      return c.json(errorBody("not_found", "No such checkout."), 404);
    case "already_resolved": {
      const latest = plain((await ucpCheckoutStore(c.env, id).readUcpCheckout()) ?? state);
      if (latest.status === "completed") return answer(latest, 200);
      return answer(latest, 409, { type: "error", code: "checkout_not_payable", severity: "unrecoverable", content: outcome.detail });
    }
    case "already_started":
    case "not_admitted":
    case "preconditions_failed":
      return answer(state, 409, { type: "error", code: "checkout_not_payable", severity: "recoverable", content: outcome.detail });
    case "production_failed":
      return answer(state, 422, { type: "error", code: "item_unavailable", severity: "recoverable", content: `${outcome.detail} Nothing was charged.` });
    default:
      /**
       * resolution_failed, delivery_failed, order_failed: the money
       * moved or the claim is held, and the bookkeeping did not finish
       * in this request. The purchase desk's alarm finishes it through
       * the same recovery an identical retry uses; the checkout says
       * complete_in_progress until then, and nothing is charged again.
       */
      return answer(state, 200, {
        type: "warning",
        code: "order_pending",
        content: `${outcome.detail} Read this checkout: it becomes completed with its order once recovery finishes. Do not sign another payment.`,
      });
  }
});
