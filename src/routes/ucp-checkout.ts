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
import { usdcPaymentHandlers } from "@/lib/ucp/payments/usdc-x402";
import { SCVD_NAMESPACE, UCP_VERSION } from "@/lib/ucp/version";
import { acceptedNetworks } from "@/lib/payment-networks";
import { ucpCheckoutStore, type StoredCheckout } from "@/services/ucp-checkout-store";
import { buyInputSchema } from "@/lib/bazaar-discovery";
import { capacityVerdict } from "@/services/queue-capacity";
import { getMenuItem } from "@/store/menu";
import type { HonoEnv } from "@/types";

/**
 * THE CHECKOUT DOORS, at the paths the pinned transport names:
 * /checkout-sessions, /checkout-sessions/{id}, and its /complete and
 * /cancel. Everything here hangs under the shopping service endpoint
 * the profile advertises.
 *
 * COMPLETE IS NOT WIRED TO SETTLEMENT YET, AND SAYS SO RATHER THAN
 * PRETENDING. Everything up to the money is built: a checkout resolves
 * a variant to a frozen tier, snapshots its price and licence version,
 * validates the product inputs, issues exact payment terms with a
 * digest over them, and admits exactly one completion. What is not
 * built is the seam that hands a verified authorization to the
 * store's existing settlement admission, and that seam is the most
 * security-sensitive line in the shop. A Complete that looked like it
 * settled and did not would be worse than one that refuses in writing.
 *
 * So the checkout CAPABILITY stays out of the profile. A negotiator
 * reading /.well-known/ucp finds no checkout and correctly declines to
 * transact; these doors exist to be reviewed and tested against the
 * specification while the settlement seam is built under review.
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
    // No rail chosen yet: every rail this store settles on is on offer.
    const handlers = usdcPaymentHandlers(c.env, base);
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
  const asked = typeof (body[SCVD_NAMESPACE] as Record<string, unknown>)?.network === "string"
    ? String((body[SCVD_NAMESPACE] as Record<string, unknown>).network)
    : acceptedNetworks(c.env)[0];
  if (!asked || !acceptedNetworks(c.env).includes(asked)) {
    return c.json(
      errorBody(
        "payment_failed",
        `This store settles on ${acceptedNetworks(c.env).join(", ")}. "${asked}" is not one of them.`,
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
 * NOT WIRED TO SETTLEMENT, AND THE REFUSAL IS THE HONEST ANSWER.
 *
 * The checkout is real: the tier is frozen, the price re-derived, the
 * terms digested, and exactly one completion would be admitted. What
 * is missing is the seam that hands a verified authorization to
 * beginVerifiedPurchaseIntent and the store's produce-before-settle
 * pipeline. That seam is the most security-sensitive code in the shop
 * and is being built under review rather than in a hurry.
 *
 * Refused with the status quo named: this store does take money, on
 * these rails, for this exact amount — through x402 at the buy door.
 */
ucpCheckoutRoutes.post("/ucp/v1/checkout-sessions/:id/complete", async (c) => {
  const base = c.env.STORE_BASE_URL;
  const stored = await ucpCheckoutStore(c.env, c.req.param("id")).readUcpCheckout();
  if (!stored) return c.json(errorBody("not_found", "No such checkout."), 404);
  const checkout = plain(stored);
  const item = checkout.lines[0]?.item_id;
  return c.json(
    checkoutDocument(checkout, base, {
      paymentHandlers: handlersFor(c, checkout),
      messages: [
        {
          type: "error",
          code: "payment_failed",
          severity: "unrecoverable",
          content: `This store cannot yet settle a payment through UCP, and will not pretend to: no checkout capability is advertised in its profile for that reason. The terms above are real — pay them over x402 at ${base}/api/buy/${item ?? "{item_id}"}, or through the MCP door at ${base}/mcp.`,
        },
      ],
    }),
    501,
  );
});
